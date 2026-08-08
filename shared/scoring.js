export const PRESETS = Object.freeze({
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
    hotScore: 80,
    watchScore: 65,
    earlyScore: 50,
    cooldownMinutes: 15,
  },
  // Modelled on the publicly posted Meteora DLMM routine of @auzhinta: enter a
  // fresh memecoin pool at or just after its top with a one-sided bid-ask range
  // pushed 70–80% below entry, then harvest fees until the volume dies. Three
  // things follow from that and make this preset unlike the other one.
  //
  //  1. The rig is specific and screenable. Bin step 80/100/125 with a 2–3%
  //     base fee is the setup behind every position they have posted, so it is
  //     a hard gate rather than a preference.
  //  2. Direction barely matters. A bid-ask range that wide earns on the way
  //     down — their own MOGDOG-SOL position closed +10.89% while the token
  //     fell ~70% — so momentumMin is negative on purpose. What has to be true
  //     is that the pool is *paying*, which is why feeTvlMin is the strictest
  //     number here.
  //  3. The exit is a volume rule, not a price rule. A screener cannot watch
  //     fee velocity decay, so the closest standing equivalent is refusing to
  //     surface a pool that is not already earning at ≥1% fee/TVL per hour.
  auzhinta: {
    id: "auzhinta",
    label: "Auzhinta-like",
    // Numbers below are stated outright in the step-by-step article, not
    // inferred: MCAP ≥ $400K ("di bawah itu terlalu kecil dan rentan
    // manipulasi"), holders ≥ 500, a Bubblemaps cluster of 40%+ is a reject,
    // dev wallet ideally 0%, NoMint mandatory, base fee 2–3%.
    marketCapMin: 400_000,
    marketCapMax: 15_000_000,
    // "TVL at least di minimal 35k an, at least kalo dump gak keberatan nahan
    // IL" — and no ceiling: the article sorts by highest TVL on purpose,
    // treating a crowded pool as other people's research already done.
    tvlMin: 35_000,
    // Entry wants the move intact — "cari yang baru ATH atau masih dalam fase
    // naik", "kalau udah ATH lama terus turun panjang, momentumnya udah lewat".
    // The wide range below is for what happens *after* entry, not a licence to
    // enter something already bleeding.
    momentumMin: 0,
    momentumMax: 400,
    volume1hMin: 10_000,
    volumeTvlMin: 0.3,
    feeTvlMin: 1,
    // The article gives four rigs, each with its own depth: BS 50 → −50/−60%,
    // BS 80 → −60/−70%, BS 100 → −70/−80% ("paling umum dipake buat meme
    // coin"), BS 400+ → −80% and beyond. All four are in play.
    binStepMin: 50,
    binStepMax: 400,
    baseFeeMin: 2,
    // Fees must accrue in base + quote, not quote only: "karna kita cari
    // rebound pas dia turun jadi pas rebound pnl kedorong sama fee kita yang
    // belum di claim". Quote-only fees forfeit that push.
    requireBothTokenFees: true,
    // The Bubblemaps check itself: RugCheck's transfer-linked wallet groups,
    // measured against the article's own threshold — "kalau ada satu cluster
    // gede yang pegang 40%+ supply, bahaya". The dangerous example walked
    // through there was a single cluster of 371 wallets holding 47.95%.
    maxClusterPct: 40,
    // Top-10 concentration is a different, coarser cut of the same worry, kept
    // because a cluster graph can miss supply parked in unlinked whales.
    top10HoldersMax: 40,
    devBalanceMax: 1,
    holdersMin: 500,
    requireMintOff: true,
    // Crude wash-trade guard. The article checks whether the buyers and
    // sellers are the same handful of wallets; swaps per unique trader is the
    // only shape of that visible from the API. Live median sits near 1.7, so
    // this only catches the pathological end.
    maxSwapsPerTrader: 6,
    ageHoursMax: 72,
    requireFreezeOff: true,
    maxRisk: 78,
    // The 100-point model is built for pools this preset never trades. An
    // unverified memecoin forfeits the verification points outright and rarely
    // sustains the 2x volume/TVL that tops out volume quality, so a strong
    // candidate lands in the fifties: the two pools that inspired this preset
    // scored 53 and 45 while they were being farmed. Reusing the 65/80 ladder
    // would gate every alert off and leave the preset inert.
    minScore: 48,
    hotScore: 60,
    watchScore: 48,
    earlyScore: 38,
    cooldownMinutes: 10,
  },
});

export const DEFAULT_PRESET = "yanman";

/**
 * Resolve a preset id that may come from localStorage, an env var, or an API
 * payload. Anything unknown — including the retired "safer" id still sitting in
 * browsers that used an earlier build — collapses to the default rather than
 * indexing PRESETS to undefined.
 */
export const resolvePresetId = (value) => (PRESETS[value] ? value : DEFAULT_PRESET);

/**
 * Where a score sits on the active preset's ladder. The ladder is per-preset
 * because the 100-point model does not score every kind of pool over the same
 * range — see the note on PRESETS.auzhinta. This is the single source for the
 * row badge, the Hot/Watch tabs, and the alert transitions, so the three can
 * never disagree about what a pool is.
 */
export function poolTier(score, presetInput) {
  const preset = typeof presetInput === "string" ? PRESETS[resolvePresetId(presetInput)] : presetInput;
  if (!Number.isFinite(score)) return "skip";
  if (score >= preset.hotScore) return "hot";
  if (score >= preset.watchScore) return "watch";
  if (score >= preset.earlyScore) return "early";
  return "skip";
}

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

const riskLevelRank = (level) => {
  const normalized = String(level || "").toLowerCase();
  if (["critical", "danger", "error", "high"].includes(normalized)) return 3;
  if (["warning", "warn", "medium"].includes(normalized)) return 2;
  if (["info", "low"].includes(normalized)) return 1;
  return 0;
};

const securityStatus = (items) => {
  if (!Array.isArray(items)) return null;
  const rank = items.reduce((highest, item) => Math.max(highest, riskLevelRank(item?.severity || item?.level)), 0);
  if (rank >= 3) return "danger";
  if (rank >= 2) return "warning";
  if (rank >= 1) return "info";
  return "clear";
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

  if (Number.isFinite(pool.top10HoldersPct)) {
    if (pool.top10HoldersPct >= 50) {
      risk += 20;
      flags.push({ type: "danger", label: `Top-10 holder sangat terkonsentrasi (${pool.top10HoldersPct.toFixed(1)}%)` });
    } else if (pool.top10HoldersPct >= 30) {
      risk += 12;
      flags.push({ type: "warning", label: `Top-10 holder terkonsentrasi (${pool.top10HoldersPct.toFixed(1)}%)` });
    } else {
      flags.push({ type: "success", label: `Top-10 holder ${pool.top10HoldersPct.toFixed(1)}%` });
    }
  } else {
    risk += 8;
    flags.push({ type: "warning", label: "Konsentrasi top-10 belum tersedia" });
  }

  if (Number.isFinite(pool.devBalancePct)) {
    if (pool.devBalancePct >= 10) {
      risk += 20;
      flags.push({ type: "danger", label: `Dev balance tinggi (${pool.devBalancePct.toFixed(1)}%)` });
    } else if (pool.devBalancePct >= 5) {
      risk += 10;
      flags.push({ type: "warning", label: `Dev balance perlu dipantau (${pool.devBalancePct.toFixed(1)}%)` });
    } else {
      flags.push({ type: "success", label: `Dev balance ${pool.devBalancePct.toFixed(1)}%` });
    }
  } else {
    flags.push({ type: "warning", label: "Dev balance belum tersedia" });
  }

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

  // Optional gates: a preset only pays for the checks it declares, so presets
  // written before these fields existed keep their exact behaviour. Each one
  // fails closed when the upstream value is missing — an unknown holder split
  // is a reason not to enter, not a reason to wave the pool through.
  if (Number.isFinite(preset.binStepMin)) {
    checks.push([pool.binStep >= preset.binStepMin, `Bin step ≥ ${preset.binStepMin}`]);
  }
  if (Number.isFinite(preset.binStepMax)) {
    checks.push([pool.binStep <= preset.binStepMax, `Bin step ≤ ${preset.binStepMax}`]);
  }
  if (Number.isFinite(preset.baseFeeMin)) {
    checks.push([pool.baseFeePct >= preset.baseFeeMin, `Base fee ≥ ${preset.baseFeeMin}%`]);
  }
  if (Number.isFinite(preset.maxClusterPct)) {
    checks.push([
      Number.isFinite(pool.clusterLargestPct) && pool.clusterLargestPct <= preset.maxClusterPct,
      `Cluster terbesar ≤ ${preset.maxClusterPct}%`,
    ]);
  }
  if (Number.isFinite(preset.top10HoldersMax)) {
    checks.push([
      Number.isFinite(pool.top10HoldersPct) && pool.top10HoldersPct <= preset.top10HoldersMax,
      `Top-10 holder ≤ ${preset.top10HoldersMax}%`,
    ]);
  }
  if (Number.isFinite(preset.devBalanceMax)) {
    checks.push([
      Number.isFinite(pool.devBalancePct) && pool.devBalancePct <= preset.devBalanceMax,
      `Saldo dev ≤ ${preset.devBalanceMax}%`,
    ]);
  }
  if (Number.isFinite(preset.ageHoursMax)) {
    checks.push([
      Number.isFinite(pool.ageHours) && pool.ageHours <= preset.ageHoursMax,
      `Umur pool ≤ ${preset.ageHoursMax} jam`,
    ]);
  }
  if (Number.isFinite(preset.holdersMin)) {
    checks.push([pool.holders >= preset.holdersMin, `Holder ≥ ${preset.holdersMin}`]);
  }
  if (preset.requireMintOff) {
    checks.push([pool.mintAuthorityDisabled === true, "Mint authority off"]);
  }
  if (preset.requireBothTokenFees) {
    checks.push([pool.feesInBothTokens === true, "Fee base + quote"]);
  }
  if (Number.isFinite(preset.maxSwapsPerTrader)) {
    checks.push([
      Number.isFinite(pool.swapsPerTrader) && pool.swapsPerTrader <= preset.maxSwapsPerTrader,
      `Swap per trader ≤ ${preset.maxSwapsPerTrader}`,
    ]);
  }

  const misses = checks.filter(([passed]) => !passed).map(([, label]) => label);
  return { passed: misses.length === 0, misses };
}

export function normalizePool(raw, momentum = {}, analytics = {}, rugCheck = null) {
  const { base, quote } = chooseTokens(raw.token_x, raw.token_y);
  const analyticsBaseToken = [analytics.token_x, analytics.token_y]
    .find((token) => token?.address === base.address);
  const tvl = number(raw.tvl);
  const volume1h = number(raw.volume?.["1h"]);
  const lpFees1h = number(raw.fees?.["1h"]);
  const protocolFees1h = number(raw.protocol_fees?.["1h"]);
  const priceChange1h = Number.isFinite(momentum.priceChange1h)
    ? momentum.priceChange1h
    : Number.isFinite(raw.price_change_1h)
      ? raw.price_change_1h
      : null;
  const jupShieldWarnings = Array.isArray(analyticsBaseToken?.warnings)
    ? analyticsBaseToken.warnings.map((warning) => ({
      type: String(warning?.type || "UNKNOWN"),
      message: String(warning?.message || "Peringatan token"),
      severity: String(warning?.severity || "warning").toLowerCase(),
    }))
    : null;
  const rugCheckRisks = Array.isArray(rugCheck?.risks)
    ? rugCheck.risks.map((riskItem) => ({
      name: String(riskItem?.name || "Risk"),
      description: String(riskItem?.description || ""),
      level: String(riskItem?.level || "warning").toLowerCase(),
      score: optionalNumber(riskItem?.score),
      value: String(riskItem?.value || ""),
    }))
    : null;

  // Meteora collect_fee_mode: 0 accrues fees in both tokens, 1 in the quote
  // only. Null when the pool config did not carry the field at all.
  const collectFeeMode = optionalNumber(raw.pool_config?.collect_fee_mode);

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
    binStep: number(raw.pool_config?.bin_step),
    baseFeePct: number(raw.pool_config?.base_fee_pct),
    dynamicFeePct: number(raw.dynamic_fee_pct),
    collectFeeMode,
    feesInBothTokens: collectFeeMode === null ? null : collectFeeMode === 0,
    // Only the discovery API reports mint authority, so this stays null when
    // that call failed — a preset that requires it will fail closed.
    mintAuthorityDisabled: typeof analyticsBaseToken?.has_mint_authority === "boolean"
      ? !analyticsBaseToken.has_mint_authority
      : null,
    totalLps: optionalNumber(analytics.total_lps),
    swaps1h: optionalNumber(analytics.swap_count),
    traders1h: optionalNumber(analytics.unique_traders),
    // Wash-trade shape: real flow spreads across many wallets, a faked one
    // bounces between a few. Null unless both counts arrived and are non-zero.
    swapsPerTrader: number(analytics.swap_count) > 0 && number(analytics.unique_traders) > 0
      ? number(analytics.swap_count) / number(analytics.unique_traders)
      : null,
    top10HoldersPct: optionalNumber(analyticsBaseToken?.top_holders_pct),
    devBalancePct: optionalNumber(analyticsBaseToken?.dev_balance_pct),
    jupShieldWarnings,
    jupShieldStatus: securityStatus(jupShieldWarnings),
    jupShieldRank: jupShieldWarnings === null ? null : Math.max(0, ...jupShieldWarnings.map((warning) => riskLevelRank(warning.severity))),
    organicScore: optionalNumber(analyticsBaseToken?.organic_score),
    organicScoreLabel: analyticsBaseToken?.organic_score_label
      ? String(analyticsBaseToken.organic_score_label).toLowerCase()
      : null,
    rugCheckScore: optionalNumber(rugCheck?.score_normalised ?? rugCheck?.score),
    rugCheckRisks,
    rugCheckRiskCount: rugCheckRisks?.length ?? null,
    rugCheckStatus: securityStatus(rugCheckRisks),
    rugCheckLpLockedPct: optionalNumber(rugCheck?.lpLockedPct),
    // Connected wallet clusters — the Bubblemaps check in numbers. Null means
    // the graph could not be read at all, which is different from a token that
    // was read and has no clusters (0).
    clusterLargestPct: optionalNumber(rugCheck?.clusters?.largestPct),
    clusterLargestWallets: optionalNumber(rugCheck?.clusters?.largestWallets),
    clusterCount: optionalNumber(rugCheck?.clusters?.count),
    clusteredSupplyPct: optionalNumber(rugCheck?.clusters?.clusteredPct),
    currentPrice: number(raw.current_price),
    priceChange1h,
    sparkline: Array.isArray(momentum.sparkline) ? momentum.sparkline : [],
  };

  const score = calculateScore(normalized);
  const risk = calculateRisk(normalized);
  // Payload-level default only. Anything rendering against a chosen preset
  // should call poolTier with that preset rather than read this field.
  const status = poolTier(score.total, PRESETS[DEFAULT_PRESET]);

  return {
    ...normalized,
    score: score.total,
    scoreBreakdown: score.breakdown,
    risk: risk.value,
    riskFlags: risk.flags,
    status,
    qualifies: {
      yanman: evaluatePreset(normalized, PRESETS.yanman),
      auzhinta: evaluatePreset(normalized, PRESETS.auzhinta),
    },
  };
}
