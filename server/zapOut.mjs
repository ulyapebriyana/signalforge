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
 */

import { createRequire } from "node:module";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { planZapOut } from "../shared/zapOut.js";

const require = createRequire(import.meta.url);
const dlmmModule = require("@meteora-ag/dlmm");
const DLMM = dlmmModule.default ?? dlmmModule;
const BN = require("bn.js");

const jupiterApi = "https://lite-api.jup.ag/swap/v1";

/** Withdraw everything: basis points of the position's liquidity to pull. */
const FULL_BPS = new BN(10_000);

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

/** Raw base units for a mint, as the chain wants them. */
const toBaseUnits = (amount, decimals) =>
  BigInt(Math.floor(Number(amount) * 10 ** Number(decimals)));

const fromBaseUnits = (raw, decimals) => Number(raw) / 10 ** Number(decimals);

/**
 * A Jupiter route for one leg, normalised into what the planner reads.
 *
 * The raw response is kept alongside because the swap transaction has to be
 * built from the exact quote that was priced — re-quoting between plan and
 * build would silently move the numbers the user agreed to.
 */
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

/**
 * What leaving this position is expected to yield.
 *
 * Read-only and side-effect free: it builds no transaction and reserves
 * nothing, so it is safe to call while the user is still deciding.
 */
export const planPositionZapOut = async ({ position, pool, targetMint, slippageBps }) => {
  const sourceIsX = targetMint === pool?.tokenY?.address;
  const source = sourceIsX ? pool.tokenX : pool.tokenY;
  const target = sourceIsX ? pool.tokenY : pool.tokenX;
  const sourceAmount = sourceIsX ? position.amountX : position.amountY;

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
 * failure partway through leaves the position genuinely half-withdrawn — the
 * caller is responsible for reporting that honestly rather than retrying blind.
 */
export const prepareWithdraw = async ({ wallet, positionKey, poolAddress, lowerBinId, upperBinId }) => {
  const owner = new PublicKey(wallet);
  const dlmm = await DLMM.create(getConnection(), new PublicKey(poolAddress));

  const transactions = await dlmm.removeLiquidity({
    user: owner,
    position: new PublicKey(positionKey),
    fromBinId: Number(lowerBinId),
    toBinId: Number(upperBinId),
    bps: FULL_BPS,
    shouldClaimAndClose: true,
  });

  const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash("confirmed");
  const prepared = [];

  for (const transaction of transactions) {
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

  return { transactions: prepared, blockhash, lastValidBlockHeight };
};

/**
 * The swap leg, built only after the withdrawal has actually landed.
 *
 * `amount` is capped at what the wallet really holds. The position's own figure
 * is what the user agreed to swap, but a partial withdrawal — or tokens of the
 * same mint held for unrelated reasons — would make that figure wrong in
 * opposite directions. Taking the smaller of the two never swaps more of the
 * user's balance than this position was supposed to release.
 */
export const prepareSwap = async ({ wallet, inputMint, outputMint, amount, decimalsIn, decimalsOut, slippageBps }) => {
  const owner = new PublicKey(wallet);
  const held = await readBalance(owner, inputMint, decimalsIn);
  const swapAmount = Math.min(Number(amount), held);

  if (!(swapAmount > 0)) {
    return { skipped: true, reason: "Tidak ada saldo token sumber untuk ditukar." };
  }

  const quote = await getSwapQuote({
    inputMint,
    outputMint,
    amount: swapAmount,
    decimalsIn,
    decimalsOut,
    slippageBps,
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
    }),
  });

  return {
    skipped: false,
    transaction: payload.swapTransaction,
    swapAmount,
    estimatedOut: quote.outAmount,
    minimumOut: quote.minimumOut,
    priceImpactPct: quote.priceImpactPct,
  };
};

/** Native SOL reads as a lamport balance; every other mint as a token account. */
const readBalance = async (owner, mint, decimals) => {
  const NATIVE_SOL = "So11111111111111111111111111111111111111112";
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
 * Relay one already-signed transaction and wait for it to land.
 *
 * Signature verification is left on: this endpoint accepts bytes from a browser
 * and must not become a way to push arbitrary unsigned instructions through the
 * server's RPC.
 */
export const sendSignedTransaction = async ({ signedTransaction, lastValidBlockHeight }) => {
  const bytes = Buffer.from(signedTransaction, "base64");
  // Jupiter returns versioned transactions, the DLMM SDK returns legacy ones.
  let raw;
  try {
    raw = VersionedTransaction.deserialize(bytes).serialize();
  } catch {
    raw = Transaction.from(bytes).serialize();
  }

  const signature = await getConnection().sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
  });

  const { blockhash, lastValidBlockHeight: height } = await getConnection().getLatestBlockhash("confirmed");
  const confirmation = await getConnection().confirmTransaction(
    { signature, blockhash, lastValidBlockHeight: lastValidBlockHeight || height },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(`Transaksi ditolak chain: ${JSON.stringify(confirmation.value.err)}`);
  }
  return { signature };
};
