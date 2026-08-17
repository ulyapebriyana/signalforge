import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  ExternalLink,
  Filter,
  GripVertical,
  LayoutGrid,
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

export const COLUMNS = [
  // --- rate: the pool at this minute ---------------------------------------
  { key: "phase", label: "Fase", group: "rate", sortable: false },
  // The token's last minute against its last five. GMGN on both sides, and
  // token-wide on both sides — see shared/marketRead.js for why a GMGN figure
  // may never be divided by a Meteora one.
  { key: "tokenBurst", label: "Burst token", group: "rate" },
  // This pool's hour against its own daily pace, Meteora on both sides.
  { key: "poolBurst", label: "Burst pool", group: "rate" },
  { key: "feeVelocity", label: "Fee tren", group: "rate", sortable: false },
  { key: "priceChange1h", label: "1j", group: "rate" },
  { key: "trend", label: "Tren", group: "rate", sortable: false },
  { key: "gmgnVolume1m", label: "Vol token 1m", group: "rate" },
  { key: "gmgnVolume5m", label: "Vol token 5m", group: "rate" },
  { key: "gmgnSwaps5m", label: "Swap token 5m", group: "rate" },

  // --- yield: what the pool pays, per minute -------------------------------
  { key: "feePerMinPct", label: "Fee/mnt", group: "yield" },
  { key: "minutesTo1Pct", label: "Waktu ke 1%", group: "yield" },
  { key: "feeTvl1h", label: "Fee/TVL", group: "yield" },
  { key: "totalFees1h", label: "Fee 1j", group: "yield" },
  { key: "avgFeePerMin", label: "Avg Fee/m", group: "yield" },
  { key: "feeActiveTvl1h", label: "Fee/Active TVL", group: "yield" },

  // --- size: the pool and the flow through it ------------------------------
  // The share of the token's own flow this pool carries — the reading that
  // catches a pool that looks busy while the token trades somewhere else.
  { key: "venueShare", label: "Porsi venue", group: "size" },
  { key: "poolTurnover", label: "Putaran TVL", group: "size" },
  { key: "tradeImpact", label: "Impact/trade", group: "size" },
  { key: "tvl", label: "TVL", group: "size" },
  { key: "volume1h", label: "Vol 1j", group: "size" },
  { key: "volume24h", label: "Vol 24j", group: "size" },
  { key: "avgVolumePerMin", label: "Avg Vol/m", group: "size" },
  { key: "volumeTvl1h", label: "Vol/TVL", group: "size" },
  { key: "activeTvl", label: "Active TVL", group: "size" },
  { key: "swaps1h", label: "Swap", group: "size" },
  { key: "avgSwapsPerMin", label: "Avg Swap/m", group: "size" },
  { key: "traders1h", label: "Trader", group: "size" },
  { key: "totalLps", label: "LP", group: "size" },
  { key: "ageHours", label: "Umur", group: "size" },

  // --- safety ---------------------------------------------------------------
  { key: "risk", label: "Risiko", group: "safety" },
  { key: "top10HoldersPct", label: "Top-10", group: "safety" },
  { key: "devBalancePct", label: "Dev", group: "safety" },
  { key: "jupShieldRank", label: "JupShield", group: "safety" },
  { key: "rugCheckScore", label: "RugCheck", group: "safety" },
  { key: "organicScore", label: "Organic", group: "safety" },
];

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
  vanchu: [
    "phase",
    "tokenBurst",
    "poolBurst",
    "feeVelocity",
    "priceChange1h",
    "feePerMinPct",
    "feeTvl1h",
    "venueShare",
    "volumeTvl1h",
    "volume1h",
    "tvl",
    "risk",
    "ageHours",
  ],
  skolmbeagh: [
    "ageHours",
    "phase",
    "tokenBurst",
    "gmgnVolume5m",
    "feePerMinPct",
    "feeTvl1h",
    "tvl",
    "top10HoldersPct",
    "devBalancePct",
    "risk",
    "rugCheckScore",
  ],
  auzhinta: [
    "feeVelocity",
    "phase",
    "feePerMinPct",
    "feeTvl1h",
    "poolBurst",
    "priceChange1h",
    "trend",
    "tvl",
    "volumeTvl1h",
    "risk",
    "top10HoldersPct",
    "rugCheckScore",
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
  swanny: [
    "phase",
    "priceChange1h",
    "trend",
    "risk",
    "top10HoldersPct",
    "devBalancePct",
    "jupShieldRank",
    "rugCheckScore",
    "organicScore",
    "tvl",
    "volume1h",
    "feeTvl1h",
    "ageHours",
  ],
};

const columnKey = (presetId) => `signalforge:columns:${presetId}`;

/**
 * Saved choices are per preset, because the presets no longer want the same
 * table. A single global list is why every preset used to open on the same
 * hourly columns regardless of the timescale it trades on.
 */
export const defaultColumnKeys = (presetId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(columnKey(presetId)) || "null");
    if (Array.isArray(saved) && saved.length) {
      const kept = saved.filter((key) => COLUMNS.some((column) => column.key === key));
      if (kept.length) return kept;
    }
  } catch {
    // A malformed preference falls back to the preset's default column set.
  }
  return PRESET_COLUMNS[presetId] || GENERAL_COLUMNS;
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
    ? { key: "tokenBurst", direction: "desc" }
    : { key: "score", direction: "desc" };

const TABS = [
  ["all", "Semua"],
  ["qualified", "Lolos gate"],
  ["hot", "Hot"],
  ["watch", "Watch"],
  ["skipped", "Gagal gate"],
  ["watchlist", "Watchlist"],
];

function SortIcon({ active, direction }) {
  if (!active) return <ChevronsUpDown />;
  return direction === "asc" ? <ArrowUp /> : <ArrowDown />;
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
 * `visible` is the ordered list of active column keys — the same array that
 * drives the table's render order, so reordering here and reordering the
 * table are the same operation. Hidden columns carry no order of their own;
 * showing one just appends it to the end of `visible`.
 */
function ColumnPicker({ visible, onChange, preset }) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Saved against the preset, so tuning the Heart Attack table does not silently
  // rewrite the one Slow Wallet opens on.
  const persist = (next) => {
    onChange(next);
    localStorage.setItem(`signalforge:columns:${preset}`, JSON.stringify(next));
  };

  const hide = (key) => persist(visible.filter((item) => item !== key));
  const show = (key) => persist([...visible, key]);

  // Live reorder while dragging: dropping is not required, hovering a row
  // already moves the dragged key next to it. `fromKey === toKey` is what
  // stops this from firing on every dragover tick once the two are adjacent.
  const reorder = (fromKey, toKey) => {
    if (!fromKey || fromKey === toKey) return;
    const fromIndex = visible.indexOf(fromKey);
    const toIndex = visible.indexOf(toKey);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...visible];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, fromKey);
    persist(next);
  };

  const hiddenColumns = COLUMNS.filter((column) => !visible.includes(column.key));

  return (
    <div className="fx-dropdown" ref={ref}>
      <button
        className={`f-btn f-btn--ghost ${open ? "is-open" : ""}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Columns3 /> Kolom
      </button>
      {open ? (
        <div className="fx-dropdown-menu fx-dropdown-menu--columns" role="menu">
          <span className="f-eyebrow">Kolom aktif — seret buat urutkan</span>
          {visible.map((key) => {
            const column = COLUMNS.find((item) => item.key === key);
            if (!column) return null;
            return (
              <div
                key={key}
                className={`fx-col-row ${dragKey === key ? "is-dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDragKey(key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", key);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  reorder(dragKey, key);
                }}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={() => setDragKey(null)}
              >
                <span className="fx-col-handle" aria-hidden="true">
                  <GripVertical />
                </span>
                <label className="fx-dropdown-check">
                  <input type="checkbox" checked onChange={() => hide(key)} />
                  {column.label}
                </label>
              </div>
            );
          })}
          {Object.entries(COLUMN_GROUPS).map(([group, title]) => {
            const inGroup = hiddenColumns.filter((column) => column.group === group);
            if (!inGroup.length) return null;
            return (
              <div key={group}>
                <span className="f-eyebrow fx-dropdown-section">{title}</span>
                {inGroup.map((column) => (
                  <label key={column.key} className="fx-dropdown-check">
                    <input type="checkbox" checked={false} onChange={() => show(column.key)} />
                    {column.label}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function cellFor(key, pool) {
  switch (key) {
    // --- rate ---------------------------------------------------------------
    case "phase":
      return <PhaseChip phase={pool.phase} size="sm" />;
    case "tokenBurst":
      return <TokenBurstCell pool={pool} />;
    case "poolBurst":
      return <PoolBurstCell pool={pool} />;
    case "gmgnVolume1m":
      return Number.isFinite(pool.gmgnVolume1m)
        ? <span className="f-num">{formatUsd(pool.gmgnVolume1m)}</span>
        : <Unread why="Butuh GMGN_API_KEY" />;

    // --- yield --------------------------------------------------------------
    case "feePerMinPct":
      return <YieldCell pool={pool} />;
    case "minutesTo1Pct":
      return <ClockCell pool={pool} />;

    // --- size ---------------------------------------------------------------
    case "venueShare":
      return <VenueShareCell pool={pool} />;
    case "poolTurnover":
      return <TurnoverCell pool={pool} />;
    case "tradeImpact":
      return <ImpactCell pool={pool} />;
    case "activeTvl":
      return <ActiveDepthCell pool={pool} />;
    case "volume24h":
      return <span className="f-num">{formatUsd(pool.volume24h)}</span>;

    case "priceChange1h":
      return <span className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</span>;
    case "trend":
      return <Spark values={pool.sparkline} score={pool.score} width={72} height={22} />;
    case "tvl":
      return <span className="f-num">{formatUsd(pool.tvl)}</span>;
    case "volume1h":
      return <span className="f-num">{formatUsd(pool.volume1h)}</span>;
    case "avgVolumePerMin":
      return Number.isFinite(pool.avgVolumePerMin)
        ? <span className="f-num">{formatUsd(pool.avgVolumePerMin)}</span>
        : <Unread />;
    case "gmgnVolume5m":
      return Number.isFinite(pool.gmgnVolume5m)
        ? <span className="f-num">{formatUsd(pool.gmgnVolume5m)}</span>
        : <Unread why="Butuh GMGN_API_KEY" />;
    case "gmgnSwaps5m":
      return <span className="f-num">{optionalNumber(pool.gmgnSwaps5m)}</span>;
    case "volumeTvl1h":
      return <span className="f-num">{pool.volumeTvl1h.toFixed(2)}x</span>;
    case "volumeActiveTvl1h":
      return Number.isFinite(pool.volumeActiveTvl1h)
        ? <span className="f-num">{pool.volumeActiveTvl1h.toFixed(2)}x</span>
        : <Unread />;
    case "totalFees1h":
      return (
        <span className="fx-cell-stack">
          <span className="f-num">{formatUsd(pool.totalFees1h)}</span>
          <small className="f-num">
            LP {formatUsd(pool.lpFees1h)} · Prot {formatUsd(pool.protocolFees1h)}
          </small>
        </span>
      );
    case "avgFeePerMin":
      return Number.isFinite(pool.avgFeePerMin)
        ? <span className="f-num">{formatUsd(pool.avgFeePerMin)}</span>
        : <Unread />;
    case "feeTvl1h":
      return <span className="f-num">{pool.feeTvl1h.toFixed(2)}%</span>;
    case "feeActiveTvl1h":
      return Number.isFinite(pool.feeActiveTvl1h)
        ? <span className="f-num">{pool.feeActiveTvl1h.toFixed(2)}%</span>
        : <Unread />;
    case "feeVelocity":
      return <FeeVelocityCell velocity={pool.feeVelocity} />;
    case "risk":
      return (
        <span className={`fx-risk fx-risk--${riskBand(pool.risk)}`}>
          <strong className="f-num">{pool.risk}</strong>
          <small>{riskLabel(pool.risk)}</small>
        </span>
      );
    case "top10HoldersPct":
      return <ConcentrationValue value={pool.top10HoldersPct} warningAt={30} dangerAt={50} />;
    case "devBalancePct":
      return <ConcentrationValue value={pool.devBalancePct} warningAt={5} dangerAt={10} />;
    case "jupShieldRank":
      return <JupShieldChip pool={pool} />;
    case "rugCheckScore":
      return <RugCheckChip pool={pool} />;
    case "organicScore":
      return <OrganicChip pool={pool} />;
    case "swaps1h":
      return <span className="f-num">{optionalNumber(pool.swaps1h)}</span>;
    case "avgSwapsPerMin":
      return <span className="f-num">{optionalNumber(pool.avgSwapsPerMin)}</span>;
    case "traders1h":
      return <span className="f-num">{optionalNumber(pool.traders1h)}</span>;
    case "totalLps":
      return <span className="f-num">{optionalNumber(pool.totalLps)}</span>;
    case "ageHours":
      return <span className="f-num">{formatAge(pool.ageHours)}</span>;
    default:
      return null;
  }
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
  const { search, tab, sort, filters, view, density, columns, filtersOpen, phaseFilter } = state;
  const patch = (partial) => setState((current) => ({ ...current, ...partial }));
  // Order follows `columns` itself, not COLUMNS' fixed order — that is the
  // whole point of letting the picker reorder them. COLUMNS is only consulted
  // for each key's label/render metadata.
  const visibleColumns = useMemo(
    () => columns.map((key) => COLUMNS.find((column) => column.key === key)).filter(Boolean),
    [columns],
  );

  const changeSort = (key) =>
    patch({
      sort: {
        key,
        direction: sort.key === key && sort.direction === "desc" ? "asc" : "desc",
      },
    });

  return (
    <div className="fx-view fx-scanner">
      <header className="fx-view-head">
        <div>
          <h1>Pool Scanner</h1>
          <p>
            {loading
              ? "Memuat hasil pemindaian…"
              : `${rows.length} pool ditampilkan dari ${pools.length} yang diperkaya penuh.`}
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
          <ColumnPicker visible={columns} preset={preset} onChange={(next) => patch({ columns: next })} />
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
            : rows.map((pool) => (
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
          <table className="fx-table">
            <thead>
              <tr>
                <th className="fx-col-star" scope="col">
                  <span className="f-visually-hidden">Watchlist</span>
                </th>
                <th className="fx-col-pool" scope="col" aria-sort={sort.key === "pair" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => changeSort("pair")}>
                    Pool <SortIcon active={sort.key === "pair"} direction={sort.direction} />
                  </button>
                </th>
                <th className="fx-col-score" scope="col" aria-sort={sort.key === "score" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => changeSort("score")}>
                    Skor <SortIcon active={sort.key === "score"} direction={sort.direction} />
                  </button>
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {column.sortable === false ? (
                      <span>{column.label}</span>
                    ) : (
                      <button type="button" onClick={() => changeSort(column.key)}>
                        {column.label} <SortIcon active={sort.key === column.key} direction={sort.direction} />
                      </button>
                    )}
                  </th>
                ))}
                <th scope="col">
                  <span className="f-visually-hidden">Tautan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 9 }, (_, index) => (
                    <tr key={index} className="fx-row-skeleton">
                      {Array.from({ length: visibleColumns.length + 4 }, (_, cell) => (
                        <td key={cell}>
                          <span className="f-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((pool) => {
                    const watched = watchlist.has(pool.address);
                    return (
                      <tr
                        key={pool.address}
                        className={pool.address === selectedAddress ? "is-selected" : ""}
                        style={heatVars(pool.score)}
                        onClick={() => onOpenPool(pool)}
                      >
                        <td className="fx-col-star">
                          <button
                            type="button"
                            className={`fx-star ${watched ? "is-on" : ""}`}
                            aria-label={watched ? `Hapus ${pool.pair} dari watchlist` : `Simpan ${pool.pair} ke watchlist`}
                            aria-pressed={watched}
                            onClick={(event) => {
                              event.stopPropagation();
                              watchlist.toggle(pool.address);
                            }}
                          >
                            <Star fill={watched ? "currentColor" : "none"} />
                          </button>
                        </td>
                        <td className="fx-col-pool">
                          <div className="fx-pool-cell">
                            <PoolAvatar symbol={pool.baseSymbol} quote={pool.quoteSymbol} />
                            <div>
                              <strong>{pool.pair}</strong>
                              <small className="f-num">MC {formatUsd(pool.marketCap)}</small>
                            </div>
                          </div>
                        </td>
                        <td className="fx-col-score">
                          <HeatBadge score={pool.score} status={poolTier(pool.score, preset)} />
                        </td>
                        {visibleColumns.map((column) => (
                          <td key={column.key}>{cellFor(column.key, pool)}</td>
                        ))}
                        <td>
                          <a
                            className="fx-row-link"
                            href={`https://www.meteora.ag/dlmm/${pool.address}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Buka ${pool.pair} di Meteora`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Tidak ada pool yang cocok"
          body={
            tab === "watchlist"
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
