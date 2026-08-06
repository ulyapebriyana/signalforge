import { Check, ExternalLink, Minus, TriangleAlert } from "lucide-react";
import { formatNumber } from "../../../lib/format.js";
import { heatColor, heatVars, STATUS_META } from "../../lib/heat.js";

export const optionalNumber = (value) => (Number.isFinite(value) ? formatNumber(value) : "—");
export const optionalPercent = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "—");

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
  const hue = [...String(symbol)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
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

export function StatusDot({ status }) {
  const score = { hot: 90, watch: 72, early: 57, skip: 22 }[status] ?? 30;
  return <span className="fx-status-dot" style={{ background: heatColor(score) }} aria-hidden="true" />;
}
