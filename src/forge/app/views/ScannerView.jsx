import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  ExternalLink,
  Filter,
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
import { PRESETS, poolTier } from "../../../../shared/scoring.js";
import { formatAge, formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars, riskBand, riskLabel } from "../../lib/heat.js";
import { Spark } from "../components/charts.jsx";
import {
  ConcentrationValue,
  FeeVelocityCell,
  EmptyState,
  HeatBadge,
  JupShieldChip,
  momentumTone,
  optionalNumber,
  OrganicChip,
  PoolAvatar,
  RugCheckChip,
} from "../components/bits.jsx";

export const COLUMNS = [
  { key: "priceChange1h", label: "1j", locked: false },
  { key: "trend", label: "Tren", sortable: false },
  { key: "tvl", label: "TVL" },
  { key: "volume1h", label: "Vol 1j" },
  // Five-minute flow, from GMGN. Meteora stops at one hour, which is far too
  // coarse for the minutes-scale plays — a runner's 5m volume is the entry
  // signal itself, not a supporting detail.
  { key: "gmgnVolume5m", label: "Vol 5m" },
  { key: "gmgnSwaps5m", label: "Swap 5m" },
  { key: "volumeTvl1h", label: "Vol/TVL" },
  { key: "totalFees1h", label: "Fee 1j" },
  { key: "feeTvl1h", label: "Fee/TVL" },
  { key: "feeVelocity", label: "Fee tren", sortable: false },
  { key: "risk", label: "Risiko" },
  { key: "top10HoldersPct", label: "Top-10" },
  { key: "devBalancePct", label: "Dev" },
  { key: "jupShieldRank", label: "JupShield" },
  { key: "rugCheckScore", label: "RugCheck" },
  { key: "organicScore", label: "Organic" },
  { key: "swaps1h", label: "Swap" },
  { key: "traders1h", label: "Trader" },
  { key: "totalLps", label: "LP" },
  { key: "ageHours", label: "Umur" },
];

const DEFAULT_COLUMNS = [
  "priceChange1h",
  "trend",
  "tvl",
  "volume1h",
  "gmgnVolume5m",
  "volumeTvl1h",
  "totalFees1h",
  "feeTvl1h",
  "feeVelocity",
  "risk",
  "top10HoldersPct",
  "jupShieldRank",
  "rugCheckScore",
  "ageHours",
];

export const defaultColumnKeys = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("signalforge:columns") || "null");
    if (Array.isArray(saved) && saved.length) return saved.filter((key) => COLUMNS.some((column) => column.key === key));
  } catch {
    // A malformed preference falls back to the default column set.
  }
  return DEFAULT_COLUMNS;
};

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

function ColumnPicker({ visible, onChange }) {
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

  const toggle = (key) => {
    const next = visible.includes(key) ? visible.filter((item) => item !== key) : [...visible, key];
    onChange(next);
    localStorage.setItem("signalforge:columns", JSON.stringify(next));
  };

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
        <div className="fx-dropdown-menu" role="menu">
          <span className="f-eyebrow">Tampilkan kolom</span>
          {COLUMNS.map((column) => (
            <label key={column.key} className="fx-dropdown-check">
              <input
                type="checkbox"
                checked={visible.includes(column.key)}
                onChange={() => toggle(column.key)}
              />
              {column.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function cellFor(key, pool) {
  switch (key) {
    case "priceChange1h":
      return <span className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</span>;
    case "trend":
      return <Spark values={pool.sparkline} score={pool.score} width={72} height={22} />;
    case "tvl":
      return <span className="f-num">{formatUsd(pool.tvl)}</span>;
    case "volume1h":
      return <span className="f-num">{formatUsd(pool.volume1h)}</span>;
    case "gmgnVolume5m":
      return Number.isFinite(pool.gmgnVolume5m)
        ? <span className="f-num">{formatUsd(pool.gmgnVolume5m)}</span>
        : <span className="fx-na" title="Butuh GMGN_API_KEY">—</span>;
    case "gmgnSwaps5m":
      return <span className="f-num">{optionalNumber(pool.gmgnSwaps5m)}</span>;
    case "volumeTvl1h":
      return <span className="f-num">{pool.volumeTvl1h.toFixed(2)}x</span>;
    case "totalFees1h":
      return (
        <span className="fx-cell-stack">
          <span className="f-num">{formatUsd(pool.totalFees1h)}</span>
          <small className="f-num">
            LP {formatUsd(pool.lpFees1h)} · Prot {formatUsd(pool.protocolFees1h)}
          </small>
        </span>
      );
    case "feeTvl1h":
      return <span className="f-num">{pool.feeTvl1h.toFixed(2)}%</span>;
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
      <dl className="fx-card-stats">
        <div>
          <dt>1 jam</dt>
          <dd className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</dd>
        </div>
        <div>
          <dt>TVL</dt>
          <dd className="f-num">{formatUsd(pool.tvl)}</dd>
        </div>
        <div>
          <dt>Fee/TVL</dt>
          <dd className="f-num">{pool.feeTvl1h.toFixed(2)}%</dd>
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
  const { search, tab, sort, filters, view, density, columns, filtersOpen } = state;
  const patch = (partial) => setState((current) => ({ ...current, ...partial }));
  const visibleColumns = useMemo(
    () => COLUMNS.filter((column) => columns.includes(column.key)),
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
          <ColumnPicker visible={columns} onChange={(next) => patch({ columns: next })} />
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
