/**
 * Building the transactions that leave a position — and never signing them.
 *
 * The split matters and is deliberate. This server holds the RPC endpoint and
 * the SDK, so it builds and simulates; the browser holds the wallet, so it
 * signs. No private key is ever present in this process, which is the only
 * arrangement that makes sense for a box sitting behind a public URL. A signed
 * transaction comes back here purely to be relayed, because relaying needs the
 * RPC the browser must not be handed.
 *
 * Everything is prepared as late as possible. A blockhash is good for roughly a
 * minute, so transactions are built at the moment the user commits rather than
 * when the confirmation screen opens — a plan can sit on screen safely, a
 * signed transaction cannot.
 *
 * The withdrawal closes the position, which is why the swap leg cannot look it
 * up afterwards: by then it does not exist. What the swap needs is captured
 * here before the withdrawal runs and held in `pendingZaps`, which is also what
 * makes a half-finished zap out resumable.
 */

import { createRequire } from "node:module";
import { ComputeBudgetProgram, Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { planZapOut } from "../shared/zapOut.js";

const require = createRequire(import.meta.url);
const dlmmModule = require("@meteora-ag/dlmm");
const DLMM = dlmmModule.default ?? dlmmModule;
const BN = require("bn.js");

const jupiterApi = "https://lite-api.jup.ag/swap/v1";
const NATIVE_SOL = "So11111111111111111111111111111111111111112";

/** Withdraw everything: basis points of the position's liquidity to pull. */
const FULL_BPS = new BN(10_000);

/**
 * Priority fee bounds, in micro-lamports per compute unit.
 *
 * A transaction with no priority fee is not rejected during congestion — it is
 * simply never picked up, which reads to the user as nothing happening at all.
 * The floor makes sure every withdrawal carries something; the ceiling keeps a
 * spike in the recent-fee sample from turning a $20 exit into a painful one.
 * At the ceiling a 400k-unit transaction still costs well under 0.001 SOL.
 */
const MIN_PRIORITY_FEE = Number(process.env.LP_MIN_PRIORITY_FEE || 1_000);
const MAX_PRIORITY_FEE = Number(process.env.LP_MAX_PRIORITY_FEE || 1_000_000);

/** A resumable zap out lives this long; past it the user starts over. */
const PENDING_TTL_MS = 30 * 60_000;

/**
 * What the swap leg needs, captured before the withdrawal destroys the position.
 * Keyed by wallet and position, held in memory: losing it on restart costs a
 * resume, never funds.
 */
const pendingZaps = new Map();

const pendingKey = (wallet, positionKey) => `${wallet}:${positionKey}`;

const prunePending = (now = Date.now()) => {
  for (const [key, record] of pendingZaps) {
    if (now - record.createdAt > PENDING_TTL_MS) pendingZaps.delete(key);
  }
};

let connection = null;

const getConnection = () => {
  if (!process.env.SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL belum diisi di file .env");
  if (!connection) {
    connection = new Connection(process.env.SOLANA_RPC_URL, { commitment: "confirmed" });
  }
  return connection;
};

const fetchJson = async (url, options = {}) => {
  const { timeoutMs = 12_000, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Jupiter ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const toBaseUnits = (amount, decimals) => BigInt(Math.floor(Number(amount) * 10 ** Number(decimals)));
const fromBaseUnits = (raw, decimals) => Number(raw) / 10 ** Number(decimals);

/**
 * What the network is currently being paid to prioritise a transaction.
 *
 * The 75th percentile of recent non-zero fees, rather than the median: this is
 * a transaction the user is watching and waiting on, and being outbid means
 * they sit staring at a spinner. A failed sample falls back to the floor rather
 * than to nothing.
 */
const priorityFeeMicroLamports = async () => {
  try {
    const recent = await getConnection().getRecentPrioritizationFees();
    const fees = recent.map((entry) => entry.prioritizationFee).filter((fee) => fee > 0).sort((a, b) => a - b);
    if (!fees.length) return MIN_PRIORITY_FEE;
    const chosen = fees[Math.floor(fees.length * 0.75)] ?? fees.at(-1);
    return Math.min(MAX_PRIORITY_FEE, Math.max(MIN_PRIORITY_FEE, chosen));
  } catch {
    return MIN_PRIORITY_FEE;
  }
};

export const getSwapQuote = async ({ inputMint, outputMint, amount, decimalsIn, decimalsOut, slippageBps }) => {
  const raw = toBaseUnits(amount, decimalsIn);
  if (raw <= 0n) return null;

  const query = new URLSearchParams({
    inputMint,
    outputMint,
    amount: raw.toString(),
    slippageBps: String(slippageBps),
  });
  const payload = await fetchJson(`${jupiterApi}/quote?${query}`);

  return {
    outAmount: fromBaseUnits(payload.outAmount, decimalsOut),
    minimumOut: fromBaseUnits(payload.otherAmountThreshold, decimalsOut),
    priceImpactPct: Number(payload.priceImpactPct) * 100,
    raw: payload,
  };
};

/** Which side of the pool gets swapped, given where the user wants to end up. */
const sides = (pool, targetMint) => {
  const sourceIsX = targetMint === pool?.tokenY?.address;
  return {
    source: sourceIsX ? pool.tokenX : pool.tokenY,
    target: sourceIsX ? pool.tokenY : pool.tokenX,
    sourceAmountOf: (position) => (sourceIsX ? position.amountX : position.amountY),
  };
};

/**
 * What leaving this position is expected to yield.
 *
 * Read-only and side-effect free: it builds no transaction and reserves
 * nothing, so it is safe to call while the user is still deciding.
 */
export const planPositionZapOut = async ({ position, pool, targetMint, slippageBps }) => {
  const { source, target, sourceAmountOf } = sides(pool, targetMint);
  const sourceAmount = sourceAmountOf(position);

  let quote = null;
  if (sourceAmount > 0 && source?.address && target?.address) {
    quote = await getSwapQuote({
      inputMint: source.address,
      outputMint: target.address,
      amount: sourceAmount,
      decimalsIn: source.decimals,
      decimalsOut: target.decimals,
      slippageBps,
    });
  }

  const plan = planZapOut({ position, pool, targetMint, slippageBps, quote });
  return { ...plan, quoteRaw: quote?.raw ?? null };
};

const serialize = (transaction) =>
  transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

/**
 * The withdrawal leg: pull all liquidity, claim fees, close the position.
 *
 * The SDK returns an array because a wide position spans more bin arrays than
 * one transaction can address. They must be signed and sent in order, and a
 * failure partway through leaves the position genuinely half-withdrawn.
 *
 * Each transaction gets a compute unit price before simulation. Without one a
 * withdrawal can sit unmined through a congested spell and look, from the
 * dashboard, exactly like a bug.
 */
export const prepareWithdraw = async ({ wallet, position, pool, targetMint, slippageBps }) => {
  const owner = new PublicKey(wallet);
  const dlmm = await DLMM.create(getConnection(), new PublicKey(position.poolAddress));

  const transactions = await dlmm.removeLiquidity({
    user: owner,
    position: new PublicKey(position.positionKey),
    fromBinId: Number(position.lowerBinId),
    toBinId: Number(position.upperBinId),
    bps: FULL_BPS,
    shouldClaimAndClose: true,
  });

  const [{ blockhash, lastValidBlockHeight }, microLamports] = await Promise.all([
    getConnection().getLatestBlockhash("confirmed"),
    priorityFeeMicroLamports(),
  ]);

  const prepared = [];
  for (const transaction of transactions) {
    transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
    transaction.feePayer = owner;
    transaction.recentBlockhash = blockhash;

    // Simulated individually so a transaction that would fail on chain is
    // caught before a wallet ever asks the user to approve it.
    const simulation = await getConnection().simulateTransaction(transaction);
    prepared.push({
      transaction: serialize(transaction),
      simulationError: simulation.value.err ? JSON.stringify(simulation.value.err) : null,
      logs: simulation.value.logs?.slice(-6) ?? [],
    });
  }

  // Recorded before anything is signed, because once the withdrawal lands the
  // position is closed and none of this can be looked up again.
  const { source, target, sourceAmountOf } = sides(pool, targetMint);
  if (source?.address && target?.address) {
    prunePending();
    pendingZaps.set(pendingKey(wallet, position.positionKey), {
      wallet,
      positionKey: position.positionKey,
      pair: position.pair,
      sourceMint: source.address,
      sourceSymbol: source.symbol,
      decimalsIn: source.decimals,
      targetMint: target.address,
      targetSymbol: target.symbol,
      decimalsOut: target.decimals,
      expectedSourceAmount: sourceAmountOf(position),
      slippageBps,
      createdAt: Date.now(),
    });
  }

  return { transactions: prepared, blockhash, lastValidBlockHeight, priorityFeeMicroLamports: microLamports };
};

/**
 * The swap leg, built only after the withdrawal has actually landed.
 *
 * It reads the record written before the withdrawal rather than the position,
 * which no longer exists. `amount` is capped at what the wallet really holds:
 * the recorded figure is what the user agreed to swap, but a partial withdrawal
 * would make it too high, and tokens of the same mint held for unrelated
 * reasons would make the balance alone too high. Taking the smaller never
 * swaps more of the user's balance than this position was meant to release.
 */
export const prepareSwap = async ({ wallet, positionKey }) => {
  prunePending();
  const record = pendingZaps.get(pendingKey(wallet, positionKey));
  if (!record) {
    return { skipped: true, reason: "Rincian zap out sudah kedaluwarsa. Mulai lagi dari awal — dana Anda aman." };
  }

  const owner = new PublicKey(wallet);
  const held = await readBalance(owner, record.sourceMint, record.decimalsIn);
  const swapAmount = Math.min(Number(record.expectedSourceAmount), held);

  if (!(swapAmount > 0)) {
    pendingZaps.delete(pendingKey(wallet, positionKey));
    return { skipped: true, reason: "Tidak ada saldo token sumber untuk ditukar." };
  }

  const quote = await getSwapQuote({
    inputMint: record.sourceMint,
    outputMint: record.targetMint,
    amount: swapAmount,
    decimalsIn: record.decimalsIn,
    decimalsOut: record.decimalsOut,
    slippageBps: record.slippageBps,
  });
  if (!quote) return { skipped: true, reason: "Rute swap tidak tersedia." };

  const payload = await fetchJson(`${jupiterApi}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: wallet,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  return {
    skipped: false,
    transaction: payload.swapTransaction,
    swapAmount,
    sourceSymbol: record.sourceSymbol,
    targetSymbol: record.targetSymbol,
    estimatedOut: quote.outAmount,
    minimumOut: quote.minimumOut,
    priceImpactPct: quote.priceImpactPct,
  };
};

/** Drop the record once the swap has landed, so no stale resume is offered. */
export const clearPendingZap = (wallet, positionKey) =>
  pendingZaps.delete(pendingKey(wallet, positionKey));

/**
 * Zap outs this wallet started but did not finish.
 *
 * Reported only when the wallet actually still holds the token that was meant
 * to be swapped — that is the difference between "the swap never ran" and "it
 * ran and we simply never heard back", and only the first is worth resuming.
 */
export const pendingZapsFor = async (wallet) => {
  prunePending();
  const mine = [...pendingZaps.values()].filter((record) => record.wallet === wallet);
  const owner = mine.length ? new PublicKey(wallet) : null;

  const checked = await Promise.all(
    mine.map(async (record) => {
      const held = await readBalance(owner, record.sourceMint, record.decimalsIn);
      const amount = Math.min(Number(record.expectedSourceAmount), held);
      return amount > 0
        ? {
            positionKey: record.positionKey,
            pair: record.pair,
            sourceSymbol: record.sourceSymbol,
            targetSymbol: record.targetSymbol,
            amount,
          }
        : null;
    }),
  );
  return checked.filter(Boolean);
};

/** Native SOL reads as a lamport balance; every other mint as a token account. */
const readBalance = async (owner, mint, decimals) => {
  if (mint === NATIVE_SOL) {
    const lamports = await getConnection().getBalance(owner);
    return fromBaseUnits(lamports, 9);
  }

  const accounts = await getConnection().getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) });
  return accounts.value.reduce(
    (total, { account }) => total + Number(account.data.parsed.info.tokenAmount.uiAmount || 0),
    0,
  );
};

/**
 * A blockhash lives about a minute, and the most common way to miss that window
 * is a user reading the wallet prompt carefully. That deserves a sentence
 * saying nothing moved, not a raw chain error.
 */
const EXPIRY_MESSAGE =
  "Blockhash kedaluwarsa sebelum transaksi terkirim — biasanya karena prompt wallet terlalu lama terbuka. " +
  "Tidak ada dana yang berpindah. Coba lagi.";

const isExpiry = (error) => {
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("blockheight") || text.includes("block height") || text.includes("expired");
};

/**
 * Relay one already-signed transaction and wait for it to land.
 *
 * The confirmation carries the transaction's *own* blockhash. Fetching a fresh
 * one here — as this first did — gives the RPC an expiry window the transaction
 * never had, so a dropped transaction hangs for a full window instead of
 * failing the moment its real blockhash died.
 */
export const sendSignedTransaction = async ({ signedTransaction, blockhash, lastValidBlockHeight }) => {
  const bytes = Buffer.from(signedTransaction, "base64");
  // Jupiter returns versioned transactions, the DLMM SDK returns legacy ones.
  let raw;
  try {
    raw = VersionedTransaction.deserialize(bytes).serialize();
  } catch {
    raw = Transaction.from(bytes).serialize();
  }

  try {
    const signature = await getConnection().sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });

    const strategy = blockhash && lastValidBlockHeight
      ? { signature, blockhash, lastValidBlockHeight }
      : { signature, ...(await getConnection().getLatestBlockhash("confirmed")) };

    const confirmation = await getConnection().confirmTransaction(strategy, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaksi ditolak chain: ${JSON.stringify(confirmation.value.err)}`);
    }
    return { signature };
  } catch (error) {
    if (isExpiry(error)) throw new Error(EXPIRY_MESSAGE);
    throw error;
  }
};
