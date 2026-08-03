export const PRESETS = Object.freeze({
  safer: {
    id: "safer",
    label: "Safer",
    marketCapMin: 100_000,
    marketCapMax: 5_000_000,
    tvlMin: 10_000,
    momentumMin: 10,
    momentumMax: 40,
    volume1hMin: 10_000,
    volumeTvlMin: 1,
    feeTvlMin: 1,
    requireFreezeOff: true,
    maxRisk: 55,
    minScore: 65,
    cooldownMinutes: 30,
  },
  yanman: {
    id: "yanman",
    label: "Yanman-like",
    marketCapMin: 100_000,
    marketCapMax: 10_000_000,
    tvlMin: 500,
    momentumMin: 20,
    momentumMax: 200,
    volume1hMin: 5_000,
    volumeTvlMin: 0.5,
    feeTvlMin: 0.5,
    requireFreezeOff: true,
    maxRisk: 72,
    minScore: 65,
    cooldownMinutes: 15,
  },
});

const QUOTE_SYMBOLS = new Set(["SOL", "WSOL", "USDC", "USDT"]);

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scaled = (value, inputMin, inputMax, outputMax) => {
  if (value <= inputMin) return 0;
  return clamp(((value - inputMin) / (inputMax - inputMin)) * outputMax, 0, outputMax);
};

const chooseTokens = (tokenX = {}, tokenY = {}) => {
  const xQuote = QUOTE_SYMBOLS.has(String(tokenX.symbol || "").toUpperCase());
  const yQuote = QUOTE_SYMBOLS.has(String(tokenY.symbol || "").toUpperCase());

  if (xQuote && !yQuote) return { base: tokenY, quote: tokenX };
  if (yQuote && !xQuote) return { base: tokenX, quote: tokenY };
  return { base: tokenX, quote: tokenY };
};

const ageHoursFrom = (createdAt) => {
  const timestamp = number(createdAt);
  if (!timestamp) return null;
  return Math.max(0, (Date.now() - timestamp) / 3_600_000);
};

export function calculateScore(pool) {
  const momentumValue = Math.max(0, number(pool.priceChange1h));
  const momentum = Math.round(scaled(momentumValue, 0, 30, 25));

  const feeTvlValue = Math.max(0, number(pool.feeTvl1h));
  const feeEfficiency = Math.round(scaled(feeTvlValue, 0, 2, 25));

  const volumeTvlValue = Math.max(0, number(pool.volumeTvl1h));
  const ratioScore = scaled(volumeTvlValue, 0, 2, 15);
  const absoluteVolumeScore = scaled(number(pool.volume1h), 0, 50_000, 5);
  const volumeQuality = Math.round(clamp(ratioScore + absoluteVolumeScore, 0, 20));

  let security = 0;
  if (!pool.isBlacklisted) security += 7;
  if (pool.freezeAuthorityDisabled) security += 6;
  if (pool.isVerified) security += 4;
  if (number(pool.holders) >= 500) security += 3;

  let freshness = 3;
  if (pool.ageHours !== null && pool.ageHours <= 24) freshness = 10;
  else if (pool.ageHours !== null && pool.ageHours <= 168) freshness = 7;
  else if (pool.ageHours !== null && pool.ageHours <= 720) freshness = 5;

  const total = clamp(momentum + feeEfficiency + volumeQuality + security + freshness, 0, 100);

  return {
    total,
    breakdown: { momentum, feeEfficiency, volumeQuality, security, freshness },
  };
}

export function calculateRisk(pool) {
  let risk = 4;
  const flags = [];

  if (pool.isBlacklisted) {
    risk += 55;
    flags.push({ type: "danger", label: "Pool masuk blacklist" });
  }
  if (!pool.freezeAuthorityDisabled) {
    risk += 30;
    flags.push({ type: "danger", label: "Freeze authority masih aktif" });
  } else {
    flags.push({ type: "success", label: "Freeze authority off" });
  }
  if (!pool.isVerified) {
    risk += 8;
    flags.push({ type: "warning", label: "Token belum terverifikasi" });
  }
  if (number(pool.tvl) < 1_000) {
    risk += 20;
    flags.push({ type: "danger", label: "Likuiditas sangat tipis" });
  } else if (number(pool.tvl) < 10_000) {
    risk += 10;
    flags.push({ type: "warning", label: "TVL di bawah $10K" });
  }
  if (number(pool.holders) > 0 && number(pool.holders) < 100) {
    risk += 15;
    flags.push({ type: "warning", label: "Holder kurang dari 100" });
  }
  if (number(pool.priceChange1h) > 100) {
    risk += 18;
    flags.push({ type: "warning", label: "Momentum 1 jam ekstrem" });
  }
  if (pool.ageHours !== null && pool.ageHours < 0.5) {
    risk += 10;
    flags.push({ type: "warning", label: "Pool berumur kurang dari 30 menit" });
  }

  risk += 8;
  flags.push({ type: "warning", label: "Konsentrasi top-10 belum tersedia" });

  return { value: clamp(Math.round(risk), 0, 100), flags };
}

export function evaluatePreset(pool, presetInput) {
  const preset = typeof presetInput === "string" ? PRESETS[presetInput] : presetInput;
  if (!preset) throw new Error("Preset tidak dikenal");

  const checks = [
    [pool.marketCap >= preset.marketCapMin, `MC ≥ $${preset.marketCapMin}`],
    [pool.marketCap <= preset.marketCapMax, `MC ≤ $${preset.marketCapMax}`],
    [pool.tvl >= preset.tvlMin, `TVL ≥ $${preset.tvlMin}`],
    [pool.priceChange1h !== null && pool.priceChange1h >= preset.momentumMin, `1h ≥ ${preset.momentumMin}%`],
    [pool.priceChange1h !== null && pool.priceChange1h <= preset.momentumMax, `1h ≤ ${preset.momentumMax}%`],
    [pool.volume1h >= preset.volume1hMin, `Vol 1h ≥ $${preset.volume1hMin}`],
    [pool.volumeTvl1h >= preset.volumeTvlMin, `Vol/TVL ≥ ${preset.volumeTvlMin}x`],
    [pool.feeTvl1h >= preset.feeTvlMin, `Fee/TVL ≥ ${preset.feeTvlMin}%`],
    [!pool.isBlacklisted, "Tidak di-blacklist"],
    [!preset.requireFreezeOff || pool.freezeAuthorityDisabled, "Freeze authority off"],
  ];

  const misses = checks.filter(([passed]) => !passed).map(([, label]) => label);
  return { passed: misses.length === 0, misses };
}

export function normalizePool(raw, momentum = {}, analytics = {}) {
  const { base, quote } = chooseTokens(raw.token_x, raw.token_y);
  const tvl = number(raw.tvl);
  const volume1h = number(raw.volume?.["1h"]);
  const lpFees1h = number(raw.fees?.["1h"]);
  const protocolFees1h = number(raw.protocol_fees?.["1h"]);
  const priceChange1h = Number.isFinite(momentum.priceChange1h)
    ? momentum.priceChange1h
    : Number.isFinite(raw.price_change_1h)
      ? raw.price_change_1h
      : null;

  const normalized = {
    address: raw.address,
    name: raw.name,
    pair: `${quote.symbol || "?"} / ${base.symbol || "?"}`,
    baseSymbol: base.symbol || "?",
    quoteSymbol: quote.symbol || "?",
    baseAddress: base.address,
    marketCap: number(base.market_cap),
    holders: number(base.holders),
    isVerified: Boolean(base.is_verified),
    freezeAuthorityDisabled: Boolean(base.freeze_authority_disabled),
    isBlacklisted: Boolean(raw.is_blacklisted),
    launchpad: raw.launchpad || null,
    createdAt: number(raw.created_at),
    ageHours: ageHoursFrom(raw.created_at),
    tvl,
    volume1h,
    volume24h: number(raw.volume?.["24h"]),
    fees1h: lpFees1h,
    lpFees1h,
    protocolFees1h,
    totalFees1h: lpFees1h + protocolFees1h,
    feeTvl1h: number(raw.fee_tvl_ratio?.["1h"]),
    volumeTvl1h: tvl > 0 ? volume1h / tvl : 0,
    baseFeePct: number(raw.pool_config?.base_fee_pct),
    dynamicFeePct: number(raw.dynamic_fee_pct),
    totalLps: optionalNumber(analytics.total_lps),
    swaps1h: optionalNumber(analytics.swap_count),
    traders1h: optionalNumber(analytics.unique_traders),
    currentPrice: number(raw.current_price),
    priceChange1h,
    sparkline: Array.isArray(momentum.sparkline) ? momentum.sparkline : [],
  };

  const score = calculateScore(normalized);
  const risk = calculateRisk(normalized);
  const status = score.total >= 80 ? "hot" : score.total >= 65 ? "watch" : score.total >= 50 ? "early" : "skip";

  return {
    ...normalized,
    score: score.total,
    scoreBreakdown: score.breakdown,
    risk: risk.value,
    riskFlags: risk.flags,
    status,
    qualifies: {
      safer: evaluatePreset(normalized, PRESETS.safer),
      yanman: evaluatePreset(normalized, PRESETS.yanman),
    },
  };
}
