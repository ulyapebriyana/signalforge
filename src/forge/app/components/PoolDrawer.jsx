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
import { PRESETS, poolTier } from "../../../../shared/scoring.js";
import { formatAge, formatPercent, formatUsd } from "../../../lib/format.js";
import { heatVars, riskLabel, STATUS_META } from "../../lib/heat.js";
import { RiskDial, ScoreRadar, Spark } from "./charts.jsx";
import {
  ConcentrationValue,
  humanizeType,
  JupShieldChip,
  momentumTone,
  optionalNumber,
  OrganicChip,
  RugCheckChip,
} from "./bits.jsx";

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

const METRICS = [
  ["TVL", (pool) => formatUsd(pool.tvl)],
  ["Volume 1j", (pool) => formatUsd(pool.volume1h)],
  ["Volume 24j", (pool) => formatUsd(pool.volume24h)],
  ["Market cap", (pool) => formatUsd(pool.marketCap)],
  ["Vol/TVL", (pool) => `${pool.volumeTvl1h.toFixed(2)}x`],
  ["Fee/TVL", (pool) => `${pool.feeTvl1h.toFixed(2)}%`],
  ["Holder", (pool) => optionalNumber(pool.holders)],
  ["Total LP", (pool) => optionalNumber(pool.totalLps)],
  ["Swap 1j", (pool) => optionalNumber(pool.swaps1h)],
  ["Trader 1j", (pool) => optionalNumber(pool.traders1h)],
  ["Umur pool", (pool) => formatAge(pool.ageHours)],
  ["Harga", (pool) => (pool.currentPrice ? formatUsd(pool.currentPrice, false) : "—")],
];

export default function PoolDrawer({
  pool,
  preset,
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
            <dl className="fx-metric-grid">
              {METRICS.map(([label, read]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="f-num">{read(pool)}</dd>
                </div>
              ))}
            </dl>
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
