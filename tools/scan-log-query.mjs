#!/usr/bin/env node
/**
 * Reads data/scan-log.db (see shared/scanLog.js) to answer "when did X first
 * pass preset Y" without guessing from the one alert that survived the
 * signal-history.json 250-row cap.
 *
 * Usage:
 *   node tools/scan-log-query.mjs EYE
 *   node tools/scan-log-query.mjs EYE --preset heartattack
 *   node tools/scan-log-query.mjs EYE --preset heartattack --since 2026-08-18
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "scan-log.db");

const args = process.argv.slice(2);
const term = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
};
const preset = flag("preset");
const since = flag("since");
const limit = Number(flag("limit") || 200);

if (!term) {
  console.error("Usage: node tools/scan-log-query.mjs <pair or address substring> [--preset id] [--since YYYY-MM-DD] [--limit N]");
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

const sinceMs = since ? new Date(since).getTime() : 0;
const rows = db.prepare(`
  SELECT scanned_at, address, pair, score, risk, status, price_change_1h,
         tvl, volume_1h, market_cap, gmgn_volume_5m, token_burst, pool_burst, qualifies
  FROM scan_log
  WHERE (pair LIKE ? OR address LIKE ?) AND scanned_at >= ?
  ORDER BY scanned_at ASC
  LIMIT ?
`).all(`%${term}%`, `%${term}%`, sinceMs, limit);

if (rows.length === 0) {
  console.log(`Tidak ada baris untuk "${term}" di data/scan-log.db.`);
  process.exit(0);
}

for (const row of rows) {
  const t = new Date(row.scanned_at).toISOString();
  const qualifies = JSON.parse(row.qualifies || "{}");
  let gateNote = "";
  if (preset) {
    const result = qualifies[preset];
    gateNote = result
      ? (result.passed ? "  PASS" : `  fail: ${result.misses.join(", ")}`)
      : "  (preset tidak dikenal)";
  } else {
    const passed = Object.entries(qualifies).filter(([, r]) => r?.passed).map(([id]) => id);
    gateNote = passed.length ? `  passes: ${passed.join(", ")}` : "  passes: (none)";
  }
  console.log(
    `${t}  ${row.pair}  score=${row.score} risk=${row.risk} 1h=${row.price_change_1h?.toFixed?.(1) ?? "—"}% ` +
    `tvl=${row.tvl} vol1h=${row.volume_1h} mc=${row.market_cap} gmgnVol5m=${row.gmgn_volume_5m}${gateNote}`,
  );
}

console.log(`\n${rows.length} baris, ${new Date(rows[0].scanned_at).toISOString()} → ${new Date(rows.at(-1).scanned_at).toISOString()}`);
