import "dotenv/config";
import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { appendSample, pruneStore, summarizeVelocity } from "../shared/feeVelocity.js";
import { openScanLog, pruneScanLog, recordScan } from "../shared/scanLog.js";
import { gmgnAuthQuery, normalizeGmgnToken } from "../shared/gmgn.js";
import { classifyPhase, PHASE_META } from "../shared/marketRead.js";
import { normalizePool, poolTier, PRESETS, resolvePresetId } from "../shared/scoring.js";
import { alertPresetsFor, cooldownKey, presetsCleared } from "../shared/alertRouting.js";
import { collectSignalEntries } from "../shared/signalTransitions.js";
import { collectPositionAlerts, RANGE_LABEL } from "../shared/lpPositions.js";
import { configuredWallets, isValidWallet, readWalletPositions, rpcConfigured } from "./lpPositions.mjs";
import {
  clearPendingZap,
  pendingZapsFor,
  planPositionZapOut,
  prepareSwap,
  prepareWithdraw,
  sendSignedTransaction,
} from "./zapOut.mjs";
import { normalizeSlippageBps } from "../shared/zapOut.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 4173);
const scanIntervalSeconds = Math.max(20, Number(process.env.SCAN_INTERVAL_SECONDS || 30));
const scannerPresetName = resolvePresetId(process.env.SCANNER_PRESET);
// Slower than the pool scan on purpose: an RPC read walks every position
// account the wallet owns and is billed per call, while a position only changes
// when the price crosses a bin. The floor keeps a stray 5 in .env from emptying
// the RPC quota overnight.
const lpScanSeconds = Math.max(30, Number(process.env.LP_SCAN_SECONDS || 60));
const dataApi = "https://dlmm.datapi.meteora.ag";
const poolDiscoveryApi = "https://pool-discovery-api.datapi.meteora.ag";
const rugCheckApi = "https://api.rugcheck.xyz";
const gmgnApi = "https://openapi.gmgn.ai";
const gmgnCacheTtlMs = Math.max(5, Number(process.env.GMGN_CACHE_MINUTES || 10)) * 60_000;
const rugCheckCacheTtlMs = Math.max(5, Number(process.env.RUGCHECK_CACHE_MINUTES || 15)) * 60_000;
const rugCheckFailureTtlMs = 2 * 60_000;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

let poolCache = null;
let poolCacheAt = 0;
let activeFetch = null;
let signalHistory = [];
const alertCooldowns = new Map();
const detectionCooldowns = new Map();
const rugCheckCache = new Map();
const rugCheckClusterCache = new Map();
const gmgnCache = new Map();
let detectionStatuses = new Map();
let detectionInitialized = false;
const historyFile = path.join(projectRoot, "data", "signal-history.json");
let historyWriteQueue = Promise.resolve();

// Fee/TVL readings per pool, one per scan. Held here rather than in the pool
// cache because the whole point is to outlive a single scan — and persisted so
// a restart does not reset every position's decay history to zero.
const feeVelocityStore = new Map();
const feeVelocityFile = path.join(projectRoot, "data", "fee-velocity.json");
let feeVelocityWriteQueue = Promise.resolve();

// Raw per-scan history for every pool the scanner looked at — not just the
// alerts that fired. See shared/scanLog.js for why this exists alongside
// signalHistory rather than replacing it.
const scanLogDb = openScanLog(path.join(projectRoot, "data", "scan-log.db"));
const SCAN_LOG_RETENTION_DAYS = 45;
let scansSincePrune = 0;

const writeJsonAtomic = async (file, snapshot) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, snapshot, "utf8");
  await rename(temporaryFile, file);
};

const hydrateHistory = async () => {
  try {
    const parsed = JSON.parse(await readFile(historyFile, "utf8"));
    signalHistory = Array.isArray(parsed) ? parsed.slice(0, 250) : [];
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Signal history could not be loaded.");
  }
};

const persistHistory = () => {
  const snapshot = JSON.stringify(signalHistory, null, 2);
  historyWriteQueue = historyWriteQueue
    .then(() => writeJsonAtomic(historyFile, snapshot))
    .catch(() => console.warn("Signal history could not be saved."));
};

const hydrateFeeVelocity = async () => {
  try {
    const parsed = JSON.parse(await readFile(feeVelocityFile, "utf8"));
    for (const [address, samples] of Object.entries(parsed || {})) {
      if (Array.isArray(samples)) feeVelocityStore.set(address, samples);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Fee velocity history could not be loaded.");
  }
};

const persistFeeVelocity = () => {
  // Written compactly: this runs once per scan and holds a sample per pool per
  // scan, so indentation would triple the file for no reader's benefit.
  const snapshot = JSON.stringify(Object.fromEntries(feeVelocityStore));
  feeVelocityWriteQueue = feeVelocityWriteQueue
    .then(() => writeJsonAtomic(feeVelocityFile, snapshot))
    .catch(() => console.warn("Fee velocity history could not be saved."));
};

/**
 * Mark pools that are not the best venue for their own token.
 *
 * "Kalau ada beberapa pool pilihan di token yang sama, pilih yang volume dan
 * fees generated-nya paling gede — bukan yang fee rate-nya paling tinggi."
 * Meteora routinely lists the same token across several bin steps, and the
 * scanner shows them as separate rows, so this says which row is the one to
 * take. Reported rather than gated: the weaker pool is a worse choice, not an
 * unsafe one, and the caller may still want it on screen.
 */
const markBestPoolPerToken = (pools) => {
  const bestByToken = new Map();
  for (const pool of pools) {
    if (!pool.baseAddress) continue;
    const incumbent = bestByToken.get(pool.baseAddress);
    if (!incumbent || pool.totalFees1h > incumbent.totalFees1h) bestByToken.set(pool.baseAddress, pool);
  }

  return pools.map((pool) => {
    const best = pool.baseAddress ? bestByToken.get(pool.baseAddress) : null;
    const outranked = Boolean(best) && best.address !== pool.address;
    return {
      ...pool,
      isBestPoolForToken: !outranked,
      richerSiblingPool: outranked
        ? { address: best.address, binStep: best.binStep, totalFees1h: best.totalFees1h, tvl: best.tvl }
        : null,
    };
  });
};

/**
 * Record this scan's fee/TVL for every pool and hand back the decay summary.
 * Mutates the store, so it runs once per scan inside loadPools.
 *
 * Phase is settled here too, because it is the one market-read field that needs
 * both halves: the burst ratio normalizePool derived from this scan, and the fee
 * decay only this store remembers. Attaching it on the payload keeps the browser
 * and the Telegram alert reading the same call.
 */
const trackFeeVelocity = (pools, sampledAt) => {
  for (const pool of pools) {
    feeVelocityStore.set(pool.address, appendSample(feeVelocityStore.get(pool.address), pool.feeTvl1h, sampledAt));
  }
  pruneStore(feeVelocityStore, pools.map((pool) => pool.address), sampledAt);
  persistFeeVelocity();

  return pools.map((pool) => {
    const withVelocity = {
      ...pool,
      feeVelocity: summarizeVelocity(feeVelocityStore.get(pool.address), sampledAt),
    };
    return { ...withVelocity, phase: classifyPhase(withVelocity) };
  });
};

const fetchJson = async (url, options = {}) => {
  const { timeoutMs = 12_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * RugCheck rate-limits hard, and it was already costing us data: a burst of 39
 * mints at concurrency 6 — what the summary call did on its own — lost about a
 * third of its responses to 429 and cached them as "no data". Every request to
 * that host now queues behind one lane with a minimum gap, and retries once
 * when told to slow down. A full refresh takes ~15s, which the 15-minute cache
 * makes a non-issue.
 */
const RUGCHECK_SPACING_MS = 180;
let rugCheckQueue = Promise.resolve();

const rugCheckFetch = async (url, timeoutMs) => {
  const attempt = async () => {
    await new Promise((resolve) => setTimeout(resolve, RUGCHECK_SPACING_MS));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429) return { retry: true };
      if (!response.ok) throw new Error(`Upstream ${response.status}`);
      return { payload: await response.json() };
    } finally {
      clearTimeout(timeout);
    }
  };

  const run = rugCheckQueue.then(async () => {
    const first = await attempt();
    if (!first.retry) return first.payload;
    // One backoff, then give up: the cache keeps the miss short-lived.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const second = await attempt();
    if (second.retry) throw new Error("Upstream 429");
    return second.payload;
  });

  rugCheckQueue = run.then(() => undefined, () => undefined);
  return run;
};

/** Spread expiries so a whole scan's worth of mints never refreshes at once. */
const jitteredTtl = (base) => base * (0.8 + Math.random() * 0.4);

const fetchRugCheckSummary = async (mint) => {
  const cached = rugCheckCache.get(mint);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const payload = await rugCheckFetch(`${rugCheckApi}/v1/tokens/${mint}/report/summary`, 8_000);
    const data = {
      score: payload.score,
      score_normalised: payload.score_normalised,
      risks: Array.isArray(payload.risks) ? payload.risks : [],
      lpLockedPct: payload.lpLockedPct,
    };
    rugCheckCache.set(mint, { data, expiresAt: Date.now() + jitteredTtl(rugCheckCacheTtlMs) });
    return data;
  } catch {
    rugCheckCache.set(mint, { data: null, expiresAt: Date.now() + rugCheckFailureTtlMs });
    return null;
  }
};

/**
 * Connected wallet clusters, the machine-readable form of the Bubblemaps check.
 *
 * RugCheck's full report carries `insiderNetworks`: groups of wallets it linked
 * by transfers between them — the same thing as Bubblemaps' thick connecting
 * lines. The share of supply the biggest group holds is the number the strategy
 * actually acts on ("kalau ada satu cluster gede yang pegang 40%+ supply,
 * bahaya").
 *
 * Kept separate from the summary call on purpose: the summary reports a
 * liquidity-weighted lpLockedPct across every market, which the full report
 * only exposes per market. Deriving it here would quietly change a number the
 * UI already shows, so the cheap summary stays the source for that.
 *
 * An empty network list is a real answer (no clusters found) and reports 0. A
 * failed call reports null, which the preset gate treats as a reason not to
 * enter — an unread Bubblemaps is not a clean one.
 */
const fetchRugCheckClusters = async (mint) => {
  const cached = rugCheckClusterCache.get(mint);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const payload = await rugCheckFetch(`${rugCheckApi}/v1/tokens/${mint}/report`, 10_000);
    const supply = Number(payload?.token?.supply);
    const networks = Array.isArray(payload?.insiderNetworks) ? payload.insiderNetworks : [];
    const shares = supply > 0
      ? networks.map((network) => (Number(network?.tokenAmount) / supply) * 100).filter(Number.isFinite)
      : [];
    const largest = networks.length && shares.length
      ? networks[shares.indexOf(Math.max(...shares))]
      : null;

    const data = {
      largestPct: shares.length ? Math.max(...shares) : 0,
      largestWallets: largest ? Number(largest.size) || 0 : 0,
      count: networks.length,
      clusteredPct: shares.reduce((sum, share) => sum + share, 0),
      graphInsiders: Number(payload?.graphInsidersDetected) || 0,
    };
    rugCheckClusterCache.set(mint, { data, expiresAt: Date.now() + jitteredTtl(rugCheckCacheTtlMs) });
    return data;
  } catch {
    rugCheckClusterCache.set(mint, { data: null, expiresAt: Date.now() + rugCheckFailureTtlMs });
    return null;
  }
};

/**
 * GMGN token intel — snipers, bundlers, insiders, phishing share.
 *
 * These are the rows the Swanny-like rubric screens on that no other source we
 * call reports. Auth is an X-APIKEY header plus a timestamp and a per-request
 * UUID in the query; the server allows ±5s of clock drift and rejects replays
 * within 7s. Signing with the private key is only required for swap routes,
 * which this project never touches — the key is created read-only.
 *
 * Optional by design: with no GMGN_API_KEY the fields come back null and the
 * Swanny-like preset simply fails its GMGN rows, which is the same fail-closed
 * behaviour every other unreadable metric already has.
 */
const gmgnConfigured = () => Boolean(process.env.GMGN_API_KEY);

const GMGN_SPACING_MS = 120;
let gmgnQueue = Promise.resolve();

const fetchGmgnToken = async (mint) => {
  if (!gmgnConfigured()) return null;
  const cached = gmgnCache.get(mint);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const run = gmgnQueue.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, GMGN_SPACING_MS));
    const query = new URLSearchParams({
      address: mint,
      chain: "sol",
      ...gmgnAuthQuery(randomUUID),
    });
    return fetchJson(`${gmgnApi}/v1/token/info?${query}`, {
      timeoutMs: 8_000,
      headers: { "X-APIKEY": process.env.GMGN_API_KEY },
    });
  });
  gmgnQueue = run.then(() => undefined, () => undefined);

  try {
    const data = normalizeGmgnToken(await run);
    gmgnCache.set(mint, { data, expiresAt: Date.now() + jitteredTtl(gmgnCacheTtlMs) });
    return data;
  } catch {
    gmgnCache.set(mint, { data: null, expiresAt: Date.now() + rugCheckFailureTtlMs });
    return null;
  }
};

const fetchGmgnTokens = async (mints) => {
  const uniqueMints = [...new Set(mints.filter(Boolean))];
  const entries = await mapConcurrent(uniqueMints, 4, async (mint) => [mint, await fetchGmgnToken(mint)]);
  return new Map(entries);
};

const fetchRugCheckSummaries = async (mints) => {
  const uniqueMints = [...new Set(mints.filter(Boolean))];
  const entries = await mapConcurrent(uniqueMints, 4, async (mint) => {
    // The two calls fail independently: a token can have a readable cluster
    // graph and an unreadable summary, or the reverse. Both queue on the same
    // lane, so the concurrency here only governs how fast work is handed to it.
    const [summary, clusters] = await Promise.all([
      fetchRugCheckSummary(mint),
      fetchRugCheckClusters(mint),
    ]);
    if (!summary && !clusters) return [mint, null];
    return [mint, { ...(summary || {}), clusters }];
  });
  return new Map(entries);
};

const mapConcurrent = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
};

const fetchMomentum = async (address) => {
  try {
    const payload = await fetchJson(`${dataApi}/pools/${address}/ohlcv?timeframe=1h`);
    const candles = Array.isArray(payload.data) ? payload.data : [];
    const latest = candles.at(-1);
    const open = Number(latest?.open);
    const close = Number(latest?.close);
    return {
      priceChange1h: open > 0 && Number.isFinite(close) ? ((close - open) / open) * 100 : null,
      sparkline: candles.slice(-10).map((candle) => Number(candle.close)).filter(Number.isFinite),
    };
  } catch {
    return { priceChange1h: null, sparkline: [] };
  }
};

const fetchPoolAnalytics = async (addresses) => {
  if (!addresses.length) return new Map();

  try {
    const batches = Array.from({ length: Math.ceil(addresses.length / 24) }, (_, index) =>
      addresses.slice(index * 24, (index + 1) * 24));
    const payloads = await Promise.all(batches.map((batch) => {
      const query = new URLSearchParams({
        page_size: String(batch.length),
        category: "all",
        timeframe: "1h",
        filter_by: `pool_address=[${batch.join(",")}]`,
      });
      return fetchJson(`${poolDiscoveryApi}/pools?${query}`);
    }));
    const pools = payloads.flatMap((payload) => Array.isArray(payload.data) ? payload.data : []);
    return new Map(pools.map((pool) => [pool.pool_address, pool]));
  } catch {
    return new Map();
  }
};

/**
 * How many candidates each upstream page may contribute. The volume page keeps
 * the 48 it always had, so nothing that used to be scanned stops being scanned,
 * and the fee page adds 24 that the volume page did not already carry — the
 * budget counts pools actually taken, so a duplicate costs nothing and the walk
 * simply continues further down that page.
 *
 * The TVL page is the third, and it exists for Slow Wallet. Both other sorts
 * rank by flow, and their heads are therefore whatever is busiest right now —
 * measured 2026-08-19 across a ~2h window, the pools they carried that cleared
 * every one of Slow Wallet's safety gates topped out at 0.06%/h fee/TVL and
 * $53K of hourly volume, because a deep, verified, week-old pool is never the
 * busiest thing on the chain. Sorting by TVL is the only one of the three that
 * asks for depth directly, which is the property that preset is built around.
 *
 * 96 is therefore the enrichment budget, and enrichment is the expensive half of
 * a scan: one OHLCV call per pool, plus two RugCheck calls per distinct mint
 * down a single 180ms lane. Measured 2026-08-13, a cold scan went 20.3s at 48
 * candidates and 33–41s at 72 — over the 30s interval, which is tolerable only
 * because it happens once per restart (`activeFetch` makes a tick that lands
 * mid-scan await the running one instead of starting a second), and because a
 * warm scan is 1.6s. Re-measure before raising any budget again.
 */
const VOLUME_PAGE_BUDGET = 48;
const FEE_PAGE_BUDGET = 24;
const TVL_PAGE_BUDGET = 24;

/**
 * 25s rather than the 12s default, because a 250-row page is roughly half a
 * megabyte and the upstream serves it slowly: measured 2026-08-19 over six
 * cold calls, `tvl:desc` took 15.4–34.0s and `volume_1h:desc` 17.5–32.4s. At
 * the default the TVL page timed out often enough to drop out of a scan
 * silently — it is best-effort, so its failure costs 24 candidates with no
 * error anywhere — and the page it drops is the one Slow Wallet depends on.
 * The three pages are fetched in parallel, so this is 25s of wall clock for
 * all three, not each.
 */
const fetchPoolPage = async (sortBy) => {
  const query = new URLSearchParams({ page: "1", page_size: "250", sort_by: sortBy });
  const upstream = await fetchJson(`${dataApi}/pools?${query}`, { timeoutMs: 25_000 });
  return {
    rawPools: Array.isArray(upstream.data) ? upstream.data : [],
    total: Number(upstream.total || 0),
  };
};

/**
 * The ceiling was $15M until 2026-08-19, which quietly capped what the whole app
 * could ever screen for: every genuinely established pair on Solana — JUP, JTO,
 * WIF, PYTH, SOL/USDC — sits above it, so Slow Wallet was asked to find safe,
 * proven tokens inside a universe that by construction contained none of them.
 * $500M is set to admit those without opening the door to the majors, where a
 * one-sided DLMM position is a different trade than the one this app screens for.
 */
const admissibleCandidates = (rawPools) => rawPools
  .map((pool) => ({ raw: pool, normalized: normalizePool(pool) }))
  .filter(({ normalized }) =>
    normalized.marketCap >= 50_000 &&
    normalized.marketCap <= 500_000_000 &&
    normalized.tvl >= 300 &&
    normalized.volume1h >= 1_000,
  );

const loadPools = async ({ force = false } = {}) => {
  const cacheAge = Date.now() - poolCacheAt;
  if (!force && poolCache && cacheAge < scanIntervalSeconds * 1_000 - 1_000) return poolCache;
  if (activeFetch) return activeFetch;

  activeFetch = (async () => {
    /**
     * Two pages, because one sort cannot see the whole market. `volume_1h:desc`
     * ranks by size, so its head is old and large — measured 2026-08-13 the
     * youngest pool in the top 48 was 1.18h, and a preset gated on a 30-minute
     * window (Skolmbeagh-like) could never fire on it. `fee_tvl_ratio_1h:desc`
     * ranks by fee efficiency, which is exactly where a fresh migration lands:
     * on the same run it put two 12-minute-old pools in its top three.
     *
     * The fee page is best-effort. If it fails the scan proceeds on the volume
     * page alone, which is the behaviour that existed before it was added.
     * `created_at:desc` and `age:asc` would be the direct expression of what is
     * wanted here, but the upstream returns HTTP 400 for both.
     */
    const [byVolume, byFeeTvl, byTvl] = await Promise.all([
      fetchPoolPage("volume_1h:desc"),
      fetchPoolPage("fee_tvl_ratio_1h:desc").catch(() => ({ rawPools: [], total: 0 })),
      fetchPoolPage("tvl:desc").catch(() => ({ rawPools: [], total: 0 })),
    ]);

    const seen = new Set();
    const candidates = [];
    const takeFrom = (page, budget) => {
      let taken = 0;
      for (const entry of admissibleCandidates(page.rawPools)) {
        if (taken >= budget) break;
        if (seen.has(entry.raw.address)) continue;
        seen.add(entry.raw.address);
        candidates.push(entry);
        taken += 1;
      }
    };
    takeFrom(byVolume, VOLUME_PAGE_BUDGET);
    takeFrom(byFeeTvl, FEE_PAGE_BUDGET);
    takeFrom(byTvl, TVL_PAGE_BUDGET);

    const scannedAddresses = new Set(
      [...byVolume.rawPools, ...byFeeTvl.rawPools, ...byTvl.rawPools].map((pool) => pool.address),
    );

    const [momentumByPool, analyticsByPool, rugCheckByMint, gmgnByMint] = await Promise.all([
      mapConcurrent(candidates, 6, async ({ raw }) => [raw.address, await fetchMomentum(raw.address)]),
      fetchPoolAnalytics(candidates.map(({ raw }) => raw.address)),
      fetchRugCheckSummaries(candidates.map(({ normalized }) => normalized.baseAddress)),
      fetchGmgnTokens(candidates.map(({ normalized }) => normalized.baseAddress)),
    ]);
    const momentumMap = new Map(momentumByPool);
    const scoredAt = Date.now();
    const enriched = trackFeeVelocity(
      markBestPoolPerToken(candidates.map(({ raw, normalized }) => normalizePool(
        raw,
        momentumMap.get(raw.address),
        analyticsByPool.get(raw.address),
        rugCheckByMint.get(normalized.baseAddress),
        gmgnByMint.get(normalized.baseAddress),
      ))),
      scoredAt,
    );

    enriched.sort((a, b) => b.score - a.score || b.volume1h - a.volume1h);
    const now = new Date(scoredAt).toISOString();
    poolCache = {
      data: enriched,
      meta: {
        source: "Meteora DLMM API",
        apiHealthy: true,
        scannedAt: now,
        scannedCount: scannedAddresses.size,
        totalAvailable: Math.max(byVolume.total, byFeeTvl.total, byTvl.total) || scannedAddresses.size,
        enrichedCount: enriched.length,
        scanIntervalSeconds,
      },
    };
    poolCacheAt = Date.now();
    recordDetectedSignals(enriched);
    try {
      recordScan(scanLogDb, enriched, scoredAt);
      scansSincePrune += 1;
      // Every ~hour at the default 30s cadence, not every scan — the delete
      // itself is cheap but there is no reason to pay it 2,880 times a day.
      if (scansSincePrune >= 120) {
        scansSincePrune = 0;
        pruneScanLog(scanLogDb, SCAN_LOG_RETENTION_DAYS);
      }
    } catch (error) {
      console.error("scan-log write gagal:", error instanceof Error ? error.message : error);
    }
    return poolCache;
  })();

  try {
    return await activeFetch;
  } finally {
    activeFetch = null;
  }
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const usd = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(value);

const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

const sendTelegram = async (text) => {
  if (!telegramConfigured()) throw new Error("Telegram belum dikonfigurasi di file .env");
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error("Telegram menolak pesan. Periksa token dan chat ID.");
  return response.json();
};

/**
 * `presets` is the list a pool cleared. The tier in the header is read off the
 * first of them rather than pool.status, because that field is computed on the
 * default preset's ladder and would mislabel an alert fired by another.
 */
const alertMessage = (pool, source = "manual", presets = []) => {
  const named = presets.length ? presets : [PRESETS[scannerPresetName]];
  const tier = poolTier(pool.score, named[0]);
  const labels = named.map((preset) => escapeHtml(preset.label)).join(" + ");
  const phase = pool.phase ?? classifyPhase(pool);

  // The alert arrives on a phone, and the decision it triggers is made in under
  // a minute. So it leads with rate — phase, burst, per-minute yield on in-range
  // capital — and keeps the stock figures (TVL, MC, holders) below them as
  // context. That ordering is the whole difference between "something happened
  // in this pool" and "this pool is running right now".
  const rate = [
    Number.isFinite(pool.tokenBurst) ? `Burst token: <b>${pool.tokenBurst.toFixed(2)}x</b> (1m vs 5m)` : null,
    Number.isFinite(pool.poolBurst) ? `Burst pool: <b>${pool.poolBurst.toFixed(2)}x</b> (1j vs harian)` : null,
  ].filter(Boolean);

  const yieldLine = [
    Number.isFinite(pool.feePerMinPct) ? `Fee/menit: <b>${pool.feePerMinPct.toFixed(3)}%</b> TVL` : null,
    Number.isFinite(pool.minutesTo1Pct) ? `1% tiap ~${Math.round(pool.minutesTo1Pct)} menit` : null,
    Number.isFinite(pool.venueShare) ? `porsi venue ~${(pool.venueShare * 100).toFixed(0)}%` : null,
  ].filter(Boolean);

  return [
    `<b>SignalForge · ${escapeHtml(tier.toUpperCase())}</b> · ${escapeHtml(PHASE_META[phase].label)}`,
    `Preset: <b>${labels}</b>`,
    `<b>${escapeHtml(pool.pair)}</b> · Score ${pool.score}/100 · Risk ${pool.risk}/100`,
    ...(rate.length ? [rate.join(" · ")] : []),
    ...(yieldLine.length ? [yieldLine.join(" · ")] : []),
    `1h: <b>${pool.priceChange1h?.toFixed(1) ?? "—"}%</b> · Vol 1j: ${usd(pool.volume1h)} · Fee/TVL: ${pool.feeTvl1h.toFixed(2)}%`,
    `TVL: ${usd(pool.tvl)} · MC: ${usd(pool.marketCap)} · Holder: ${pool.holders.toLocaleString("en-US")}`,
    `<i>${escapeHtml(PHASE_META[phase].action)}</i>`,
    `<a href="https://www.meteora.ag/dlmm/${pool.address}">Buka pool di Meteora</a>`,
    `<i>${source === "auto" ? "Alert otomatis" : "Dikirim manual"}; ini bukan rekomendasi finansial.</i>`,
  ].join("\n");
};

const recordSignal = (pool, source, delivered, details = {}) => {
  signalHistory = [{
    id: `${pool.address}-${source}-${Date.now()}`,
    address: pool.address,
    pair: pool.pair,
    score: pool.score,
    risk: pool.risk,
    priceChange1h: pool.priceChange1h,
    status: pool.status,
    tvl: pool.tvl,
    volume1h: pool.volume1h,
    source,
    delivered,
    ...details,
    createdAt: new Date().toISOString(),
  }, ...signalHistory].slice(0, 250);
  persistHistory();
};

const recordDetectedSignals = (pools) => {
  const cooldownMs = 15 * 60_000;
  const { currentStatuses, entries } = collectSignalEntries(pools, scannerPresetName, detectionStatuses);

  if (!detectionInitialized) {
    detectionStatuses = currentStatuses;
    detectionInitialized = true;
    return;
  }

  for (const { pool, status, previousStatus } of entries) {
    const detectionKey = `${pool.address}:${status}`;
    if (Date.now() - (detectionCooldowns.get(detectionKey) || 0) < cooldownMs) continue;
    detectionCooldowns.set(detectionKey, Date.now());
    recordSignal(pool, "scanner", null, { eventType: "status-entry", previousStatus });
  }

  detectionStatuses = currentStatuses;
};

const findPool = async (address) => {
  const payload = await loadPools();
  return payload.data.find((pool) => pool.address === address);
};

app.get("/api/pools", async (request, response) => {
  try {
    const payload = await loadPools({ force: request.query.force === "1" });
    response.set("cache-control", "no-store");
    response.json(payload);
  } catch (error) {
    response.status(502).json({
      error: "Meteora API sedang tidak dapat dijangkau",
      detail: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
});

app.get("/api/status", (_request, response) => {
  response.json({
    telegramConfigured: telegramConfigured(),
    autoAlertsEnabled: process.env.ENABLE_ALERTS === "true",
    scanIntervalSeconds,
    preset: scannerPresetName,
    gmgnConfigured: gmgnConfigured(),
    historyPersistent: true,
    lpTrackingConfigured: rpcConfigured(),
    lpWallets: configuredWallets(),
    lpScanSeconds,
  });
});

/**
 * A wallet's live LP positions.
 *
 * The address may come from the query so the dashboard can track a wallet
 * without a redeploy, and it is validated before it reaches the RPC — this
 * endpoint must not become an open relay for arbitrary strings. Only public
 * data is involved either way: reading a position requires no signature and
 * this server holds no key that could produce one.
 */
app.get("/api/lp/positions", async (request, response) => {
  const requested = String(request.query.wallet || "").trim();
  const wallet = requested || configuredWallets()[0] || "";

  if (!wallet) {
    return response.status(400).json({ error: "Belum ada wallet. Isi LP_WALLETS di .env atau kirim ?wallet=" });
  }
  if (!isValidWallet(wallet)) {
    return response.status(400).json({ error: "Alamat wallet tidak valid" });
  }
  if (!rpcConfigured()) {
    return response.status(503).json({ error: "SOLANA_RPC_URL belum diisi di file .env" });
  }

  try {
    const payload = await readWalletPositions(wallet, { force: request.query.force === "1" });
    response.set("cache-control", "no-store");
    return response.json(payload);
  } catch (error) {
    return response.status(502).json({
      error: "Gagal membaca posisi dari chain",
      detail: error instanceof Error ? error.message : "Unknown RPC error",
    });
  }
});

/**
 * Zap out — three prepare steps and one relay, none of which sign anything.
 *
 * Every one of these re-reads the position from chain rather than trusting the
 * amounts the browser sends. A client that could name its own position size
 * would be naming how much gets withdrawn and swapped, so the only figures
 * these routes act on are ones the server fetched itself.
 */
const zapGuard = async (request, response) => {
  if (!rpcConfigured()) {
    response.status(503).json({ error: "SOLANA_RPC_URL belum diisi di file .env" });
    return null;
  }

  const wallet = String(request.body?.wallet || "").trim();
  const positionKey = String(request.body?.positionKey || "").trim();
  const targetMint = String(request.body?.targetMint || "").trim();
  const slippageBps = normalizeSlippageBps(request.body?.slippageBps);

  if (!isValidWallet(wallet)) {
    response.status(400).json({ error: "Alamat wallet tidak valid" });
    return null;
  }
  if (slippageBps === null) {
    response.status(400).json({ error: "Slippage di luar batas yang wajar" });
    return null;
  }

  const { positions } = await readWalletPositions(wallet, { force: true });
  const position = positions.find((item) => item.positionKey === positionKey);
  if (!position) {
    response.status(404).json({ error: "Posisi tidak ditemukan di wallet ini" });
    return null;
  }

  const pool = {
    name: position.pair,
    tokenX: { symbol: position.symbolX, address: position.mintX, decimals: position.decimalsX },
    tokenY: { symbol: position.symbolY, address: position.mintY, decimals: position.decimalsY },
  };
  return { wallet, position, pool, targetMint, slippageBps };
};

app.post("/api/lp/zap-out/plan", async (request, response) => {
  try {
    const context = await zapGuard(request, response);
    if (!context) return undefined;
    const plan = await planPositionZapOut(context);
    // The raw Jupiter route is large and only the server needs it; the browser
    // gets the numbers it must display and nothing it could tamper with.
    const { quoteRaw, ...visible } = plan;
    return response.json(visible);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Rencana gagal disusun" });
  }
});

app.post("/api/lp/zap-out/withdraw", async (request, response) => {
  try {
    const context = await zapGuard(request, response);
    if (!context) return undefined;
    const prepared = await prepareWithdraw(context);

    // A transaction that already fails in simulation must never reach a wallet
    // prompt — approving it would burn a fee to accomplish nothing.
    const broken = prepared.transactions.find((item) => item.simulationError);
    if (broken) {
      return response.status(409).json({
        error: "Simulasi penarikan gagal, transaksi tidak dikirim ke wallet",
        detail: broken.simulationError,
        logs: broken.logs,
      });
    }
    return response.json(prepared);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Penarikan gagal disiapkan" });
  }
});

/**
 * The swap leg deliberately does not go through `zapGuard`.
 *
 * By the time this runs the withdrawal has closed the position, so looking it
 * up would always 404 — the swap would fail every time it was actually needed.
 * What it needs was recorded before the withdrawal ran, and the amount is
 * bounded by the wallet's real balance, so nothing here relies on the caller's
 * numbers either.
 */
app.post("/api/lp/zap-out/swap", async (request, response) => {
  if (!rpcConfigured()) return response.status(503).json({ error: "SOLANA_RPC_URL belum diisi di file .env" });

  const wallet = String(request.body?.wallet || "").trim();
  const positionKey = String(request.body?.positionKey || "").trim();
  if (!isValidWallet(wallet)) return response.status(400).json({ error: "Alamat wallet tidak valid" });

  try {
    return response.json(await prepareSwap({ wallet, positionKey }));
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Swap gagal disiapkan" });
  }
});

/** Zap outs this wallet started but never finished, so the UI can offer a resume. */
app.get("/api/lp/zap-out/pending", async (request, response) => {
  const wallet = String(request.query.wallet || "").trim();
  if (!isValidWallet(wallet)) return response.status(400).json({ error: "Alamat wallet tidak valid" });
  if (!rpcConfigured()) return response.json({ pending: [] });

  try {
    return response.json({ pending: await pendingZapsFor(wallet) });
  } catch {
    // A resume offer is a convenience; failing to compute one must not break
    // the page that reports the positions themselves.
    return response.json({ pending: [] });
  }
});

app.post("/api/lp/send", async (request, response) => {
  if (!rpcConfigured()) return response.status(503).json({ error: "SOLANA_RPC_URL belum diisi di file .env" });
  const signedTransaction = String(request.body?.signedTransaction || "");
  if (!signedTransaction) return response.status(400).json({ error: "Transaksi kosong" });

  try {
    const result = await sendSignedTransaction({
      signedTransaction,
      blockhash: String(request.body?.blockhash || "") || null,
      lastValidBlockHeight: Number(request.body?.lastValidBlockHeight) || null,
    });

    // Sent once the swap lands, so a finished zap out stops offering a resume.
    const finished = String(request.body?.finishesPositionKey || "").trim();
    const wallet = String(request.body?.wallet || "").trim();
    if (finished && isValidWallet(wallet)) clearPendingZap(wallet, finished);

    return response.json(result);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Transaksi gagal dikirim" });
  }
});

app.get("/api/history", (_request, response) => {
  response.json({ data: signalHistory });
});

app.delete("/api/history", (_request, response) => {
  signalHistory = [];
  detectionCooldowns.clear();
  detectionStatuses = new Map();
  detectionInitialized = false;
  persistHistory();
  response.json({ ok: true });
});

app.post("/api/telegram/test", async (_request, response) => {
  try {
    await sendTelegram("<b>SignalForge tersambung.</b>\nAlert Meteora siap dikirim.");
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Telegram gagal" });
  }
});

app.post("/api/telegram/alert", async (request, response) => {
  try {
    const address = String(request.body?.address || "");
    const pool = await findPool(address);
    if (!pool) return response.status(404).json({ error: "Pool tidak ditemukan di hasil scan terbaru" });
    const cleared = presetsCleared(pool);
    await sendTelegram(alertMessage(pool, "manual", cleared));
    recordSignal(pool, "manual", true, { presets: cleared.map((preset) => preset.id) });
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Alert gagal" });
  }
});

const runAlertScan = async () => {
  if (process.env.ENABLE_ALERTS !== "true" || !telegramConfigured()) return;
  try {
    const payload = await loadPools({ force: true });
    const now = Date.now();

    for (const pool of payload.data) {
      // A pool that clears several screens gets one message naming all of them,
      // not one message per preset — the same alert twice reads as a bug.
      const presets = alertPresetsFor(pool, alertCooldowns, now);
      if (!presets.length) continue;

      const ids = presets.map((preset) => preset.id);
      try {
        await sendTelegram(alertMessage(pool, "auto", presets));
        for (const preset of presets) alertCooldowns.set(cooldownKey(pool.address, preset.id), now);
        recordSignal(pool, "auto", true, { presets: ids });
      } catch {
        recordSignal(pool, "auto", false, { presets: ids });
      }
    }
  } catch {
    // The dashboard status communicates upstream failures; the loop retries next interval.
  }
};

/** Position range states, tracked per wallet so one wallet cannot mask another. */
const positionStates = new Map();

/** Prices here span SOL-USDC to memecoins, so significant digits beat fixed ones. */
const price = (value) => (value === null || value === undefined
  ? "—"
  : Number(value).toPrecision(6).replace(/\.?0+$/, ""));

const money = (value) => (value === null || value === undefined ? "—" : usd(value));

/**
 * An out-of-range position is not a suggestion to close — it is a statement
 * that the position has stopped earning, which is a fact the LP should hear
 * immediately. The wording stays descriptive for the same reason the pool
 * alerts do: this project reports, it does not advise.
 */
const positionAlertMessage = ({ position, kind }) => {
  const heading = kind === "out-of-range"
    ? "POSISI KELUAR RANGE"
    : "POSISI DEKAT TEPI";
  const consequence = kind === "out-of-range"
    ? "Posisi berhenti menghasilkan fee sampai harga kembali masuk range."
    : "Masih dapat fee, tapi satu langkah lagi keluar range.";

  return [
    `<b>SignalForge · ${heading}</b>`,
    `<b>${escapeHtml(position.pair || position.poolAddress)}</b> · ${escapeHtml(RANGE_LABEL[position.rangeState])}`,
    `Range: ${price(position.lowerPrice)} – ${price(position.upperPrice)}`,
    `Harga aktif: <b>${price(position.activePrice)}</b>`,
    `Nilai posisi: ${money(position.valueUsd)} · Fee belum diklaim: ${money(position.unclaimedFeesUsd)}`,
    `Total fee didapat: ${money(position.totalFeesUsd)}`,
    consequence,
    `<a href="https://www.meteora.ag/dlmm/${position.poolAddress}">Buka pool di Meteora</a>`,
    "<i>Alert otomatis; ini bukan rekomendasi finansial.</i>",
  ].join("\n");
};

/**
 * Watch every configured wallet and report positions that stop earning.
 *
 * Only wallets from .env are scanned. A wallet typed into the dashboard is
 * read on demand but never alerted on, because alerting is a background job
 * that outlives the browser tab — it has to come from server configuration,
 * not from whatever a page last asked about.
 */
const runPositionScan = async () => {
  if (process.env.ENABLE_ALERTS !== "true" || !telegramConfigured() || !rpcConfigured()) return;

  for (const wallet of configuredWallets()) {
    if (!isValidWallet(wallet)) {
      console.warn(`LP_WALLETS berisi alamat tidak valid, dilewati: ${wallet}`);
      continue;
    }

    try {
      const { positions } = await readWalletPositions(wallet, { force: true });
      const { currentStates, entries } = collectPositionAlerts(positions, positionStates.get(wallet) || new Map());
      positionStates.set(wallet, currentStates);

      for (const entry of entries) {
        // Each transition fires once because the state map has already moved on;
        // a position flapping across its edge re-alerts only after it settles
        // and crosses again, which is a real event rather than noise.
        try {
          await sendTelegram(positionAlertMessage(entry));
        } catch {
          // Same posture as the pool alerts: the next scan retries the state it
          // still sees, and the dashboard shows the position either way.
        }
      }
    } catch {
      // An RPC hiccup must not kill the loop; the next interval retries.
    }
  }
};

// These were a single-preset knob. Alerts are now per preset, each with its own
// calibrated floor, so a shared override would silence whole presets instead of
// tuning them — ALERT_MIN_SCORE=65 alone would mute Auzhinta-like entirely.
const LEGACY_ALERT_VARS = ["ALERT_MIN_SCORE", "ALERT_MAX_RISK", "ALERT_COOLDOWN_MINUTES"];
const strandedAlertVars = LEGACY_ALERT_VARS.filter((name) => process.env[name]);
if (strandedAlertVars.length) {
  console.warn(
    `Ignoring ${strandedAlertVars.join(", ")}: alert thresholds now come from each preset. ` +
    "Remove them from .env to silence this warning.",
  );
}

let vite;
await Promise.all([hydrateHistory(), hydrateFeeVelocity()]);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.use((_request, response) => response.sendFile(path.join(projectRoot, "dist", "index.html")));
} else {
  const { createServer } = await import("vite");
  vite = await createServer({ root: projectRoot, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`SignalForge running on http://127.0.0.1:${port}`);
});

const timer = setInterval(runAlertScan, scanIntervalSeconds * 1_000);
setTimeout(runAlertScan, 3_000);

const positionTimer = setInterval(runPositionScan, lpScanSeconds * 1_000);
// The first pass only records where each position stands; it cannot alert
// without a previous reading to compare against, which is what makes a restart
// silent instead of replaying every position the wallet holds.
setTimeout(runPositionScan, 6_000);

const shutdown = async () => {
  clearInterval(timer);
  clearInterval(positionTimer);
  await vite?.close();
  server.close();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
