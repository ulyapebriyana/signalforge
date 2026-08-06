import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  History,
  LayoutDashboard,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PRESETS } from "../shared/scoring.js";
import { usePools } from "./hooks/usePools.js";
import { useSignalHistory } from "./hooks/useSignalHistory.js";
import { formatAge, formatNumber, formatPercent, formatUsd, formatWibTime } from "./lib/format.js";
import { playProfitSignal } from "./lib/signalSound.js";
import { Sparkline } from "./components/Sparkline.jsx";
import { ScoreRing } from "./components/ScoreRing.jsx";

gsap.registerPlugin(useGSAP);

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "pool-scanner", label: "Pool Scanner", icon: Search },
  { id: "signal-history", label: "Signal History", icon: History },
  { id: "risk-rules", label: "Risk Rules", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

const STATUS_LABEL = { hot: "Hot", watch: "Watch", early: "Early", skip: "Skip" };
const SCAN_INTERVALS = [30, 60, 120];
const SORT_COLUMNS = [
  ["pair", "Pool"],
  ["score", "Score"],
  ["priceChange1h", "1h"],
  ["tvl", "TVL"],
  ["volume1h", "Vol 1h"],
  ["volumeTvl1h", "Vol/TVL"],
  ["feeTvl1h", "Fee/TVL"],
  ["risk", "Risk"],
  ["ageHours", "Age"],
];

const defaultFilters = (preset) => ({
  minScore: preset.minScore,
  maxRisk: preset.maxRisk,
  minTvl: preset.tvlMin,
  minMomentum: preset.momentumMin,
  marketCapMin: preset.marketCapMin,
  marketCapMax: preset.marketCapMax,
  minVolumeTvl: preset.volumeTvlMin,
  minFeeTvl: preset.feeTvlMin,
  verifiedOnly: false,
  freezeOffOnly: preset.requireFreezeOff,
});

const formatHistoryTime = (iso) => new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(iso));

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 3.5 38.5 13v18L22 40.5 5.5 31V13L22 3.5Z" />
      <path d="m10 23 5-7 4 14 5-18 4 15 6-8" />
    </svg>
  );
}

function Header({
  meta,
  refreshing,
  onRefresh,
  onOpenSettings,
  onToggleNav,
  scanInterval,
  onScanInterval,
  onToggleNotifications,
  notificationsOpen,
  notificationCount,
}) {
  const pulseRef = useRef(null);
  const [remaining, setRemaining] = useState(scanInterval);
  const [intervalOpen, setIntervalOpen] = useState(false);

  useEffect(() => setRemaining(scanInterval), [meta?.scannedAt, scanInterval]);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useGSAP(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !pulseRef.current) return;
    gsap.fromTo(pulseRef.current, { scale: 0.7, opacity: 0.8 }, {
      scale: 1.9,
      opacity: 0,
      duration: 1,
      ease: "power2.out",
      repeat: 1,
      repeatDelay: 1.8,
    });
  }, { dependencies: [meta?.scannedAt] });

  return (
    <header className="topbar">
      <button className="mobile-menu" type="button" onClick={onToggleNav} aria-label="Buka navigasi"><Menu /></button>
      <div className="brand"><BrandMark /><span>SignalForge</span></div>
      <div className="live-status">
        <span className="live-dot-wrap"><span ref={pulseRef} className="live-pulse" /><span className="live-dot" /></span>
        <span>Meteora live</span>
      </div>
      <div className="scan-stamp"><span>Last scan</span><strong>{formatWibTime(meta?.scannedAt)} WIB</strong></div>
      <div className="scan-selector">
        <button className="scan-control" type="button" onClick={() => setIntervalOpen((value) => !value)} aria-expanded={intervalOpen}>
          <RefreshCw className={refreshing ? "spin" : ""} />
          <span>{remaining}s</span>
          <ChevronDown />
        </button>
        {intervalOpen ? (
          <div className="scan-menu" role="menu">
            <span>Interval refresh</span>
            {SCAN_INTERVALS.map((seconds) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={scanInterval === seconds}
                className={scanInterval === seconds ? "active" : ""}
                key={seconds}
                onClick={() => { onScanInterval(seconds); setIntervalOpen(false); }}
              >
                {seconds < 60 ? `${seconds} detik` : `${seconds / 60} menit`}
                {scanInterval === seconds ? <Check /> : null}
              </button>
            ))}
            <button type="button" className="scan-now" onClick={() => { onRefresh(); setIntervalOpen(false); }}><RefreshCw /> Scan sekarang</button>
          </div>
        ) : null}
      </div>
      <div className="topbar-spacer" />
      <button
        className={`icon-button notification-button ${notificationsOpen ? "active" : ""}`}
        type="button"
        aria-label={`Notifikasi sinyal${notificationCount ? ` (${notificationCount})` : ""}`}
        aria-expanded={notificationsOpen}
        onClick={onToggleNotifications}
      >
        <Bell />
        {notificationCount ? <span>{Math.min(notificationCount, 9)}</span> : null}
      </button>
      <button className="primary-button telegram-button" type="button" onClick={onOpenSettings}><Send /> Telegram</button>
    </header>
  );
}

function Sidebar({ open, activeView, onNavigate }) {
  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <nav aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button className={`nav-item ${active ? "active" : ""}`} type="button" key={id} aria-label={label} title={label} aria-current={active ? "page" : undefined} onClick={() => onNavigate(id)}>
              <Icon /><span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="data-source"><Database /><div><span>Data source</span><strong>Meteora DLMM API</strong></div></div>
    </aside>
  );
}

function MetricStrip({ meta, pools, preset }) {
  const qualified = pools.filter((pool) => pool.qualifies[preset].passed);
  const hot = qualified.filter((pool) => pool.score >= 80);
  let medianRisk = 0;
  if (pools.length) {
    const risks = pools.map((pool) => pool.risk).toSorted((a, b) => a - b);
    medianRisk = risks[Math.floor(risks.length / 2)];
  }
  const trend = pools.slice(0, 12).map((pool) => pool.score);
  const metrics = [
    { label: "Pools scanned", value: meta?.scannedCount || 0, extra: <Sparkline values={trend} width={88} height={28} /> },
    { label: "Qualified", value: qualified.length },
    { label: "Hot signals", value: hot.length, tone: "warning" },
    { label: "Median risk", value: medianRisk, tone: medianRisk > 55 ? "danger" : "default" },
  ];

  return (
    <section className="metric-strip enter" aria-label="Ringkasan scan">
      {metrics.map((metric) => (
        <div className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <div><strong className={metric.tone || ""}>{metric.value}</strong>{metric.extra}</div>
        </div>
      ))}
    </section>
  );
}

function FilterControl({ label, value, suffix = "", onChange, min = 0, step = 1 }) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{suffix}</em>
    </label>
  );
}

function ToggleControl({ checked, onChange, children }) {
  return (
    <label className="toggle-control">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true"><i /></span>
      <strong>{children}</strong>
    </label>
  );
}

function Controls({ preset, onPreset, activeTab, onTab, counts, filters, onFilters, onReset, advancedOpen }) {
  const tabs = [
    ["all", "All", counts.all],
    ["hot", "Hot", counts.hot],
    ["watch", "Watch", counts.watch],
    ["skipped", "Skipped", counts.skipped],
  ];

  return (
    <section className="controls enter" aria-label="Filter scanner">
      <div className="control-topline">
        <div className="preset-switch" aria-label="Preset strategi">
          {Object.values(PRESETS).map((item) => (
            <button className={preset === item.id ? "active" : ""} type="button" key={item.id} onClick={() => onPreset(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="tab-switch" role="tablist" aria-label="Status sinyal">
          {tabs.map(([id, label, count]) => (
            <button className={activeTab === id ? "active" : ""} type="button" role="tab" aria-selected={activeTab === id} key={id} onClick={() => onTab(id)}>
              {label} <strong>{count}</strong>
            </button>
          ))}
        </div>
        <button className="reset-button" type="button" onClick={onReset}><RotateCcw /> Reset semua</button>
      </div>
      <div className="filter-row">
        <FilterControl label="Score ≥" value={filters.minScore} onChange={(value) => onFilters({ ...filters, minScore: value })} />
        <FilterControl label="Risk ≤" value={filters.maxRisk} onChange={(value) => onFilters({ ...filters, maxRisk: value })} />
        <FilterControl label="TVL ≥" value={filters.minTvl} suffix="$" onChange={(value) => onFilters({ ...filters, minTvl: value })} />
        <FilterControl label="1h ≥" value={filters.minMomentum} suffix="%" onChange={(value) => onFilters({ ...filters, minMomentum: value })} />
        <div className="preset-hint"><SlidersHorizontal /> {PRESETS[preset].label}: fee/TVL ≥ {PRESETS[preset].feeTvlMin}%</div>
      </div>
      {advancedOpen ? (
        <div className="advanced-filters">
          <div className="advanced-filter-fields">
            <FilterControl label="MC min" value={filters.marketCapMin} suffix="$" onChange={(value) => onFilters({ ...filters, marketCapMin: value })} />
            <FilterControl label="MC max" value={filters.marketCapMax} suffix="$" onChange={(value) => onFilters({ ...filters, marketCapMax: value })} />
            <FilterControl label="Vol/TVL ≥" value={filters.minVolumeTvl} suffix="x" step={0.1} onChange={(value) => onFilters({ ...filters, minVolumeTvl: value })} />
            <FilterControl label="Fee/TVL ≥" value={filters.minFeeTvl} suffix="%" step={0.1} onChange={(value) => onFilters({ ...filters, minFeeTvl: value })} />
          </div>
          <div className="advanced-filter-toggles">
            <ToggleControl checked={filters.verifiedOnly} onChange={(value) => onFilters({ ...filters, verifiedOnly: value })}>Token terverifikasi</ToggleControl>
            <ToggleControl checked={filters.freezeOffOnly} onChange={(value) => onFilters({ ...filters, freezeOffOnly: value })}>Freeze authority off</ToggleControl>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PoolIcon({ symbol }) {
  const hue = [...String(symbol)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return <span className="pool-token" style={{ "--token-hue": hue }}>{String(symbol).slice(0, 2)}</span>;
}

function SkeletonRows() {
  return Array.from({ length: 7 }, (_, index) => (
    <tr className="skeleton-row" key={index}>
      <td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td>
    </tr>
  ));
}

function SortIcon({ active, direction }) {
  if (!active) return <ArrowUpDown />;
  return direction === "asc" ? <ArrowUp /> : <ArrowDown />;
}

function PoolTable({ rows, selected, onSelect, loading, sort, onSort }) {
  const bodyRef = useRef(null);
  const rowKey = rows.map((row) => row.address).join(":");

  useGSAP(() => {
    if (loading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rowTargets = bodyRef.current?.querySelectorAll("tr.pool-row");
    if (!rowTargets?.length) return;
    gsap.fromTo(rowTargets, { y: 8, autoAlpha: 0 }, {
      y: 0,
      autoAlpha: 1,
      duration: 0.28,
      stagger: 0.03,
      ease: "power2.out",
      clearProps: "transform,opacity,visibility",
    });
  }, { scope: bodyRef, dependencies: [rowKey, loading], revertOnUpdate: true });

  return (
    <div className="table-frame enter">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {SORT_COLUMNS.map(([key, label]) => (
                <th key={key} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="sort-button" aria-label={`Sortir ${label}`} onClick={() => onSort(key)}>
                    {label}<SortIcon active={sort.key === key} direction={sort.direction} />
                  </button>
                </th>
              ))}
              <th>Action</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {loading ? <SkeletonRows /> : rows.map((pool) => (
              <tr className={`pool-row ${selected?.address === pool.address ? "selected" : ""}`} key={pool.address} onClick={() => onSelect(pool)}>
                <td>
                  <div className="pool-name"><span className="sol-token">S</span><PoolIcon symbol={pool.baseSymbol} /><strong>{pool.pair}</strong></div>
                  <small>MC {formatUsd(pool.marketCap)}</small>
                </td>
                <td><span className="score-cell">{pool.score}</span><span className={`signal-label ${pool.status}`}>{STATUS_LABEL[pool.status]}</span></td>
                <td className={pool.priceChange1h >= 0 ? "positive" : "negative"}>{formatPercent(pool.priceChange1h)}</td>
                <td>{formatUsd(pool.tvl)}</td>
                <td>{formatUsd(pool.volume1h)}</td>
                <td>{pool.volumeTvl1h.toFixed(2)}x</td>
                <td>{pool.feeTvl1h.toFixed(2)}%</td>
                <td><strong className={pool.risk <= 35 ? "risk-low" : pool.risk <= 55 ? "risk-medium" : "risk-high"}>{pool.risk}</strong><small>{pool.risk <= 35 ? "Low" : pool.risk <= 55 ? "Medium" : "High"}</small></td>
                <td>{formatAge(pool.ageHours)}</td>
                <td>
                  <a
                    className="inspect-button"
                    href={`https://www.meteora.ag/dlmm/${pool.address}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Buka ${pool.pair} di Meteora`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink /> Buka Meteora
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <div className="empty-state"><Filter /><strong>Tidak ada pool yang cocok.</strong><span>Reset filter atau buka tab Skipped untuk melihat alasan kegagalan.</span></div>
        ) : null}
      </div>
    </div>
  );
}

function Inspector({ pool, preset, onAlert, alertState }) {
  const inspectorRef = useRef(null);

  useGSAP(() => {
    if (!pool || !inspectorRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(inspectorRef.current, { x: 8, autoAlpha: 0.55 }, { x: 0, autoAlpha: 1, duration: 0.24, ease: "power2.out" });
  }, { scope: inspectorRef, dependencies: [pool?.address], revertOnUpdate: true });

  if (!pool) return <aside className="inspector inspector-empty"><CircleGauge /><strong>Pilih sebuah pool</strong><span>Score, risiko, dan alasan filter akan muncul di sini.</span></aside>;

  const breakdown = [
    ["Momentum", pool.scoreBreakdown.momentum, 25],
    ["Fee efficiency", pool.scoreBreakdown.feeEfficiency, 25],
    ["Volume quality", pool.scoreBreakdown.volumeQuality, 20],
    ["Security", pool.scoreBreakdown.security, 20],
    ["Freshness", pool.scoreBreakdown.freshness, 10],
  ];
  const misses = pool.qualifies[preset].misses;

  return (
    <aside className="inspector" ref={inspectorRef}>
      <div className="inspector-title">
        <div><span>Selected pool</span><h2>{pool.pair}</h2></div>
        <a href={`https://www.meteora.ag/dlmm/${pool.address}`} target="_blank" rel="noreferrer" aria-label="Buka Meteora"><ExternalLink /></a>
      </div>
      <div className="score-summary">
        <ScoreRing score={pool.score} />
        <div><span className={`signal-label ${pool.status}`}>{STATUS_LABEL[pool.status].toUpperCase()} SIGNAL</span><small>Risk score {pool.risk}/100</small></div>
      </div>
      <div className="score-breakdown">
        {breakdown.map(([label, value, total]) => (
          <div className="breakdown-row" key={label}><span>{label}</span><i><b style={{ width: `${(value / total) * 100}%` }} /></i><strong>{value} / {total}</strong></div>
        ))}
      </div>
      <div className="momentum-panel">
        <div><span>1h price momentum</span><strong className={pool.priceChange1h >= 0 ? "positive" : "negative"}>{formatPercent(pool.priceChange1h)}</strong></div>
        <Sparkline values={pool.sparkline} width={240} height={62} />
      </div>
      <div className="risk-flags compact-list">
        <h3>Risk flags</h3>
        {pool.riskFlags.slice(0, 3).map((flag) => (
          <div className={`risk-flag ${flag.type}`} key={flag.label}>{flag.type === "success" ? <Check /> : <TriangleAlert />}<span>{flag.label}</span></div>
        ))}
      </div>
      <div className="preset-gate">
        <div className="section-title"><h3>{PRESETS[preset].label} gate</h3><span>{misses.length ? `${misses.length} gagal` : "Lolos"}</span></div>
        {misses.length ? misses.slice(0, 5).map((miss) => <div className="gate-row failed" key={miss}><X /><span>{miss}</span></div>) : <div className="gate-row passed"><Check /><span>Semua aturan preset terpenuhi</span></div>}
      </div>
      <div className="inspector-actions">
        <button className="primary-button" type="button" onClick={() => onAlert(pool)} disabled={alertState === "sending"}>
          {alertState === "sending" ? <RefreshCw className="spin" /> : <Bell />}{alertState === "sending" ? "Mengirim…" : "Kirim alert"}
        </button>
        <a className="secondary-button" href={`https://www.meteora.ag/dlmm/${pool.address}`} target="_blank" rel="noreferrer"><ExternalLink /> Buka Meteora</a>
      </div>
    </aside>
  );
}

function NotificationPanel({ history, loading, soundEnabled, onToggleSound, onClose, onOpenHistory }) {
  return (
    <section className="notification-panel" role="dialog" aria-label="Notifikasi sinyal">
      <div className="notification-header"><div><span>Live feed</span><h2>Notifikasi Sinyal</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup notifikasi"><X /></button></div>
      <button className={`signal-sound-control ${soundEnabled ? "active" : ""}`} type="button" aria-pressed={soundEnabled} onClick={onToggleSound}>
        {soundEnabled ? <Volume2 /> : <VolumeX />}
        <span><strong>{soundEnabled ? "Suara cuan aktif" : "Aktifkan suara cuan"}</strong><small>{soundEnabled ? "Volume keras · klik untuk matikan" : "Klik untuk tes & aktifkan"}</small></span>
        <i aria-hidden="true" />
      </button>
      <div className="notification-list">
        {loading ? <div className="panel-empty"><RefreshCw className="spin" /> Memuat riwayat…</div> : null}
        {!loading && history.length === 0 ? <div className="panel-empty"><Bell /><strong>Belum ada sinyal</strong><span>Sinyal yang lolos preset akan muncul setelah scan.</span></div> : null}
        {history.slice(0, 6).map((item) => (
          <div className="notification-item" key={item.id}>
            <span className={`notification-indicator ${item.status || "watch"}`} />
            <div><strong>{item.pair}</strong><span>{item.source === "scanner" ? "Terdeteksi scanner" : item.source === "auto" ? "Alert otomatis" : "Alert manual"}</span></div>
            <div><strong>{item.score}</strong><span>{formatHistoryTime(item.createdAt)}</span></div>
          </div>
        ))}
      </div>
      <button className="secondary-button full" type="button" onClick={onOpenHistory}><History /> Buka Signal History</button>
    </section>
  );
}

function SettingsSheet({ runtimeStatus, onClose, onToast }) {
  const [testing, setTesting] = useState(false);

  const testTelegram = async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/telegram/test", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tes gagal");
      onToast("Pesan tes berhasil dikirim ke Telegram.", "success");
    } catch (error) {
      onToast(error.message, "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-header"><div><span>Server settings</span><h2 id="settings-title">Telegram Alert</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup"><X /></button></div>
        <div className={`connection-status ${runtimeStatus?.telegramConfigured ? "connected" : ""}`}>
          <Bot /><div><strong>{runtimeStatus?.telegramConfigured ? "Telegram tersambung" : "Telegram belum tersambung"}</strong><span>{runtimeStatus?.autoAlertsEnabled ? "Alert otomatis aktif" : "Alert otomatis nonaktif"}</span></div>
        </div>
        <div className="runtime-facts">
          <div><span>Preset server</span><strong>{PRESETS[runtimeStatus?.preset || "safer"].label}</strong></div>
          <div><span>Riwayat</span><strong>{runtimeStatus?.historyPersistent ? "Persisten" : "Sementara"}</strong></div>
          <div><span>Interval</span><strong>{runtimeStatus?.scanIntervalSeconds || 30}s</strong></div>
        </div>
        <div className="setup-copy">
          <h3>Status konfigurasi</h3>
          <p>{runtimeStatus?.autoAlertsEnabled ? "SignalForge akan mengirim sinyal yang lolos secara otomatis dengan cooldown per pool." : "Telegram siap dites. Untuk pengiriman otomatis, ubah ENABLE_ALERTS=true lalu restart server."}</p>
          <p>Token tetap di server dan tidak pernah muncul di browser.</p>
        </div>
        <button className="primary-button full" type="button" disabled={!runtimeStatus?.telegramConfigured || testing} onClick={testTelegram}>
          {testing ? <RefreshCw className="spin" /> : <Send />}{testing ? "Mengirim…" : "Kirim pesan tes"}
        </button>
      </section>
    </div>
  );
}

function StatusBar({ meta, preset, scanInterval }) {
  return (
    <footer className="statusbar">
      <span><RefreshCw /> Refresh interval <strong>{scanInterval}s</strong></span>
      <span className={meta?.apiHealthy ? "healthy" : "unhealthy"}><i /> API {meta?.apiHealthy ? "healthy" : "offline"}</span>
      <span><Clock3 /> Alert cooldown <strong>{PRESETS[preset].cooldownMinutes}m</strong></span>
    </footer>
  );
}

function OverviewView({ meta, pools, preset, onOpenScanner }) {
  const topSignals = pools.filter((pool) => pool.qualifies[preset].passed).slice(0, 5);
  return (
    <div className="view-page">
      <div className="page-heading enter"><div><h1>Overview</h1><p>Ringkasan kesehatan scanner dan sinyal teratas saat ini.</p></div><button className="primary-button" type="button" onClick={onOpenScanner}><Search /> Buka Pool Scanner</button></div>
      <MetricStrip meta={meta} pools={pools} preset={preset} />
      <div className="overview-grid enter">
        <section className="open-panel"><div className="section-title"><div><span>Current preset</span><h2>{PRESETS[preset].label}</h2></div><ShieldCheck /></div><div className="overview-facts"><div><span>Market cap</span><strong>{formatUsd(PRESETS[preset].marketCapMin)} – {formatUsd(PRESETS[preset].marketCapMax)}</strong></div><div><span>Minimum TVL</span><strong>{formatUsd(PRESETS[preset].tvlMin)}</strong></div><div><span>Minimum score</span><strong>{PRESETS[preset].minScore}</strong></div><div><span>Cooldown</span><strong>{PRESETS[preset].cooldownMinutes}m</strong></div></div></section>
        <section className="open-panel"><div className="section-title"><div><span>Highest conviction</span><h2>Top signals</h2></div><ChartNoAxesCombined /></div><div className="top-signal-list">{topSignals.length ? topSignals.map((pool) => <button type="button" key={pool.address} onClick={onOpenScanner}><span>{pool.pair}</span><strong>{pool.score}</strong><em>{formatPercent(pool.priceChange1h)}</em></button>) : <div className="panel-empty">Belum ada pool yang lolos preset saat ini.</div>}</div></section>
      </div>
    </div>
  );
}

function SignalHistoryView({ history, loading, error, onRefresh, onClear }) {
  const clearHistory = () => {
    if (window.confirm("Hapus seluruh riwayat sinyal?")) onClear();
  };
  return (
    <div className="view-page history-view">
      <div className="page-heading enter"><div><h1>Signal History</h1><p>Riwayat deteksi scanner dan pengiriman Telegram tersimpan di server.</p></div><div className="page-actions"><button className="secondary-button" type="button" onClick={onRefresh}><RefreshCw /> Refresh</button><button className="danger-button" type="button" onClick={clearHistory} disabled={!history.length}><Trash2 /> Hapus riwayat</button></div></div>
      {error ? <div className="error-banner"><TriangleAlert /><span>{error}</span></div> : null}
      <div className="history-summary enter"><div><span>Total records</span><strong>{history.length}</strong></div><div><span>Telegram delivered</span><strong>{history.filter((item) => item.delivered === true).length}</strong></div><div><span>Scanner detections</span><strong>{history.filter((item) => item.source === "scanner").length}</strong></div></div>
      <div className="history-table-frame enter"><table className="history-table"><thead><tr><th>Time</th><th>Pool</th><th>Score</th><th>1h</th><th>Source</th><th>Delivery</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{formatHistoryTime(item.createdAt)}</td><td><strong>{item.pair}</strong></td><td><span className="score-cell">{item.score}</span></td><td className={item.priceChange1h >= 0 ? "positive" : "negative"}>{formatPercent(item.priceChange1h)}</td><td>{item.source === "scanner" ? "Scanner" : item.source === "auto" ? "Auto alert" : "Manual"}</td><td><span className={`delivery-state ${item.delivered === true ? "sent" : item.delivered === false ? "failed" : "detected"}`}>{item.delivered === true ? "Sent" : item.delivered === false ? "Failed" : "Detected"}</span></td></tr>)}</tbody></table>{!loading && !history.length ? <div className="empty-state"><History /><strong>Riwayat masih kosong.</strong><span>Scanner akan mencatat sinyal pertama yang lolos preset.</span></div> : null}{loading ? <div className="panel-empty"><RefreshCw className="spin" /> Memuat riwayat…</div> : null}</div>
    </div>
  );
}

function RiskRulesView({ preset, onPreset }) {
  const rules = PRESETS[preset];
  const rows = [
    ["Market cap", `${formatUsd(rules.marketCapMin)} – ${formatUsd(rules.marketCapMax)}`],
    ["TVL minimum", formatUsd(rules.tvlMin)],
    ["Momentum 1h", `${rules.momentumMin}% – ${rules.momentumMax}%`],
    ["Volume 1h minimum", formatUsd(rules.volume1hMin)],
    ["Vol/TVL minimum", `${rules.volumeTvlMin}x`],
    ["Fee/TVL minimum", `${rules.feeTvlMin}%`],
    ["Freeze authority", rules.requireFreezeOff ? "Wajib off" : "Opsional"],
    ["Risk maksimum", rules.maxRisk],
  ];
  return (
    <div className="view-page">
      <div className="page-heading enter"><div><h1>Risk Rules</h1><p>Semua aturan yang menentukan lolos atau gagalnya sebuah pool.</p></div><div className="preset-switch">{Object.values(PRESETS).map((item) => <button className={preset === item.id ? "active" : ""} type="button" key={item.id} onClick={() => onPreset(item.id)}>{item.label}</button>)}</div></div>
      <div className="rules-layout enter"><section className="open-panel rules-panel"><div className="section-title"><div><span>Active gate</span><h2>{rules.label}</h2></div><ShieldCheck /></div>{rows.map(([label, value]) => <div className="rule-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section><section className="open-panel"><div className="section-title"><div><span>Score model</span><h2>100-point conviction</h2></div><CircleGauge /></div>{[["Momentum",25],["Fee efficiency",25],["Volume quality",20],["Security",20],["Freshness",10]].map(([label,value]) => <div className="weight-row" key={label}><span>{label}</span><i><b style={{ width: `${value * 4}%` }} /></i><strong>{value}</strong></div>)}<p className="rules-note">Risk score berdiri terpisah dari conviction score. Pool dapat memiliki score tinggi tetapi tetap ditolak jika risk melewati batas.</p></section></div>
    </div>
  );
}

export default function App() {
  const appRef = useRef(null);
  const [scanInterval, setScanInterval] = useState(() => {
    const saved = Number(localStorage.getItem("signalforge:scanInterval"));
    return SCAN_INTERVALS.includes(saved) ? saved : 30;
  });
  const { pools, meta, status, loading, refreshing, error, refresh } = usePools(scanInterval);
  const signalHistory = useSignalHistory(scanInterval);
  const [preset, setPreset] = useState(() => localStorage.getItem("signalforge:preset") || "safer");
  const [activeView, setActiveView] = useState("pool-scanner");
  const [activeTab, setActiveTab] = useState("all");
  const [filters, setFilters] = useState(() => defaultFilters(PRESETS[preset]));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState({ key: "score", direction: "desc" });
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [alertState, setAlertState] = useState("idle");
  const [signalSoundEnabled, setSignalSoundEnabled] = useState(false);
  const latestSignalIdRef = useRef();

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".enter", { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.38, stagger: 0.055, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  }, { scope: appRef, dependencies: [activeView], revertOnUpdate: true });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedAddress && pools[0]) setSelectedAddress(pools[0].address);
  }, [pools, selectedAddress]);

  useEffect(() => {
    if (signalHistory.loading) return;
    const latestId = signalHistory.history[0]?.id || null;
    if (latestSignalIdRef.current === undefined) {
      latestSignalIdRef.current = latestId;
      return;
    }
    if (!latestId || latestSignalIdRef.current === latestId) return;
    latestSignalIdRef.current = latestId;
    if (signalSoundEnabled) playProfitSignal().catch(() => setSignalSoundEnabled(false));
  }, [signalHistory.history, signalHistory.loading, signalSoundEnabled]);

  const selectPreset = (nextPreset) => {
    setPreset(nextPreset);
    setFilters(defaultFilters(PRESETS[nextPreset]));
    setActiveTab("all");
    localStorage.setItem("signalforge:preset", nextPreset);
  };

  const setIntervalPreference = (seconds) => {
    setScanInterval(seconds);
    localStorage.setItem("signalforge:scanInterval", String(seconds));
  };

  const poolProjection = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const textMatches = (pool) => !needle || `${pool.pair} ${pool.name} ${pool.address}`.toLowerCase().includes(needle);
    const filterMatches = (pool) => textMatches(pool)
      && pool.score >= filters.minScore
      && pool.risk <= filters.maxRisk
      && pool.tvl >= filters.minTvl
      && Number.isFinite(pool.priceChange1h)
      && pool.priceChange1h >= filters.minMomentum
      && pool.marketCap >= filters.marketCapMin
      && pool.marketCap <= filters.marketCapMax
      && pool.volumeTvl1h >= filters.minVolumeTvl
      && pool.feeTvl1h >= filters.minFeeTvl
      && (!filters.verifiedOnly || pool.isVerified)
      && (!filters.freezeOffOnly || pool.freezeAuthorityDisabled);

    const filtered = pools.filter(filterMatches);
    const qualified = (pool) => pool.qualifies[preset].passed;
    return {
      all: filtered,
      hot: filtered.filter((pool) => qualified(pool) && pool.score >= 80),
      watch: filtered.filter((pool) => qualified(pool) && pool.score >= 65 && pool.score < 80),
      skipped: pools.filter((pool) => textMatches(pool) && !qualified(pool)),
    };
  }, [pools, deferredSearch, filters, preset]);

  const counts = useMemo(() => ({
    all: poolProjection.all.length,
    hot: poolProjection.hot.length,
    watch: poolProjection.watch.length,
    skipped: poolProjection.skipped.length,
  }), [poolProjection]);

  const visiblePools = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return poolProjection[activeTab].toSorted((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      if (typeof a === "string") return a.localeCompare(b) * direction;
      if (!Number.isFinite(a)) return 1;
      if (!Number.isFinite(b)) return -1;
      return (a - b) * direction;
    });
  }, [poolProjection, activeTab, sort]);

  const selected = pools.find((pool) => pool.address === selectedAddress) || visiblePools[0] || pools[0] || null;
  const showToast = (message, tone = "info") => setToast({ message, tone });

  const toggleSignalSound = async () => {
    if (signalSoundEnabled) {
      setSignalSoundEnabled(false);
      showToast("Suara cuan dimatikan.");
      return;
    }
    if (!await playProfitSignal()) {
      showToast("Browser ini tidak mendukung suara notifikasi.", "error");
      return;
    }
    setSignalSoundEnabled(true);
    showToast("Suara cuan keras aktif.", "success");
  };

  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));

  const resetAll = () => {
    setFilters(defaultFilters(PRESETS[preset]));
    setSearch("");
    setActiveTab("all");
    setSort({ key: "score", direction: "desc" });
  };

  const sendAlert = async (pool) => {
    setAlertState("sending");
    try {
      const response = await fetch("/api/telegram/alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: pool.address }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Alert gagal dikirim");
      setAlertState("sent");
      showToast(`Alert ${pool.pair} berhasil dikirim.`, "success");
      signalHistory.refresh();
    } catch (sendError) {
      setAlertState("error");
      showToast(sendError.message, "error");
      if (!status?.telegramConfigured) setSettingsOpen(true);
    }
  };

  const navigate = (view) => {
    setNavOpen(false);
    setNotificationsOpen(false);
    if (view === "settings") setSettingsOpen(true);
    else setActiveView(view);
  };

  const openScanner = () => setActiveView("pool-scanner");
  const mainWide = activeView !== "pool-scanner";

  return (
    <div className="app-shell" ref={appRef}>
      <Header
        meta={meta}
        refreshing={refreshing}
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleNav={() => setNavOpen((value) => !value)}
        scanInterval={scanInterval}
        onScanInterval={setIntervalPreference}
        onToggleNotifications={() => { setNotificationsOpen((value) => !value); signalHistory.refresh(); }}
        notificationsOpen={notificationsOpen}
        notificationCount={signalHistory.history.length}
      />
      <Sidebar open={navOpen} activeView={activeView} onNavigate={navigate} />
      <main className={`main-canvas ${mainWide ? "main-wide" : ""}`}>
        {activeView === "pool-scanner" ? (
          <>
            <div className="page-heading enter">
              <div><h1>Pool Scanner</h1><p>Momentum, fee efficiency, dan risiko—dalam satu layar.</p></div>
              <div className="search-area">
                <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari token atau pool" /></label>
                <button className={`filter-button ${advancedOpen ? "active" : ""}`} type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}><Filter /> Filter</button>
              </div>
            </div>
            {error ? <div className="error-banner"><TriangleAlert /><span><strong>Data live belum tersedia.</strong> {error}</span><button type="button" onClick={refresh}>Coba lagi</button></div> : null}
            <MetricStrip meta={meta} pools={pools} preset={preset} />
            <Controls preset={preset} onPreset={selectPreset} activeTab={activeTab} onTab={setActiveTab} counts={counts} filters={filters} onFilters={setFilters} onReset={resetAll} advancedOpen={advancedOpen} />
            <PoolTable rows={visiblePools} selected={selected} onSelect={(pool) => setSelectedAddress(pool.address)} loading={loading} sort={sort} onSort={changeSort} />
          </>
        ) : null}
        {activeView === "overview" ? <OverviewView meta={meta} pools={pools} preset={preset} onOpenScanner={openScanner} /> : null}
        {activeView === "signal-history" ? <SignalHistoryView history={signalHistory.history} loading={signalHistory.loading} error={signalHistory.error} onRefresh={signalHistory.refresh} onClear={signalHistory.clear} /> : null}
        {activeView === "risk-rules" ? <RiskRulesView preset={preset} onPreset={selectPreset} /> : null}
      </main>
      {activeView === "pool-scanner" ? <Inspector pool={selected} preset={preset} onAlert={sendAlert} alertState={alertState} /> : null}
      <StatusBar meta={meta} preset={preset} scanInterval={scanInterval} />
      {notificationsOpen ? <NotificationPanel history={signalHistory.history} loading={signalHistory.loading} soundEnabled={signalSoundEnabled} onToggleSound={toggleSignalSound} onClose={() => setNotificationsOpen(false)} onOpenHistory={() => navigate("signal-history")} /> : null}
      {settingsOpen ? <SettingsSheet runtimeStatus={status} onClose={() => setSettingsOpen(false)} onToast={showToast} /> : null}
      {toast ? <div className={`toast ${toast.tone}`} role="status">{toast.tone === "success" ? <Check /> : toast.tone === "error" ? <TriangleAlert /> : <Activity />}<span>{toast.message}</span></div> : null}
    </div>
  );
}
