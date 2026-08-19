/**
 * Every scan's full pool list, persisted — not just the alerts that fired.
 * signal-history.json only records status-*entry* events and caps at 250
 * rows, so a pool that fires once and then gets crowded out by a handful of
 * hyperactive repeat-alerters (one pool logged 20 status-entries in a single
 * ~15h window) leaves no trace of what its score/gates looked like on the way
 * in. This keeps the raw per-scan reading for every pool the scanner looked
 * at, `qualifies` misses included, so "why did X only pass preset Y at time
 * Z" is answerable from the misses list on the scans just before Z rather
 * than guessed from the one alert that survived.
 */
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scan_log (
    scanned_at INTEGER NOT NULL,
    address TEXT NOT NULL,
    pair TEXT NOT NULL,
    base_symbol TEXT,
    score INTEGER,
    risk INTEGER,
    status TEXT,
    price_change_1h REAL,
    tvl REAL,
    volume_1h REAL,
    market_cap REAL,
    holders INTEGER,
    fee_tvl_1h REAL,
    token_burst REAL,
    pool_burst REAL,
    fee_per_min_pct REAL,
    gmgn_volume_1m REAL,
    gmgn_volume_5m REAL,
    qualifies TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scan_log_address_time ON scan_log(address, scanned_at);
  CREATE INDEX IF NOT EXISTS idx_scan_log_pair ON scan_log(pair);
  CREATE INDEX IF NOT EXISTS idx_scan_log_time ON scan_log(scanned_at);
`;

export const openScanLog = (dbPath) => {
  const db = new DatabaseSync(dbPath);
  // WAL + NORMAL: a scan writes ~70 rows every 20-30s on a small VPS shared
  // with three other PM2 apps — full fsync-per-commit durability isn't worth
  // the disk I/O here, and WAL lets /api reads happen without blocking on it.
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  return db;
};

const num = (value) => (Number.isFinite(value) ? value : null);

export const recordScan = (db, pools, scannedAt) => {
  const insert = db.prepare(`
    INSERT INTO scan_log (
      scanned_at, address, pair, base_symbol, score, risk, status,
      price_change_1h, tvl, volume_1h, market_cap, holders, fee_tvl_1h,
      token_burst, pool_burst, fee_per_min_pct, gmgn_volume_1m, gmgn_volume_5m, qualifies
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const pool of pools) {
      insert.run(
        scannedAt,
        pool.address,
        pool.pair,
        pool.baseSymbol ?? null,
        num(pool.score),
        num(pool.risk),
        pool.status ?? null,
        num(pool.priceChange1h),
        num(pool.tvl),
        num(pool.volume1h),
        num(pool.marketCap),
        num(pool.holders),
        num(pool.feeTvl1h),
        num(pool.tokenBurst),
        num(pool.poolBurst),
        num(pool.feePerMinPct),
        num(pool.gmgnVolume1m),
        num(pool.gmgnVolume5m),
        JSON.stringify(pool.qualifies ?? {}),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

/** Deletes rows older than retentionDays. Cheap; call it every hour or so, not every scan. */
export const pruneScanLog = (db, retentionDays) => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM scan_log WHERE scanned_at < ?").run(cutoff);
};
