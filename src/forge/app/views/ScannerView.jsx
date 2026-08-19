import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  FlexRender,
  filterFn_inNumberRange,
  filterFn_includesString,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  ExternalLink,
  Filter,
  LayoutGrid,
  ListFilter,
  Pin,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react";
import { MARKET_CONDITION_META, PHASE_META, readMarket } from "../../../../shared/marketRead.js";
import { PRESETS, poolTier } from "../../../../shared/scoring.js";
import { formatAge, formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars, riskBand, riskLabel } from "../../lib/heat.js";
import { Spark } from "../components/charts.jsx";
import {
  ActiveDepthCell,
  BurstCell,
  ClockCell,
  ConcentrationValue,
  FeeVelocityCell,
  EmptyState,
  HeatBadge,
  ImpactCell,
  JupShieldChip,
  momentumTone,
  optionalNumber,
  OrganicChip,
  PhaseChip,
  PoolAvatar,
  PoolBurstCell,
  RugCheckChip,
  TokenBurstCell,
  TurnoverCell,
  Unread,
  VenueShareCell,
  YieldCell,
} from "../components/bits.jsx";
import {
  alignPinning,
  clearTablePrefs,
  loadTablePrefs,
  moveColumnId,
  saveTablePrefs,
} from "../lib/tablePrefs.js";

/**
 * Only the features this table actually uses, which is the whole point of v9's
 * opt-in registration — an unregistered feature's state and methods do not
 * exist at all. `columnSizingFeature` stays even though nothing resizes any
 * more: a pinned column's sticky offset is the summed width of the columns
 * pinned before it, and those widths come from the sizing feature.
 *
 * Only the two filter functions the columns actually name are registered.
 * Spreading the whole `filterFns` export would pull every built-in into the
 * bundle for the sake of two of them.
 */
const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { inNumberRange: filterFn_inNumberRange, includesString: filterFn_includesString },
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnPinningFeature,
});

/**
 * Columns are grouped by the question they answer, and the groups are ordered
 * the way a pool is actually judged: what is it doing right now (rate), what is
 * it worth to be in range (yield), how big is the thing (size), and can it hurt
 * you (safety). The old list opened with stock figures — TVL, hourly volume —
 * which describe an hour that already finished.
 */
export const COLUMN_GROUPS = Object.freeze({
  rate: "Kondisi sekarang",
  yield: "Hasil per menit",
  size: "Ukuran & aliran",
  safety: "Keamanan",
});

/**
 * Each column carries its own renderer. This used to be a 130-line `switch`
 * living a few hundred lines away from the list, so adding a column meant
 * editing two places that had no way of telling you when they disagreed —
 * a key present here but missing there rendered as an empty cell, silently.
 *
 * `size` is the column's width in pixels, wide enough for the header's label
 * beside its sort icon and pin button — the table lays out fixed now, so a
 * column too narrow for its own title clips it rather than stretching to fit.
 *
 * `sortable: false` marks the columns whose cell is a shape rather than a value
 * (a chip, a sparkline): there is no meaningful ordering of those, and no
 * meaningful range to filter them by either, so they carry neither control.
 */
const usdCell = (key) => (pool) => <span className="f-num">{formatUsd(pool[key])}</span>;

/** GMGN and pool-discovery figures are absent rather than zero when unread. */
const optionalUsdCell = (key, why) => (pool) =>
  Number.isFinite(pool[key])
    ? <span className="f-num">{formatUsd(pool[key])}</span>
    : <Unread why={why} />;

const countCell = (key) => (pool) => <span className="f-num">{optionalNumber(pool[key])}</span>;

const ratioCell = (key) => (pool) =>
  Number.isFinite(pool[key])
    ? <span className="f-num">{pool[key].toFixed(2)}x</span>
    : <Unread />;

const percentCell = (key) => (pool) =>
  Number.isFinite(pool[key])
    ? <span className="f-num">{pool[key].toFixed(2)}%</span>
    : <Unread />;

export const COLUMNS = [
  // --- rate: the pool at this minute ---------------------------------------
  { key: "phase", label: "Fase", group: "rate", sortable: false, size: 104, render: (pool) => <PhaseChip phase={pool.phase} size="sm" /> },
  // The token's last minute against its last five. GMGN on both sides, and
  // token-wide on both sides — see shared/marketRead.js for why a GMGN figure
  // may never be divided by a Meteora one.
  { key: "tokenBurst", label: "Burst token", group: "rate", size: 132, render: (pool) => <TokenBurstCell pool={pool} /> },
  // This pool's hour against its own daily pace, Meteora on both sides.
  { key: "poolBurst", label: "Burst pool", group: "rate", size: 124, render: (pool) => <PoolBurstCell pool={pool} /> },
  { key: "feeVelocity", label: "Fee tren", group: "rate", sortable: false, size: 112, render: (pool) => <FeeVelocityCell velocity={pool.feeVelocity} /> },
  {
    key: "priceChange1h",
    label: "1j",
    group: "rate",
    size: 92,
    render: (pool) => <span className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</span>,
  },
  { key: "trend", label: "Tren", group: "rate", sortable: false, size: 92, render: (pool) => <Spark values={pool.sparkline} score={pool.score} width={72} height={22} /> },
  { key: "gmgnVolume1m", label: "Vol token 1m", group: "rate", size: 135, render: optionalUsdCell("gmgnVolume1m", "Butuh GMGN_API_KEY") },
  { key: "gmgnVolume5m", label: "Vol token 5m", group: "rate", size: 135, render: optionalUsdCell("gmgnVolume5m", "Butuh GMGN_API_KEY") },
  { key: "gmgnSwaps5m", label: "Swap token 5m", group: "rate", size: 150, render: countCell("gmgnSwaps5m") },

  // --- yield: what the pool pays, per minute -------------------------------
  { key: "feePerMinPct", label: "Fee/mnt", group: "yield", size: 116, render: (pool) => <YieldCell pool={pool} /> },
  { key: "minutesTo1Pct", label: "Waktu ke 1%", group: "yield", size: 134, render: (pool) => <ClockCell pool={pool} /> },
  { key: "feeTvl1h", label: "Fee/TVL", group: "yield", size: 104, render: (pool) => <span className="f-num">{pool.feeTvl1h.toFixed(2)}%</span> },
  {
    key: "totalFees1h",
    label: "Fee 1j",
    group: "yield",
    size: 148,
    render: (pool) => (
      <span className="fx-cell-stack">
        <span className="f-num">{formatUsd(pool.totalFees1h)}</span>
        <small className="f-num">
          LP {formatUsd(pool.lpFees1h)} · Prot {formatUsd(pool.protocolFees1h)}
        </small>
      </span>
    ),
  },
  { key: "avgFeePerMin", label: "Avg Fee/m", group: "yield", size: 118, render: optionalUsdCell("avgFeePerMin") },
  { key: "feeActiveTvl1h", label: "Fee/Active TVL", group: "yield", size: 150, render: percentCell("feeActiveTvl1h") },

  // --- size: the pool and the flow through it ------------------------------
  // The share of the token's own flow this pool carries — the reading that
  // catches a pool that looks busy while the token trades somewhere else.
  { key: "venueShare", label: "Porsi venue", group: "size", size: 126, render: (pool) => <VenueShareCell pool={pool} /> },
  { key: "poolTurnover", label: "Putaran TVL", group: "size", size: 129, render: (pool) => <TurnoverCell pool={pool} /> },
  { key: "tradeImpact", label: "Impact/trade", group: "size", size: 136, render: (pool) => <ImpactCell pool={pool} /> },
  { key: "tvl", label: "TVL", group: "size", size: 104, render: usdCell("tvl") },
  { key: "volume1h", label: "Vol 1j", group: "size", size: 104, render: usdCell("volume1h") },
  { key: "volume24h", label: "Vol 24j", group: "size", size: 104, render: usdCell("volume24h") },
  { key: "avgVolumePerMin", label: "Avg Vol/m", group: "size", size: 116, render: optionalUsdCell("avgVolumePerMin") },
  { key: "volumeTvl1h", label: "Vol/TVL", group: "size", size: 104, render: (pool) => <span className="f-num">{pool.volumeTvl1h.toFixed(2)}x</span> },
  // Reachable only through the picker, like Vol/Active TVL below it — neither
  // is in any preset's default list, but both read cleanly once shown.
  { key: "volumeActiveTvl1h", label: "Vol/Active TVL", group: "size", size: 147, render: ratioCell("volumeActiveTvl1h") },
  { key: "activeTvl", label: "Active TVL", group: "size", size: 119, render: (pool) => <ActiveDepthCell pool={pool} /> },
  { key: "swaps1h", label: "Swap", group: "size", size: 92, render: countCell("swaps1h") },
  { key: "avgSwapsPerMin", label: "Avg Swap/m", group: "size", size: 130, render: countCell("avgSwapsPerMin") },
  { key: "traders1h", label: "Trader", group: "size", size: 96, render: countCell("traders1h") },
  { key: "totalLps", label: "LP", group: "size", size: 88, render: countCell("totalLps") },
  { key: "ageHours", label: "Umur", group: "size", size: 96, render: (pool) => <span className="f-num">{formatAge(pool.ageHours)}</span> },

  // --- safety ---------------------------------------------------------------
  {
    key: "risk",
    label: "Risiko",
    group: "safety",
    size: 108,
    render: (pool) => (
      <span className={`fx-risk fx-risk--${riskBand(pool.risk)}`}>
        <strong className="f-num">{pool.risk}</strong>
        <small>{riskLabel(pool.risk)}</small>
      </span>
    ),
  },
  { key: "top10HoldersPct", label: "Top-10", group: "safety", size: 100, render: (pool) => <ConcentrationValue value={pool.top10HoldersPct} warningAt={30} dangerAt={50} /> },
  { key: "devBalancePct", label: "Dev", group: "safety", size: 92, render: (pool) => <ConcentrationValue value={pool.devBalancePct} warningAt={5} dangerAt={10} /> },
  { key: "jupShieldRank", label: "JupShield", group: "safety", size: 114, render: (pool) => <JupShieldChip pool={pool} /> },
  { key: "rugCheckScore", label: "RugCheck", group: "safety", size: 124, render: (pool) => <RugCheckChip pool={pool} /> },
  { key: "organicScore", label: "Organic", group: "safety", size: 108, render: (pool) => <OrganicChip pool={pool} /> },
];

const ALL_COLUMN_KEYS = COLUMNS.map((column) => column.key);

const GENERAL_COLUMNS = [
  "phase",
  "tokenBurst",
  "poolBurst",
  "feeVelocity",
  "priceChange1h",
  "trend",
  "feePerMinPct",
  "feeTvl1h",
  "tvl",
  "volume1h",
  "volumeTvl1h",
  "risk",
  "top10HoldersPct",
  "rugCheckScore",
  "ageHours",
];

/**
 * Each preset shows the columns its own play is decided on.
 *
 * The sharpest case is Heart Attack. It is worked in minutes, so an hourly
 * column tells you about a window three times longer than the whole hold: what
 * decides it is burst, the per-minute fee on in-range capital, how deep the
 * active bin is, and how hard a single trade shoves through it. Hourly TVL and
 * volume are still one click away in the picker; they are simply not what the
 * default view leads with any more.
 *
 * Anything not listed here falls back to GENERAL_COLUMNS.
 */
const PRESET_COLUMNS = {
  heartattack: [
    "phase",
    "tokenBurst",
    "poolBurst",
    "gmgnVolume5m",
    "venueShare",
    "feePerMinPct",
    "minutesTo1Pct",
    "tradeImpact",
    "feeVelocity",
    "priceChange1h",
    "tvl",
    "risk",
    "top10HoldersPct",
    "ageHours",
  ],
  slowwallet: [
    "priceChange1h",
    "trend",
    "feeVelocity",
    "feePerMinPct",
    "feeTvl1h",
    "tvl",
    "volume1h",
    "volume24h",
    "volumeTvl1h",
    "risk",
    "jupShieldRank",
    "rugCheckScore",
    "organicScore",
    "ageHours",
  ],
};

/**
 * Saved choices are per preset, because the presets no longer want the same
 * table. A single global list is why every preset used to open on the same
 * hourly columns regardless of the timescale it trades on.
 */
export const defaultColumnKeys = (presetId) => PRESET_COLUMNS[presetId] || GENERAL_COLUMNS;

/**
 * The slices TanStack owns for this table, resolved for a preset: the user's
 * saved layout when there is one, the preset's own list when there is not.
 * Sorting and column filters are deliberately not persisted — switching preset
 * should open on the sort that preset is judged by and on an unfiltered table,
 * not on whatever was last clicked.
 */
export const tableStateFor = (presetId) => ({
  ...loadTablePrefs(presetId, defaultColumnKeys(presetId), ALL_COLUMN_KEYS),
  sorting: defaultSort(presetId),
  // Per-column filters are a question asked of one scan, not a layout choice.
  // They are dropped on a preset switch for the same reason sorting is.
  columnFilters: [],
});

export const resetTableState = (presetId) => {
  clearTablePrefs(presetId);
  return tableStateFor(presetId);
};

/**
 * Where each preset opens its sort.
 *
 * Score answers "how good is this pool by the 100-point model", which is the
 * right lead for the slower presets. It is the wrong lead for a play held for
 * minutes: there, the pool that matters is the one accelerating hardest right
 * now, and that is burst.
 */
export const defaultSort = (presetId) =>
  presetId === "heartattack"
    ? [{ id: "tokenBurst", desc: true }]
    : [{ id: "score", desc: true }];

const TABS = [
  ["all", "Semua"],
  ["qualified", "Lolos gate"],
  ["hot", "Hot"],
  ["watch", "Watch"],
  ["skipped", "Gagal gate"],
  ["watchlist", "Watchlist"],
];

/**
 * `rank` is the column's position in a multi-sort, and the caller passes -1
 * while only one column is sorted — a "1" badge on a table sorted by exactly
 * one thing is noise. Once there are two, every sorted column is numbered:
 * badging only the second leaves the reader to infer which one leads.
 */
function SortIcon({ sorted, rank }) {
  if (!sorted) return <ChevronsUpDown />;
  return (
    <>
      {sorted === "asc" ? <ArrowUp /> : <ArrowDown />}
      {rank >= 0 ? <em className="fx-sort-rank f-num">{rank + 1}</em> : null}
    </>
  );
}

const NO_DRAG = Object.freeze({ id: null, index: -1, pinned: false, over: null, after: false });

/**
 * One button rather than three, cycling unpinned → kiri → kanan → unpinned.
 * Each state draws a different icon, so where a column is frozen is readable
 * without hovering for the tooltip.
 */
const PIN_STATES = {
  false: { icon: Pin, next: "start", title: "Bekukan kolom di kiri" },
  start: { icon: ArrowLeftToLine, next: "end", title: "Beku di kiri — klik untuk pindah ke kanan" },
  end: { icon: ArrowRightToLine, next: false, title: "Beku di kanan — klik untuk lepas" },
};

/**
 * The header owns three controls now: click to sort, drag to reorder, and a pin
 * toggle. They used to live in the column picker, two menus away from the
 * column they act on.
 *
 * The whole `th` is the drag handle — a 9px grip would be a smaller target than
 * the resize handle it replaces. Dragging is refused across pinning regions:
 * a frozen column and a scrolling one are laid out by different arrays, so
 * "dropping" one into the other could only ever look like nothing happened.
 */
function HeaderCell({ header, sortCount, dragRef, drag, onDrag, onMove, onPin, style, className }) {
  const { column } = header;
  const sorted = column.getIsSorted();
  const pinned = column.getIsPinned() || false;
  const pin = PIN_STATES[String(pinned)];
  const label = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
  const sortable = column.getCanSort();

  const isTarget = drag.over === column.id && drag.id && drag.id !== column.id;

  // What is being dragged is read from the ref, not from the rendered props:
  // `dragover` can fire in the same task as `dragstart`, before React has
  // re-rendered with the new source, and a handler reading the stale prop would
  // refuse that first hover.
  const accepts = () => {
    const source = dragRef.current;
    return Boolean(source.id) && source.id !== column.id && source.pinned === pinned;
  };

  const endDrag = () => {
    dragRef.current = NO_DRAG;
    onDrag(NO_DRAG);
  };

  return (
    <th
      scope="col"
      className={[
        className,
        drag.id === column.id ? "is-dragging" : "",
        isTarget ? (drag.after ? "is-drop-after" : "is-drop-before") : "",
      ].filter(Boolean).join(" ")}
      style={style}
      title={label}
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column.id);
        const source = { id: column.id, index: column.getIndex(), pinned, over: null, after: false };
        dragRef.current = source;
        onDrag(source);
      }}
      onDragOver={(event) => {
        // Leaving the event un-prevented is how a cross-region drag is refused:
        // the browser then shows "no drop" and never fires `drop` here.
        if (!accepts()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const source = dragRef.current;
        if (source.over === column.id) return;
        const next = { ...source, over: column.id, after: column.getIndex() > source.index };
        dragRef.current = next;
        onDrag(next);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = dragRef.current;
        if (accepts()) onMove(source.id, column.id);
        endDrag();
      }}
      onDragEnd={endDrag}
    >
      <div className="fx-th">
        <button
          type="button"
          className="fx-th-label"
          // Alt+arrow is the keyboard equivalent of the drag: the header is the
          // only place columns can be reordered now, so it cannot be a
          // pointer-only affordance.
          onKeyDown={(event) => {
            if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
            event.preventDefault();
            onMove(column.id, event.key === "ArrowLeft" ? -1 : 1);
          }}
          onClick={sortable ? column.getToggleSortingHandler() : undefined}
          title={
            sortable
              ? "Klik untuk urutkan · Shift+klik untuk urutan bertingkat · Alt+←/→ untuk geser"
              : "Alt+←/→ untuk geser kolom"
          }
        >
          <span className="fx-th-text">
            <FlexRender header={header} />
          </span>
          {sortable ? <SortIcon sorted={sorted} rank={sortCount > 1 ? column.getSortIndex() : -1} /> : null}
        </button>
        <button
          type="button"
          className={`fx-th-pin ${pinned ? "is-on" : ""}`}
          aria-pressed={Boolean(pinned)}
          aria-label={`${pin.title}: ${label}`}
          title={pin.title}
          onClick={() => onPin(column.id, pin.next)}
        >
          <pin.icon />
        </button>
      </div>
    </th>
  );
}

/**
 * The filter each column carries is decided by what its cell holds: a range for
 * the numbers, a substring for the one column that is a name. Columns whose
 * cell is a chip or a sparkline get nothing — see the COLUMNS comment.
 *
 * An empty box is not a filter of zero. `inNumberRange` reads a blank end as
 * open, and TanStack drops the entry entirely once both ends are blank, so
 * clearing both boxes restores the full list without a separate reset.
 */
function ColumnFilter({ column }) {
  const value = column.getFilterValue();
  const label = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;

  if (column.columnDef.meta?.filter === "text") {
    return (
      <input
        className="fx-cf"
        type="search"
        value={value ?? ""}
        placeholder="cari"
        aria-label={`Saring ${label}`}
        onChange={(event) => column.setFilterValue(event.target.value)}
      />
    );
  }

  const [min, max] = Array.isArray(value) ? value : ["", ""];
  return (
    <span className="fx-cf-range">
      <input
        className="fx-cf f-num"
        type="number"
        value={min ?? ""}
        placeholder="min"
        aria-label={`${label} minimum`}
        onChange={(event) => column.setFilterValue([event.target.value, max ?? ""])}
      />
      <input
        className="fx-cf f-num"
        type="number"
        value={max ?? ""}
        placeholder="maks"
        aria-label={`${label} maksimum`}
        onChange={(event) => column.setFilterValue([min ?? "", event.target.value])}
      />
    </span>
  );
}

function NumberField({ label, value, suffix, onChange, step = 1, min }) {
  return (
    <label className="fx-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function Switch({ checked, onChange, children }) {
  return (
    <label className="fx-switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true">
        <i />
      </span>
      <strong>{children}</strong>
    </label>
  );
}

/**
 * The picker is now only a list of what is shown. Reordering and pinning moved
 * onto the header itself, where the column being moved is the one under the
 * cursor — they used to be here, two menus away from the table they changed.
 *
 * Showing a column does not move it: `columnOrder` covers every column whether
 * visible or not (see normalizeOrder), so a column comes back to the slot it
 * was hidden from rather than jumping to the end of the row.
 *
 * The structural columns — the star, the pool identity, the score, the link —
 * are absent because there is nothing useful to hide about them.
 */
function ColumnPicker({ table }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const visibility = table.state.columnVisibility;
  const shown = COLUMNS.filter((column) => visibility[column.key] !== false).length;

  return (
    <div className="fx-dropdown" ref={ref}>
      <button
        className={`f-btn f-btn--ghost ${open ? "is-open" : ""}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Columns3 /> Kolom <em className="f-num">{shown}</em>
      </button>
      {open ? (
        <div className="fx-dropdown-menu fx-dropdown-menu--columns" role="menu">
          <span className="f-eyebrow">Seret judul kolom di tabel untuk menata urutannya</span>
          {Object.entries(COLUMN_GROUPS).map(([group, title]) => (
            <div key={group}>
              <span className="f-eyebrow fx-dropdown-section">{title}</span>
              {COLUMNS.filter((column) => column.group === group).map((column) => (
                <label key={column.key} className="fx-dropdown-check">
                  <input
                    type="checkbox"
                    checked={visibility[column.key] !== false}
                    onChange={() => table.getColumn(column.key)?.toggleVisibility()}
                  />
                  {column.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PoolCard({ pool, preset, selected, watched, onOpen, onToggleWatch }) {
  return (
    <article
      className={`fx-card ${selected ? "is-selected" : ""}`}
      style={heatVars(pool.score)}
      onClick={() => onOpen(pool)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(pool);
        }
      }}
    >
      <span className="fx-card-heat" aria-hidden="true" />
      <header>
        <PoolAvatar symbol={pool.baseSymbol} quote={pool.quoteSymbol} />
        <div>
          <strong>{pool.pair}</strong>
          <small className="f-num">MC {formatUsd(pool.marketCap)}</small>
        </div>
        <button
          type="button"
          className={`fx-card-star ${watched ? "is-on" : ""}`}
          aria-label={watched ? "Hapus dari watchlist" : "Simpan ke watchlist"}
          aria-pressed={watched}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWatch(pool);
          }}
        >
          <Star fill={watched ? "currentColor" : "none"} />
        </button>
      </header>
      <div className="fx-card-score">
        <HeatBadge score={pool.score} status={poolTier(pool.score, preset)} size="lg" />
        <Spark values={pool.sparkline} score={pool.score} width={96} height={32} />
      </div>
      {/* Phase before any number: the card's job on a phone is to say whether
          this pool is worth opening at all, and a score cannot answer that. */}
      <div className="fx-card-phase">
        <PhaseChip phase={pool.phase} />
        <BurstCell pool={pool} />
      </div>
      <dl className="fx-card-stats">
        <div>
          <dt>Fee/mnt</dt>
          <dd><YieldCell pool={pool} /></dd>
        </div>
        <div>
          <dt>TVL</dt>
          <dd className="f-num">{formatUsd(pool.tvl)}</dd>
        </div>
        <div>
          <dt>1 jam</dt>
          <dd className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</dd>
        </div>
        <div>
          <dt>Risiko</dt>
          <dd className={`f-num fx-risk-text fx-risk-text--${riskBand(pool.risk)}`}>{pool.risk}</dd>
        </div>
      </dl>
      <footer>
        <JupShieldChip pool={pool} />
        <RugCheckChip pool={pool} />
        <a
          className="fx-card-link"
          href={`https://www.meteora.ag/dlmm/${pool.address}`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Buka ${pool.pair} di Meteora`}
        >
          <ExternalLink />
        </a>
      </footer>
    </article>
  );
}

const PHASE_ORDER = ["igniting", "running", "peaking", "fading", "dead"];

/**
 * The scan read as one market rather than a sorted list.
 *
 * A list always has a top row, so a screener that only sorts can never say
 * "nothing is running" — it just puts the least dead pool first and lets the
 * reader assume it found something. This strip answers that question before any
 * row is read, and the phase counts double as filters: clicking one narrows the
 * table to pools in that phase.
 */
function MarketStrip({ pools, phaseFilter, onPhaseFilter, loading }) {
  const read = useMemo(() => readMarket(pools), [pools]);
  const meta = MARKET_CONDITION_META[read.condition];

  return (
    <section className={`fx-market fx-market--${read.condition}`} aria-label="Kondisi pasar">
      <div className="fx-market-verdict">
        <span className="f-eyebrow">Kondisi pasar</span>
        <strong>{loading ? "Membaca…" : meta.label}</strong>
        <p>{loading ? "Menunggu pemindaian pertama." : meta.blurb}</p>
      </div>

      <div className="fx-market-phases" role="group" aria-label="Saring menurut fase">
        {PHASE_ORDER.map((phase) => (
          <button
            key={phase}
            type="button"
            className={`fx-market-phase fx-market-phase--${PHASE_META[phase].tone} ${phaseFilter === phase ? "is-active" : ""}`}
            aria-pressed={phaseFilter === phase}
            title={`${PHASE_META[phase].blurb} ${PHASE_META[phase].action}`}
            onClick={() => onPhaseFilter(phaseFilter === phase ? null : phase)}
          >
            <span className="f-num">{read.phases[phase]}</span>
            <small>{PHASE_META[phase].label}</small>
          </button>
        ))}
      </div>

      <dl className="fx-market-rates">
        <div>
          <dt>Burst median</dt>
          <dd className="f-num">
            {Number.isFinite(read.medianBurst) ? `${read.medianBurst.toFixed(2)}x` : "—"}
            {read.burstReadable ? <em> · {read.burstReadable} pool</em> : null}
          </dd>
        </div>
        <div>
          <dt>Volume mengalir</dt>
          <dd className="f-num">{formatUsd(read.volume1h / 60)}<em> /menit</em></dd>
        </div>
        <div>
          <dt>Fee mengalir</dt>
          <dd className="f-num">{formatUsd(read.feePerMin)}<em> /menit</em></dd>
        </div>
      </dl>
    </section>
  );
}

export default function ScannerView({
  pools,
  loading,
  error,
  preset,
  onPreset,
  state,
  setState,
  counts,
  rows,
  selectedAddress,
  onOpenPool,
  watchlist,
  onRefresh,
  onResetFilters,
}) {
  const {
    search,
    tab,
    filters,
    view,
    density,
    filtersOpen,
    columnFiltersOpen,
    phaseFilter,
    sorting,
    columnFilters,
    columnOrder,
    columnVisibility,
    columnPinning,
  } = state;
  const patch = (partial) => setState((current) => ({ ...current, ...partial }));

  /**
   * Table columns are derived once from the COLUMNS catalogue. The leading
   * three and the trailing link are display columns rather than catalogue
   * entries: they are structural, always shown, and their cells read from the
   * row rather than from a single field.
   */
  const tableColumns = useMemo(() => {
    const middle = COLUMNS.map((column) => ({
      id: column.key,
      // Non-finite readings resolve to undefined so `sortUndefined: "last"`
      // can sink them. That option short-circuits before the direction flip,
      // which is what keeps an unread metric at the bottom in both directions
      // — the behaviour the hand-rolled comparator had, and the reason this is
      // not left to a plain numeric sort.
      accessorFn: (pool) => {
        const value = pool[column.key];
        return Number.isFinite(value) ? value : undefined;
      },
      header: column.label,
      cell: ({ row }) => column.render(row.original),
      size: column.size ?? 108,
      minSize: 64,
      enableSorting: column.sortable !== false,
      sortFn: "basic",
      sortUndefined: "last",
      // A column with no ordering has no range either — the chip and sparkline
      // columns would offer a min/max box over a value nobody can see.
      enableColumnFilter: column.sortable !== false,
      filterFn: "inNumberRange",
      meta: { group: column.group, filter: "number" },
    }));

    return [
      {
        id: "star",
        header: () => <span className="f-visually-hidden">Watchlist</span>,
        cell: ({ row, table: instance }) => {
          const { watchlist: list } = instance.options.meta;
          const watched = list.has(row.original.address);
          return (
            <button
              type="button"
              className={`fx-star ${watched ? "is-on" : ""}`}
              aria-label={watched ? `Hapus ${row.original.pair} dari watchlist` : `Simpan ${row.original.pair} ke watchlist`}
              aria-pressed={watched}
              onClick={(event) => {
                event.stopPropagation();
                list.toggle(row.original.address);
              }}
            >
              <Star fill={watched ? "currentColor" : "none"} />
            </button>
          );
        },
        size: 44,
        minSize: 44,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "pair",
        accessorFn: (pool) => pool.pair,
        header: "Pool",
        cell: ({ row }) => (
          <div className="fx-pool-cell">
            <PoolAvatar symbol={row.original.baseSymbol} quote={row.original.quoteSymbol} />
            <div>
              <strong>{row.original.pair}</strong>
              <small className="f-num">MC {formatUsd(row.original.marketCap)}</small>
            </div>
          </div>
        ),
        size: 208,
        minSize: 140,
        sortFn: "text",
        filterFn: "includesString",
        meta: { filter: "text" },
        enableHiding: false,
      },
      {
        id: "score",
        accessorFn: (pool) => pool.score,
        header: "Skor",
        cell: ({ row, table: instance }) => (
          <HeatBadge score={row.original.score} status={poolTier(row.original.score, instance.options.meta.preset)} />
        ),
        size: 128,
        minSize: 96,
        sortFn: "basic",
        sortUndefined: "last",
        filterFn: "inNumberRange",
        meta: { filter: "number" },
        enableHiding: false,
      },
      ...middle,
      {
        id: "link",
        header: () => <span className="f-visually-hidden">Tautan</span>,
        cell: ({ row }) => (
          <a
            className="fx-row-link"
            href={`https://www.meteora.ag/dlmm/${row.original.address}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Buka ${row.original.pair} di Meteora`}
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink />
          </a>
        ),
        size: 52,
        minSize: 52,
        enableSorting: false,
        enableHiding: false,
      },
    ];
  }, []);

  const table = useTable({
    features: tableFeatureSet,
    columns: tableColumns,
    data: rows,
    getRowId: (pool) => pool.address,
    enableMultiSort: true,
    // Clicking a sorted header cycles desc → asc → desc rather than passing
    // through unsorted: an unsorted scanner table has no meaning here, every
    // view of it is "the strongest by some measure, first".
    enableSortingRemoval: false,
    meta: { watchlist, preset: PRESETS[preset] },
    state: { sorting, columnFilters, columnOrder, columnVisibility, columnPinning },
    onSortingChange: (updater) =>
      patch({ sorting: typeof updater === "function" ? updater(sorting) : updater }),
    onColumnFiltersChange: (updater) =>
      patch({ columnFilters: typeof updater === "function" ? updater(columnFilters) : updater }),
    onColumnOrderChange: (updater) =>
      patch({ columnOrder: typeof updater === "function" ? updater(columnOrder) : updater }),
    onColumnVisibilityChange: (updater) =>
      patch({ columnVisibility: typeof updater === "function" ? updater(columnVisibility) : updater }),
    onColumnPinningChange: (updater) =>
      patch({ columnPinning: typeof updater === "function" ? updater(columnPinning) : updater }),
  });

  // Layout is per preset and survives a reload. Sorting and column filters are
  // deliberately left out — see tableStateFor.
  useEffect(() => {
    saveTablePrefs(preset, { columnOrder, columnVisibility, columnPinning });
  }, [preset, columnOrder, columnVisibility, columnPinning]);

  /* --- header interactions ----------------------------------------------- */

  const [drag, setDrag] = useState(NO_DRAG);
  const dragRef = useRef(NO_DRAG);

  /**
   * Order and pinning are written together, always. A pinned region renders in
   * its own array's order, so a move that touched only `columnOrder` would do
   * nothing to a frozen column — see alignPinning.
   *
   * `target` is either the column dropped on or a step (-1 / +1) from the
   * keyboard. A step is resolved against the region the column is actually in,
   * because that is the run it can move within.
   */
  const moveColumn = (fromId, target) => {
    let toId = target;
    if (typeof target === "number") {
      const column = table.getColumn(fromId);
      if (!column) return;
      const region = table.getPinnedVisibleLeafColumns(column.getIsPinned() || "center");
      const at = region.findIndex((item) => item.id === fromId);
      toId = region[at + target]?.id;
    }
    if (!toId || toId === fromId) return;
    const nextOrder = moveColumnId(columnOrder, fromId, toId);
    if (nextOrder === columnOrder) return;
    patch({ columnOrder: nextOrder, columnPinning: alignPinning(columnPinning, nextOrder) });
  };

  const pinColumn = (columnId, region) => {
    const without = (ids) => (ids || []).filter((id) => id !== columnId);
    const next = { start: without(columnPinning.start), end: without(columnPinning.end) };
    if (region) next[region] = [...next[region], columnId];
    patch({ columnPinning: alignPinning(next, columnOrder) });
  };

  /**
   * The filter row sticks below the header row, and the header row's height is
   * whatever the labels wrap to — so it is measured rather than guessed. A
   * hardcoded offset is what would leave a gap or an overlap the first time a
   * label wrapped or the font loaded late.
   */
  const headRowRef = useRef(null);
  const [headHeight, setHeadHeight] = useState(0);
  const showFilterRow = columnFiltersOpen || columnFilters.length > 0;

  useEffect(() => {
    const node = headRowRef.current;
    if (!node) return undefined;
    const measure = () => setHeadHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, showFilterRow]);

  /* --- rendering --------------------------------------------------------- */

  /**
   * Pinned cells are sticky, and their offset is the summed width of everything
   * pinned before them in the same region — which changes the moment another
   * column joins or leaves that region. The old CSS hardcoded those offsets
   * (left: 0 / 34px / 202px), which only held while exactly three fixed columns
   * could ever be frozen.
   */
  const pinnedStyle = (column) => {
    const pinned = column.getIsPinned();
    return {
      width: column.getSize(),
      ...(pinned === "start" ? { insetInlineStart: `${column.getStart("start")}px` } : null),
      ...(pinned === "end" ? { insetInlineEnd: `${column.getAfter("end")}px` } : null),
    };
  };

  /**
   * The seam between a frozen run and the scrolling remainder is drawn on the
   * run's last column, which is now whichever column the user pinned last
   * rather than a fixed one.
   */
  const pinnedClass = (column) => {
    const pinned = column.getIsPinned();
    if (!pinned) return "";
    const seam =
      pinned === "start"
        ? column.getIsLastColumn("start") && "fx-col-seam-start"
        : column.getIsFirstColumn("end") && "fx-col-seam-end";
    return `fx-col-pinned ${seam || ""}`;
  };

  /**
   * Cells and headers are read region by region rather than from the plain
   * header groups. `columnOrder` alone decides the flat order, but a pinned
   * column's sticky offset is measured inside its own region — render the two
   * out of step and a frozen column sits at an offset belonging to a slot it is
   * not in.
   */
  const headers = [
    ...table.getStartFlatHeaders(),
    ...table.getCenterFlatHeaders(),
    ...table.getEndFlatHeaders(),
  ];
  const rowCells = (row) => [
    ...row.getStartVisibleCells(),
    ...row.getCenterVisibleCells(),
    ...row.getEndVisibleCells(),
  ];

  /**
   * Cards read the same ordering as the table. `rows` arrives unsorted and
   * unfiltered now that the table owns both, so going through the row model is
   * what keeps the two views showing the same pools — switching layout must not
   * silently reshuffle or re-widen the list.
   */
  const shownRows = table.getRowModel().rows;
  const sortedPools = shownRows.map((row) => row.original);
  const sortCount = sorting.length;

  return (
    <div className="fx-view fx-scanner">
      <header className="fx-view-head">
        <div>
          <h1>Pool Scanner</h1>
          <p>
            {loading
              ? "Memuat hasil pemindaian…"
              : `${shownRows.length} pool ditampilkan dari ${pools.length} yang diperkaya penuh.`}
          </p>
        </div>
        <div className="fx-view-head-tools">
          <label className="fx-search">
            <Search />
            <input
              value={search}
              onChange={(event) => patch({ search: event.target.value })}
              placeholder="Cari token, pair, atau alamat"
              aria-label="Cari pool"
            />
            {search ? (
              <button type="button" onClick={() => patch({ search: "" })} aria-label="Kosongkan pencarian">
                <X />
              </button>
            ) : null}
          </label>
          <button
            className={`f-btn f-btn--ghost ${filtersOpen ? "is-open" : ""}`}
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => patch({ filtersOpen: !filtersOpen })}
          >
            <Filter /> Filter
          </button>
          <button
            className={`f-btn f-btn--ghost ${showFilterRow ? "is-open" : ""}`}
            type="button"
            aria-expanded={showFilterRow}
            title="Saring tiap kolom langsung di tabel"
            onClick={() => patch({ columnFiltersOpen: !showFilterRow, columnFilters: [] })}
          >
            <ListFilter /> Kolom filter
            {columnFilters.length ? <em className="f-num">{columnFilters.length}</em> : null}
          </button>
          <ColumnPicker table={table} />
          <div className="fx-segment" role="group" aria-label="Bentuk tampilan">
            <button
              type="button"
              className={view === "table" ? "is-active" : ""}
              aria-pressed={view === "table"}
              onClick={() => patch({ view: "table" })}
              title="Tabel"
            >
              <Table2 />
            </button>
            <button
              type="button"
              className={view === "grid" ? "is-active" : ""}
              aria-pressed={view === "grid"}
              onClick={() => patch({ view: "grid" })}
              title="Kartu"
            >
              <LayoutGrid />
            </button>
          </div>
          <button
            className="f-icon-btn"
            type="button"
            onClick={() => patch({ density: density === "compact" ? "cosy" : "compact" })}
            aria-label={`Kerapatan: ${density === "compact" ? "rapat" : "longgar"}`}
            title={`Kerapatan: ${density === "compact" ? "rapat" : "longgar"}`}
          >
            <Rows3 />
          </button>
        </div>
      </header>

      {error ? (
        <div className="fx-banner fx-banner--error" role="alert">
          <TriangleAlert />
          <span>
            <strong>Data langsung belum tersedia.</strong> {error}
          </span>
          <button className="f-btn f-btn--ghost" type="button" onClick={onRefresh}>
            Coba lagi
          </button>
        </div>
      ) : null}

      <MarketStrip
        pools={pools}
        loading={loading}
        phaseFilter={phaseFilter}
        onPhaseFilter={(next) => patch({ phaseFilter: next })}
      />

      <div className="fx-scanner-bar">
        <div className="fx-preset-switch" role="group" aria-label="Preset strategi">
          {Object.values(PRESETS).map((item) => (
            <button
              key={item.id}
              type="button"
              className={preset === item.id ? "is-active" : ""}
              aria-pressed={preset === item.id}
              onClick={() => onPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="fx-tabs" role="tablist" aria-label="Status sinyal">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : ""}
              onClick={() => patch({ tab: id })}
            >
              {label}
              <span className="f-num">{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
        <button className="f-btn f-btn--ghost" type="button" onClick={onResetFilters}>
          <RotateCcw /> Reset
        </button>
      </div>

      {filtersOpen ? (
        <section className="fx-filters" aria-label="Filter lanjutan">
          <div className="fx-filter-grid">
            <NumberField label="Skor minimum" value={filters.minScore} onChange={(value) => patch({ filters: { ...filters, minScore: value } })} />
            <NumberField label="Risiko maksimum" value={filters.maxRisk} onChange={(value) => patch({ filters: { ...filters, maxRisk: value } })} />
            <NumberField label="TVL minimum" suffix="$" step={500} value={filters.minTvl} onChange={(value) => patch({ filters: { ...filters, minTvl: value } })} />
            <NumberField label="Momentum 1j minimum" suffix="%" value={filters.minMomentum} onChange={(value) => patch({ filters: { ...filters, minMomentum: value } })} />
            <NumberField label="Market cap minimum" suffix="$" step={50_000} value={filters.marketCapMin} onChange={(value) => patch({ filters: { ...filters, marketCapMin: value } })} />
            <NumberField label="Market cap maksimum" suffix="$" step={50_000} value={filters.marketCapMax} onChange={(value) => patch({ filters: { ...filters, marketCapMax: value } })} />
            <NumberField label="Vol/TVL minimum" suffix="x" step={0.1} value={filters.minVolumeTvl} onChange={(value) => patch({ filters: { ...filters, minVolumeTvl: value } })} />
            <NumberField label="Fee/TVL minimum" suffix="%" step={0.1} value={filters.minFeeTvl} onChange={(value) => patch({ filters: { ...filters, minFeeTvl: value } })} />
            <NumberField label="Top-10 holder maksimum" suffix="%" value={filters.maxTop10} onChange={(value) => patch({ filters: { ...filters, maxTop10: value } })} />
          </div>
          <div className="fx-filter-switches">
            <Switch checked={filters.verifiedOnly} onChange={(value) => patch({ filters: { ...filters, verifiedOnly: value } })}>
              Hanya token terverifikasi
            </Switch>
            <Switch checked={filters.freezeOffOnly} onChange={(value) => patch({ filters: { ...filters, freezeOffOnly: value } })}>
              Freeze authority wajib mati
            </Switch>
            <Switch checked={filters.cleanSecurityOnly} onChange={(value) => patch({ filters: { ...filters, cleanSecurityOnly: value } })}>
              Tanpa peringatan JupShield
            </Switch>
            <p className="fx-filter-hint">
              <SlidersHorizontal /> Gate {PRESETS[preset].label} tetap berlaku di tab Hot dan Watch.
              Filter di sini hanya mempersempit daftar.
            </p>
          </div>
        </section>
      ) : null}

      {view === "grid" ? (
        <div className="fx-card-grid">
          {loading
            ? Array.from({ length: 8 }, (_, index) => <div className="fx-card-skeleton f-skeleton" key={index} />)
            : sortedPools.map((pool) => (
                <PoolCard
                  key={pool.address}
                  pool={pool}
                  preset={preset}
                  selected={pool.address === selectedAddress}
                  watched={watchlist.has(pool.address)}
                  onOpen={onOpenPool}
                  onToggleWatch={(target) => watchlist.toggle(target.address)}
                />
              ))}
        </div>
      ) : (
        <div className={`fx-table-frame fx-table-frame--${density}`}>
          <table className="fx-table" style={{ width: table.getTotalSize() }}>
            <thead>
              <tr ref={headRowRef}>
                {headers.map((header) => (
                  <HeaderCell
                    key={header.id}
                    header={header}
                    sortCount={sortCount}
                    dragRef={dragRef}
                    drag={drag}
                    onDrag={setDrag}
                    onMove={moveColumn}
                    onPin={pinColumn}
                    className={`fx-col-${header.id} ${pinnedClass(header.column)}`}
                    style={pinnedStyle(header.column)}
                  />
                ))}
              </tr>
              {showFilterRow ? (
                <tr className="fx-filter-row">
                  {headers.map(({ id, column }) => (
                    <th
                      key={id}
                      className={`fx-col-${id} ${pinnedClass(column)}`}
                      style={{ ...pinnedStyle(column), top: `${headHeight}px` }}
                    >
                      {column.getCanFilter() ? <ColumnFilter column={column} /> : null}
                    </th>
                  ))}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 9 }, (_, index) => (
                    <tr key={index} className="fx-row-skeleton">
                      {headers.map(({ id, column }) => (
                        <td
                          key={id}
                          className={`fx-col-${id} ${pinnedClass(column)}`}
                          style={pinnedStyle(column)}
                        >
                          <span className="f-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                : shownRows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.original.address === selectedAddress ? "is-selected" : ""}
                      style={heatVars(row.original.score)}
                      onClick={() => onOpenPool(row.original)}
                    >
                      {rowCells(row).map((cell) => (
                        <td
                          key={cell.id}
                          className={`fx-col-${cell.column.id} ${pinnedClass(cell.column)}`}
                          style={pinnedStyle(cell.column)}
                        >
                          <FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && shownRows.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Tidak ada pool yang cocok"
          body={
            columnFilters.length
              ? "Filter kolom di tabel sedang mempersempit daftar. Kosongkan kotaknya untuk melebarkan lagi."
              : tab === "watchlist"
                ? "Klik bintang di baris mana pun untuk menyimpan pool ke sini."
                : "Longgarkan filter, atau buka tab Gagal gate untuk melihat pool yang tertahan beserta alasannya."
          }
          action={
            <button className="f-btn" type="button" onClick={onResetFilters}>
              <RotateCcw /> Reset filter
            </button>
          }
        />
      ) : null}
    </div>
  );
}
