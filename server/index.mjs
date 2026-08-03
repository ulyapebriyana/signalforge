import "dotenv/config";
import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePool, PRESETS } from "../shared/scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 4173);
const scanIntervalSeconds = Math.max(20, Number(process.env.SCAN_INTERVAL_SECONDS || 30));
const dataApi = "https://dlmm.datapi.meteora.ag";

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

let poolCache = null;
let poolCacheAt = 0;
let activeFetch = null;
let signalHistory = [];
const alertCooldowns = new Map();
const detectionCooldowns = new Map();
const historyFile = path.join(projectRoot, "data", "signal-history.json");
let historyWriteQueue = Promise.resolve();

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
    .then(async () => {
      await mkdir(path.dirname(historyFile), { recursive: true });
      const temporaryFile = `${historyFile}.tmp`;
      await writeFile(temporaryFile, snapshot, "utf8");
      await rename(temporaryFile, historyFile);
    })
    .catch(() => console.warn("Signal history could not be saved."));
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
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

    const enriched = await mapConcurrent(candidates, 6, async ({ raw }) => {
      const momentum = await fetchMomentum(raw.address);
      return normalizePool(raw, momentum);
    });

    enriched.sort((a, b) => b.score - a.score || b.volume1h - a.volume1h);
    const now = new Date().toISOString();
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

const recordSignal = (pool, source, delivered) => {
  signalHistory = [{
    id: `${pool.address}-${Date.now()}`,
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
    createdAt: new Date().toISOString(),
  }, ...signalHistory].slice(0, 250);
  persistHistory();
};

const recordDetectedSignals = (pools) => {
  const cooldownMs = 15 * 60_000;
  for (const pool of pools) {
    const qualified = pool.qualifies.safer.passed || pool.qualifies.yanman.passed;
    if (!qualified || pool.score < 65) continue;
    if (Date.now() - (detectionCooldowns.get(pool.address) || 0) < cooldownMs) continue;
    detectionCooldowns.set(pool.address, Date.now());
    recordSignal(pool, "scanner", null);
  }
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
    preset: PRESETS[process.env.SCANNER_PRESET] ? process.env.SCANNER_PRESET : "safer",
    historyPersistent: true,
  });
});

app.get("/api/history", (_request, response) => {
  response.json({ data: signalHistory });
});

app.delete("/api/history", (_request, response) => {
  signalHistory = [];
  detectionCooldowns.clear();
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
    const presetName = PRESETS[process.env.SCANNER_PRESET] ? process.env.SCANNER_PRESET : "safer";
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
await hydrateHistory();

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
