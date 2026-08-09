/**
 * The Swanny-like rubric.
 *
 * Transcribed from the default threshold settings of the DLMM Checker its
 * author built and screens every token through before researching it. The tool
 * paints each metric green / yellow / red rather than passing or failing it, so
 * that shape is preserved here: the bands drive both the colour layer in the UI
 * and the preset gate, which rejects red and tolerates yellow.
 *
 * `higherIsBetter` marks the metrics the tool calls inverse. For those, green is
 * a floor; for the rest it is a ceiling.
 *
 * Two rows from the tool are deliberately absent. Its "GMGN Top 10 Holders"
 * duplicates "Top Holders" from a second source, and gating the same quantity
 * twice buys nothing. Its "GMGN Total Fees" carries thresholds (1 / 0.2) that do
 * not match the units the API returns, so rather than guess at what it means
 * only the unambiguous fee row is kept.
 */
export const SWANNY_RUBRIC = Object.freeze([
  { key: "rugCheckScore", label: "RugCheck score", green: 14, yellow: 25, higherIsBetter: false },
  { key: "organicScore", label: "Organic score", green: 80, yellow: 50, higherIsBetter: true },
  { key: "marketCap", label: "Market cap", green: 500_000, yellow: 100_000, higherIsBetter: true, unit: "usd" },
  { key: "tokenAgeHours", label: "Umur token", green: 168, yellow: 24, higherIsBetter: true, unit: "hours" },
  { key: "top10HoldersPct", label: "Top-10 holder", green: 15, yellow: 30, higherIsBetter: false, unit: "pct" },
  { key: "devBalancePct", label: "Saldo dev", green: 5, yellow: 15, higherIsBetter: false, unit: "pct" },
  { key: "gmgnSniperPct", label: "Sniper", green: 2, yellow: 5, higherIsBetter: false, unit: "pct" },
  { key: "gmgnSniperWallets", label: "Jumlah sniper", green: 5, yellow: 15, higherIsBetter: false },
  { key: "gmgnInsidersPct", label: "Insider", green: 5, yellow: 12, higherIsBetter: false, unit: "pct" },
  { key: "gmgnBundlerPct", label: "Bundler", green: 5, yellow: 12, higherIsBetter: false, unit: "pct" },
  { key: "gmgnPhishingPct", label: "Phishing", green: 2, yellow: 8, higherIsBetter: false, unit: "pct" },
  { key: "gmgnTotalFeesSol", label: "Total fee", green: 100, yellow: 20, higherIsBetter: true, unit: "sol" },
]);

/** Rows that cannot be filled without a GMGN key, so the UI can say so. */
export const SWANNY_GMGN_KEYS = Object.freeze(
  SWANNY_RUBRIC.filter((spec) => spec.key.startsWith("gmgn")).map((spec) => spec.key),
);

/**
 * Which band a value falls in. Unknown is its own answer, never green — the
 * whole point of the pre-filter is that an unread metric is not a clean one.
 */
export function bandOf(value, spec) {
  if (!Number.isFinite(value)) return "unknown";
  if (spec.higherIsBetter) {
    if (value >= spec.green) return "green";
    return value >= spec.yellow ? "yellow" : "red";
  }
  if (value <= spec.green) return "green";
  return value <= spec.yellow ? "yellow" : "red";
}

/** Every band for a pool, in rubric order. Drives the drawer panel. */
export function rubricReport(pool) {
  return SWANNY_RUBRIC.map((spec) => ({
    ...spec,
    value: Number.isFinite(pool?.[spec.key]) ? pool[spec.key] : null,
    band: bandOf(pool?.[spec.key], spec),
  }));
}

/** Counts per band, for a one-glance verdict. */
export function rubricTally(pool) {
  return rubricReport(pool).reduce(
    (tally, row) => ({ ...tally, [row.band]: tally[row.band] + 1 }),
    { green: 0, yellow: 0, red: 0, unknown: 0 },
  );
}
