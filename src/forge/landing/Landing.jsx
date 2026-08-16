import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  Flame,
  LayoutGrid,
  Moon,
  ShieldHalf,
  Sun,
  Telescope,
  Thermometer,
} from "lucide-react";
import { DEFAULT_PRESET, PRESETS } from "../../../shared/scoring.js";
import { usePools } from "../../hooks/usePools.js";
import { formatPercent, formatUsd, formatWibTime } from "../../lib/format.js";
import { heatColor, heatVars } from "../lib/heat.js";
import { summarize } from "../lib/summary.js";
import { navigate } from "../lib/router.js";
import { useTheme } from "../lib/useTheme.js";
import ForgeCore from "./ForgeCore.jsx";
import "./landing.css";

/* --- reveal on scroll ------------------------------------------------------ */

/** Stable identity so the default argument does not re-run the effect each render. */
const MOUNT_ONLY = [];

/**
 * Sections that mount after their data arrives were never seen by a mount-only
 * observer, leaving them stuck at the hidden end of the reveal animation. Pass
 * the values that gate those sections so the sweep runs again once they exist.
 */
function useReveal(deps = MOUNT_ONLY) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll("[data-reveal]").forEach((node) => node.classList.add("is-in"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    root.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, deps);
  return ref;
}

/* --- sections -------------------------------------------------------------- */

const NAV_LINKS = [
  ["#cara-kerja", "Cara kerja"],
  ["#skor", "Skor"],
  ["#preset", "Preset"],
  ["#risiko", "Risiko"],
];

function TopNav({ theme, onCycleTheme }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`lp-nav ${stuck ? "is-stuck" : ""}`}>
      <a className="lp-wordmark" href="/" aria-label="SignalForge, beranda">
        <span className="lp-wordmark-mark" aria-hidden="true">
          <i />
        </span>
        SignalForge
      </a>
      <nav className="lp-nav-links" aria-label="Bagian halaman">
        {NAV_LINKS.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <div className="lp-nav-actions">
        <a className="lp-nav-classic" href="/classic">
          Tampilan klasik
        </a>
        <button
          className="f-icon-btn"
          type="button"
          onClick={onCycleTheme}
          aria-label={`Tema: ${theme}. Ganti tema.`}
          title={`Tema: ${theme}`}
        >
          {theme === "light" ? <Sun /> : <Moon />}
        </button>
        <button className="f-btn f-btn--hot" type="button" onClick={() => navigate("/app")}>
          Buka scanner <ArrowRight />
        </button>
      </div>
    </header>
  );
}

function LiveRail({ summary, meta, loading, error }) {
  const readouts = [
    { label: "Pool dipindai", value: loading ? "—" : String(meta?.scannedCount ?? 0) },
    { label: "Diperkaya penuh", value: loading ? "—" : String(summary.enriched) },
    {
      label: "Hot sekarang",
      value: loading ? "—" : String(summary.hot.length),
      heat: summary.hot.length ? 88 : 30,
    },
    { label: "Risk median", value: loading ? "—" : String(summary.medianRisk) },
    { label: "Scan terakhir", value: loading ? "—" : `${formatWibTime(meta?.scannedAt)} WIB` },
  ];

  return (
    <div className="lp-rail" aria-live="polite">
      <span className="lp-rail-status" data-state={error ? "down" : loading ? "wait" : "live"}>
        <i />
        {error ? "API Meteora tidak terjangkau" : loading ? "Menghubungi Meteora" : "Data langsung"}
      </span>
      <dl>
        {readouts.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className="f-num" style={item.heat ? { color: heatColor(item.heat) } : undefined}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const SCALE_MARKS = [
  { at: 18, label: "Skip", note: "di bawah 50" },
  { at: 57, label: "Early", note: "50–64" },
  { at: 72, label: "Watch", note: "65–79" },
  { at: 92, label: "Hot", note: "80+" },
];

function HeatScale() {
  return (
    <section className="lp-section lp-scale" aria-labelledby="skala-title">
      <div className="lp-section-head" data-reveal>
        <span className="f-eyebrow">Skala baca</span>
        <h2 className="f-display" id="skala-title">
          Skor dibaca sebagai suhu
        </h2>
        <p className="f-lede">
          Satu pool keluar dari pemindaian dengan satu suhu. Warna itu dipakai di seluruh aplikasi —
          di tabel, kartu, dan riwayat — supaya kamu bisa menyapu satu kolom dan langsung tahu mana
          yang layak dibuka.
        </p>
      </div>
      <div className="lp-scale-strip" data-reveal>
        <div className="lp-scale-bar" aria-hidden="true">
          {Array.from({ length: 101 }, (_, score) => (
            <i key={score} style={{ background: heatColor(score) }} />
          ))}
        </div>
        <div className="lp-scale-marks">
          {SCALE_MARKS.map((mark) => (
            <div className="lp-scale-mark" key={mark.label} style={{ left: `${mark.at}%` }}>
              <span className="lp-scale-tick" style={{ background: heatColor(mark.at) }} />
              <strong style={{ color: heatColor(mark.at) }}>{mark.label}</strong>
              <em className="f-num">{mark.note}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PIPELINE = [
  {
    title: "Tarik pool",
    body: "Dua halaman 250 pool langsung dari API DLMM Meteora: teratas menurut volume 1 jam, dan teratas menurut rasio fee/TVL 1 jam — halaman kedua itu tempat pool baru migrasi muncul.",
  },
  {
    title: "Perkaya kandidat",
    body: "Sampai 72 pool yang lolos saringan awal diambil candle 1 jam-nya, ditambah data holder, JupShield, dan RugCheck.",
  },
  {
    title: "Beri skor",
    body: "Momentum, efisiensi fee, kualitas volume, keamanan, dan usia pool dijumlahkan menjadi 100 poin.",
  },
  {
    title: "Lewatkan gate preset",
    body: "Preset menentukan lolos atau gagal. Yang gagal tetap ditampilkan, lengkap dengan aturan mana yang tidak terpenuhi.",
  },
  {
    title: "Kirim alert",
    body: "Pool yang lolos dikirim ke Telegram dengan cooldown per pool supaya kanal tidak dibanjiri.",
  },
];

function Pipeline() {
  return (
    <section className="lp-section lp-pipeline" id="cara-kerja" aria-labelledby="pipeline-title">
      <div className="lp-section-head" data-reveal>
        <span className="f-eyebrow">Lima langkah, tiap 30 detik</span>
        <h2 className="f-display" id="pipeline-title">
          Apa yang terjadi di antara dua scan
        </h2>
      </div>
      <ol className="lp-steps">
        {PIPELINE.map((step, index) => (
          <li key={step.title} data-reveal style={{ "--delay": `${index * 60}ms` }}>
            <span className="lp-step-index f-num">{String(index + 1).padStart(2, "0")}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const SCORE_MODEL = [
  { label: "Momentum", weight: 25, note: "Perubahan harga 1 jam, dipetakan penuh di 30%." },
  { label: "Efisiensi fee", weight: 25, note: "Fee yang dihasilkan terhadap TVL dalam 1 jam." },
  { label: "Kualitas volume", weight: 20, note: "Rasio volume/TVL ditambah volume absolut." },
  { label: "Keamanan", weight: 20, note: "Blacklist, freeze authority, verifikasi, jumlah holder." },
  { label: "Kesegaran", weight: 10, note: "Umur pool sejak dibuat." },
];

function ScoreModel() {
  return (
    <section className="lp-section lp-model" id="skor" aria-labelledby="model-title">
      <div className="lp-model-grid">
        <div className="lp-section-head" data-reveal>
          <span className="f-eyebrow">Model 100 poin</span>
          <h2 className="f-display" id="model-title">
            Dari mana angkanya datang
          </h2>
          <p className="f-lede">
            Tidak ada bobot tersembunyi. Lima komponen, jumlahnya persis 100, dan tiap pool bisa
            dibuka untuk melihat berapa poin yang ia dapat di masing-masing komponen.
          </p>
          <p className="lp-model-note">
            Risk score dihitung terpisah. Sebuah pool bisa punya skor tinggi dan tetap ditolak
            karena risikonya melewati batas preset.
          </p>
        </div>
        <div className="lp-model-list" data-reveal>
          {SCORE_MODEL.map((item) => (
            <div className="lp-model-row" key={item.label} style={heatVars(40 + item.weight * 2)}>
              <div className="lp-model-row-top">
                <strong>{item.label}</strong>
                <span className="f-num">{item.weight}</span>
              </div>
              <div className="lp-model-track">
                <i style={{ width: `${item.weight * 4}%` }} />
              </div>
              <p>{item.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PRESET_ROWS = [
  ["Market cap", (p) => `${formatUsd(p.marketCapMin)} – ${formatUsd(p.marketCapMax)}`],
  ["TVL minimum", (p) => formatUsd(p.tvlMin)],
  ["Active TVL minimum", (p) => (Number.isFinite(p.activeTvlMin) ? formatUsd(p.activeTvlMin) : "—")],
  ["Avg volume/menit minimum", (p) => (Number.isFinite(p.avgVolumePerMinMin) ? formatUsd(p.avgVolumePerMinMin) : "—")],
  ["Momentum 1 jam", (p) => `${p.momentumMin}% – ${p.momentumMax}%`],
  ["Volume 1 jam minimum", (p) => formatUsd(p.volume1hMin)],
  ["Volume 5 menit minimum", (p) => (Number.isFinite(p.volume5mMin) ? formatUsd(p.volume5mMin) : "—")],
  ["Vol/TVL minimum", (p) => `${p.volumeTvlMin}x`],
  ["Fee/TVL minimum", (p) => `${p.feeTvlMin}%`],
  ["Bin step", (p) => (p.binStepMin ? `${p.binStepMin} – ${p.binStepMax}` : "—")],
  ["Base fee minimum", (p) => (p.baseFeeMin ? `${p.baseFeeMin}%` : "—")],
  // Sub-hour reads as minutes: Skolmbeagh-like's window is 0.5, and "0,5 jam"
  // is a worse way to say the number the whole preset turns on.
  ["Umur pool maksimum", (p) => {
    if (!Number.isFinite(p.ageHoursMax)) return "—";
    return p.ageHoursMax < 1 ? `${p.ageHoursMax * 60} menit` : `${p.ageHoursMax} jam`;
  }],
  ["Risk maksimum", (p) => String(p.maxRisk)],
  ["Freeze authority", (p) => (p.requireFreezeOff ? "Wajib mati" : "Opsional")],
  ["Cooldown alert", (p) => `${p.cooldownMinutes} menit`],
];

function Presets() {
  return (
    <section className="lp-section lp-presets" id="preset" aria-labelledby="preset-title">
      <div className="lp-section-head" data-reveal>
        <span className="f-eyebrow">Tujuh gate, aturan terbuka</span>
        <h2 className="f-display" id="preset-title">
          Pilih seberapa longgar saringannya
        </h2>
      </div>
      <div className="lp-preset-table" data-reveal style={{ "--lp-preset-count": Object.keys(PRESETS).length }}>
        <div className="lp-preset-head">
          <span className="f-eyebrow">Aturan</span>
          {Object.values(PRESETS).map((preset) => (
            <span key={preset.id} className="lp-preset-name">
              {preset.label}
            </span>
          ))}
        </div>
        {PRESET_ROWS.map(([label, read]) => (
          <div className="lp-preset-row" key={label}>
            <span>{label}</span>
            {Object.values(PRESETS).map((preset) => (
              <span className="f-num" key={preset.id}>
                {read(preset)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="lp-preset-caveat" data-reveal>
        Semuanya rekonstruksi dari filter yang pernah dibagikan terbuka — bukan klaim bahwa ini
        strategi milik orang tersebut. “Yanman-like” longgar dan bisa memasukkan pool dengan
        likuiditas sangat tipis. “Auzhinta-like” menuntut likuiditas jauh lebih tebal dan rig yang
        spesifik, tapi sengaja menerima momentum negatif: range bid-ask lebar memang dipakai untuk
        memanen fee saat harga turun, dan itu menanggung risiko penurunan yang nyata. “VanChu-like”
        dan “Skolmbeagh-like” adalah dua yang paling agresif: yang pertama hanya masuk pool fee
        tinggi saat token sudah lari, yang kedua hanya hidup 30 menit pertama setelah migrasi. Batas
        risikonya sengaja paling longgar, dan itu berarti kerugiannya juga paling nyata. “Slow
        Wallet” di ujung yang berlawanan: token established, pool berumur minimal seminggu, wajib
        terverifikasi, dan batas risiko paling ketat di seluruh aplikasi. “Heart Attack” yang paling
        ekstrem dari semuanya — dipicu volume 5 menit ≥ $50K pada token yang sedang lari, dengan
        batas risiko paling longgar. LP Army Academy sendiri menyebut strategi ini “lebih mirip judi”.
      </p>
    </section>
  );
}

const CHECKS = [
  { icon: ShieldHalf, title: "JupShield", body: "Peringatan token dari Jupiter, dengan tingkat keparahan per peringatan." },
  { icon: Check, title: "RugCheck", body: "Skor ternormalisasi, daftar risiko, dan persentase LP terkunci." },
  { icon: Telescope, title: "Organic Score", body: "Penilaian aktivitas organik dari Pool Discovery API Meteora." },
  { icon: Flame, title: "Konsentrasi holder", body: "Porsi top-10 holder dan saldo dev, keduanya menambah risk score." },
  { icon: Thermometer, title: "Freeze authority", body: "Pool dengan freeze authority aktif langsung ditandai bahaya." },
  { icon: BellRing, title: "Transisi status", body: "Bunyi dan notifikasi saat pool masuk Watch atau naik ke Hot." },
];

function Checks() {
  return (
    <section className="lp-section lp-checks" aria-labelledby="checks-title">
      <div className="lp-section-head" data-reveal>
        <span className="f-eyebrow">Yang ikut diperiksa</span>
        <h2 className="f-display" id="checks-title">
          Momentum saja tidak cukup
        </h2>
      </div>
      <div className="lp-check-grid">
        {CHECKS.map((check, index) => (
          <article className="lp-check" key={check.title} data-reveal style={{ "--delay": `${index * 45}ms` }}>
            <check.icon />
            <h3>{check.title}</h3>
            <p>{check.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Movers({ summary, loading }) {
  if (loading || !summary.gainers.length) return null;
  return (
    <section className="lp-section lp-movers" aria-labelledby="movers-title">
      <div className="lp-section-head" data-reveal>
        <span className="f-eyebrow">Dari scan barusan</span>
        <h2 className="f-display" id="movers-title">
          Yang paling panas menit ini
        </h2>
      </div>
      <div className="lp-mover-list" data-reveal>
        {summary.gainers.map((pool) => (
          <button
            className="lp-mover"
            key={pool.address}
            type="button"
            style={heatVars(pool.score)}
            onClick={() => navigate(`/app/scanner?pool=${pool.address}`)}
          >
            <span className="lp-mover-heat" aria-hidden="true" />
            <span className="lp-mover-pair">{pool.pair}</span>
            <span className="lp-mover-score f-num">{pool.score}</span>
            <span className={`f-num ${pool.priceChange1h >= 0 ? "f-pos" : "f-neg"}`}>
              {formatPercent(pool.priceChange1h)}
            </span>
            <span className="f-num f-muted">{formatUsd(pool.tvl)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RiskNotice() {
  return (
    <section className="lp-section lp-risk" id="risiko" aria-labelledby="risk-title">
      <div className="lp-risk-inner" data-reveal>
        <h2 id="risk-title">Yang perlu kamu tahu sebelum memakai ini</h2>
        <ul>
          <li>
            SignalForge adalah screener, bukan bot auto-trading. Aplikasi ini tidak pernah meminta
            seed phrase atau private key, dan tidak mengeksekusi transaksi apa pun.
          </li>
          <li>
            Tidak ada skor yang menjamin profit. Slippage, pergeseran liquidity bin, risiko smart
            contract, dan pergerakan harga setelah alert tetap bisa membuat rugi.
          </li>
          <li>
            Data holder, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora.
            RugCheck di-cache agar pemindaian tidak membebani layanan itu.
          </li>
          <li>
            Token Telegram hanya dibaca di server. Browser tidak pernah menerima nilainya.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="lp-closing">
      <div data-reveal>
        <span className="f-eyebrow">Siap dipakai sekarang</span>
        <h2 className="f-display">Nyalakan tungkunya</h2>
        <p className="f-lede">
          Scanner berjalan di server yang sama dengan halaman ini. Tidak ada pendaftaran, tidak ada
          dompet yang perlu disambungkan.
        </p>
        <div className="lp-closing-actions">
          <button className="f-btn f-btn--hot" type="button" onClick={() => navigate("/app")}>
            Buka scanner <ArrowRight />
          </button>
          <a className="f-btn f-btn--ghost" href="/classic">
            <LayoutGrid /> Tampilan klasik
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div>
        <strong>SignalForge</strong>
        <span>Screener Meteora DLMM · zona waktu WIB</span>
      </div>
      <nav aria-label="Tautan footer">
        <a href="/classic">Tampilan klasik</a>
        <a href="https://www.meteora.ag/" target="_blank" rel="noreferrer">
          Meteora
        </a>
        <a href="https://rugcheck.xyz/" target="_blank" rel="noreferrer">
          RugCheck
        </a>
      </nav>
    </footer>
  );
}

/* --- page ------------------------------------------------------------------ */

export default function Landing() {
  const { theme, cycleTheme } = useTheme();
  const { pools, meta, loading, error } = usePools(60);
  const summary = useMemo(() => summarize(pools, DEFAULT_PRESET), [pools]);
  const revealRef = useReveal([loading, pools.length]);

  return (
    <div className="lp" ref={revealRef}>
      <TopNav theme={theme} onCycleTheme={cycleTheme} />

      <section className="lp-hero">
        <div className="lp-hero-canvas">
          <ForgeCore heat={summary.heat} className="lp-canvas" />
        </div>
        <div className="lp-hero-copy">
          <span className="f-eyebrow lp-hero-eyebrow">
            Meteora DLMM · Solana · dipindai tiap 30 detik
          </span>
          <h1 className="f-display lp-hero-title">
            Baca panasnya
            <br />
            sebelum dingin
          </h1>
          <p className="f-lede lp-hero-lede">
            SignalForge memindai ratusan pool Meteora DLMM, memberi skor 100 poin untuk momentum,
            efisiensi fee, dan risiko, lalu menandai mana yang layak dibuka. Bukan bot trading, dan
            tidak pernah meminta private key.
          </p>
          <div className="lp-hero-actions">
            <button className="f-btn f-btn--hot" type="button" onClick={() => navigate("/app")}>
              Buka scanner <ArrowRight />
            </button>
            <a className="f-btn f-btn--ghost" href="#skor">
              Lihat cara skornya dihitung
            </a>
          </div>
        </div>
        <LiveRail summary={summary} meta={meta} loading={loading} error={error} />
      </section>

      <HeatScale />
      <Pipeline />
      <ScoreModel />
      <Movers summary={summary} loading={loading} />
      <Presets />
      <Checks />
      <RiskNotice />
      <Closing />
      <Footer />
    </div>
  );
}
