/**
 * Reading a wallet's DLMM positions off-chain state.
 *
 * Meteora's data API has no positions-by-wallet route — every shape of it
 * answers 404, and the older dlmm-api host is gone — so the only source for
 * "what do I actually hold" is the chain itself. The SDK reads it with a plain
 * RPC connection and a public key; nothing here signs, and nothing here needs a
 * key that could. A wallet address is all it takes, which is why this never
 * grew a wallet-connect button: connecting would not return one field more.
 *
 * The chain knows amounts and bins but not dollars, so each position is paired
 * with its pool from the same data API the scanner already uses. That is what
 * supplies token prices, symbols, and the pool's own fee rate — letting a
 * position be judged against the pool it sits in.
 */

import { createRequire } from "node:module";
import { Connection, PublicKey } from "@solana/web3.js";
import { summarizePosition, summarizeWallet } from "../shared/lpPositions.js";

/**
 * Loaded through require rather than import, which is not a style choice.
 *
 * The SDK's ESM build imports a *directory* out of @coral-xyz/anchor's CJS
 * tree, and Node's ESM resolver refuses directory specifiers outright —
 * `import DLMM from "@meteora-ag/dlmm"` dies at load with
 * ERR_UNSUPPORTED_DIR_IMPORT before any of our code runs. CJS resolution still
 * allows directories, so the require path loads cleanly. Its entry sets
 * `module.exports` to the class itself and hangs the named exports off it, so
 * there is no `.default` to unwrap on the current version; the fallback keeps
 * this working if a later release goes back to a plain default export.
 */
const require = createRequire(import.meta.url);
const dlmmModule = require("@meteora-ag/dlmm");
const DLMM = dlmmModule.default ?? dlmmModule;

const dataApi = "https://dlmm.datapi.meteora.ag";

/** Base58, 32 bytes — checked before anything reaches the RPC. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Position reads are cached for a scan interval.
 *
 * Helius bills per call and this walks every position account the wallet owns,
 * so an open dashboard polling every few seconds would burn the quota for no
 * new information — positions change when the user acts or the price moves a
 * bin, neither of which is faster than the scanner's own cadence.
 */
const POSITION_CACHE_MS = 30_000;

/**
 * How often an open dashboard should ask, exported so the client polls at the
 * cache's own clock rather than guessing.
 *
 * It used to poll on `lpScanSeconds`, the background out-of-range alert
 * cadence, which is a different job with different constraints — that one has
 * to keep running after the tab closes, so it is deliberately slow. Polling
 * slower than this TTL shows the reader positions staler than the server
 * already has; polling faster just re-serves the same cached object. Matching
 * it is the only setting that is neither.
 */
export const positionPollSeconds = POSITION_CACHE_MS / 1_000;
const POOL_CACHE_MS = 60_000;

const positionCache = new Map();
const poolCache = new Map();

let connection = null;

export const rpcConfigured = () => Boolean(process.env.SOLANA_RPC_URL);

/** Wallets to track when the request does not name one. */
export const configuredWallets = () =>
  String(process.env.LP_WALLETS || "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);

export const isValidWallet = (wallet) => {
  if (!BASE58.test(String(wallet || ""))) return false;
  try {
    // The regex passes some strings that are not on the curve or not 32 bytes;
    // PublicKey is the real check, and it throws rather than returning false.
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
};

const getConnection = () => {
  if (!rpcConfigured()) throw new Error("SOLANA_RPC_URL belum diisi di file .env");
  // One connection for the process: the SDK opens no sockets of its own and a
  // fresh Connection per request would drop HTTP keep-alive.
  if (!connection) {
    connection = new Connection(process.env.SOLANA_RPC_URL, { commitment: "confirmed" });
  }
  return connection;
};

const fetchJson = async (url, timeoutMs = 10_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Pool metadata for one address, in the shape the summary expects.
 *
 * A pool the API cannot describe caches as null for a shorter spell than a
 * success, so a transient failure does not blank a position's dollar values for
 * a full minute.
 */
const fetchPoolMeta = async (address) => {
  const cached = poolCache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const payload = await fetchJson(`${dataApi}/pools/${address}`);
    const data = {
      name: payload?.name ?? null,
      binStep: payload?.pool_config?.bin_step ?? null,
      tvl: payload?.tvl ?? null,
      apr: payload?.apr ?? null,
      apy: payload?.apy ?? null,
      currentPrice: payload?.current_price ?? null,
      feeTvl1h: payload?.fee_tvl_ratio?.["1h"] ?? null,
      volume1h: payload?.volume?.["1h"] ?? null,
      tokenX: {
        symbol: payload?.token_x?.symbol ?? null,
        address: payload?.token_x?.address ?? null,
        decimals: payload?.token_x?.decimals ?? null,
        price: payload?.token_x?.price ?? null,
      },
      tokenY: {
        symbol: payload?.token_y?.symbol ?? null,
        address: payload?.token_y?.address ?? null,
        decimals: payload?.token_y?.decimals ?? null,
        price: payload?.token_y?.price ?? null,
      },
    };
    poolCache.set(address, { data, expiresAt: Date.now() + POOL_CACHE_MS });
    return data;
  } catch {
    poolCache.set(address, { data: null, expiresAt: Date.now() + 10_000 });
    return null;
  }
};

/**
 * SDK objects → plain JSON.
 *
 * The SDK hands back BN and PublicKey instances; amounts are turned into
 * strings rather than numbers because a raw u64 of a 9-decimal mint can exceed
 * what a double represents exactly, and the conversion to a human amount
 * belongs downstream where decimals are known.
 */
const flattenPosition = (poolAddress, lbPair, position) => {
  const data = position.positionData;
  return {
    positionKey: position.publicKey.toBase58(),
    poolAddress,
    activeBinId: lbPair.activeId,
    binStep: lbPair.binStep,
    lowerBinId: data.lowerBinId,
    upperBinId: data.upperBinId,
    totalXAmount: String(data.totalXAmount),
    totalYAmount: String(data.totalYAmount),
    feeX: data.feeX.toString(),
    feeY: data.feeY.toString(),
    claimedFeeX: data.totalClaimedFeeXAmount.toString(),
    claimedFeeY: data.totalClaimedFeeYAmount.toString(),
    lastUpdatedAt: Number(data.lastUpdatedAt?.toString?.() ?? 0) * 1_000 || null,
  };
};

/**
 * Every DLMM position a wallet holds, valued and range-checked.
 *
 * A wallet with no positions is a valid answer, not an error — the dashboard
 * shows an empty state rather than a failure, because "belum ada posisi" is the
 * normal state between plays.
 */
export const readWalletPositions = async (wallet, { force = false } = {}) => {
  if (!isValidWallet(wallet)) throw new Error("Alamat wallet tidak valid");

  const cached = positionCache.get(wallet);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;

  const owner = new PublicKey(wallet);
  const byPool = await DLMM.getAllLbPairPositionsByUser(getConnection(), owner);

  const flattened = [];
  for (const [poolAddress, info] of byPool) {
    for (const position of info.lbPairPositionsData) {
      flattened.push(flattenPosition(poolAddress, info.lbPair, position));
    }
  }

  const poolAddresses = [...new Set(flattened.map((position) => position.poolAddress))];
  const metaEntries = await Promise.all(
    poolAddresses.map(async (address) => [address, await fetchPoolMeta(address)]),
  );
  const metaByPool = new Map(metaEntries);

  const positions = flattened
    .map((position) => summarizePosition(position, metaByPool.get(position.poolAddress)))
    // Out-of-range first: those are the ones that need a decision. Within a
    // group, the biggest position leads, since that is where the money is.
    .sort((a, b) => Number(a.earning) - Number(b.earning) || (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const data = {
    wallet,
    positions,
    totals: summarizeWallet(positions),
    readAt: new Date().toISOString(),
  };

  positionCache.set(wallet, { data, expiresAt: Date.now() + POSITION_CACHE_MS });
  return data;
};

/** Drop a wallet's cached read, so a manual refresh actually hits the chain. */
export const invalidateWallet = (wallet) => positionCache.delete(wallet);
