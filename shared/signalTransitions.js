import { poolTier } from "./scoring.js";

const SIGNAL_RANK = Object.freeze({ none: 0, watch: 1, hot: 2 });

export function getPoolSignalStatus(pool, presetName) {
  if (!pool?.qualifies?.[presetName]?.passed) return "none";
  const tier = poolTier(pool.score, presetName);
  return tier === "hot" || tier === "watch" ? tier : "none";
}

export function collectSignalEntries(pools, presetName, previousStatuses = new Map()) {
  const currentStatuses = new Map();
  const entries = [];

  for (const pool of pools) {
    const status = getPoolSignalStatus(pool, presetName);
    const previousStatus = previousStatuses.get(pool.address) || "none";
    currentStatuses.set(pool.address, status);

    if (SIGNAL_RANK[status] > SIGNAL_RANK[previousStatus]) {
      entries.push({ pool, status, previousStatus });
    }
  }

  return { currentStatuses, entries };
}
