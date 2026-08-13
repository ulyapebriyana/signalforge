import { emptyGmgnFields } from "./gmgn.js";
import { bandOf, gateLabel, SWANNY_RUBRIC } from "./swannyRubric.js";

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
  // Modelled on the Meteora DLMM posts of @0xVanChu, who farms one thing: a
  // token that is already running, in the highest-fee pool available, for
  // minutes to hours rather than days. The posts name ranges (−10%/−15% short
  // spot, −42% medium, −59%/−65% slow bid-ask) but never a bin step, so no bin
  // step gate is declared here — inventing one would misrepresent the source.
  //
  // What the posts *do* state outright is the mistake that cost them 4 SOL: a
  // token doing ~$30K of volume per minute, entered through an existing 1% fee
  // pool instead of a 3% one, pushed out of range on a red candle. Their own
  // verdict was that a 3% pool at that volume "would have compensated for
  // around 90% of the losses". The counter-example is the same setup done
  // right: +8 SOL in three minutes on a 10% fee pool. So the fee tier, not the
  // token, is the gate that matters, and baseFeeMin exists for that reason.
  //
  // baseFeeMin is 2 rather than the 3 that lesson names, because 2% is the
  // lowest tier they have posted entering on purpose (a $LUNA position moved
  // 5% → 2% as it calmed). A gate should not exclude a rig the source is on
  // record using.
  vanchu: {
    id: "vanchu",
    label: "VanChu-like",
    // Their runners span microcap shitcoins to $ANSEM at a $50M cap, but the
    // upstream candidate filter in server/index.mjs already drops anything over
    // $15M before scoring, so a higher ceiling here would be decorative.
    marketCapMin: 300_000,
    marketCapMax: 15_000_000,
    // Positions are 20–100 SOL, so a dust pool cannot absorb one. The ceiling
    // is deliberately absent: thin TVL against heavy volume is the whole edge.
    tvlMin: 15_000,
    // Entry is always into a move already happening — "saw a pump and volumes
    // that were impossible to ignore". Never into something bleeding.
    momentumMin: 15,
    momentumMax: 900,
    // A runner, not a busy pool. These three are one rule read three ways:
    // heavy absolute flow, turning the pool over several times an hour, and
    // actually paying for it. With a 2% base fee, 3x turnover implies roughly
    // 6% fee/TVL, so feeTvlMin is a floor these already imply rather than a
    // second, independent squeeze.
    volume1hMin: 250_000,
    volumeTvlMin: 3,
    feeTvlMin: 2,
    baseFeeMin: 2,
    requireFreezeOff: true,
    // The highest ceiling of any preset, and not an oversight. This is the
    // "heart attack" play by name: a fresh unverified token at extreme
    // momentum collects risk points for exactly the traits being farmed.
    maxRisk: 88,
    // Unlike Auzhinta-like, these pools score *well* on the 100-point model —
    // momentum, fee efficiency, and volume quality are 70 of the 100 points and
    // this preset gates hard on all three. So the ladder stays near the shared
    // default instead of dropping into the fifties.
    minScore: 65,
    hotScore: 82,
    watchScore: 68,
    earlyScore: 55,
    // Minutes matter here in a way they do not for the slower presets.
    cooldownMinutes: 5,
  },
  // Modelled on the token filter @skolmbeaghNFT published for fresh migrations,
  // the one applied in 20–30 seconds before any liquidity is committed.
  //
  // The thread it comes from is a DAMM v2 strategy, and this scanner only reads
  // DLMM pools (server/index.mjs talks to dlmm.datapi.meteora.ag). That is not
  // a mismatch to paper over: what is reproduced here is the *token selection*
  // half, which is stated as a numbered checklist and is about which token
  // deserves liquidity, not about which venue receives it. The position
  // construction half of the thread — 6% fee tier, exponential fee scheduler,
  // exit at 45 minutes — is a DAMM v2 pool setting a DLMM screener cannot see,
  // and is deliberately not faked into these numbers.
  //
  // The thread is also from June 2025 and its author has since moved mostly to
  // DLMM. Treat the thresholds as transcribed, not as currently endorsed.
  //
  // EXPECT THIS PRESET TO BE QUIET, and not because the numbers are wrong. It
  // is a 30-minute window on a narrow cap band, so most scans will hold no pool
  // that qualifies. What changed on 2026-08-13 is that such a pool can now
  // reach scoring at all:
  //
  //   - Age. loadPools used to take only the top pools by 1h volume, where the
  //     youngest admissible pool was 1.18h old — nothing inside a 30-minute
  //     window ever arrived. It now also reads a page sorted by
  //     fee_tvl_ratio_1h:desc, which is where fresh migrations rank; on the
  //     verification run that page put two 12-minute-old pools in its top three.
  //   - Market cap. Still thin: only 1 of 48 volume-page candidates sat under
  //     $200K. The upstream $50K floor is not a limit for this preset, whose own
  //     marketCapMin is the same $50K.
  //   - GMGN. The sniper/insider/bundler gates fail closed, and the API filled
  //     0–6 of ~35 tokens across local runs. GMGN_API_KEY is set on the VPS.
  //
  // It is committed as a faithful transcription rather than tuned into firing,
  // because loosening it to match the pipeline would describe a play nobody
  // posted.
  skolmbeagh: {
    id: "skolmbeagh",
    label: "Skolmbeagh-like",
    // "Coins over $200K gradually start opening DLMM pools, and since our
    // losses increase when the coin price drops, I prefer to avoid them." The
    // floor is the low end of the companion screener filter (50k–300k).
    marketCapMin: 50_000,
    marketCapMax: 200_000,
    // Positions are 0.05–0.3 SOL, so almost any live pool is deep enough. This
    // only excludes pools with no liquidity at all.
    tvlMin: 1_000,
    // "The coin's price should appear to have moved organically." A fresh
    // migration already down on the hour is not that; the ceiling is wide
    // because a migration candle legitimately is not.
    momentumMin: 0,
    momentumMax: 2_000,
    volume1hMin: 20_000,
    volumeTvlMin: 1,
    feeTvlMin: 2,
    // The hard clock, and the single most load-bearing number in the thread:
    // "The token should have migrated within the last 30 minutes. After an
    // hour, the fee yield drops from around 50% to about 20%."
    ageHoursMax: 0.5,
    // "Top 10 Holders: Should be between 10% and 35%" — a floor on
    // concentration, which no other preset has. It is not a typo in the
    // source: on a just-migrated token a top-10 share that low means the supply
    // is scattered across bots rather than held by anyone.
    top10HoldersMin: 10,
    top10HoldersMax: 35,
    // "Dev: If the dev holds tokens, I stay away." Zero, not "low".
    devBalanceMax: 0,
    // "Sniper / Insiders / Bundle: each below 15%." Loose on purpose — the
    // thread says so — because the candidates are already filtered down to
    // ~$100K caps where cleaner numbers barely exist.
    sniperPctMax: 15,
    insidersPctMax: 15,
    bundlerPctMax: 15,
    requireFreezeOff: true,
    // A sub-30-minute pool collects risk points for being sub-30-minutes old,
    // thinly held, and violently priced — the exact traits selected for. A
    // ceiling tuned like the other presets would gate the whole preset off.
    maxRisk: 92,
    // Between Auzhinta-like's fifties and the shared default. A fresh pool
    // takes full freshness and, when it is paying at all, near-full fee and
    // volume points, but forfeits verification and the holder bonus — so the
    // reachable band sits roughly 50–85.
    minScore: 55,
    hotScore: 70,
    watchScore: 55,
    earlyScore: 42,
    cooldownMinutes: 5,
  },
  // Modelled on @SwannyDeFi's DLMM Checker, the pre-filter every token is put
  // through before it earns any research time. It is a screen, not a play:
  // where the other two presets describe a way to open a position, this one
  // only answers whether a token is worth looking at at all.
  //
  // That difference shows in the shape. The rubric it comes from paints twelve
  // metrics green / yellow / red rather than passing or failing them, so the
  // gate here rejects red and tolerates yellow — the way the tool is actually
  // read. The pool-level checks below are deliberately loose: the rubric says
  // nothing about bin step, fee tier, or volume, and inventing limits it never
  // states would misrepresent it.
  swanny: {
    id: "swanny",
    label: "Swanny-like",
    // Mirrors the rubric's own red line for market cap rather than adding a
    // second, different one.
    marketCapMin: 100_000,
    marketCapMax: 15_000_000,
    tvlMin: 500,
    momentumMin: -95,
    momentumMax: 2_000,
    volume1hMin: 1_000,
    volumeTvlMin: 0,
    feeTvlMin: 0,
    requireFreezeOff: true,
    requireMintOff: true,
    // The twelve-row rubric, evaluated as bands. See shared/swannyRubric.js.
    rubric: SWANNY_RUBRIC,
    maxRisk: 100,
    // Screening quality and confidence score are different questions, and this
    // preset only answers the first. The ladder therefore stays on the shared
    // default rather than pretending the rubric produces a score.
    minScore: 50,
    hotScore: 80,
    watchScore: 65,
    earlyScore: 50,
    cooldownMinutes: 20,
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
  // A *floor* on top-10 concentration, which reads backwards until you know
  // what it screens: on a just-migrated token, supply too evenly spread means
  // it is spread across snipers and bundlers rather than held by holders.
  if (Number.isFinite(preset.top10HoldersMin)) {
    checks.push([
      Number.isFinite(pool.top10HoldersPct) && pool.top10HoldersPct >= preset.top10HoldersMin,
      `Top-10 holder ≥ ${preset.top10HoldersMin}%`,
    ]);
  }
  // Sniper, insider, and bundler share. These come from GMGN and are null
  // without a key, so like every other unreadable metric they fail closed —
  // a preset that declares them goes quiet rather than waving pools through.
  if (Number.isFinite(preset.sniperPctMax)) {
    checks.push([
      Number.isFinite(pool.gmgnSniperPct) && pool.gmgnSniperPct <= preset.sniperPctMax,
      `Sniper ≤ ${preset.sniperPctMax}%`,
    ]);
  }
  if (Number.isFinite(preset.insidersPctMax)) {
    checks.push([
      Number.isFinite(pool.gmgnInsidersPct) && pool.gmgnInsidersPct <= preset.insidersPctMax,
      `Insider ≤ ${preset.insidersPctMax}%`,
    ]);
  }
  if (Number.isFinite(preset.bundlerPctMax)) {
    checks.push([
      Number.isFinite(pool.gmgnBundlerPct) && pool.gmgnBundlerPct <= preset.bundlerPctMax,
      `Bundler ≤ ${preset.bundlerPctMax}%`,
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
  if (Array.isArray(preset.rubric)) {
    // Reject red, tolerate yellow — how the source tool is read in practice.
    // Unknown counts as red: an unread metric is not a clean one.
    for (const spec of preset.rubric) {
      const tier = bandOf(pool[spec.key], spec);
      checks.push([tier === "green" || tier === "yellow", gateLabel(spec)]);
    }
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

export function normalizePool(raw, momentum = {}, analytics = {}, rugCheck = null, gmgn = null) {
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
    // Age of the token itself, distinct from ageHours which is the pool's. A
    // fresh pool on a year-old token is routine, and the two presets disagree
    // about which one matters, so both are carried.
    tokenAgeHours: ageHoursFrom(analyticsBaseToken?.created_at),
    ...emptyGmgnFields(),
    ...(gmgn || {}),
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
    // Derived from PRESETS rather than listed, so a preset added later cannot
    // be missing here — which is exactly the bug this replaced.
    qualifies: Object.fromEntries(
      Object.values(PRESETS).map((preset) => [preset.id, evaluatePreset(normalized, preset)]),
    ),
  };
}
