import {
  Activity,
  Check,
  Equal,
  ExternalLink,
  Flame,
  Minus,
  Snowflake,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { VELOCITY_LABEL } from "../../../../shared/feeVelocity.js";
import { BURST_LABEL, burstBand, PHASE_META } from "../../../../shared/marketRead.js";
import { formatNumber, formatUsd } from "../../../lib/format.js";
import { heatColor, heatVars, STATUS_META } from "../../lib/heat.js";

export const optionalNumber = (value) => (Number.isFinite(value) ? formatNumber(value) : "—");
export const optionalPercent = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "—");

/** Nothing to read is grey and says so, never a zero dressed up as a measurement. */
export function Unread({ why = "Data belum tersedia", dash = true }) {
  return (
    <span className="fx-na" title={why}>
      {dash ? "—" : <Minus />}
    </span>
  );
}

/* --- market read ----------------------------------------------------------- */

/**
 * Phase is the headline of the whole redesign: one word for what the pool is
 * doing at this minute, ahead of any number. The tone families are the app's
 * existing ones — accent for "running hot", quench for healthy, caution for
 * turning, scorch for gone.
 */
export const PHASE_TONE = {
  hot: "ignite",
  good: "run",
  warn: "turn",
  bad: "gone",
  muted: "unread",
};

export function PhaseChip({ phase, size = "md" }) {
  const meta = PHASE_META[phase] ?? PHASE_META.unknown;
  const tone = PHASE_TONE[meta.tone];
  const Icon = { ignite: Flame, run: Activity, turn: TrendingDown, gone: Snowflake, unread: Minus }[tone];
  return (
    <span className={`fx-phase fx-phase--${tone} fx-phase--${size}`} title={`${meta.blurb} ${meta.action}`}>
      <Icon />
      {meta.label}
    </span>
  );
}

const BURST_ICON = {
  erupting: Flame,
  accelerating: TrendingUp,
  holding: Equal,
  cooling: TrendingDown,
  dying: TrendingDown,
};

/**
 * Token burst — the last minute against the last five minutes' average pace,
 * both sides from GMGN and both token-wide, so the ratio is internally clean.
 *
 * This measures the TOKEN, not this pool. That distinction is not pedantry: on a
 * live scan a token was doing $105K every five minutes while the DLMM pool
 * holding it did $2.8K in a whole hour. Both facts matter and neither one
 * substitutes for the other, which is why PoolBurstCell exists beside this.
 */
export function TokenBurstCell({ pool }) {
  if (!Number.isFinite(pool.tokenBurst)) {
    return <Unread why={Number.isFinite(pool.gmgnVolume5m) ? "Volume token 5 menit terlalu tipis untuk dibandingkan" : "Butuh GMGN_API_KEY"} />;
  }

  const band = pool.tokenBurstBand ?? burstBand(pool.tokenBurst);
  const Icon = BURST_ICON[band];
  return (
    <span
      className={`fx-burst fx-burst--${band}`}
      title={[
        `${BURST_LABEL[band]} — menit terakhir berjalan ${pool.tokenBurst.toFixed(2)}x pace lima menit terakhir`,
        Number.isFinite(pool.gmgnVolume5m) ? `Volume token 5m ${formatUsd(pool.gmgnVolume5m)} (seluruh venue, bukan pool ini)` : null,
      ].filter(Boolean).join("\n")}
    >
      <Icon />
      <span className="f-num">{pool.tokenBurst.toFixed(2)}x</span>
    </span>
  );
}

/**
 * Pool burst — this pool's hour against its own daily pace, both sides from
 * Meteora. Coarser than the token reading but pool-scoped and nearly always
 * present, and the daily window is already clipped to the pool's real age.
 */
export function PoolBurstCell({ pool }) {
  if (!Number.isFinite(pool.poolBurst)) return <Unread why="Volume 24 jam terlalu tipis untuk dibandingkan" />;

  const band = pool.poolBurstBand ?? burstBand(pool.poolBurst);
  const Icon = BURST_ICON[band];
  return (
    <span
      className={`fx-burst fx-burst--${band}`}
      title={[
        `${BURST_LABEL[band]} — jam terakhir pool ini berjalan ${pool.poolBurst.toFixed(2)}x pace hariannya`,
        pool.poolBurstIsYoung ? "Pool belum genap sehari; jendela harian sudah dipotong ke umur asli, tapi sampelnya tetap pendek." : null,
      ].filter(Boolean).join("\n")}
    >
      <Icon />
      <span className="f-num">{pool.poolBurst.toFixed(2)}x</span>
      {pool.poolBurstIsYoung ? <em className="fx-burst-young">*</em> : null}
    </span>
  );
}

/** Whichever burst reading a pool has, preferring the finer token window. */
export function BurstCell({ pool }) {
  return Number.isFinite(pool.tokenBurst) ? <TokenBurstCell pool={pool} /> : <PoolBurstCell pool={pool} />;
}

/**
 * Fee per minute as a share of pool TVL — the unit a hold measured in minutes is
 * paid in, where fee/TVL per hour is the same fact in a unit nobody running this
 * play holds for.
 */
export function YieldCell({ pool }) {
  if (!Number.isFinite(pool.feePerMinPct)) return <Unread why="Butuh fee/TVL 1 jam" />;
  const tone = pool.feePerMinPct >= 0.1 ? "strong" : pool.feePerMinPct >= 0.03 ? "good" : pool.feePerMinPct >= 0.008 ? "thin" : "flat";
  return (
    <span
      className={`fx-rate fx-rate--${tone}`}
      title={
        Number.isFinite(pool.minutesTo1Pct)
          ? `Pada rate sekarang, modal di pool ini mencetak 1% tiap ~${Math.round(pool.minutesTo1Pct)} menit`
          : "Rate fee per menit atas TVL pool"
      }
    >
      {/* Three decimals is the right resolution for a pool that pays, and turns
          a slow-but-real rate into a flat "0.000%" that reads as nothing at all.
          Below the threshold, say so rather than round it away. */}
      <span className="f-num">
        {pool.feePerMinPct > 0 && pool.feePerMinPct < 0.0005 ? "<0.001%" : `${pool.feePerMinPct.toFixed(3)}%`}
      </span>
      <small>/mnt</small>
    </span>
  );
}

/** Minutes for pool capital to earn 1% at the current rate. Lower is better. */
export function ClockCell({ pool }) {
  if (!Number.isFinite(pool.minutesTo1Pct)) return <Unread why="Butuh fee/TVL 1 jam" />;
  const minutes = pool.minutesTo1Pct;
  const tone = minutes <= 10 ? "strong" : minutes <= 30 ? "good" : minutes <= 120 ? "thin" : "flat";
  const shown = minutes >= 600 ? `${Math.round(minutes / 60)}j` : `${Math.round(minutes)}m`;
  return (
    <span className={`fx-rate fx-rate--${tone} f-num`} title="Berapa lama modal di pool ini butuh untuk mencetak 1% pada rate sekarang">
      {shown}
    </span>
  );
}

/**
 * How much of the pool's TVL one average trade moves. This is how a tight range
 * actually dies: not on a trend, but on single market orders large enough to
 * walk the price through bins.
 */
export function ImpactCell({ pool }) {
  if (!Number.isFinite(pool.tradeImpact)) return <Unread why="Butuh TVL dan jumlah swap 1 jam" />;
  const pct = pool.tradeImpact * 100;
  const tone = pct >= 5 ? "danger" : pct >= 1 ? "warning" : "healthy";
  return (
    <span
      className={`fx-conc fx-conc--${tone} f-num`}
      title={`Satu trade rata-rata (${formatUsd(pool.avgTradeSize)}) menggeser ${pct.toFixed(2)}% TVL pool`}
    >
      {pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`}
    </span>
  );
}

/** Times per minute the pool's whole TVL is traded through. */
export function TurnoverCell({ pool }) {
  if (!Number.isFinite(pool.poolTurnover)) return <Unread why="Butuh TVL dan volume 1 jam" />;
  const tone = pool.poolTurnover >= 0.5 ? "strong" : pool.poolTurnover >= 0.1 ? "good" : pool.poolTurnover >= 0.02 ? "thin" : "flat";
  return (
    <span className={`fx-rate fx-rate--${tone} f-num`} title="Berapa kali TVL pool diputar penuh tiap menit">
      {pool.poolTurnover.toFixed(3)}x
    </span>
  );
}

/**
 * What share of its own token's flow runs through this pool.
 *
 * The one reading that catches being in the wrong venue: a pool can look busy in
 * isolation and still be carrying a fraction of a percent of where the token is
 * actually traded. Estimated, because the token's hourly volume is extrapolated
 * from its five-minute window — but the gap it exposes is far wider than the
 * error in the estimate.
 */
export function VenueShareCell({ pool }) {
  if (!Number.isFinite(pool.venueShare)) return <Unread why="Butuh volume token 5 menit dari GMGN" />;
  const pct = pool.venueShare * 100;
  const tone = pct >= 25 ? "healthy" : pct >= 5 ? "warning" : "danger";
  return (
    <span
      className={`fx-conc fx-conc--${tone} f-num`}
      title={`Perkiraan: sekitar ${pct.toFixed(1)}% aliran token ini lewat pool tersebut. Volume token per jam diekstrapolasi dari jendela 5 menit, jadi ini estimasi.`}
    >
      {pct >= 1 ? `${pct.toFixed(0)}%` : `${pct.toFixed(2)}%`}
    </span>
  );
}

/**
 * Active TVL against pool TVL, reported as the plain share it is.
 *
 * Deliberately NOT labelled "active bin". Measured across a live scan this
 * upstream field lands between 0.62x and 1.01x of TVL — sometimes above it,
 * which no subset of a pool can be — so it is shown as context, not as the
 * depth a tight range would compete with.
 */
export function ActiveDepthCell({ pool }) {
  if (!Number.isFinite(pool.activeTvl)) return <Unread why="Discovery API tidak mengembalikan active TVL" />;
  return (
    <span
      className="fx-cell-stack"
      title="TVL versi discovery API. Nilainya berdekatan dengan TVL biasa dan kadang sedikit di atasnya, jadi ini bukan isi bin aktif."
    >
      <span className="f-num">{formatUsd(pool.activeTvl)}</span>
      {Number.isFinite(pool.activeShare) ? (
        <small className="f-num">{(pool.activeShare * 100).toFixed(0)}% dari TVL</small>
      ) : null}
    </span>
  );
}

/** Unknown momentum is grey, not red — the candle simply never arrived. */
export const momentumTone = (value) =>
  !Number.isFinite(value) ? "f-muted" : value >= 0 ? "f-pos" : "f-neg";

export const humanizeType = (value) =>
  String(value || "Risiko")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

/** Score as a temperature reading: the number plus the strip of metal under it. */
export function HeatBadge({ score, status, size = "md" }) {
  return (
    <span className={`fx-heat fx-heat--${size}`} style={heatVars(score)}>
      <span className="fx-heat-value f-num">{score}</span>
      <span className="fx-heat-bar" aria-hidden="true">
        <i style={{ width: `${score}%` }} />
      </span>
      {status ? <span className="fx-heat-status">{STATUS_META[status]?.label ?? status}</span> : null}
    </span>
  );
}

export function PoolAvatar({ symbol, quote }) {
  // Constrained to the cool arc (teal → blue → violet → magenta) so avatars stay
  // inside the palette instead of scattering random warm hues across the table.
  const seed = [...String(symbol)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const hue = 168 + (seed % 152);
  return (
    <span className="fx-avatar" aria-hidden="true">
      <i className="fx-avatar-quote">{String(quote || "?").slice(0, 1)}</i>
      <i className="fx-avatar-base" style={{ "--token-hue": hue }}>
        {String(symbol || "?").slice(0, 2)}
      </i>
    </span>
  );
}

export function StatTile({ label, value, sub, heat, tone, children }) {
  return (
    <div className="fx-tile" style={heat != null ? heatVars(heat) : undefined}>
      <span className="fx-tile-label">{label}</span>
      <strong className={`fx-tile-value f-num ${tone ? `fx-tile-value--${tone}` : ""}`}>{value}</strong>
      {sub ? <span className="fx-tile-sub">{sub}</span> : null}
      {children ? <div className="fx-tile-extra">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="fx-empty">
      {Icon ? <Icon /> : null}
      <strong>{title}</strong>
      {body ? <span>{body}</span> : null}
      {action}
    </div>
  );
}

export function JupShieldChip({ pool, onInspect }) {
  if (pool.jupShieldStatus === null) return <span className="fx-na">—</span>;
  const count = pool.jupShieldWarnings?.length || 0;
  const tone = count ? (pool.jupShieldStatus === "danger" ? "danger" : "warning") : "clear";
  return (
    <button
      type="button"
      className={`f-chip f-chip--${tone} fx-chip-button`}
      onClick={(event) => {
        event.stopPropagation();
        onInspect?.(pool);
      }}
      title={
        count
          ? pool.jupShieldWarnings.map((warning) => `${humanizeType(warning.type)}: ${warning.message}`).join("\n")
          : "JupShield tidak menemukan peringatan"
      }
    >
      {count ? <TriangleAlert /> : <Check />}
      {count ? `${count} alert` : "Bersih"}
    </button>
  );
}

export function RugCheckChip({ pool }) {
  if (pool.rugCheckStatus === null) return <span className="fx-na">—</span>;
  const count = pool.rugCheckRiskCount || 0;
  const tone = count ? (pool.rugCheckStatus === "danger" ? "danger" : "warning") : "clear";
  return (
    <a
      className={`f-chip f-chip--${tone} fx-chip-button`}
      href={`https://rugcheck.xyz/tokens/${pool.baseAddress}`}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={`Skor ${optionalNumber(pool.rugCheckScore)}${
        Number.isFinite(pool.rugCheckLpLockedPct) ? ` · LP terkunci ${pool.rugCheckLpLockedPct.toFixed(0)}%` : ""
      }`}
    >
      {count ? <TriangleAlert /> : <Check />}
      {count ? `${count} risiko` : "Bersih"}
      <ExternalLink />
    </a>
  );
}

export function OrganicChip({ pool }) {
  if (!Number.isFinite(pool.organicScore)) return <span className="fx-na">—</span>;
  const tone = pool.organicScore >= 80 ? "clear" : pool.organicScore >= 50 ? "warning" : "danger";
  return (
    <span className={`f-chip f-chip--${tone}`} title={pool.organicScoreLabel || "belum dinilai"}>
      <span className="f-num">{Math.round(pool.organicScore)}</span>
    </span>
  );
}

/** Holder concentration reads healthy → danger, not on the heat ramp. */
export function ConcentrationValue({ value, warningAt, dangerAt }) {
  if (!Number.isFinite(value)) {
    return (
      <span className="fx-na" title="Data belum tersedia">
        <Minus />
      </span>
    );
  }
  const tone = value >= dangerAt ? "danger" : value >= warningAt ? "warning" : "healthy";
  return <span className={`fx-conc fx-conc--${tone} f-num`}>{value.toFixed(1)}%</span>;
}

/**
 * Fee velocity reads as a direction, not a magnitude: the number that matters
 * is how far the pool has fallen off its own peak, which is the closest the
 * screener gets to "the fee stopped flowing".
 */
export function FeeVelocityCell({ velocity }) {
  const trend = velocity?.trend ?? "unknown";
  if (trend === "unknown") {
    return (
      <span className="fx-na" title={`Baru ${velocity?.samples ?? 0} sampel — butuh minimal 3 scan`}>
        <Minus />
      </span>
    );
  }

  const tone = { rising: "healthy", steady: "healthy", decaying: "warning", stalled: "danger" }[trend];
  const Icon = { rising: TrendingUp, steady: Equal, decaying: TrendingDown, stalled: TrendingDown }[trend];
  const share = Number.isFinite(velocity.ratioToPeak) ? Math.round(velocity.ratioToPeak * 100) : null;

  return (
    <span
      className={`fx-velocity fx-velocity--${tone}`}
      title={`${VELOCITY_LABEL[trend]} · ${share}% dari puncak · ${velocity.minutesTracked} menit terpantau`}
    >
      <Icon />
      <span className="f-num">{share === null ? "—" : `${share}%`}</span>
    </span>
  );
}

export function StatusDot({ status }) {
  const score = { hot: 90, watch: 72, early: 57, skip: 22 }[status] ?? 30;
  return <span className="fx-status-dot" style={{ background: heatColor(score) }} aria-hidden="true" />;
}
