const SIGNAL_RANK = Object.freeze({ none: 0, watch: 1, hot: 2 });

export function getPoolSignalStatus(pool, presetName) {
  if (!pool?.qualifies?.[presetName]?.passed || pool.score < 65) return "none";
  return pool.score >= 80 ? "hot" : "watch";
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
