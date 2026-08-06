import { PRESETS } from "../../../shared/scoring.js";

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Score buckets used by the distribution readout. Boundaries match the status thresholds. */
export const SCORE_BUCKETS = [
  { floor: 0, ceil: 50, label: "0–49" },
  { floor: 50, ceil: 65, label: "50–64" },
  { floor: 65, ceil: 80, label: "65–79" },
  { floor: 80, ceil: 101, label: "80+" },
];

export function summarize(pools = [], presetId = "safer") {
  const preset = PRESETS[presetId] ? presetId : "safer";
  const qualified = pools.filter((pool) => pool.qualifies?.[preset]?.passed);
  const hot = qualified.filter((pool) => pool.score >= 80);
  const watch = qualified.filter((pool) => pool.score >= 65 && pool.score < 80);
  const scores = pools.map((pool) => pool.score).filter(Number.isFinite);
  const risks = pools.map((pool) => pool.risk).filter(Number.isFinite);

  const movers = pools
    .filter((pool) => Number.isFinite(pool.priceChange1h))
    .sort((a, b) => b.priceChange1h - a.priceChange1h);

  return {
    enriched: pools.length,
    qualified,
    hot,
    watch,
    medianRisk: median(risks),
    medianScore: median(scores),
    topScore: scores.length ? Math.max(...scores) : 0,
    gainers: movers.slice(0, 5),
    losers: movers.slice(-5).reverse(),
    totalFees1h: pools.reduce((sum, pool) => sum + (pool.totalFees1h || 0), 0),
    totalTvl: pools.reduce((sum, pool) => sum + (pool.tvl || 0), 0),
    totalVolume1h: pools.reduce((sum, pool) => sum + (pool.volume1h || 0), 0),
    distribution: SCORE_BUCKETS.map((bucket) => ({
      ...bucket,
      count: pools.filter((pool) => pool.score >= bucket.floor && pool.score < bucket.ceil).length,
    })),
    /** 0–1, feeds the heat of the landing ingot. */
    heat: pools.length ? Math.min(1, 0.22 + (hot.length / Math.max(6, pools.length / 4)) * 0.78) : 0.3,
  };
}
