import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { VELOCITY_LABEL } from "../../../../shared/feeVelocity.js";
import { BURST_LABEL, burstBand, PHASE_META, projectFees } from "../../../../shared/marketRead.js";
import { rubricReport, rubricTally, RUBRIC_GMGN_KEYS } from "../../../../shared/healthRubric.js";
import { PRESETS, poolTier } from "../../../../shared/scoring.js";
import { formatAge, formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars, riskLabel, STATUS_META } from "../../lib/heat.js";
import { RiskDial, ScoreRadar, Spark } from "./charts.jsx";
import {
  ConcentrationValue,
  humanizeType,
  ImpactCell,
  JupShieldChip,
  momentumTone,
  optionalNumber,
  OrganicChip,
  PhaseChip,
  PHASE_TONE,
  PoolBurstCell,
  RugCheckChip,
  TokenBurstCell,
  TurnoverCell,
  VenueShareCell,
  YieldCell,
} from "./bits.jsx";

const RUBRIC_FORMAT = {
  usd: (value) => formatUsd(value),
  pct: (value) => `${value.toFixed(2)}%`,
  hours: (value) => formatAge(value),
  sol: (value) => `${value.toFixed(1)} SOL`,
};

const formatRubricValue = (row) => {
  if (row.value === null) return "—";
  const format = RUBRIC_FORMAT[row.unit];
  return format ? format(row.value) : String(Math.round(row.value * 100) / 100);
};

const bandLimit = (row) =>
  row.higherIsBetter ? `hijau ≥ ${row.green} · kuning ≥ ${row.yellow}` : `hijau ≤ ${row.green} · kuning ≤ ${row.yellow}`;

/**
 * The health rubric as the source tool shows it: every metric painted, not just
 * the ones that fail. Rendered for any preset, because the colours answer "is
 * this token worth researching" regardless of which play you are running.
 */
function RubricPanel({ pool, gmgnConfigured }) {
  const rows = rubricReport(pool);
  const tally = rubricTally(pool);
  const missingGmgn = rows.filter((row) => row.band === "unknown" && RUBRIC_GMGN_KEYS.includes(row.key)).length;

  return (
    <div className="fx-rubric">
      <div className="fx-rubric-tally">
        <span className="fx-rubric-dot fx-rubric-dot--green" /> {tally.green}
        <span className="fx-rubric-dot fx-rubric-dot--yellow" /> {tally.yellow}
        <span className="fx-rubric-dot fx-rubric-dot--red" /> {tally.red}
        {tally.unknown ? (
          <>
            <span className="fx-rubric-dot fx-rubric-dot--unknown" /> {tally.unknown}
          </>
        ) : null}
      </div>
      <ul className="fx-rubric-list">
        {rows.map((row) => (
          <li key={row.key} className={`fx-rubric-row fx-rubric-row--${row.band}`} title={bandLimit(row)}>
            <span>{row.label}</span>
            <strong className="f-num">{formatRubricValue(row)}</strong>
          </li>
        ))}
      </ul>
      {!gmgnConfigured && missingGmgn ? (
        <p className="fx-panel-note">
          {missingGmgn} baris butuh GMGN dan tidak terbaca. Isi <code>GMGN_API_KEY</code> di server
          agar sniper, bundler, insider, dan phishing terisi.
        </p>
      ) : null}
    </div>
  );
}

/** Cluster share reads against the article's 40% reject line, not the heat ramp. */
const clusterTone = (pct) => (pct >= 40 ? "danger" : pct >= 20 ? "warning" : "healthy");

/** What each trend means for a position that is already open. */
const VELOCITY_ADVICE = {
  rising: "Fee makin deras. Tidak ada alasan keluar dari sisi volume.",
  steady: "Fee stabil di sekitar puncaknya. Mesin masih jalan.",
  decaying: "Fee melambat. Siapkan exit — cek bar volume sebelum menambah posisi.",
  stalled: "Fee jauh di bawah puncak. Ini kondisi yang memicu cut loss by volume.",
  unknown: "Belum cukup scan untuk mengukur tren. Butuh minimal 3 pemindaian.",
};

function FeeVelocityPanel({ velocity }) {
  const trend = velocity?.trend ?? "unknown";
  const tone = { rising: "healthy", steady: "healthy", decaying: "warning", stalled: "danger" }[trend] || "muted";
  const share = Number.isFinite(velocity?.ratioToPeak) ? Math.round(velocity.ratioToPeak * 100) : null;

  return (
    <div className={`fx-velocity-panel fx-velocity-panel--${tone}`}>
      <div className="fx-velocity-headline">
        <strong>{VELOCITY_LABEL[trend]}</strong>
        {share === null ? null : <span className="f-num">{share}% dari puncak</span>}
      </div>
      <dl className="fx-metric-grid">
        <div>
          <dt>Fee/TVL sekarang</dt>
          <dd className="f-num">{Number.isFinite(velocity?.current) ? `${velocity.current.toFixed(2)}%` : "—"}</dd>
        </div>
        <div>
          <dt>Puncak dalam jendela</dt>
          <dd className="f-num">{Number.isFinite(velocity?.peak) ? `${velocity.peak.toFixed(2)}%` : "—"}</dd>
        </div>
        <div>
          <dt>Perubahan antar-paruh</dt>
          <dd className="f-num">
            {Number.isFinite(velocity?.changePct) ? `${velocity.changePct > 0 ? "+" : ""}${velocity.changePct.toFixed(0)}%` : "—"}
          </dd>
        </div>
        <div>
          <dt>Terpantau</dt>
          <dd className="f-num">{velocity?.minutesTracked ? `${velocity.minutesTracked} menit` : "—"}</dd>
        </div>
      </dl>
      <p className="fx-velocity-advice">{VELOCITY_ADVICE[trend]}</p>
    </div>
  );
}

/** Position sizes the fee projection can be read at, in USD. */
const PROJECTION_SIZES = [500, 1_000, 5_000];

/**
 * The projection routinely lands in cents, and the shared formatter stops at one
 * decimal below $100 — which rendered a real $0.0026/minute as "$0.0" and made
 * every quiet pool look like it paid nothing at all. Small amounts get the
 * digits they need; anything from a dollar up hands back to the shared one.
 */
const formatMoney = (value) => {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1) return formatUsd(value, false);
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
};

/** How long a hold each preset is written around, for the projection's second figure. */
const HOLD_MINUTES = { heartattack: 10, slowwallet: 660 };

/**
 * The market read, as the panel the drawer opens on.
 *
 * Everything below this in the drawer answers "what is this pool" — the score
 * radar, the rubric, the security rows. This one answers "is it running, what
 * does being in range pay per minute, and what breaks the range", which is the
 * only question a position measured in minutes has time for. It is first for
 * that reason, ahead of the score.
 */
function MarketReadPanel({ pool, preset }) {
  const [size, setSize] = useState(1_000);
  const phase = pool.phase ?? "unknown";
  const meta = PHASE_META[phase];
  const minutes = HOLD_MINUTES[preset] ?? 60;
  const projected = projectFees(pool, size, minutes);
  const tokenBand = pool.tokenBurstBand ?? burstBand(pool.tokenBurst);
  const poolBand = pool.poolBurstBand ?? burstBand(pool.poolBurst);

  return (
    <div className={`fx-read fx-read--${PHASE_TONE[meta.tone]}`}>
      <div className="fx-read-head">
        <PhaseChip phase={phase} size="lg" />
        <div>
          <p className="fx-read-blurb">{meta.blurb}</p>
          <p className="fx-read-action">{meta.action}</p>
        </div>
      </div>

      <dl className="fx-read-grid">
        <div>
          <dt>Burst token (1m vs 5m)</dt>
          <dd>
            <TokenBurstCell pool={pool} />
            <small>{BURST_LABEL[tokenBand]} · seluruh venue</small>
          </dd>
        </div>
        <div>
          <dt>Burst pool (1j vs harian)</dt>
          <dd>
            <PoolBurstCell pool={pool} />
            <small>{BURST_LABEL[poolBand]} · pool ini saja</small>
          </dd>
        </div>
        <div>
          <dt>Porsi venue</dt>
          <dd>
            <VenueShareCell pool={pool} />
            <small>
              {Number.isFinite(pool.venueShare)
                ? "perkiraan aliran token yang lewat sini"
                : "butuh volume token 5m"}
            </small>
          </dd>
        </div>
        <div>
          <dt>Fee per menit</dt>
          <dd>
            <YieldCell pool={pool} />
            <small>
              {Number.isFinite(pool.minutesTo1Pct)
                ? `1% tiap ~${Math.round(pool.minutesTo1Pct)} menit`
                : "atas TVL pool"}
            </small>
          </dd>
        </div>
        <div>
          <dt>Yang mematahkan range</dt>
          <dd>
            <ImpactCell pool={pool} />
            <small>
              {Number.isFinite(pool.avgTradeSize)
                ? `1 trade rata-rata ${formatUsd(pool.avgTradeSize)}`
                : "geseran TVL per trade"}
            </small>
          </dd>
        </div>
        <div>
          <dt>Putaran TVL</dt>
          <dd>
            <TurnoverCell pool={pool} />
            <small>kali per menit</small>
          </dd>
        </div>
        <div>
          <dt>Momentum 1 jam</dt>
          <dd>
            <span className={`f-num ${momentumTone(pool.priceChange1h)}`}>{formatPercent(pool.priceChange1h)}</span>
            <small>umur pool {formatAge(pool.ageHours)}</small>
          </dd>
        </div>
        <div>
          <dt>TVL</dt>
          <dd>
            <span className="f-num">{formatUsd(pool.tvl)}</span>
            <small>vol 1j {formatUsd(pool.volume1h)}</small>
          </dd>
        </div>
      </dl>

      {/* A rate is abstract until it is money. This turns fee/active-TVL into
          what a position of a stated size collects, at the rate showing right
          now — a projection of the present, not a forecast; the rate is exactly
          what decays once the runner tops out. */}
      <div className="fx-read-project">
        <div className="fx-read-project-head">
          <span className="f-eyebrow">Proyeksi pada rate sekarang</span>
          <div className="fx-read-sizes" role="group" aria-label="Ukuran posisi">
            {PROJECTION_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                className={size === option ? "is-active" : ""}
                aria-pressed={size === option}
                onClick={() => setSize(option)}
              >
                {formatUsd(option)}
              </button>
            ))}
          </div>
        </div>
        {projected ? (
          <p>
            Posisi <strong>{formatUsd(size)}</strong> mengumpulkan{" "}
            <strong className="f-num">{formatMoney(projected.perMinute)}</strong> per menit —{" "}
            <strong className="f-num">{formatMoney(projected.overHold)}</strong> kalau dipegang{" "}
            {minutes} menit. Dihitung dari fee/TVL pool, jadi ini rata-rata seluruh pool, bukan
            bonus range ketat. Rate-nya ikut turun begitu fase berubah.
          </p>
        ) : (
          <p className="fx-read-project-empty">
            Fee/TVL belum terbaca untuk pool ini, jadi tidak ada yang bisa diproyeksikan.
          </p>
        )}
      </div>

      {pool.poolBurstIsYoung ? (
        <p className="fx-read-caveat">
          Pool ini belum genap sehari. Jendela harian sudah dipotong ke umur aslinya, tapi sampelnya
          tetap pendek — perlakukan burst pool sebagai indikasi, bukan pengukuran.
        </p>
      ) : null}
    </div>
  );
}

const usdOrDash = (value) => (Number.isFinite(value) ? formatUsd(value) : "—");
const xOrDash = (value, digits = 2) => (Number.isFinite(value) ? `${value.toFixed(digits)}x` : "—");
const pctOrDash = (value, digits = 2) => (Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—");

/**
 * The raw reference table, grouped by timescale rather than by source. Per-minute
 * and five-minute readings come first because they are the ones a short hold is
 * decided on; the hourly and lifetime figures are context underneath them.
 */
const METRIC_GROUPS = [
  // Grouped by scope as well as timescale, because the token figures and the
  // pool figures come from different APIs and describe different things — GMGN
  // measures the token across every venue, Meteora measures this pool. Mixing
  // them in one list is what made a ratio across the two look reasonable.
  ["Token — seluruh venue (GMGN)", [
    ["Volume token 1m", (pool) => usdOrDash(pool.gmgnVolume1m)],
    ["Volume token 5m", (pool) => usdOrDash(pool.gmgnVolume5m)],
    ["Swap token 5m", (pool) => optionalNumber(pool.gmgnSwaps5m)],
    ["Burst token", (pool) => xOrDash(pool.tokenBurst)],
    ["Porsi venue (est.)", (pool) => (Number.isFinite(pool.venueShare) ? `${(pool.venueShare * 100).toFixed(1)}%` : "—")],
    // Already on the payload and, until now, shown nowhere outside the
    // The health rubric's own rows.
    ["Fresh wallet", (pool) => pctOrDash(pool.gmgnFreshWalletPct, 1)],
    ["Top-10 (GMGN)", (pool) => pctOrDash(pool.gmgnTop10Pct, 1)],
    ["Holder (GMGN)", (pool) => optionalNumber(pool.gmgnHolders)],
  ]],
  ["Pool — per menit", [
    ["Burst pool", (pool) => xOrDash(pool.poolBurst)],
    ["Fee/menit", (pool) => pctOrDash(pool.feePerMinPct, 3)],
    ["Waktu ke 1%", (pool) => (Number.isFinite(pool.minutesTo1Pct) ? `${Math.round(pool.minutesTo1Pct)}m` : "—")],
    ["Putaran TVL/menit", (pool) => xOrDash(pool.poolTurnover, 3)],
    ["Avg Vol/m", (pool) => usdOrDash(pool.avgVolumePerMin)],
    ["Avg Fee/m", (pool) => usdOrDash(pool.avgFeePerMin)],
    ["Trade rata-rata", (pool) => usdOrDash(pool.avgTradeSize)],
    ["Impact per trade", (pool) => (Number.isFinite(pool.tradeImpact) ? `${(pool.tradeImpact * 100).toFixed(2)}%` : "—")],
  ]],
  ["Pool — per jam & seterusnya", [
    ["TVL", (pool) => formatUsd(pool.tvl)],
    ["Volume 1j", (pool) => formatUsd(pool.volume1h)],
    ["Volume 24j", (pool) => formatUsd(pool.volume24h)],
    ["Vol/TVL", (pool) => `${pool.volumeTvl1h.toFixed(2)}x`],
    ["Fee/TVL", (pool) => `${pool.feeTvl1h.toFixed(2)}%`],
    ["Swap 1j", (pool) => optionalNumber(pool.swaps1h)],
    ["Trader 1j", (pool) => optionalNumber(pool.traders1h)],
    ["Market cap", (pool) => formatUsd(pool.marketCap)],
    ["Holder", (pool) => optionalNumber(pool.holders)],
    ["Total LP", (pool) => optionalNumber(pool.totalLps)],
    ["Umur pool", (pool) => formatAge(pool.ageHours)],
    ["Harga", (pool) => (pool.currentPrice ? formatUsd(pool.currentPrice, false) : "—")],
  ]],
  // Kept because the fields exist upstream, but reported as what they measured
  // rather than as active-bin depth — see the note in shared/marketRead.js.
  ["Active TVL (discovery API)", [
    ["Active TVL", (pool) => usdOrDash(pool.activeTvl)],
    ["Share vs TVL", (pool) => (Number.isFinite(pool.activeShare) ? `${(pool.activeShare * 100).toFixed(0)}%` : "—")],
    ["Fee/Active TVL", (pool) => pctOrDash(pool.feeActiveTvl1h)],
    ["Vol/Active TVL", (pool) => xOrDash(pool.volumeActiveTvl1h)],
  ]],
];

export default function PoolDrawer({
  pool,
  preset,
  gmgnConfigured,
  onClose,
  onSendAlert,
  alertState,
  isWatched,
  onToggleWatch,
  onToast,
}) {
  const panelRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
    setCopied(false);
  }, [pool?.address]);

  if (!pool) return null;

  const gate = pool.qualifies?.[preset] || { passed: false, misses: [] };
  const tier = poolTier(pool.score, preset);

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(pool.baseAddress || pool.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      onToast?.("Browser menolak akses clipboard.", "error");
    }
  };

  return (
    <>
      <div className="fx-drawer-scrim" role="presentation" onMouseDown={onClose} />
      <aside
        className="fx-drawer"
        role="dialog"
        aria-modal="false"
        aria-label={`Detail pool ${pool.pair}`}
        style={heatVars(pool.score)}
      >
        <header className="fx-drawer-head">
          <div>
            <span className="fx-drawer-status">
              {STATUS_META[tier]?.label ?? tier} · {STATUS_META[tier]?.blurb}
            </span>
            <h2>{pool.pair}</h2>
          </div>
          <div className="fx-drawer-head-actions">
            <button
              type="button"
              className={`f-icon-btn ${isWatched ? "is-active" : ""}`}
              onClick={() => onToggleWatch(pool)}
              aria-pressed={isWatched}
              aria-label={isWatched ? "Hapus dari watchlist" : "Simpan ke watchlist"}
            >
              <Star fill={isWatched ? "currentColor" : "none"} />
            </button>
            <button type="button" className="f-icon-btn" onClick={onClose} aria-label="Tutup detail">
              <X />
            </button>
          </div>
        </header>

        <div className="fx-drawer-body" ref={panelRef}>
          <section className="fx-drawer-section">
            <h3>Baca pasar</h3>
            <MarketReadPanel pool={pool} preset={preset} />
          </section>

          <section className="fx-drawer-gauges">
            <ScoreRadar breakdown={pool.scoreBreakdown} score={pool.score} />
            <div className="fx-drawer-gauge-side">
              <div className="fx-drawer-score">
                <span className="f-eyebrow">Skor</span>
                <strong className="f-num">{pool.score}</strong>
                <div className="f-heat-bar" style={heatVars(pool.score)}>
                  <i style={{ width: `${pool.score}%` }} />
                </div>
              </div>
              <div className="fx-drawer-risk">
                <span className="f-eyebrow">Risiko</span>
                <RiskDial risk={pool.risk} />
                <em>{riskLabel(pool.risk)}</em>
              </div>
            </div>
          </section>

          <section className="fx-drawer-section">
            <div className="fx-drawer-section-head">
              <h3>Momentum 1 jam</h3>
              <strong className={`f-num ${momentumTone(pool.priceChange1h)}`}>
                {formatPercent(pool.priceChange1h)}
              </strong>
            </div>
            <div className="fx-drawer-chart">
              <Spark values={pool.sparkline} score={pool.score} width={320} height={80} showAxis />
            </div>
          </section>

          <section className="fx-drawer-section">
            <h3>{PRESETS[preset].label} gate</h3>
            {gate.passed ? (
              <div className="fx-gate fx-gate--passed">
                <Check /> <span>Semua aturan preset terpenuhi.</span>
              </div>
            ) : (
              <ul className="fx-gate-list">
                {gate.misses.map((miss) => (
                  <li key={miss}>
                    <X /> <span>{miss}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fx-drawer-section">
            <h3>Keamanan token</h3>
            <div className="fx-security-row">
              <div>
                <span>JupShield</span>
                <JupShieldChip pool={pool} />
              </div>
              <div>
                <span>RugCheck</span>
                <RugCheckChip pool={pool} />
              </div>
              <div>
                <span>Organic Score</span>
                <OrganicChip pool={pool} />
              </div>
              <div>
                <span>Top-10 holder</span>
                <ConcentrationValue value={pool.top10HoldersPct} warningAt={30} dangerAt={50} />
              </div>
              <div>
                <span>Saldo dev</span>
                <ConcentrationValue value={pool.devBalancePct} warningAt={5} dangerAt={10} />
              </div>
              <div>
                <span>LP terkunci</span>
                <span className="f-num">
                  {Number.isFinite(pool.rugCheckLpLockedPct) ? `${pool.rugCheckLpLockedPct.toFixed(0)}%` : "—"}
                </span>
              </div>
              <div>
                <span
                  title="Wallet yang saling terhubung lewat transfer — bentuk terukur dari cek Bubblemaps"
                >
                  Cluster terbesar
                </span>
                {Number.isFinite(pool.clusterLargestPct) ? (
                  <span
                    className={`fx-conc fx-conc--${clusterTone(pool.clusterLargestPct)} f-num`}
                    title={
                      pool.clusterCount
                        ? `${pool.clusterCount} cluster terdeteksi · terbesar ${pool.clusterLargestWallets} wallet · total ${pool.clusteredSupplyPct?.toFixed(1)}% supply`
                        : "Tidak ada cluster wallet terhubung yang terdeteksi"
                    }
                  >
                    {pool.clusterLargestPct.toFixed(1)}%
                    {pool.clusterLargestWallets ? <em> · {pool.clusterLargestWallets}w</em> : null}
                  </span>
                ) : (
                  <span className="fx-na" title="Graf cluster tidak terbaca">—</span>
                )}
              </div>
            </div>
            {pool.jupShieldWarnings?.length ? (
              <ul className="fx-warning-list">
                {pool.jupShieldWarnings.map((warning, index) => (
                  <li className={`fx-warning fx-warning--${warning.severity}`} key={`${warning.type}-${index}`}>
                    <TriangleAlert />
                    <div>
                      <strong>{humanizeType(warning.type)}</strong>
                      <p>{warning.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="fx-drawer-section">
            <h3>Tanda risiko</h3>
            <ul className="fx-flag-list">
              {pool.riskFlags.map((flag) => (
                <li className={`fx-flag fx-flag--${flag.type}`} key={flag.label}>
                  {flag.type === "success" ? <Check /> : <TriangleAlert />}
                  <span>{flag.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="fx-drawer-section">
            <h3>Angka pool</h3>
            {METRIC_GROUPS.map(([title, metrics]) => (
              <div className="fx-metric-group" key={title}>
                <span className="f-eyebrow">{title}</span>
                <dl className="fx-metric-grid">
                  {metrics.map(([label, read]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="f-num">{read(pool)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>

          {pool.richerSiblingPool ? (
            <section className="fx-drawer-section">
              <div className="fx-sibling-warning">
                <TriangleAlert />
                <div>
                  <strong>Ada pool lain untuk token ini yang lebih produktif</strong>
                  <p>
                    Bin step {pool.richerSiblingPool.binStep} mencetak{" "}
                    {formatUsd(pool.richerSiblingPool.totalFees1h)} fee dalam 1 jam versus{" "}
                    {formatUsd(pool.totalFees1h)} di sini. Pilih pool dengan fee terbesar, bukan
                    fee rate tertinggi.
                  </p>
                  <a
                    href={`https://www.meteora.ag/dlmm/${pool.richerSiblingPool.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka pool itu <ExternalLink />
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          <section className="fx-drawer-section">
            <h3>Rubrik screening</h3>
            <RubricPanel pool={pool} gmgnConfigured={gmgnConfigured} />
          </section>

          <section className="fx-drawer-section">
            <h3>Kecepatan fee</h3>
            <FeeVelocityPanel velocity={pool.feeVelocity} />
          </section>

          <section className="fx-drawer-section">
            <h3>Rincian fee 1 jam</h3>
            <dl className="fx-metric-grid">
              <div>
                <dt>Total fee</dt>
                <dd className="f-num">{formatUsd(pool.totalFees1h)}</dd>
              </div>
              <div>
                <dt>Fee LP</dt>
                <dd className="f-num">{formatUsd(pool.lpFees1h)}</dd>
              </div>
              <div>
                <dt>Fee protokol</dt>
                <dd className="f-num">{formatUsd(pool.protocolFees1h)}</dd>
              </div>
              <div>
                <dt>Bin step</dt>
                <dd className="f-num">{pool.binStep || "—"}</dd>
              </div>
              <div>
                <dt>Mode fee</dt>
                <dd>
                  {pool.feesInBothTokens === null
                    ? "—"
                    : pool.feesInBothTokens
                      ? "Base + quote"
                      : "Quote saja"}
                </dd>
              </div>
              <div>
                <dt>Mint authority</dt>
                <dd>
                  {pool.mintAuthorityDisabled === null
                    ? "—"
                    : pool.mintAuthorityDisabled
                      ? "Mati"
                      : "Masih aktif"}
                </dd>
              </div>
              <div>
                <dt>Swap per trader</dt>
                <dd className="f-num">
                  {Number.isFinite(pool.swapsPerTrader) ? `${pool.swapsPerTrader.toFixed(2)}x` : "—"}
                </dd>
              </div>
              <div>
                <dt>Base fee</dt>
                <dd className="f-num">{pool.baseFeePct.toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Dynamic fee</dt>
                <dd className="f-num">{pool.dynamicFeePct.toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Launchpad</dt>
                <dd>{pool.launchpad || "—"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="fx-drawer-foot">
          <button
            className="f-btn f-btn--hot"
            type="button"
            onClick={() => onSendAlert(pool)}
            disabled={alertState === "sending"}
          >
            {alertState === "sending" ? <Loader2 className="f-spin" /> : <BellRing />}
            {alertState === "sending" ? "Mengirim…" : "Kirim ke Telegram"}
          </button>
          <button className="f-btn" type="button" onClick={copyMint}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Tersalin" : "Salin mint"}
          </button>
          <a
            className="f-btn"
            href={`https://www.meteora.ag/dlmm/${pool.address}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> Meteora
          </a>
        </footer>
      </aside>
    </>
  );
}
