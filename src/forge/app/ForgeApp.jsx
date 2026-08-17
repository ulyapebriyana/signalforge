import {
  Suspense,
  lazy,
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
  Wallet,
  X,
} from "lucide-react";
import { collectPositionAlerts } from "../../../shared/lpPositions.js";
import { PRESETS, poolTier, resolvePresetId } from "../../../shared/scoring.js";
import { collectSignalEntries } from "../../../shared/signalTransitions.js";
import { useLpPositions } from "../../hooks/useLpPositions.js";
import { usePools } from "../../hooks/usePools.js";
import { useSignalHistory } from "../../hooks/useSignalHistory.js";
import { formatWibTime } from "../../lib/format.js";
import {
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUNDS,
  resolveNotificationSoundMap,
  resolvePositionSoundChoice,
  soundForPreset,
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
import ScannerView, { defaultColumnKeys, defaultSort } from "./views/ScannerView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import SignalsView from "./views/SignalsView.jsx";
import "./app.css";

const NAV = [
  { path: "/app", label: "Ringkasan", icon: Gauge },
  { path: "/app/scanner", label: "Scanner", icon: Telescope },
  { path: "/app/positions", label: "Posisi", icon: Wallet },
  { path: "/app/signals", label: "Sinyal", icon: History },
  { path: "/app/rules", label: "Aturan", icon: ShieldCheck },
  { path: "/app/settings", label: "Pengaturan", icon: Settings },
];

/**
 * Positions load on demand, and so does everything they drag in.
 *
 * Signing needs @solana/web3.js and the wallet adapter, which together are
 * larger than the entire rest of this dashboard — importing them at the top
 * level made the shared bundle roughly six times heavier for every scanner
 * session that never opens this page. Behind a lazy import they land in their
 * own chunk, fetched the first time someone actually goes to /app/positions.
 *
 * The provider sits inside that boundary rather than around the shell, which
 * costs a reconnect when navigating away and back. That is the price of keeping
 * the wallet code out of the main bundle, and it errs the safe way: nothing
 * stays connected while the user is off looking at pools.
 */
const PositionsWorkspace = lazy(() => import("./views/PositionsWorkspace.jsx"));

const SCAN_INTERVALS = [30, 60, 120];

const PRESET_IDS = Object.keys(PRESETS);

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
  sort: defaultSort(preset.id),
  filters: defaultFilters(preset),
  // A 18-column table is unusable on a phone; start those sessions on cards.
  view: window.innerWidth < 760 ? "grid" : "table",
  density: "compact",
  columns: defaultColumnKeys(preset.id),
  filtersOpen: false,
  // Set by clicking a phase count in the market strip. Null means every phase.
  phaseFilter: null,
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
  // Polled on the server's own LP cadence rather than the pool scan's: a
  // position moves when the price crosses a bin, and each read costs an RPC call.
  const lp = useLpPositions(status?.lpScanSeconds || 60);

  const [preset, setPreset] = useState(() => resolvePresetId(localStorage.getItem("signalforge:preset")));
  const [scanner, setScanner] = useState(() => initialScannerState(PRESETS[preset]));
  const [selectedAddress, setSelectedAddress] = useState(
    () => new URLSearchParams(window.location.search).get("pool") || null,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [alertState, setAlertState] = useState("idle");

  // One sound per preset, so the alarm alone says which gate fired.
  const [soundByPreset, setSoundByPreset] = useState(() =>
    resolveNotificationSoundMap(
      localStorage.getItem("signalforge:notificationSoundByPreset"),
      localStorage.getItem("signalforge:notificationSoundChoice"),
      localStorage.getItem("signalforge:notificationSound"),
    ),
  );
  const soundChoice = soundForPreset(soundByPreset, preset);
  const soundEnabled = soundChoice !== NOTIFICATION_SOUND_OFF;

  // The LP alarm is one setting for the whole app, not one per preset — see
  // resolvePositionSoundChoice for why an open position has no preset to vary by.
  const [positionSound, setPositionSound] = useState(() =>
    resolvePositionSoundChoice(localStorage.getItem("signalforge:positionSound")),
  );
  const positionSoundEnabled = positionSound !== NOTIFICATION_SOUND_OFF;
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

  /**
   * Which sound does the unlocking.
   *
   * One <audio> element serves every file-backed sound, so priming it once buys
   * autoplay rights for all of them — but only a sound that *has* a file can do
   * the priming, and the synthesised ones have no element to unlock. Picking the
   * first choice with a file means a synth preset sound no longer leaves the LP
   * alarm locked out, which it silently did while priming followed the preset.
   */
  const primeChoice = [soundChoice, positionSound].find(
    (choice) => NOTIFICATION_SOUNDS[choice]?.src,
  );

  useEffect(() => {
    if (!primeChoice) return undefined;
    const prime = () => void primeSignalSound(primeChoice);
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [primeChoice]);

  useEffect(() => stopSignalSound, []);

  const changeSound = useCallback(
    async (targetPreset, choice) => {
      if (!PRESETS[targetPreset]) return;
      if (choice !== NOTIFICATION_SOUND_OFF && !NOTIFICATION_SOUNDS[choice]) return;

      const next = { ...soundByPreset, [targetPreset]: choice };
      setSoundByPreset(next);
      localStorage.setItem("signalforge:notificationSoundByPreset", JSON.stringify(next));

      const presetLabel = PRESETS[targetPreset].label;
      if (choice === NOTIFICATION_SOUND_OFF) {
        stopSignalSound();
        push(`Bunyi ${presetLabel} dimatikan.`);
        return;
      }
      // Preview whichever sound was just picked, even for the inactive preset.
      await playSound(choice);
      push(`${NOTIFICATION_SOUNDS[choice].label} dipakai untuk sinyal ${presetLabel}.`, "success");
    },
    [playSound, push, soundByPreset],
  );

  const changePositionSound = useCallback(
    async (choice) => {
      if (choice !== NOTIFICATION_SOUND_OFF && !NOTIFICATION_SOUNDS[choice]) return;

      setPositionSound(choice);
      localStorage.setItem("signalforge:positionSound", choice);

      if (choice === NOTIFICATION_SOUND_OFF) {
        stopSignalSound();
        push("Bunyi posisi keluar range dimatikan.");
        return;
      }
      await playSound(choice);
      push(`${NOTIFICATION_SOUNDS[choice].label} dipakai untuk posisi keluar range.`, "success");
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

  /* --- position range transitions ---------------------------------------- */

  /**
   * The other half of the alarm: the scanner shouts when a pool becomes worth
   * entering, this shouts when a position stops being worth holding.
   *
   * The transition rule is `collectPositionAlerts`, the same one the server's
   * Telegram alerts run on — reusing it means the browser cannot disagree with
   * the message that arrives on the phone. Only the out-of-range half is voiced
   * here; a drift to the edge still earns fees and needs no interruption.
   *
   * This lives in the shell rather than in the positions view because the tab is
   * rarely parked on that page. The LP poll runs for as long as a wallet is set,
   * so the alarm reaches someone watching the scanner.
   */
  const positionsRef = useRef({ readAt: null, wallet: null, states: new Map() });

  useEffect(() => {
    if (!lp.readAt) return;
    const snapshot = positionsRef.current;
    if (snapshot.readAt === lp.readAt && snapshot.wallet === lp.wallet) return;

    // A different wallet holds different positions, so its first read is a
    // baseline of its own. Comparing across wallets would be comparing keys that
    // never met, and the empty map makes that explicit rather than accidental.
    const previous = snapshot.wallet === lp.wallet ? snapshot.states : new Map();
    const { currentStates, entries } = collectPositionAlerts(lp.positions, previous);
    positionsRef.current = { readAt: lp.readAt, wallet: lp.wallet, states: currentStates };

    const left = entries.filter((entry) => entry.kind === "out-of-range");
    if (!left.length) return;

    const primary = left[0];
    const pair = primary.position.pair || "Posisi";
    const side = primary.state === "below" ? "tembus batas bawah" : "tembus batas atas";
    const message =
      left.length === 1
        ? `${pair} ${side} dan berhenti dapat fee.`
        : `${left.length} posisi keluar range. ${pair} ${side}.`;

    if (positionSoundEnabled) void playSound(positionSound);
    push(message, "warning", {
      title: "Posisi keluar range",
      action: { label: "Lihat", onClick: () => navigate("/app/positions") },
    });

    if (notificationPermission === "granted" && typeof window.Notification !== "undefined") {
      try {
        new window.Notification("SignalForge · Posisi keluar range", {
          body: message,
          tag: `signalforge-lp-${primary.position.positionKey}-${primary.state}`,
        });
      } catch {
        // Blocked at the OS level; the toast and the sound still carry it.
      }
    }
  }, [
    lp.positions,
    lp.readAt,
    lp.wallet,
    notificationPermission,
    playSound,
    positionSound,
    positionSoundEnabled,
    push,
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

    // The phase chips in the market strip are a filter, not a legend: clicking
    // "Menyala" is how you go from "three pools are igniting" to seeing them.
    const phaseMatch = (pool) => !scanner.phaseFilter || pool.phase === scanner.phaseFilter;

    const passes = (pool) =>
      textMatch(pool) &&
      phaseMatch(pool) &&
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
      hot: filtered.filter((pool) => poolTier(pool.score, preset) === "hot"),
      watch: filtered.filter((pool) => poolTier(pool.score, preset) === "watch"),
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

  // Switching preset switches the whole table, not just the gate: each preset
  // trades on a different timescale and is judged on different columns, so the
  // view follows the play rather than carrying the last one's layout across.
  const selectPreset = useCallback((next) => {
    setPreset(next);
    localStorage.setItem("signalforge:preset", next);
    setScanner((current) => ({
      ...current,
      filters: { ...current.filters, freezeOffOnly: PRESETS[next].requireFreezeOff },
      columns: defaultColumnKeys(next),
      sort: defaultSort(next),
      phaseFilter: null,
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
      phaseFilter: null,
      sort: defaultSort(preset),
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

  // The palette offers one "switch preset" entry that walks the list, so a
  // third preset would need no change here.
  const nextPreset = PRESET_IDS[(PRESET_IDS.indexOf(preset) + 1) % PRESET_IDS.length];

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
        label: `Ganti preset ke ${PRESETS[nextPreset].label}`,
        icon: ShieldCheck,
        run: () => selectPreset(nextPreset),
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
    [cycleTheme, nextPreset, refresh, resolved, selectPreset],
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
                if (primeChoice) void primeSignalSound(primeChoice);
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
        {view === "positions" ? (
          <Suspense
            fallback={
              <p className="fx-notify-empty">
                <Loader2 className="f-spin" /> Memuat modul wallet…
              </p>
            }
          >
            <PositionsWorkspace
              wallet={lp.wallet}
              onWallet={lp.setWallet}
              positions={lp.positions}
              totals={lp.totals}
              readAt={lp.readAt}
              loading={lp.loading}
              refreshing={lp.refreshing}
              error={lp.error}
              onRefresh={lp.refresh}
              configured={status?.lpTrackingConfigured !== false}
            />
          </Suspense>
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
            preset={preset}
            soundByPreset={soundByPreset}
            onSoundChange={changeSound}
            positionSound={positionSound}
            onPositionSoundChange={changePositionSound}
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
        gmgnConfigured={Boolean(status?.gmgnConfigured)}
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
