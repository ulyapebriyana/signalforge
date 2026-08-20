export const formatUsd = (value, compact = true) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(amount) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(amount) < 100 ? 1 : 0,
  }).format(amount);
};

/**
 * Money the reader owns, printed in full.
 *
 * `formatUsd` compacts anything over $1,000 because a screener column is
 * comparing pools, where $1.2M against $840K is the whole point and the digits
 * after are noise. A position table is the opposite: it is one person's own
 * money, and "$12K" cannot tell $12,480.55 from $12,010.00 — a $470 difference
 * rendered as the same string. Unclaimed fees are worse, since the interesting
 * numbers there live in the tens of dollars and their cents.
 *
 * So: never compact, always two decimals, grouped.
 */
export const formatUsdExact = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
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
