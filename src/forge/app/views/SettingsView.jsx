import {
  Bell,
  Monitor,
  Moon,
  ServerCog,
  Star,
  Sun,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import TelegramConnect from "../components/TelegramConnect.jsx";
import { PRESETS, resolvePresetId } from "../../../../shared/scoring.js";
import {
  NOTIFICATION_SOUND_OFF,
  NOTIFICATION_SOUND_OPTIONS,
  soundForPreset,
} from "../../../lib/notificationSounds.js";

const SCAN_INTERVALS = [30, 60, 120];
const THEMES = [
  ["dark", "Gelap", Moon],
  ["light", "Terang", Sun],
  ["auto", "Ikuti sistem", Monitor],
];

/** The sound picker, shared by the preset alarms and the LP one. */
function SoundSelect({ value, onChange, label }) {
  const on = value !== NOTIFICATION_SOUND_OFF;
  return (
    <label className={`fx-select ${on ? "is-on" : ""}`}>
      {on ? <Volume2 /> : <VolumeX />}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {NOTIFICATION_SOUND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({ title, description, children }) {
  return (
    <div className="fx-setting">
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="fx-setting-control">{children}</div>
    </div>
  );
}

export default function SettingsView({
  status,
  scanInterval,
  onScanInterval,
  preset,
  soundByPreset,
  onSoundChange,
  positionSound,
  onPositionSoundChange,
  notificationPermission,
  onRequestPermission,
  theme,
  onTheme,
  watchlistCount,
  onClearWatchlist,
  onStatusChange,
  onToast,
}) {
  const desktopLabel =
    notificationPermission === "granted"
      ? "Aktif"
      : notificationPermission === "denied"
        ? "Diblokir browser"
        : notificationPermission === "unsupported"
          ? "Tidak didukung"
          : "Aktifkan";

  return (
    <div className="fx-view fx-settings">
      <header className="fx-view-head">
        <div>
          <h1>Pengaturan</h1>
          <p>Preferensi tampilan tersimpan di browser ini. Konfigurasi alert diatur di server.</p>
        </div>
      </header>

      <div className="fx-settings-grid">
        <TelegramConnect onToast={onToast} onChanged={onStatusChange} />

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Browser ini</span>
              <h2>Pemberitahuan</h2>
            </div>
            <Bell />
          </header>
          {Object.values(PRESETS).map((item) => (
            <Row
              key={item.id}
              title={`Bunyi sinyal · ${item.label}`}
              description={
                item.id === preset
                  ? "Preset aktif. Dimainkan saat pool masuk Watch atau naik ke Hot."
                  : "Dipakai saat preset ini yang aktif."
              }
            >
              <SoundSelect
                value={soundForPreset(soundByPreset, item.id)}
                onChange={(choice) => onSoundChange(item.id, choice)}
                label={`Pilih bunyi notifikasi untuk preset ${item.label}`}
              />
            </Row>
          ))}
          {/* Not tied to a preset: an open position leaves its range because of
              price, not because of which gate found the pool. */}
          <Row
            title="Bunyi posisi keluar range"
            description="Dibunyikan saat posisi LP tembus batas bawah atau atas, jadi berhenti dapat fee. Butuh alamat wallet yang dipantau di halaman Posisi."
          >
            <SoundSelect
              value={positionSound}
              onChange={onPositionSoundChange}
              label="Pilih bunyi untuk posisi keluar range"
            />
          </Row>
          <Row title="Notifikasi desktop" description="Muncul walau tab sedang tidak dilihat.">
            <button
              className="f-btn"
              type="button"
              disabled={notificationPermission === "denied" || notificationPermission === "unsupported"}
              onClick={onRequestPermission}
            >
              <Bell /> {desktopLabel}
            </button>
          </Row>
          <Row title="Interval muat ulang" description="Seberapa sering halaman ini menarik hasil scan.">
            <div className="fx-segment fx-segment--text" role="group" aria-label="Interval muat ulang">
              {SCAN_INTERVALS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={scanInterval === seconds ? "is-active" : ""}
                  aria-pressed={scanInterval === seconds}
                  onClick={() => onScanInterval(seconds)}
                >
                  {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                </button>
              ))}
            </div>
          </Row>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Browser ini</span>
              <h2>Tampilan</h2>
            </div>
            <Timer />
          </header>
          <Row title="Tema" description="Skala panas tetap sama di kedua tema.">
            <div className="fx-segment fx-segment--text" role="group" aria-label="Tema">
              {THEMES.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className={theme === id ? "is-active" : ""}
                  aria-pressed={theme === id}
                  onClick={() => onTheme(id)}
                >
                  <Icon /> {label}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Watchlist" description={`${watchlistCount} pool disimpan di browser ini.`}>
            <button className="f-btn f-btn--danger" type="button" disabled={!watchlistCount} onClick={onClearWatchlist}>
              <Star /> Kosongkan
            </button>
          </Row>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Server</span>
              <h2>Scanner</h2>
            </div>
            <ServerCog />
          </header>
          <dl className="fx-fact-list">
            <div>
              <dt>Preset server</dt>
              <dd>{PRESETS[resolvePresetId(status?.preset)].label}</dd>
            </div>
            <div>
              <dt>Interval scan server</dt>
              <dd className="f-num">{status?.scanIntervalSeconds || 30}s</dd>
            </div>
            <div>
              <dt>Riwayat</dt>
              <dd>{status?.historyPersistent ? "Persisten di disk" : "Sementara"}</dd>
            </div>
          </dl>
          <p className="fx-panel-note">
            Preset dan interval scanner diatur di .env server, bukan di browser ini.
          </p>
        </section>
      </div>
    </div>
  );
}
