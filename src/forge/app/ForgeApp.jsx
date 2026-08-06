import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bell,
  BellRing,
  Flame,
  Gauge,
  History,
  Home,
  LayoutGrid,
  Loader2,
  Moon,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Telescope,
  X,
} from "lucide-react";
import { PRESETS } from "../../../shared/scoring.js";
import { collectSignalEntries } from "../../../shared/signalTransitions.js";
import { usePools } from "../../hooks/usePools.js";
import { useSignalHistory } from "../../hooks/useSignalHistory.js";
import { formatWibTime } from "../../lib/format.js";
import {
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUNDS,
  resolveNotificationSoundChoice,
} from "../../lib/notificationSounds.js";
import { playSignalSound, primeSignalSound, stopSignalSound } from "../../lib/signalSound.js";
import { heatVars } from "../lib/heat.js";
import { Link, navigate } from "../lib/router.js";
import { summarize } from "../lib/summary.js";
import { useTheme } from "../lib/useTheme.js";
import { useWatchlist } from "../lib/watchlist.js";
import CommandPalette from "./components/CommandPalette.jsx";
import PoolDrawer from "./components/PoolDrawer.jsx";
import { ToastStack, useToasts } from "./components/Toasts.jsx";
import OverviewView from "./views/OverviewView.jsx";
import RulesView from "./views/RulesView.jsx";
import ScannerView, { defaultColumnKeys } from "./views/ScannerView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import SignalsView from "./views/SignalsView.jsx";
import "./app.css";

const NAV = [
  { path: "/app", label: "Ringkasan", icon: Gauge },
  { path: "/app/scanner", label: "Scanner", icon: Telescope },
  { path: "/app/signals", label: "Sinyal", icon: History },
  { path: "/app/rules", label: "Aturan", icon: ShieldCheck },
  { path: "/app/settings", label: "Pengaturan", icon: Settings },
];

const SCAN_INTERVALS = [30, 60, 120];

const defaultFilters = (preset) => ({
  minScore: 0,
  maxRisk: 100,
  minTvl: 0,
  minMomentum: -100,
  marketCapMin: 0,
  marketCapMax: 100_000_000,
  minVolumeTvl: 0,
  minFeeTvl: 0,
  maxTop10: 100,
  verifiedOnly: false,
  freezeOffOnly: preset.requireFreezeOff,
  cleanSecurityOnly: false,
});

const initialScannerState = (preset) => ({
  search: "",
  tab: "all",
  sort: { key: "score", direction: "desc" },
  filters: defaultFilters(preset),
  // A 18-column table is unusable on a phone; start those sessions on cards.
  view: window.innerWidth < 760 ? "grid" : "table",
  density: "compact",
  columns: defaultColumnKeys(),
  filtersOpen: false,
});

/* --- chrome ---------------------------------------------------------------- */

function Rail({ path }) {
  return (
    <nav className="fx-rail" aria-label="Navigasi utama">
      <Link className="fx-rail-brand" to="/" aria-label="Kembali ke beranda">
        <span aria-hidden="true">
          <i />
        </span>
      </Link>
      <ul>
        {NAV.map((item) => {
          const active = item.path === "/app" ? path === "/app" : path.startsWith(item.path);
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`fx-rail-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <a className="fx-rail-item fx-rail-foot" href="/classic" title="Tampilan klasik">
        <LayoutGrid />
        <span>Klasik</span>
      </a>
    </nav>
  );
}

function ScanClock({ scannedAt, interval, refreshing, onRefresh }) {
  const [remaining, setRemaining] = useState(interval);

  useEffect(() => setRemaining(interval), [scannedAt, interval]);
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <button
      className="fx-scanclock"
      type="button"
      onClick={onRefresh}
      title="Muat ulang sekarang"
      aria-label="Muat ulang hasil scan sekarang"
    >
      <span className="fx-scanclock-ring" style={{ "--progress": `${(remaining / interval) * 100}%` }}>
        <RefreshCw className={refreshing ? "f-spin" : ""} />
      </span>
      <span className="fx-scanclock-text">
        <em className="f-num">{formatWibTime(scannedAt)} WIB</em>
        <small>muat ulang dalam {remaining}s</small>
      </span>
    </button>
  );
}

function NotificationPanel({ history, loading, onClose, onOpenSignals }) {
  return (
    <div className="fx-notify" role="dialog" aria-label="Sinyal terbaru">
      <header>
        <div>
          <span className="f-eyebrow">Umpan langsung</span>
          <h2>Sinyal terbaru</h2>
        </div>
        <button className="f-icon-btn" type="button" onClick={onClose} aria-label="Tutup">
          <X />
        </button>
      </header>
      <div className="fx-notify-list">
        {loading && !history.length ? (
          <p className="fx-notify-empty">
            <Loader2 className="f-spin" /> Memuat riwayat…
          </p>
        ) : null}
        {!loading && !history.length ? (
          <p className="fx-notify-empty">Belum ada sinyal sejak server dijalankan.</p>
        ) : null}
        {history.slice(0, 8).map((item) => (
          <div className="fx-notify-row" key={item.id} style={heatVars(item.score)}>
            <span className="fx-notify-heat" aria-hidden="true" />
            <div>
              <strong>{item.pair}</strong>
              <span>
                {item.eventType === "status-entry"
                  ? `Masuk ${String(item.status).toUpperCase()}`
                  : item.source === "scanner"
                    ? "Terdeteksi scanner"
                    : item.source === "auto"
                      ? "Alert otomatis"
                      : "Alert manual"}
              </span>
            </div>
            <span className="f-num">{item.score}</span>
          </div>
        ))}
      </div>
      <button className="f-btn f-btn--block" type="button" onClick={onOpenSignals}>
        <History /> Buka riwayat lengkap
      </button>
    </div>
  );
}

/* --- app ------------------------------------------------------------------- */

export default function ForgeApp({ path }) {
  const { theme, setTheme, cycleTheme, resolved } = useTheme();
  const { toasts, push, dismiss } = useToasts();
  const watchlist = useWatchlist();

  const [scanInterval, setScanInterval] = useState(() => {
    const saved = Number(localStorage.getItem("signalforge:scanInterval"));
    return SCAN_INTERVALS.includes(saved) ? saved : 30;
  });
  const { pools, meta, status, loading, refreshing, error, refresh } = usePools(scanInterval);
  const signalHistory = useSignalHistory(scanInterval);

  const [preset, setPreset] = useState(() => localStorage.getItem("signalforge:preset") || "safer");
  const [scanner, setScanner] = useState(() => initialScannerState(PRESETS[preset] || PRESETS.safer));
  const [selectedAddress, setSelectedAddress] = useState(
    () => new URLSearchParams(window.location.search).get("pool") || null,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [alertState, setAlertState] = useState("idle");

  const [soundChoice, setSoundChoice] = useState(() =>
    resolveNotificationSoundChoice(
      localStorage.getItem("signalforge:notificationSoundChoice"),
      localStorage.getItem("signalforge:notificationSound"),
    ),
  );
  const soundEnabled = soundChoice !== NOTIFICATION_SOUND_OFF;
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window.Notification === "undefined" ? "unsupported" : window.Notification.permission,
  );

  const snapshotRef = useRef({ preset: null, scannedAt: null, statuses: new Map() });
  const deferredSearch = useDeferredValue(scanner.search);
  const summary = useMemo(() => summarize(pools, preset), [pools, preset]);

  /* --- sound ------------------------------------------------------------- */

  // Playback lives in lib/signalSound.js, shared with the classic interface: it
  // owns the one <audio> element for the file-backed sounds and synthesises the
  // ones that have no file, which an <audio> element alone could never play.
  const playSound = useCallback(
    async (choice = soundChoice) => {
      if (!NOTIFICATION_SOUNDS[choice]) return;
      try {
        await playSignalSound(choice);
      } catch {
        // Autoplay may still be blocked; the toast carries the signal regardless.
      }
    },
    [soundChoice],
  );

  useEffect(() => {
    if (!soundEnabled) return undefined;
    const prime = () => void primeSignalSound(soundChoice);
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [soundChoice, soundEnabled]);

  useEffect(() => stopSignalSound, []);

  const changeSound = useCallback(
    async (choice) => {
      if (choice !== NOTIFICATION_SOUND_OFF && !NOTIFICATION_SOUNDS[choice]) return;
      setSoundChoice(choice);
      localStorage.setItem("signalforge:notificationSoundChoice", choice);
      localStorage.setItem("signalforge:notificationSound", String(choice !== NOTIFICATION_SOUND_OFF));
      if (choice === NOTIFICATION_SOUND_OFF) {
        stopSignalSound();
        push("Bunyi sinyal dimatikan.");
        return;
      }
      await playSound(choice);
      push(`${NOTIFICATION_SOUNDS[choice].label} dipakai untuk sinyal baru.`, "success");
    },
    [playSound, push],
  );

  const requestDesktopNotifications = useCallback(async () => {
    if (typeof window.Notification === "undefined") return;
    if (window.Notification.permission !== "default") return;
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") push("Notifikasi desktop aktif.", "success");
  }, [push]);

  /* --- status transitions ------------------------------------------------ */

  useEffect(() => {
    if (!meta?.scannedAt || !pools.length) return;
    const snapshot = snapshotRef.current;
    if (snapshot.preset === preset && snapshot.scannedAt === meta.scannedAt) return;

    const { currentStatuses, entries } = collectSignalEntries(pools, preset, snapshot.statuses);
    const shouldNotify = snapshot.preset === preset && snapshot.scannedAt !== null;
    snapshotRef.current = { preset, scannedAt: meta.scannedAt, statuses: currentStatuses };
    if (!shouldNotify || !entries.length) return;

    const ordered = entries.toSorted((left, right) => (right.status === "hot") - (left.status === "hot"));
    const primary = ordered[0];
    const label = primary.status.toUpperCase();
    const message =
      ordered.length === 1
        ? `${primary.pool.pair} baru masuk ${label}.`
        : `${ordered.length} pair baru masuk Watch/Hot. ${primary.pool.pair} paling kuat (${label}).`;

    if (soundEnabled) void playSound();
    push(message, primary.status === "hot" ? "warning" : "success", {
      title: `Sinyal ${label}`,
      action: {
        label: "Lihat",
        onClick: () => {
          setSelectedAddress(primary.pool.address);
          navigate("/app/scanner");
        },
      },
    });
    signalHistory.refresh();

    if (notificationPermission === "granted" && typeof window.Notification !== "undefined") {
      try {
        new window.Notification(`SignalForge · ${label}`, {
          body: message,
          tag: `signalforge-${primary.pool.address}-${primary.status}`,
        });
      } catch {
        // Native notifications can be blocked at the OS level; the toast still fires.
      }
    }
  }, [
    meta?.scannedAt,
    notificationPermission,
    playSound,
    pools,
    preset,
    push,
    signalHistory.refresh,
    soundEnabled,
  ]);

  /* --- selection --------------------------------------------------------- */

  const selected = useMemo(
    () => pools.find((pool) => pool.address === selectedAddress) || null,
    [pools, selectedAddress],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedAddress) url.searchParams.set("pool", selectedAddress);
    else url.searchParams.delete("pool");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [selectedAddress, path]);

  const openPool = useCallback((pool) => {
    setSelectedAddress(pool.address);
  }, []);

  // The scroll container is <main>, not the window, so switching views has to
  // reset it explicitly.
  useEffect(() => {
    document.querySelector(".fx-main")?.scrollTo({ top: 0 });
  }, [path]);

  /* --- projection -------------------------------------------------------- */

  const projection = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const { filters } = scanner;
    const textMatch = (pool) =>
      !needle || `${pool.pair} ${pool.name} ${pool.address}`.toLowerCase().includes(needle);

    const passes = (pool) =>
      textMatch(pool) &&
      pool.score >= filters.minScore &&
      pool.risk <= filters.maxRisk &&
      pool.tvl >= filters.minTvl &&
      // Pools whose 1h candle never arrived stay in the list until a momentum
      // floor is actually set, rather than vanishing without explanation.
      (Number.isFinite(pool.priceChange1h)
        ? pool.priceChange1h >= filters.minMomentum
        : filters.minMomentum <= -100) &&
      pool.marketCap >= filters.marketCapMin &&
      pool.marketCap <= filters.marketCapMax &&
      pool.volumeTvl1h >= filters.minVolumeTvl &&
      pool.feeTvl1h >= filters.minFeeTvl &&
      (!Number.isFinite(pool.top10HoldersPct) || pool.top10HoldersPct <= filters.maxTop10) &&
      (!filters.verifiedOnly || pool.isVerified) &&
      (!filters.freezeOffOnly || pool.freezeAuthorityDisabled) &&
      (!filters.cleanSecurityOnly || !(pool.jupShieldWarnings?.length > 0));

    const filtered = pools.filter(passes);
    const qualified = (pool) => pool.qualifies?.[preset]?.passed;

    // Hot and Watch are score bands so they agree with the badge on every row.
    // Clearing the preset gate is its own tab rather than a hidden condition.
    return {
      all: filtered,
      qualified: filtered.filter(qualified),
      hot: filtered.filter((pool) => pool.score >= 80),
      watch: filtered.filter((pool) => pool.score >= 65 && pool.score < 80),
      skipped: pools.filter((pool) => textMatch(pool) && !qualified(pool)),
      watchlist: pools.filter((pool) => textMatch(pool) && watchlist.addresses.includes(pool.address)),
    };
  }, [deferredSearch, pools, preset, scanner, watchlist.addresses]);

  const counts = useMemo(
    () => ({
      all: projection.all.length,
      qualified: projection.qualified.length,
      hot: projection.hot.length,
      watch: projection.watch.length,
      skipped: projection.skipped.length,
      watchlist: projection.watchlist.length,
    }),
    [projection],
  );

  const rows = useMemo(() => {
    const { key, direction } = scanner.sort;
    const factor = direction === "asc" ? 1 : -1;
    return (projection[scanner.tab] || []).toSorted((left, right) => {
      const a = left[key];
      const b = right[key];
      if (typeof a === "string" || typeof b === "string") {
        return String(a ?? "").localeCompare(String(b ?? "")) * factor;
      }
      if (!Number.isFinite(a)) return 1;
      if (!Number.isFinite(b)) return -1;
      return (a - b) * factor;
    });
  }, [projection, scanner.sort, scanner.tab]);

  /* --- actions ----------------------------------------------------------- */

  const selectPreset = useCallback((next) => {
    setPreset(next);
    localStorage.setItem("signalforge:preset", next);
    setScanner((current) => ({
      ...current,
      filters: { ...current.filters, freezeOffOnly: PRESETS[next].requireFreezeOff },
      tab: "all",
    }));
  }, []);

  const changeInterval = useCallback((seconds) => {
    setScanInterval(seconds);
    localStorage.setItem("signalforge:scanInterval", String(seconds));
  }, []);

  const resetFilters = useCallback(() => {
    setScanner((current) => ({
      ...current,
      filters: defaultFilters(PRESETS[preset]),
      search: "",
      tab: "all",
      sort: { key: "score", direction: "desc" },
    }));
  }, [preset]);

  const sendAlert = useCallback(
    async (pool) => {
      setAlertState("sending");
      try {
        const response = await fetch("/api/telegram/alert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: pool.address }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Alert gagal dikirim");
        setAlertState("sent");
        push(`Alert ${pool.pair} terkirim.`, "success");
        signalHistory.refresh();
      } catch (sendError) {
        setAlertState("error");
        push(sendError.message, "error");
        if (!status?.telegramConfigured) navigate("/app/settings");
      }
    },
    [push, signalHistory, status?.telegramConfigured],
  );

  const toggleWatch = useCallback(
    (pool) => {
      const added = watchlist.toggle(pool.address);
      push(added ? `${pool.pair} disimpan ke watchlist.` : `${pool.pair} dihapus dari watchlist.`);
    },
    [push, watchlist],
  );

  /* --- keyboard ---------------------------------------------------------- */

  const commands = useMemo(
    () => [
      ...NAV.map((item) => ({
        id: `nav:${item.path}`,
        label: `Buka ${item.label}`,
        icon: item.icon,
        run: () => navigate(item.path),
      })),
      { id: "refresh", label: "Muat ulang scan sekarang", icon: RefreshCw, run: refresh },
      {
        id: "preset",
        label: `Ganti preset ke ${PRESETS[preset === "safer" ? "yanman" : "safer"].label}`,
        icon: ShieldCheck,
        run: () => selectPreset(preset === "safer" ? "yanman" : "safer"),
      },
      { id: "theme", label: "Ganti tema", icon: resolved === "light" ? Sun : Moon, run: cycleTheme },
      {
        id: "hot",
        label: "Saring ke tab Hot",
        icon: Flame,
        run: () => {
          setScanner((current) => ({ ...current, tab: "hot" }));
          navigate("/app/scanner");
        },
      },
      {
        id: "watchlist",
        label: "Buka watchlist",
        icon: Star,
        run: () => {
          setScanner((current) => ({ ...current, tab: "watchlist" }));
          navigate("/app/scanner");
        },
      },
      { id: "landing", label: "Kembali ke beranda", icon: Home, run: () => navigate("/") },
    ],
    [cycleTheme, preset, refresh, resolved, selectPreset],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === "r") {
        refresh();
      } else if (event.key === "Escape") {
        setSelectedAddress(null);
        setNotifyOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  useEffect(() => {
    if (!notifyOpen) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".fx-notify") && !event.target.closest?.(".fx-bell")) {
        setNotifyOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notifyOpen]);

  /* --- render ------------------------------------------------------------ */

  const view = path.replace(/^\/app\/?/, "") || "overview";

  return (
    <div className={`fx-shell ${selected ? "has-drawer" : ""}`}>
      <Rail path={path} />

      <header className="fx-topbar">
        <span className={`fx-live ${error ? "is-down" : ""}`}>
          <i />
          {error ? "API tidak terjangkau" : "Meteora langsung"}
        </span>
        <ScanClock
          scannedAt={meta?.scannedAt}
          interval={scanInterval}
          refreshing={refreshing}
          onRefresh={refresh}
        />
        <button className="fx-omni" type="button" onClick={() => setPaletteOpen(true)}>
          <Search />
          <span>Cari pool atau perintah</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="fx-topbar-actions">
          <button
            className={`f-icon-btn fx-bell ${notifyOpen ? "is-active" : ""}`}
            type="button"
            aria-expanded={notifyOpen}
            aria-label={`Sinyal terbaru${signalHistory.history.length ? ` (${signalHistory.history.length})` : ""}`}
            onClick={() => {
              const next = !notifyOpen;
              setNotifyOpen(next);
              if (next) {
                signalHistory.refresh();
                if (soundEnabled) void unlockAudio();
              }
            }}
          >
            {signalHistory.history.length ? <BellRing /> : <Bell />}
            {signalHistory.history.length ? (
              <span className="fx-bell-count f-num">{Math.min(signalHistory.history.length, 99)}</span>
            ) : null}
          </button>
          <button
            className="f-icon-btn"
            type="button"
            onClick={cycleTheme}
            aria-label={`Tema: ${theme}. Ganti tema.`}
            title={`Tema: ${theme}`}
          >
            {resolved === "light" ? <Sun /> : <Moon />}
          </button>
          <button className="f-btn" type="button" onClick={() => navigate("/app/settings")}>
            <Send /> Telegram
          </button>
        </div>
        {notifyOpen ? (
          <NotificationPanel
            history={signalHistory.history}
            loading={signalHistory.loading}
            onClose={() => setNotifyOpen(false)}
            onOpenSignals={() => {
              setNotifyOpen(false);
              navigate("/app/signals");
            }}
          />
        ) : null}
      </header>

      <main className="fx-main">
        {view === "overview" ? (
          <OverviewView
            summary={summary}
            meta={meta}
            preset={preset}
            loading={loading}
            history={signalHistory.history}
            onOpenPool={openPool}
            onGoScanner={() => navigate("/app/scanner")}
          />
        ) : null}
        {view === "scanner" ? (
          <ScannerView
            pools={pools}
            loading={loading}
            error={error}
            preset={preset}
            onPreset={selectPreset}
            state={scanner}
            setState={setScanner}
            counts={counts}
            rows={rows}
            selectedAddress={selectedAddress}
            onOpenPool={openPool}
            watchlist={watchlist}
            onRefresh={refresh}
            onResetFilters={resetFilters}
          />
        ) : null}
        {view === "signals" ? (
          <SignalsView
            history={signalHistory.history}
            loading={signalHistory.loading}
            error={signalHistory.error}
            onRefresh={signalHistory.refresh}
            onClear={async () => {
              await signalHistory.clear();
              push("Riwayat sinyal dihapus.", "success");
            }}
            onOpenAddress={(address) => {
              if (pools.some((pool) => pool.address === address)) setSelectedAddress(address);
            }}
          />
        ) : null}
        {view === "rules" ? <RulesView preset={preset} onPreset={selectPreset} /> : null}
        {view === "settings" ? (
          <SettingsView
            status={status}
            scanInterval={scanInterval}
            onScanInterval={changeInterval}
            soundChoice={soundChoice}
            onSoundChange={changeSound}
            notificationPermission={notificationPermission}
            onRequestPermission={requestDesktopNotifications}
            theme={theme}
            onTheme={setTheme}
            watchlistCount={watchlist.addresses.length}
            onClearWatchlist={() => {
              watchlist.clear();
              push("Watchlist dikosongkan.");
            }}
            onToast={push}
          />
        ) : null}
      </main>

      <PoolDrawer
        pool={selected}
        preset={preset}
        onClose={() => setSelectedAddress(null)}
        onSendAlert={sendAlert}
        alertState={alertState}
        isWatched={selected ? watchlist.has(selected.address) : false}
        onToggleWatch={toggleWatch}
        onToast={push}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        pools={pools}
        onSelectPool={(pool) => {
          openPool(pool);
          navigate("/app/scanner");
        }}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
