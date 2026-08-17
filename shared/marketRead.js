/**
 * Market read — the pool's condition *right now*, rather than where it has been.
 *
 * Everything the screener showed before this module is a stock figure: TVL,
 * volume over the last hour, fee/TVL over the last hour. Those describe an hour
 * that is already over. A DLMM position measured in minutes — Heart Attack most
 * of all — is not entered on the hour that finished, it is entered on the rate
 * the pool is running at this minute.
 *
 * Every field below is derived from numbers already on the payload; nothing here
 * adds an upstream call. Each one fails to `null` rather than 0, because "not
 * readable" and "zero" mean opposite things when you are deciding to commit
 * liquidity.
 *
 * WHAT EACH FIGURE IS ACTUALLY MEASURING, because two of these fields are not
 * what their upstream names suggest and a ratio across the two would be
 * meaningless. All of this was checked against live scans, not assumed:
 *
 *   - GMGN's `volume_1m` / `volume_5m` are the TOKEN's volume across every
 *     venue it trades on, not this pool's. On a live scan a pool showed a 5m
 *     token volume of $105K against $2.8K of its own hourly volume — the token
 *     was ripping somewhere else entirely. So a GMGN figure may only ever be
 *     compared against another GMGN figure, and a Meteora figure only against
 *     another Meteora figure. `tokenBurst` and `poolBurst` are that rule made
 *     explicit: two separate readings, each internally consistent, never mixed.
 *
 *   - The discovery API's `active_tvl` is NOT the liquidity sitting in the
 *     active bin. Measured across a live scan it lands between 0.62x and 1.01x
 *     of the pool's TVL — sometimes slightly *above* it, which no subset can be.
 *     `fee_active_tvl_ratio / fee_tvl_ratio` comes out exactly equal to
 *     `tvl / active_tvl`, so the two carry one fact between them, not two. It is
 *     therefore reported as a plain share with that caveat attached, and no
 *     headline reading is built on it. Anything labelled "in-range yield" off
 *     this field would have been fiction.
 */

const num = (value) => (Number.isFinite(value) ? value : null);

const ratio = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
};

/**
 * Burst bands, shared by both burst readings. 1.0 means the recent window is
 * running at exactly the longer window's average pace.
 */
export const BURST_BANDS = Object.freeze({
  erupting: 2,
  accelerating: 1.2,
  holding: 0.8,
  cooling: 0.4,
});

/** Below these the windows are too thin for the ratio to mean anything. */
const MIN_TOKEN_VOLUME_5M = 500;
const MIN_POOL_VOLUME_24H = 2_000;

export const burstBand = (value) => {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= BURST_BANDS.erupting) return "erupting";
  if (value >= BURST_BANDS.accelerating) return "accelerating";
  if (value >= BURST_BANDS.holding) return "holding";
  if (value >= BURST_BANDS.cooling) return "cooling";
  return "dying";
};

export const BURST_LABEL = Object.freeze({
  erupting: "Meledak",
  accelerating: "Menguat",
  holding: "Bertahan",
  cooling: "Mendingin",
  dying: "Padam",
  unknown: "—",
});

/**
 * The five phases a runner passes through, ordered the way a position is worked:
 * get in while it ignites, hold while it runs, tighten at the peak, leave as it
 * fades, and never open into a dead one.
 */
export const PHASE_META = Object.freeze({
  igniting: {
    label: "Menyala",
    tone: "hot",
    blurb: "Menit terakhir berjalan jauh di atas pace lima menit terakhir.",
    action: "Jendela masuk. Range ketat, siap keluar dalam hitungan menit.",
  },
  running: {
    label: "Jalan",
    tone: "good",
    blurb: "Pace bertahan dan fee masih mengalir.",
    action: "Aman dipegang. Begitu burst turun di bawah 0.8x, siapkan exit.",
  },
  peaking: {
    label: "Puncak",
    tone: "warn",
    blurb: "Fee mulai melambat padahal flow masih kuat.",
    action: "Jangan menambah posisi. Ini titik ambil untung, bukan titik masuk.",
  },
  fading: {
    label: "Meredup",
    tone: "warn",
    blurb: "Flow dan fee sama-sama turun dari puncaknya.",
    action: "Exit by volume. Alasan masuk sudah tidak ada lagi.",
  },
  dead: {
    label: "Mati",
    tone: "bad",
    blurb: "Fee jauh di bawah puncak dan pace hampir berhenti.",
    action: "Tidak ada yang dipanen di sini. Lewati.",
  },
  unknown: {
    label: "Belum terbaca",
    tone: "muted",
    blurb: "Butuh volume 1m/5m (GMGN) atau minimal 3 pemindaian untuk membaca tren.",
    action: "Pakai angka mentah di bawah sampai datanya masuk.",
  },
});

/**
 * Which phase a pool is in.
 *
 * Two independent witnesses, deliberately: burst is flow, `feeVelocity` is
 * fee/TVL sampled across scans. They can disagree — flow can pick back up on a
 * pool whose fee has already collapsed — and when they do, the *worse* reading
 * wins. A position is closed on the first sign the machine stopped, not on the
 * last sign it was running.
 *
 * `tokenBurst` leads because it is the finest window available (one minute
 * against five). `poolBurst` stands in when GMGN gave nothing, at the cost of
 * being an hour against a day — coarse, but pool-scoped and always present.
 */
export function classifyPhase(pool = {}) {
  const burst = num(pool.tokenBurst) ?? num(pool.poolBurst);
  const trend = pool.feeVelocity?.trend ?? "unknown";
  const momentum = num(pool.priceChange1h);

  if (burst === null && trend === "unknown") return "unknown";

  // Either witness alone is enough to call it dead.
  if (trend === "stalled") return "dead";
  if (burst !== null && burst < 0.3) return "dead";

  if (trend === "decaying") return burst !== null && burst >= BURST_BANDS.accelerating ? "peaking" : "fading";
  if (burst !== null && burst < BURST_BANDS.cooling) return "fading";

  if (burst !== null && burst >= BURST_BANDS.erupting && (momentum === null || momentum > 0)) return "igniting";
  if (burst !== null && burst >= BURST_BANDS.accelerating && trend === "rising") return "igniting";
  if (burst !== null && burst < BURST_BANDS.holding) return "peaking";

  if (burst === null) {
    // No flow reading at all: fall back to fee velocity rather than guessing.
    if (trend === "rising") return "igniting";
    if (trend === "steady") return "running";
    return "unknown";
  }

  return "running";
}

/**
 * Derived rate figures. Pure, and safe to call on a pool that never reached
 * enrichment — every field is null when its input is missing.
 */
export function deriveMarketRead(pool = {}) {
  const tvl = num(pool.tvl);
  const volume1h = num(pool.volume1h);
  const volume24h = num(pool.volume24h);
  const volume1m = num(pool.gmgnVolume1m);
  const volume5m = num(pool.gmgnVolume5m);
  const feeTvl1h = num(pool.feeTvl1h);
  const swaps1h = num(pool.swaps1h);
  const ageHours = num(pool.ageHours);

  // Token flow: the last minute against the last five minutes' average pace.
  // Both sides are GMGN and both are token-wide, so the ratio is clean. This is
  // the finest window anything in the app can see.
  const tokenBurst =
    volume1m !== null && volume5m !== null && volume5m >= MIN_TOKEN_VOLUME_5M
      ? ratio(volume1m, volume5m / 5)
      : null;

  // Pool flow: this pool's last hour against its own daily pace. The daily
  // window is clipped to the pool's actual age — a two-hour-old pool's "24h"
  // volume covers two hours, and dividing it by 1,440 minutes anyway inflated
  // one live reading from 0.45x to 5.13x, turning a pool that was slowing into
  // one that looked like it was erupting.
  const dailyMinutes = ageHours === null ? 1_440 : Math.min(24, Math.max(ageHours, 1 / 60)) * 60;
  const poolBurst =
    volume24h !== null && volume1h !== null && volume24h >= MIN_POOL_VOLUME_24H
      ? ratio(volume1h / 60, volume24h / dailyMinutes)
      : null;

  // Fee as a share of the pool's TVL, per minute — the unit a hold measured in
  // minutes is paid in, where fee/TVL per hour is the same fact in a unit nobody
  // running this play holds for.
  const feePerMinPct = feeTvl1h === null ? null : feeTvl1h / 60;
  const minutesTo1Pct = feeTvl1h !== null && feeTvl1h > 0 ? 60 / feeTvl1h : null;

  // How much of the pool's whole TVL is traded through every minute.
  const poolTurnover = volume1h === null ? null : ratio(volume1h / 60, tvl);

  const avgTradeSize = volume1h !== null && swaps1h !== null && swaps1h > 0 ? volume1h / swaps1h : null;
  // One average trade as a share of pool TVL. High means the price is shoved
  // through bins trade by trade, which is how a tight range is exited by someone
  // else's market order rather than by a trend.
  const tradeImpact = ratio(avgTradeSize, tvl);

  // Whether this pool is where the token actually trades. The token's hourly
  // volume is extrapolated from its five-minute window, so this is an estimate
  // and is labelled as one everywhere it is shown — but the gap it exposes is
  // wide enough to survive the imprecision: a live scan had a pool carrying 0.2%
  // of its own token's flow, which no other figure in the app would have said.
  const venueShare =
    volume5m !== null && volume5m >= MIN_TOKEN_VOLUME_5M && volume1h !== null
      ? Math.min(1, ratio(volume1h, volume5m * 12) ?? Infinity)
      : null;

  // Reported as the plain share it is. See the header note: this is not the
  // active bin, and nothing downstream treats it as such.
  const activeShare = ratio(num(pool.activeTvl), tvl);

  return {
    tokenBurst,
    tokenBurstBand: burstBand(tokenBurst),
    poolBurst,
    poolBurstBand: burstBand(poolBurst),
    // True while the pool has not lived a full day, so its 24h window — already
    // age-corrected above — still rests on a short sample.
    poolBurstIsYoung: ageHours === null ? false : ageHours < 24,
    feePerMinPct,
    minutesTo1Pct,
    poolTurnover,
    avgTradeSize,
    tradeImpact,
    venueShare,
    activeShare,
  };
}

/**
 * Fee on a position of `size` USD over a hold, at the rate showing right now.
 * A projection of the present, not a forecast — the rate is exactly what decays
 * once the runner tops out.
 */
export function projectFees(pool = {}, sizeUsd = 1_000, minutes = 10) {
  const feePerMinPct = Number.isFinite(pool.feePerMinPct)
    ? pool.feePerMinPct
    : deriveMarketRead(pool).feePerMinPct;
  if (feePerMinPct === null || !Number.isFinite(sizeUsd) || sizeUsd <= 0) return null;

  const perMinute = (feePerMinPct / 100) * sizeUsd;
  return { perMinute, overHold: perMinute * minutes, minutes, sizeUsd };
}

/**
 * The whole scan read as one market, not a list of pools.
 *
 * The question this answers is the one asked before picking any row: is there
 * anything running right now, or is the market flat? A screener that only ever
 * shows a sorted list cannot say "nothing is moving" — it just shows the least
 * dead thing at the top.
 */
export function readMarket(pools = []) {
  const phases = { igniting: 0, running: 0, peaking: 0, fading: 0, dead: 0, unknown: 0 };
  const bursts = [];
  let volume1h = 0;
  let feePerHour = 0;

  for (const pool of pools) {
    phases[pool.phase ?? classifyPhase(pool)] += 1;
    const burst = num(pool.tokenBurst) ?? num(pool.poolBurst);
    if (burst !== null) bursts.push(burst);
    if (Number.isFinite(pool.volume1h)) volume1h += pool.volume1h;
    if (Number.isFinite(pool.totalFees1h)) feePerHour += pool.totalFees1h;
  }

  const sorted = [...bursts].sort((a, b) => a - b);
  const medianBurst = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const live = phases.igniting + phases.running;

  // Named off what a trader can actually do with the scan, not off a score.
  let condition = "sepi";
  if (phases.igniting >= 3) condition = "panas";
  else if (live >= 4) condition = "aktif";
  else if (live >= 1) condition = "tipis";

  return {
    phases,
    live,
    medianBurst,
    burstReadable: bursts.length,
    volume1h,
    feePerHour,
    feePerMin: feePerHour / 60,
    condition,
  };
}

export const MARKET_CONDITION_META = Object.freeze({
  panas: { label: "Panas", blurb: "Beberapa pool menyala bersamaan — ini jam kerja Heart Attack." },
  aktif: { label: "Aktif", blurb: "Ada yang jalan, tapi pilih-pilih. Cek burst sebelum masuk." },
  tipis: { label: "Tipis", blurb: "Cuma segelintir yang hidup. Sabar lebih murah daripada maksa." },
  sepi: { label: "Sepi", blurb: "Tidak ada yang berlari. Tidak ada yang perlu dibuka." },
});
