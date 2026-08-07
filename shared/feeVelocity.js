/**
 * Fee velocity — how fast a pool's fee/TVL is decaying.
 *
 * The gate in scoring.js can only ask whether a pool is paying *right now*. The
 * exit rule the Auzhinta-like preset is modelled on is a rate of change: leave
 * when the fee stops flowing, regardless of price. That needs memory across
 * scans, which is what this module holds — the server appends one sample per
 * pool per scan and hands the summary back on the payload.
 *
 * Everything here is pure so the decay rules can be tested without a scan loop.
 */

/** Samples older than this are dropped. Roughly the length of a position. */
export const VELOCITY_WINDOW_MS = 45 * 60_000;

/** Below this many samples there is no trend worth reporting. */
export const MIN_SAMPLES = 3;

/** Hard cap per pool, so a slow scan interval cannot grow the store unbounded. */
const MAX_SAMPLES = 120;

/** Current fee/TVL as a share of the window's peak, under which the pool reads as stalled. */
const STALLED_RATIO = 0.4;

/** Percentage change between the window's halves that counts as a real move. */
const TREND_PCT = 25;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Append one reading and drop whatever has aged out. Returns a new array; the
 * caller owns storage.
 */
export function appendSample(samples, feeTvl, now = Date.now(), windowMs = VELOCITY_WINDOW_MS) {
  const previous = Array.isArray(samples) ? samples : [];
  if (!Number.isFinite(feeTvl)) return previous;

  const cutoff = now - windowMs;
  const kept = previous.filter((sample) => Number.isFinite(sample?.t) && sample.t > cutoff);
  // A scan that serves cached data repeats the same timestamp; overwrite rather
  // than stack duplicates, otherwise a stalled scanner looks like a flat trend.
  if (kept.at(-1)?.t === now) kept[kept.length - 1] = { t: now, v: feeTvl };
  else kept.push({ t: now, v: feeTvl });

  return kept.length > MAX_SAMPLES ? kept.slice(kept.length - MAX_SAMPLES) : kept;
}

/**
 * Reduce a sample window to the numbers the UI shows.
 *
 * `trend` is deliberately ordered: a pool far off its peak reads as "stalled"
 * even while the last few samples tick up, because the machine that mattered
 * has already slowed. `ratioToPeak` is the headline — the closest standing
 * equivalent to comparing this half hour's fees against the first half hour.
 */
export function summarizeVelocity(samples, now = Date.now(), windowMs = VELOCITY_WINDOW_MS) {
  const window = (Array.isArray(samples) ? samples : []).filter(
    (sample) => Number.isFinite(sample?.t) && Number.isFinite(sample?.v) && sample.t > now - windowMs,
  );

  const empty = {
    samples: window.length,
    minutesTracked: 0,
    current: null,
    peak: null,
    ratioToPeak: null,
    changePct: null,
    trend: "unknown",
  };
  if (window.length < MIN_SAMPLES) return empty;

  const values = window.map((sample) => sample.v);
  const current = values.at(-1);
  const peak = Math.max(...values);
  const minutesTracked = Math.round((window.at(-1).t - window[0].t) / 60_000);

  const half = Math.floor(window.length / 2);
  const earlier = mean(values.slice(0, half));
  const recent = mean(values.slice(window.length - half));
  const changePct = earlier > 0 ? ((recent - earlier) / earlier) * 100 : null;
  const ratioToPeak = peak > 0 ? current / peak : null;

  let trend = "steady";
  if (ratioToPeak !== null && ratioToPeak < STALLED_RATIO) trend = "stalled";
  else if (changePct === null) trend = "unknown";
  else if (changePct <= -TREND_PCT) trend = "decaying";
  else if (changePct >= TREND_PCT) trend = "rising";

  return { samples: window.length, minutesTracked, current, peak, ratioToPeak, changePct, trend };
}

/** Prune pools the scanner has stopped returning, so the store follows the scan. */
export function pruneStore(store, liveAddresses, now = Date.now(), windowMs = VELOCITY_WINDOW_MS) {
  const live = new Set(liveAddresses);
  for (const [address, samples] of store) {
    const lastSeen = samples.at(-1)?.t ?? 0;
    if (!live.has(address) && lastSeen <= now - windowMs) store.delete(address);
  }
  return store;
}

export const VELOCITY_LABEL = Object.freeze({
  rising: "Naik",
  steady: "Stabil",
  decaying: "Melambat",
  stalled: "Mandek",
  unknown: "Belum cukup data",
});
