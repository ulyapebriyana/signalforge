/**
 * Per-preset table layout, persisted to localStorage.
 *
 * The v1 format was a single array where *presence* meant visible and
 * *position* meant order — one field doing two jobs. TanStack splits those
 * into separate `columnOrder` / `columnVisibility` slices and adds sizing and
 * pinning on top, so the stored shape had to change. `migrateV1` converts the
 * old arrays in place rather than discarding them: a saved Heart Attack layout
 * from before this refactor still opens the same way after it.
 */

/**
 * Columns that are structural rather than chosen — the star, the pool identity,
 * the score badge, and the trailing link. They are always present and always at
 * the edges, so the picker never lists them and the order state never carries
 * them. Kept pinned by default, which is what the old hardcoded sticky CSS was
 * expressing before pinning became a real feature.
 */
export const LEADING_COLUMN_IDS = Object.freeze(["star", "pair", "score"]);
export const TRAILING_COLUMN_IDS = Object.freeze(["link"]);

const V1_KEY = (presetId) => `signalforge:columns:${presetId}`;
const V2_KEY = (presetId) => `signalforge:table:${presetId}`;

/** Order state covers every leaf column, edges included, or pinning drifts. */
export const fullColumnOrder = (middleOrder) => [
  ...LEADING_COLUMN_IDS,
  ...middleOrder,
  ...TRAILING_COLUMN_IDS,
];

/**
 * Only explicit `false` hides a column in TanStack — an absent entry reads as
 * visible — so every hidden key has to be written out rather than omitted.
 */
const visibilityFrom = (middleOrder, allMiddleKeys) =>
  Object.fromEntries(
    allMiddleKeys.filter((key) => !middleOrder.includes(key)).map((key) => [key, false]),
  );

const defaultPinning = () => ({ start: [...LEADING_COLUMN_IDS], end: [] });

/**
 * Reads a v1 array and rebuilds the v2 slices from it. Returns null when there
 * is nothing to migrate, so the caller falls through to the preset's defaults.
 */
const migrateV1 = (presetId, allMiddleKeys) => {
  try {
    const saved = JSON.parse(localStorage.getItem(V1_KEY(presetId)) || "null");
    if (!Array.isArray(saved) || !saved.length) return null;
    const order = saved.filter((key) => allMiddleKeys.includes(key));
    if (!order.length) return null;
    return {
      columnOrder: fullColumnOrder(order),
      columnVisibility: visibilityFrom(order, allMiddleKeys),
      columnSizing: {},
      columnPinning: defaultPinning(),
    };
  } catch {
    return null;
  }
};

/**
 * `defaultMiddleOrder` is the preset's own column list — the fallback when the
 * user has never touched this preset's table.
 */
export const loadTablePrefs = (presetId, defaultMiddleOrder, allMiddleKeys) => {
  const fallback = () => ({
    columnOrder: fullColumnOrder(defaultMiddleOrder),
    columnVisibility: visibilityFrom(defaultMiddleOrder, allMiddleKeys),
    columnSizing: {},
    columnPinning: defaultPinning(),
  });

  try {
    const raw = JSON.parse(localStorage.getItem(V2_KEY(presetId)) || "null");
    if (raw && raw.v === 2) {
      // A column added to the app after this layout was saved is absent from
      // both slices. Treating it as visible-but-unordered would drop it at the
      // end silently; appending it explicitly keeps order state total.
      const known = new Set([...LEADING_COLUMN_IDS, ...allMiddleKeys, ...TRAILING_COLUMN_IDS]);
      const stored = Array.isArray(raw.columnOrder) ? raw.columnOrder.filter((id) => known.has(id)) : [];
      const missing = [...LEADING_COLUMN_IDS, ...allMiddleKeys, ...TRAILING_COLUMN_IDS]
        .filter((id) => !stored.includes(id));
      return {
        columnOrder: [...stored, ...missing],
        columnVisibility: raw.columnVisibility && typeof raw.columnVisibility === "object"
          ? raw.columnVisibility
          : {},
        columnSizing: raw.columnSizing && typeof raw.columnSizing === "object" ? raw.columnSizing : {},
        columnPinning: raw.columnPinning && Array.isArray(raw.columnPinning.start)
          ? { start: raw.columnPinning.start, end: raw.columnPinning.end || [] }
          : defaultPinning(),
      };
    }
    return migrateV1(presetId, allMiddleKeys) || fallback();
  } catch {
    return fallback();
  }
};

export const saveTablePrefs = (presetId, prefs) => {
  try {
    localStorage.setItem(V2_KEY(presetId), JSON.stringify({ v: 2, ...prefs }));
  } catch {
    // A full or blocked localStorage must not take the table down with it.
  }
};

export const clearTablePrefs = (presetId) => {
  try {
    localStorage.removeItem(V2_KEY(presetId));
    localStorage.removeItem(V1_KEY(presetId));
  } catch {
    // Same reasoning as saveTablePrefs.
  }
};
