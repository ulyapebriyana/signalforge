import { CircleGauge, ShieldCheck } from "lucide-react";
import { PRESETS } from "../../../../shared/scoring.js";
import { formatNumber, formatUsd } from "../../../lib/format.js";
import { heatVars } from "../../lib/heat.js";

/** Em dash for a gate a preset does not declare, so the columns stay aligned. */
const NONE = "—";

/**
 * Read an optional numeric gate.
 *
 * Deliberately not a truthiness check: Skolmbeagh-like sets `devBalanceMax` to
 * 0 ("if the dev holds tokens, I stay away"), and 0 is falsy — a plain `? :`
 * renders the strictest gate in the table as though it were absent.
 */
const gate = (value, format) => (Number.isFinite(value) ? format(value) : NONE);

const GATE_ROWS = [
  ["Market cap", (p) => `${formatUsd(p.marketCapMin)} – ${formatUsd(p.marketCapMax)}`],
  ["TVL minimum", (p) => formatUsd(p.tvlMin)],
  ["Momentum 1 jam", (p) => `${p.momentumMin}% – ${p.momentumMax}%`],
  ["Volume 1 jam minimum", (p) => formatUsd(p.volume1hMin)],
  ["Vol/TVL minimum", (p) => `${p.volumeTvlMin}x`],
  ["Fee/TVL minimum", (p) => `${p.feeTvlMin}%`],
  ["Bin step", (p) => gate(p.binStepMin, (v) => `${v} – ${p.binStepMax}`)],
  ["Base fee minimum", (p) => gate(p.baseFeeMin, (v) => `${v}%`)],
  ["Mode fee", (p) => (p.requireBothTokenFees ? "Base + quote" : NONE)],
  ["Cluster terbesar maksimum", (p) => gate(p.maxClusterPct, (v) => `${v}%`)],
  ["Top-10 holder minimum", (p) => gate(p.top10HoldersMin, (v) => `${v}%`)],
  ["Top-10 holder maksimum", (p) => gate(p.top10HoldersMax, (v) => `${v}%`)],
  ["Saldo dev maksimum", (p) => gate(p.devBalanceMax, (v) => `${v}%`)],
  ["Sniper maksimum", (p) => gate(p.sniperPctMax, (v) => `${v}%`)],
  ["Insider maksimum", (p) => gate(p.insidersPctMax, (v) => `${v}%`)],
  ["Bundler maksimum", (p) => gate(p.bundlerPctMax, (v) => `${v}%`)],
  ["Holder minimum", (p) => gate(p.holdersMin, formatNumber)],
  ["Mint authority", (p) => (p.requireMintOff ? "Wajib mati" : NONE)],
  ["Swap per trader maksimum", (p) => gate(p.maxSwapsPerTrader, (v) => `${v}x`)],
  ["Umur pool maksimum", (p) => gate(p.ageHoursMax, (v) => (v < 1 ? `${v * 60} menit` : `${v} jam`))],
  ["Rubrik screening", (p) => (p.rubric ? `${p.rubric.length} metrik, tolak merah` : NONE)],
  ["Skor minimum", (p) => String(p.minScore)],
  ["Risiko maksimum", (p) => String(p.maxRisk)],
  ["Freeze authority", (p) => (p.requireFreezeOff ? "Wajib mati" : "Opsional")],
  ["Cooldown alert", (p) => `${p.cooldownMinutes} menit`],
];

const SCORE_MODEL = [
  ["Momentum", 25, "Perubahan harga 1 jam, nilai penuh di 30%."],
  ["Efisiensi fee", 25, "Rasio fee terhadap TVL selama 1 jam, nilai penuh di 2%."],
  ["Kualitas volume", 20, "Rasio volume/TVL (maks 15) ditambah volume absolut (maks 5)."],
  ["Keamanan", 20, "Tidak blacklist 7 · freeze off 6 · terverifikasi 4 · holder ≥ 500 3."],
  ["Kesegaran", 10, "≤ 24 jam 10 · ≤ 7 hari 7 · ≤ 30 hari 5 · selebihnya 3."],
];

const RISK_MODEL = [
  ["Masuk blacklist", "+55"],
  ["Freeze authority aktif", "+30"],
  ["Top-10 holder ≥ 50%", "+20"],
  ["Saldo dev ≥ 10%", "+20"],
  ["TVL di bawah $1K", "+20"],
  ["Momentum 1 jam > 100%", "+18"],
  ["Holder di bawah 100", "+15"],
  ["Top-10 holder ≥ 30%", "+12"],
  ["Saldo dev ≥ 5%", "+10"],
  ["TVL di bawah $10K", "+10"],
  ["Pool berumur < 30 menit", "+10"],
  ["Token belum terverifikasi", "+8"],
  ["Data top-10 belum tersedia", "+8"],
];

export default function RulesView({ preset, onPreset }) {
  return (
    <div className="fx-view fx-rules">
      <header className="fx-view-head">
        <div>
          <h1>Aturan & skor</h1>
          <p>Semua yang menentukan lolos atau gagalnya sebuah pool, tanpa bobot tersembunyi.</p>
        </div>
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
      </header>

      <div className="fx-rules-grid">
        <section className="fx-panel fx-panel--wide">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Perbandingan gate</span>
              <h2>Lima preset berdampingan</h2>
            </div>
            <ShieldCheck />
          </header>
          <div className="fx-compare" style={{ "--fx-preset-count": Object.keys(PRESETS).length }}>
            <div className="fx-compare-head">
              <span>Aturan</span>
              {Object.values(PRESETS).map((item) => (
                <span key={item.id} className={preset === item.id ? "is-active" : ""}>
                  {item.label}
                  {preset === item.id ? <em>aktif</em> : null}
                </span>
              ))}
            </div>
            {GATE_ROWS.map(([label, read]) => (
              <div className="fx-compare-row" key={label}>
                <span>{label}</span>
                {Object.values(PRESETS).map((item) => (
                  <span key={item.id} className={`f-num ${preset === item.id ? "is-active" : ""}`}>
                    {read(item)}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="fx-panel-note">
            Kelimanya rekonstruksi dari materi yang dibagikan terbuka, bukan strategi milik orang
            tersebut. “Auzhinta-like” menyalin satu rig dan menuntut pool-nya masih membayar.
            “Swanny-like” bukan cara membuka posisi sama sekali — itu pre-filter yang menjawab apakah
            sebuah token layak diriset, dan menilai umur token terbalik dari Auzhinta-like: makin tua
            makin aman. Gate rubriknya menolak merah dan menerima kuning. “VanChu-like” mengejar
            token yang sudah lari di pool fee tinggi dan sengaja punya batas risiko paling longgar —
            momentum ekstrem justru yang dicari. “Skolmbeagh-like” hanya hidup 30 menit pertama
            setelah migrasi, dan gate sniper/insider/bundler-nya butuh GMGN_API_KEY: tanpa kunci itu
            semuanya gagal-tertutup dan preset ini diam.
          </p>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Model 100 poin</span>
              <h2>Cara skor dibentuk</h2>
            </div>
            <CircleGauge />
          </header>
          <div className="fx-weights">
            {SCORE_MODEL.map(([label, weight, note]) => (
              <div className="fx-weight" key={label} style={heatVars(40 + weight * 2)}>
                <div className="fx-weight-top">
                  <strong>{label}</strong>
                  <span className="f-num">{weight}</span>
                </div>
                <div className="fx-weight-track">
                  <i style={{ width: `${weight * 4}%` }} />
                </div>
                <p>{note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="fx-panel">
          <header className="fx-panel-head">
            <div>
              <span className="f-eyebrow">Hitungan terpisah</span>
              <h2>Apa yang menaikkan risiko</h2>
            </div>
          </header>
          <ul className="fx-risk-model">
            {RISK_MODEL.map(([label, delta]) => (
              <li key={label}>
                <span>{label}</span>
                <strong className="f-num">{delta}</strong>
              </li>
            ))}
          </ul>
          <p className="fx-panel-note">
            Risk score mulai dari 4 dan dibatasi di 100. Skor keyakinan dan skor risiko tidak saling
            mengurangi: sebuah pool bisa mencetak 88 dan tetap ditolak gate karena risikonya 70.
          </p>
        </section>
      </div>
    </div>
  );
}
