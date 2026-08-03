export const formatUsd = (value, compact = true) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(amount) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(amount) < 100 ? 1 : 0,
  }).format(amount);
};

export const formatNumber = (value) => new Intl.NumberFormat("en-US", {
  notation: Number(value) >= 10_000 ? "compact" : "standard",
  maximumFractionDigits: 1,
}).format(Number(value || 0));

export const formatPercent = (value, digits = 1) => {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
};

export const formatAge = (hours) => {
  if (!Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
};

export const formatWibTime = (iso) => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
};
