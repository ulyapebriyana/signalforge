import "dotenv/config";
import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { appendSample, pruneStore, summarizeVelocity } from "../shared/feeVelocity.js";
import { gmgnAuthQuery, normalizeGmgnToken } from "../shared/gmgn.js";
import { normalizePool, PRESETS, resolvePresetId } from "../shared/scoring.js";
import { collectSignalEntries } from "../shared/signalTransitions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 4173);
const scanIntervalSeconds = Math.max(20, Number(process.env.SCAN_INTERVAL_SECONDS || 30));
const scannerPresetName = resolvePresetId(process.env.SCANNER_PRESET);
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
 */
const trackFeeVelocity = (pools, sampledAt) => {
  for (const pool of pools) {
    feeVelocityStore.set(pool.address, appendSample(feeVelocityStore.get(pool.address), pool.feeTvl1h, sampledAt));
  }
  pruneStore(feeVelocityStore, pools.map((pool) => pool.address), sampledAt);
  persistFeeVelocity();

  return pools.map((pool) => ({
    ...pool,
    feeVelocity: summarizeVelocity(feeVelocityStore.get(pool.address), sampledAt),
  }));
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

const loadPools = async ({ force = false } = {}) => {
  const cacheAge = Date.now() - poolCacheAt;
  if (!force && poolCache && cacheAge < scanIntervalSeconds * 1_000 - 1_000) return poolCache;
  if (activeFetch) return activeFetch;

  activeFetch = (async () => {
    const query = new URLSearchParams({ page: "1", page_size: "250", sort_by: "volume_1h:desc" });
    const upstream = await fetchJson(`${dataApi}/pools?${query}`);
    const rawPools = Array.isArray(upstream.data) ? upstream.data : [];

    const candidates = rawPools
      .map((pool) => ({ raw: pool, normalized: normalizePool(pool) }))
      .filter(({ normalized }) =>
        normalized.marketCap >= 50_000 &&
        normalized.marketCap <= 15_000_000 &&
        normalized.tvl >= 300 &&
        normalized.volume1h >= 1_000,
      )
      .slice(0, 48);

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
        scannedCount: rawPools.length,
        totalAvailable: Number(upstream.total || rawPools.length),
        enrichedCount: enriched.length,
        scanIntervalSeconds,
      },
    };
    poolCacheAt = Date.now();
    recordDetectedSignals(enriched);
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

const alertMessage = (pool, source = "manual") => [
  `<b>SignalForge · ${escapeHtml(pool.status.toUpperCase())}</b>`,
  `<b>${escapeHtml(pool.pair)}</b> · Score ${pool.score}/100 · Risk ${pool.risk}/100`,
  `1h: <b>${pool.priceChange1h?.toFixed(1) ?? "—"}%</b>`,
  `TVL: ${usd(pool.tvl)} · Vol 1h: ${usd(pool.volume1h)}`,
  `Vol/TVL: ${pool.volumeTvl1h.toFixed(2)}x · Fee/TVL: ${pool.feeTvl1h.toFixed(2)}%`,
  `MC: ${usd(pool.marketCap)} · Holder: ${pool.holders.toLocaleString("en-US")}`,
  `<a href="https://www.meteora.ag/dlmm/${pool.address}">Buka pool di Meteora</a>`,
  `<i>${source === "auto" ? "Alert otomatis" : "Dikirim manual"}; ini bukan rekomendasi finansial.</i>`,
].join("\n");

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
    const cooldownKey = `${pool.address}:${status}`;
    if (Date.now() - (detectionCooldowns.get(cooldownKey) || 0) < cooldownMs) continue;
    detectionCooldowns.set(cooldownKey, Date.now());
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
  });
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
    await sendTelegram(alertMessage(pool));
    recordSignal(pool, "manual", true);
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Alert gagal" });
  }
});

const runAlertScan = async () => {
  if (process.env.ENABLE_ALERTS !== "true" || !telegramConfigured()) return;
  try {
    const payload = await loadPools({ force: true });
    const presetName = scannerPresetName;
    const preset = PRESETS[presetName];
    const minScore = Number(process.env.ALERT_MIN_SCORE || preset.minScore);
    const maxRisk = Number(process.env.ALERT_MAX_RISK || preset.maxRisk);
    const cooldownMs = Number(process.env.ALERT_COOLDOWN_MINUTES || preset.cooldownMinutes) * 60_000;

    for (const pool of payload.data) {
      if (!pool.qualifies[presetName].passed || pool.score < minScore || pool.risk > maxRisk) continue;
      if (Date.now() - (alertCooldowns.get(pool.address) || 0) < cooldownMs) continue;
      try {
        await sendTelegram(alertMessage(pool, "auto"));
        alertCooldowns.set(pool.address, Date.now());
        recordSignal(pool, "auto", true);
      } catch {
        recordSignal(pool, "auto", false);
      }
    }
  } catch {
    // The dashboard status communicates upstream failures; the loop retries next interval.
  }
};

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

const shutdown = async () => {
  clearInterval(timer);
  await vite?.close();
  server.close();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
