/**
 * Per-preset table layout, persisted to localStorage.
 *
 * The v1 format was a single array where *presence* meant visible and
 * *position* meant order — one field doing two jobs. TanStack splits those
 * into separate `columnOrder` / `columnVisibility` slices and adds pinning on
 * top, so the stored shape had to change. `migrateV1` converts the old arrays
 * in place rather than discarding them: a saved Heart Attack layout from
 * before that refactor still opens the same way after it.
 *
 * Column widths are no longer stored. They were a `columnSizing` slice while
 * the table had drag-to-resize handles; the handles are gone, so every column
 * now takes the width its definition declares and there is nothing per-user to
 * remember. A stored `columnSizing` key from an older save is simply ignored.
 */

/**
 * Columns that are structural rather than chosen — the star, the pool identity,
 * the score badge, and the trailing link. The picker never lists them because
 * there is nothing useful to hide about them. They *are* carried in the order
 * state, and they can be dragged and pinned from the header like any other.
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
 * Makes an order array *total*: every known column appears exactly once, in the
 * stored order where one exists and in catalogue order where it does not.
 *
 * Totality is what lets show/hide leave the order untouched. TanStack appends
 * any column missing from `columnOrder` after every listed one, so a column
 * absent from the array would reappear past the trailing link when un-hidden,
 * rather than back in the slot it was hidden from.
 */
export const normalizeOrder = (order, allMiddleKeys) => {
  const known = new Set([...LEADING_COLUMN_IDS, ...allMiddleKeys, ...TRAILING_COLUMN_IDS]);
  const seen = new Set();
  const kept = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (!known.has(id) || seen.has(id) || TRAILING_COLUMN_IDS.includes(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return [
    ...LEADING_COLUMN_IDS.filter((id) => !seen.has(id)),
    ...kept,
    ...allMiddleKeys.filter((id) => !seen.has(id)),
    ...TRAILING_COLUMN_IDS,
  ];
};

/**
 * Pinned regions render in `columnPinning` array order, not in `columnOrder`
 * — they are separate slices and TanStack reads each region's own array. Left
 * alone the two drift apart, and a column dragged past its neighbour would not
 * move while both were pinned. Re-sorting the regions by the order array after
 * every change keeps `columnOrder` the single answer to "which column comes
 * first", and leaves pinning to answer only "which region is it in".
 */
export const alignPinning = (pinning, order) => {
  const rank = new Map(order.map((id, index) => [id, index]));
  const region = (ids) =>
    [...new Set(Array.isArray(ids) ? ids : [])]
      .filter((id) => rank.has(id))
      .sort((a, b) => rank.get(a) - rank.get(b));
  return { start: region(pinning?.start), end: region(pinning?.end) };
};

/**
 * Moves `fromId` into `toId`'s slot, keeping every other column's relative
 * order. Dragging rightwards lands *after* the target and leftwards *before*
 * it, which is what makes a drag onto the neighbouring column swap the pair
 * rather than doing nothing.
 */
export const moveColumnId = (order, fromId, toId) => {
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return order;
  const next = order.filter((id) => id !== fromId);
  const anchor = next.indexOf(toId);
  next.splice(from < to ? anchor + 1 : anchor, 0, fromId);
  return next;
};

/**
 * Only explicit `false` hides a column in TanStack — an absent entry reads as
 * visible — so every hidden key has to be written out rather than omitted.
 */
const visibilityFrom = (middleOrder, allMiddleKeys) =>
  Object.fromEntries(
    allMiddleKeys.filter((key) => !middleOrder.includes(key)).map((key) => [key, false]),
  );

const defaultPinning = () => ({ start: [...LEADING_COLUMN_IDS], end: [] });

/** The three slices together, with order and pinning always in agreement. */
const layout = (order, columnVisibility, pinning, allMiddleKeys) => {
  const columnOrder = normalizeOrder(order, allMiddleKeys);
  return { columnOrder, columnVisibility, columnPinning: alignPinning(pinning, columnOrder) };
};

/**
 * Reads a v1 array and rebuilds the current slices from it. Returns null when
 * there is nothing to migrate, so the caller falls through to the defaults.
 */
const migrateV1 = (presetId, allMiddleKeys) => {
  try {
    const saved = JSON.parse(localStorage.getItem(V1_KEY(presetId)) || "null");
    if (!Array.isArray(saved) || !saved.length) return null;
    const order = saved.filter((key) => allMiddleKeys.includes(key));
    if (!order.length) return null;
    return layout(
      fullColumnOrder(order),
      visibilityFrom(order, allMiddleKeys),
      defaultPinning(),
      allMiddleKeys,
    );
  } catch {
    return null;
  }
};

/**
 * `defaultMiddleOrder` is the preset's own column list — the fallback when the
 * user has never touched this preset's table.
 */
export const loadTablePrefs = (presetId, defaultMiddleOrder, allMiddleKeys) => {
  const fallback = () =>
    layout(
      fullColumnOrder(defaultMiddleOrder),
      visibilityFrom(defaultMiddleOrder, allMiddleKeys),
      defaultPinning(),
      allMiddleKeys,
    );

  try {
    const raw = JSON.parse(localStorage.getItem(V2_KEY(presetId)) || "null");
    if (raw && raw.v === 2) {
      return layout(
        raw.columnOrder,
        raw.columnVisibility && typeof raw.columnVisibility === "object" ? raw.columnVisibility : {},
        raw.columnPinning && Array.isArray(raw.columnPinning.start) ? raw.columnPinning : defaultPinning(),
        allMiddleKeys,
      );
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
