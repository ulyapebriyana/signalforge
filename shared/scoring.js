import { emptyGmgnFields } from "./gmgn.js";
import { deriveMarketRead } from "./marketRead.js";

export const PRESETS = Object.freeze({
  // The "Heart Attack" play, named for how it feels rather than how it works:
  // the tightest survivable range on a token that is already ripping, held for
  // minutes, exited before the dump. It is community slang from the LP Army
  // circle rather than a Meteora term, popularised by @_mythicalpotato and run
  // publicly by @0xVanChu and @0xMrBeefman.
  //
  // What the sources actually state, and what is gated on below:
  //   - Range −5% to −15%, most often −10%. @0xMrBeefman: "one of the criteria
  //     for using a 'tight range' of −5-15% is the token ripping upward with
  //     almost no corrections". @0xVanChu on his +101 SOL $TOAD position:
  //     "realized it was more effective to work in the −10%" band. A range is
  //     a position setting, not a pool property, so no gate here can express
  //     it — it belongs in the execution notes, not the screener.
  //   - The trigger is a five-minute volume spike. @0xMrBeefman's algorithm
  //     opens with "say a runner launches and on the 5 minute I see 1M+ in
  //     trading volume". `volume5mMin` is the gate the user asked for and the
  //     one this whole preset turns on.
  //   - Stage 1 is always a rugpull check before any liquidity moves —
  //     "quickly going through holders, distribution". That is what the dev,
  //     sniper, insider, bundler, and top-10 gates below are, borrowed from
  //     Skolmbeagh-like where the same checklist is spelled out in numbers.
  //   - LP Army Academy's own verdict on the play: "extremely high risk and
  //     more like gambling. Not recommended to attempt." Hence the loosest
  //     risk ceiling in the app, and this comment.
  //
  // Several numbers were set, moved, or removed by the user's explicit
  // instruction rather than transcribed, and each is called out again at its
  // own gate below: `volume5mMin` (40_000, not @0xMrBeefman's 1M),
  // `marketCapMin` (lowered from $300K to $150K, then to $100K), `tvlMin`
  // (removed outright, was $10K), `volume1hMin` (removed outright, was
  // lowered from $200K to $50K to $25K before that), `volumeTvlMin` (removed
  // outright, was loosened from 3x to 1x before that), `feeTvlMin` (removed
  // outright, was 5%), `baseFeeMin` (removed outright, was 2%),
  // `devBalanceMax` (loosened from 0 to 10%), `ageHoursMax` (removed
  // outright, was 24h), and `bundlerPctMax` (loosened from Skolmbeagh-like's
  // 15% to 50%, then to 80%). None of these are transcription errors — they are recorded
  // here so a later reader does not mistake them for source-backed numbers.
  //
  // NEEDS `GMGN_API_KEY`. Volume 5m, sniper, insider, and bundler all come from
  // GMGN and every one of them fails closed, so without a key this preset is
  // silent — the same posture as Skolmbeagh-like.
  //
  // The gates below are only half of what makes this preset usable. The other
  // half is the view: ScannerView gives Heart Attack its own default columns and
  // opens sorted by token burst rather than by score, because a play worked in
  // minutes is decided on the rate the token is running at right now, not on a
  // 100-point model built around a whole hour. Nothing in that view is a gate —
  // it changes what you see first, never what qualifies — which is why it was
  // added here rather than as yet another threshold on a preset the user has
  // spent several commits deliberately loosening.
  heartattack: {
    id: "heartattack",
    label: "Heart Attack",
    // The gate the whole preset turns on. GMGN's `price.volume_5m`, finer than
    // anything Meteora exposes — Meteora stops at one hour, which is far too
    // coarse for a play measured in minutes.
    volume5mMin: 40_000,
    // Lowered from the original $300K to $150K, then to $100K, on the user's
    // explicit instruction — below Skolmbeagh-like's $50K–$200K floor now, so
    // a runner can qualify here even earlier in its life than the second cut
    // assumed. The Metlex "HEART ATTACK · RUNNER" alert that prompted this
    // preset showed MC $1.68M, still comfortably inside the $100K–$15M range.
    marketCapMin: 100_000,
    marketCapMax: 15_000_000,
    // "Ripping upward with almost no corrections." Entry is never into
    // something flat and never into something bleeding.
    // Lowered from 20% to 10% on the user's explicit instruction.
    momentumMin: 10,
    momentumMax: 2_000,
    // No tvlMin, volume1hMin, volumeTvlMin, or feeTvlMin gate, on the user's
    // explicit instruction — each was previously set (tvlMin was $10K; the
    // other three were $25K, 1x, 5% respectively) but the user decided the 5m
    // spike gate above already does the heavy lifting on flow and removed all
    // four outright rather than loosen them further. Thin liquidity against
    // violent flow was the original rationale for the TVL floor, exactly as
    // in VanChu-like, but it no longer gates here.
    //
    // An activeTvlMin ($2,000) and avgVolumePerMinMin ($1,000) gate were
    // added here briefly on the user's explicit instruction, then removed
    // again by the same instruction — the pool-wide TVL/volume floors above
    // stay absent rather than being replaced by a narrower pair.
    //
    // No baseFeeMin gate either, on the same explicit instruction. VanChu-like's
    // fee-tier lesson — right token, right volume, wrong fee tier, pushed out
    // of range by one red candle — was the reason for the earlier 2% floor,
    // but the user removed it outright rather than loosen it further.
    // No age gate, on the user's explicit instruction. The earlier 24h ceiling
    // was an inference rather than a stated rule — no source names a maximum
    // age — and the user removed it outright rather than widen it further.
    //
    // Beefman's Stage 1, in numbers. Borrowed from Skolmbeagh-like rather than
    // re-derived, because it is the same checklist doing the same job: make
    // sure the thing cannot wipe you out with a single candle.
    // Loosened from 0 to 10 on the user's explicit instruction — a token where
    // the dev still holds a small residual balance is no longer disqualified
    // outright.
    devBalanceMax: 10,
    sniperPctMax: 15,
    insidersPctMax: 15,
    // Loosened from Skolmbeagh-like's 15% to 50%, then to 80%, both on the
    // user's explicit instruction. This is a real weakening of the rugpull
    // check, not a rounding difference — at 80% a pool can clear this gate
    // with four-fifths of its volume run through bundled buys. Left in
    // rather than argued with, but named so it reads as a deliberate
    // choice, not an oversight.
    bundlerPctMax: 80,
    // Only the ceiling, not Skolmbeagh-like's unusual floor. That floor exists
    // because supply spread too thin across a just-migrated token means bots
    // hold it; a runner that has already moved is past the moment that reads.
    top10HoldersMax: 35,
    requireFreezeOff: true,
    // The loosest ceiling in the app, above even Skolmbeagh-like's 92. A pool
    // that qualifies here is young, unverified, thinly held, and violently
    // priced — it collects risk points for every single trait being farmed.
    // Anything tighter would gate the preset off entirely, and the honest way
    // to say that is in the number, not by quietly softening the risk model.
    maxRisk: 95,
    // These pools score *high* on the 100-point model — extreme momentum, fee
    // efficiency far past the 2% cap, full volume quality, and full freshness
    // are 80 of the 100 points, and this preset gates hard on all four. The
    // ladder therefore sits above VanChu-like's rather than below it.
    minScore: 65,
    hotScore: 85,
    watchScore: 70,
    earlyScore: 55,
    // The shortest cooldown in the app. A play that exits in minutes cannot
    // wait five for its second alert.
    cooldownMinutes: 3,
  },
  // Modelled on @EvilPanda ("Logical TA"), the LP Army DLMM screener whose whole
  // public output is a numbered checklist rather than a vibe. Sits between
  // Heart Attack and Slow Wallet on purpose: fresh memecoins, screened hard
  // before entry, held on 15-minute charts rather than either a 5-minute spike
  // or a week-old proven pair. His own words on the gap this preset fills —
  // "Do I still get rugged with this screener? Yes I still get rugged
  // sometimes... but it also screens out the rugs that would make me lose all
  // those gains in the first place."
  //
  // Every gate below traces to one of four sources, cited inline:
  //   - SCREEN (28 Jul 2025, "How to screen memecoins for DLMM the LogicalTA
  //     way", 13-tweet thread) — the original rugcheck+GMGN checklist and its
  //     12 numbered data points.
  //   - SUMMARY (26 Dec 2025, "Summary of Evil Panda Strat from Advanced
  //     Bootcamp #7") — his own consolidated 4-part cheat sheet: coin
  //     selection, entry, exit, emotions/risk. The single most authoritative
  //     source here because it is *his* summary of the whole play, not a
  //     one-off thread.
  //   - AVOID (6 Feb 2026, "Coins to Avoid doing SOL Sided DLMM", X Article) —
  //     his most recent update, tightened from SCREEN on a few numbers.
  //   - EXIT (5 Sep 2025, "Simple DLMM Exit Strategies") — the indicator
  //     confluence (Supertrend + RSI(2) + MACD + Bollinger) this app has no
  //     chart engine to evaluate. Not a gate anywhere below; noted so a later
  //     reader does not go looking for it.
  //
  // What this preset cannot express: entry/exit here is a chart pattern
  // (price crossing Supertrend, then RSI(2)/MACD/BB confluence on the way
  // out), not a snapshot number. `momentumMin`/`momentumMax` are unconditional
  // in `evaluatePreset` — every preset must set both — so they are set wide
  // enough to be non-binding rather than faked into a meaningful band: -90
  // excludes only a chart already in freefall (arguably broken by his own
  // rugcheck-adjacent judgement, not something to enter), 1000 excludes
  // nothing his 15-minute-chart, non-runner-chasing approach would touch.
  // Pool bin-width (his Fib-retracement-to-bins
  // sizing, e.g. 80/100/125 bins at -86% to -94% one-sided) is a position
  // setting, same reasoning as the range note on Heart Attack above — nothing
  // here can gate it. Position-level discipline from SUMMARY Part 4 (spread
  // capital across 6+ positions, no new entries after 6pm, sit out a day after
  // a loss) is portfolio-level, not pool-level, and belongs nowhere in a
  // preset at all.
  //
  // Two numbers are NOT from a source and are named here so they read as
  // deliberate rather than transcribed:
  //   - `marketCapMax` (2,000,000): SCREEN/SUMMARY give a floor (250k) but no
  //     ceiling. Set at Slow Wallet's own floor so the two presets describe
  //     adjacent bands instead of overlapping — a coin that grows past this is
  //     Slow Wallet's to evaluate, not this preset's.
  //   - `totalFeesMin` unit: SUMMARY says "GMGN -> fees over 30" with no unit
  //     stated. Read as SOL because the field it gates
  //     (`gmgnTotalFeesSol`/`data.total_fee`) is GMGN's own total-fee figure
  //     and carries no separate USD reading anywhere in this codebase — worth
  //     confirming against a live GMGN token page before trusting this gate.
  //
  // `insidersPctMax` moved across his own posts and is left at the middle
  // value rather than the newest one: SCREEN said "more than 5% is a red
  // flag", SUMMARY said "Insiders < 10%", AVOID (newest) says "Above 0% is a
  // red flag". 0% would fail almost every real pool outright, so SUMMARY's
  // 10 — his own cheat-sheet number, not a one-off aside — is what is gated on
  // here; AVOID's tightening is recorded rather than silently adopted.
  //
  // NEEDS `GMGN_API_KEY`, same as Heart Attack: totalFeesMin, phishingPctMax,
  // freshWalletPctMax, bundlerPctMax, and insidersPctMax are all GMGN-sourced
  // and fail closed without a key, so this preset goes quiet rather than
  // waving pools through.
  mediumwallet: {
    id: "mediumwallet",
    label: "Medium Wallet",
    // SUMMARY Part 1: "Dexscreener Filter -> 250k MC & 1,000,000 24h Volume".
    marketCapMin: 250_000,
    // Not sourced — see the note above.
    marketCapMax: 2_000_000,
    // Mandatory field, not really a gate — see the note above.
    momentumMin: -90,
    momentumMax: 1_000,
    volume24hMin: 1_000_000,
    // SUMMARY Part 1: "GMGN -> fees over 30". See the unit note above.
    totalFeesMin: 30,
    // SUMMARY: "phising < 30%". AVOID: "Phishing - Above 30% is a red flag".
    // The one number that never moved across sources.
    phishingPctMax: 30,
    // SUMMARY: "Bundling < 60%". AVOID: "above 60% is a red flag" — also
    // unmoved.
    bundlerPctMax: 60,
    // SUMMARY: "Insiders < 10%". See the note above on why this is 10 and not
    // AVOID's newer, stricter "> 0%".
    insidersPctMax: 10,
    // SUMMARY: "Top10 < 30%". AVOID: "above 30% is a red flag" — unmoved.
    top10HoldersMax: 30,
    // AVOID: "Above 5% is a red flag, but generally if Dev has even 1% supply
    // is a red flag cos they can dump anytime." The hard line is 5; his own
    // text admits 1-5% is already worse than ideal, which a single ceiling
    // cannot express, so it is recorded here instead.
    devBalanceMax: 5,
    // SCREEN, data point 1-2: "For a new coin, usually we will see 500-3000
    // holders, any number below or above warrants a red flag." A floor and a
    // ceiling together, not just a floor — too many holders on a coin this
    // young reads as already-played-out.
    holdersMin: 500,
    holdersMax: 3_000,
    // SCREEN, data point 10: "Number of Fresh wallets(8) divide by
    // holders(2) - Above 40% is a red flag." Gated as the ratio his own point
    // 10 computes, not the raw count from point 8 — this codebase has no raw
    // fresh-wallet-count field to gate on.
    freshWalletPctMax: 40,
    // Inferred baseline hygiene rather than a numbered rule of his — every
    // rugcheck screenshot across his threads shows these already closed on
    // the coins he treats as clean, the same standing assumption Slow Wallet
    // makes for "proven".
    requireFreezeOff: true,
    requireMintOff: true,
    // SUMMARY Part 4: "I prefer to only use the 15mins as it gives me time to
    // do other stuffs and no need to keep watching the charts." His own
    // chart timeframe, taken directly as the alert cadence.
    cooldownMinutes: 15,
    // Not from a source — EvilPanda does not use a 0-100 risk model. Set at
    // the midpoint between Heart Attack (95) and Slow Wallet (45): this tier
    // screens harder than a runner but still trades coins young enough that
    // Slow Wallet's ceiling would be dishonest.
    maxRisk: 65,
    // Calibrated against data/scan-log.db rather than a live retune like Slow
    // Wallet's: sliced to marketCap $250k-$2M and holders 500-3000 (this
    // preset's own MC/holders band), 2,307 scan-rows across 29 distinct pools
    // over the local log's full window. Score quartiles there were
    // 17-21 / 21-26 / 26-44 / 44-96, median ~26. This is a starting point, not
    // a full retune — scan_log.js does not persist gmgn_phishing/fresh_wallet/
    // total_fee/insiders/bundler/top10/dev_balance, so the GMGN-sourced gates
    // above could not be backtested the way Slow Wallet's were. Revisit once
    // this preset has run long enough to log its own hits.
    minScore: 30,
    hotScore: 55,
    watchScore: 38,
    earlyScore: 24,
  },
  // Modelled on @0xVanChu's *other* wallet — the one he says takes "noticeably
  // less time and nerves" than the Action Wallet: "Bid-Ask on more proven
  // tokens, without the constant race for new shitcoins and without the need to
  // stare at the chart."
  //
  // This is NOT a reconstruction of a published checklist — he never posted one
  // for Slow Wallet, only fragments. The one concrete trade he did share: $TOAD,
  // Bid-Ask, range −42%, 20,000 USDC deposited, ~3% return over an 11-hour hold,
  // price staying inside a 15% band the whole time. The thresholds below are a
  // synthesis around those fragments at the user's request, not a transcription.
  //
  // Retuned 2026-08-19, on the user's instruction to make this the app's one
  // serious preset and to maximise it on safe pairs. The retune was measured,
  // not guessed: 9,563 scan-log rows over ~2h showed the preset clearing 16
  // times (0.17%), and every binding gate was an *activity* gate, not a safety
  // one — Vol 1h failed 82% of evaluations, Fee/TVL 79%, Vol/TVL 70%. The
  // safety gates were barely the constraint at all: 27 of 80 pools cleared all
  // of them. That is the shape of a preset asking a deep, verified, week-old
  // pool to churn like a fresh memecoin, which it never does. So the trade made
  // here is deliberate and runs in both directions at once: the activity floors
  // come down to what a calm pool actually pays, and the safety side gets three
  // gates it did not have before. Verified live against a 96-pool scan on the
  // widened pipeline — 3 pools clear, all at risk 4.
  slowwallet: {
    id: "slowwallet",
    label: "Slow Wallet",
    // "Proven tokens" as opposed to the shitcoins Action Wallet chases. The
    // ceiling was $15M and is now the pipeline's own $500M (see
    // server/index.mjs): every established pair on Solana sits above $15M, so
    // the old ceiling guaranteed this preset could never see the exact kind of
    // token it was written for. The floor stays — below $2M "proven" is a word
    // without content.
    marketCapMin: 2_000_000,
    marketCapMax: 500_000_000,
    // Lowered from $100K. The old floor was back-computed from the one deposit
    // size on record (20,000 USDC) needing to land without brutal price impact,
    // but it was excluding the best candidates the scan actually produced — a
    // $71K pool paying 0.183%/h at risk 4 is a better Slow Wallet position than
    // a $400K pool paying 0.006%/h, and $50K is still deep enough that a
    // position sized in single-digit SOL is nowhere near moving the price.
    tvlMin: 50_000,
    // The $TOAD position "traded sideways within 15% the whole" hold, and the
    // $LUNA position he named moved 5% → 2% as it calmed — this is a preset for
    // a token that is not doing anything violent right now. A wide bid-ask
    // range still earns on a mild pullback, so the floor is negative; the
    // ceiling excludes anything that has become a runner, which is what Heart
    // Attack is for.
    momentumMin: -15,
    momentumMax: 20,
    // The three activity gates below used to be three overlapping proxies for
    // the same question, each set where a memecoin lives rather than where a
    // proven pair does. They now split the question properly: volume1hMin is a
    // liveness floor (a pool doing $1K/hour cannot be traded out of), and
    // volumeTvlMin is the turnover shape that liveness floor cannot express
    // once TVL is past ~$100K.
    volume1hMin: 5_000,
    volumeTvlMin: 0.05,
    // The one number that decides whether this position is worth opening: is
    // the pool paying? 0.2%/h was back-computed from the $TOAD trade (20,000
    // USDC, ~3% over 11 hours ≈ 0.27%/h) and is simply not a rate a deep,
    // verified pair sustains — across two separate live scans the best such
    // pool reached 0.183%/h and the median sat near 0.02%. 0.03%/h is ~0.7%/day
    // on TVL, which on a position carrying this little risk is a real return,
    // and it still cuts two thirds of the safe universe as dead weight.
    feeTvlMin: 0.03,
    requireFreezeOff: true,
    // "Proven" implies the standard rug levers are already closed off, not
    // merely tolerated.
    requireMintOff: true,
    requireVerified: true,
    // An established community, not a just-migrated one.
    holdersMin: 1_000,
    // A pool has to have survived at least a week before it counts as "proven"
    // rather than "still in its violent early hours."
    ageHoursMin: 168,
    // The three gates added by the retune, all paid for by the loosened
    // activity floors above. Each is measured on a field that came back
    // populated for 40 of 40 pools in the live scan, which is why these three
    // and not the obvious fourth: RugCheck's own score was missing on 2 of 40,
    // and a fail-closed gate on a flaky upstream would make this preset blink
    // on and off for reasons that have nothing to do with the pool.
    //
    // Top-10 concentration is the one that earns its place immediately. It was
    // the only gate that rejected anything the old set would have passed: a
    // $240M token, verified, mint and freeze off, 1,000+ holders, week-old
    // pool — with 62.8% of supply in ten wallets. Provenance does not matter
    // here; a wallet holding 63% can end the position regardless of whose it is.
    top10HoldersMax: 40,
    // Stricter than Heart Attack's 10%, which is a gate on a token minutes old
    // where some dev balance is normal. A week-old proven token still holding
    // 5%+ in the dev wallet has had a week to distribute it and has not.
    devBalanceMax: 5,
    // Jupiter's organic score: how much of the flow is real rather than
    // manufactured. The median safe pool scores 86.6, so 70 is a floor on
    // genuineness rather than a demand for excellence — the cheapest available
    // guard against farming a pool whose volume is its own market maker.
    organicScoreMin: 70,
    // The lowest ceiling of any preset, and the point of the exercise — Slow
    // Wallet exists because Action Wallet costs "adrenaline and stress."
    maxRisk: 45,
    // Lowered with the gates. The 100-point model rewards momentum and
    // freshness and this preset gates against both, so a pool it likes scores
    // far below the shared 65/80 ladder: across the safe universe of the live
    // scan the median was 26 and the best pool reached 45, while the three
    // pools that cleared every gate scored 39, 30 and 27. A 35 floor would have
    // silenced two of those three.
    minScore: 26,
    hotScore: 38,
    watchScore: 30,
    earlyScore: 24,
    // No reason to ping often for a position meant to sit for hours.
    cooldownMinutes: 60,
  },
});

export const DEFAULT_PRESET = "slowwallet";

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
 * range — see the note on PRESETS.slowwallet. This is the single source for the
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

/**
 * The labels for the three gates that can flip between two consecutive scans,
 * built here rather than written out at each call site.
 *
 * A miss is identified by its rendered label — that is the only thing
 * `evaluatePreset` returns — so anything matching on one has to build the
 * string exactly as the check below does. Written twice, the two copies drift
 * silently the first time a threshold moves: change `volume5mMin` to 30_000
 * and a hand-written `"Vol 5m ≥ $40000"` simply stops matching, with no error
 * anywhere. The server's GMGN refresh rule depends on that match, so it reads
 * these instead of spelling the labels out.
 *
 * "Volatile" means the reading behind the gate can change inside one scan
 * interval: price moves, so momentum and the market-cap bounds move with it,
 * and five-minute volume is a rolling window. Everything else a preset gates
 * on — holder distribution, freeze authority, dev balance, sniper and bundler
 * share — is a property of the token that does not turn over in 15 seconds.
 */
export const gateLabels = Object.freeze({
  marketCapMin: (preset) => `MC ≥ $${preset.marketCapMin}`,
  marketCapMax: (preset) => `MC ≤ $${preset.marketCapMax}`,
  momentumMin: (preset) => `1h ≥ ${preset.momentumMin}%`,
  momentumMax: (preset) => `1h ≤ ${preset.momentumMax}%`,
  volume5mMin: (preset) => `Vol 5m ≥ $${preset.volume5mMin}`,
});

/** The subset of `gateLabels` a preset actually declares, as a Set of labels. */
export function volatileGateLabels(presetInput) {
  const preset = typeof presetInput === "string" ? PRESETS[resolvePresetId(presetInput)] : presetInput;
  const labels = new Set();
  for (const [key, render] of Object.entries(gateLabels)) {
    if (Number.isFinite(preset[key])) labels.add(render(preset));
  }
  return labels;
}

export function evaluatePreset(pool, presetInput) {
  const preset = typeof presetInput === "string" ? PRESETS[presetInput] : presetInput;
  if (!preset) throw new Error("Preset tidak dikenal");

  const checks = [
    [pool.marketCap >= preset.marketCapMin, gateLabels.marketCapMin(preset)],
    [pool.marketCap <= preset.marketCapMax, gateLabels.marketCapMax(preset)],
    [pool.priceChange1h !== null && pool.priceChange1h >= preset.momentumMin, gateLabels.momentumMin(preset)],
    [pool.priceChange1h !== null && pool.priceChange1h <= preset.momentumMax, gateLabels.momentumMax(preset)],
    [!pool.isBlacklisted, "Tidak di-blacklist"],
    [!preset.requireFreezeOff || pool.freezeAuthorityDisabled, "Freeze authority off"],
  ];

  // Optional gates: a preset only pays for the checks it declares, so presets
  // written before these fields existed keep their exact behaviour. Each one
  // fails closed when the upstream value is missing — an unknown holder split
  // is a reason not to enter, not a reason to wave the pool through.
  if (Number.isFinite(preset.tvlMin)) {
    checks.push([pool.tvl >= preset.tvlMin, `TVL ≥ $${preset.tvlMin}`]);
  }
  if (Number.isFinite(preset.volume1hMin)) {
    checks.push([pool.volume1h >= preset.volume1hMin, `Vol 1h ≥ $${preset.volume1hMin}`]);
  }
  // Dexscreener-style 24h floor — coarser than volume1hMin, and the window
  // EvilPanda's own coin-selection filter actually names. See
  // PRESETS.mediumwallet.
  if (Number.isFinite(preset.volume24hMin)) {
    checks.push([pool.volume24h >= preset.volume24hMin, `Vol 24h ≥ $${preset.volume24hMin}`]);
  }
  if (Number.isFinite(preset.volumeTvlMin)) {
    checks.push([pool.volumeTvl1h >= preset.volumeTvlMin, `Vol/TVL ≥ ${preset.volumeTvlMin}x`]);
  }
  if (Number.isFinite(preset.feeTvlMin)) {
    checks.push([pool.feeTvl1h >= preset.feeTvlMin, `Fee/TVL ≥ ${preset.feeTvlMin}%`]);
  }
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
  // Five-minute volume, the only sub-hour flow figure available — Meteora
  // stops at 1h. GMGN-backed, so it fails closed like the rows below it: no
  // key means no reading, and no reading is not a pass.
  if (Number.isFinite(preset.volume5mMin)) {
    checks.push([
      Number.isFinite(pool.gmgnVolume5m) && pool.gmgnVolume5m >= preset.volume5mMin,
      gateLabels.volume5mMin(preset),
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
  // GMGN's entrapment/phishing-wallet share. Same source call as sniper,
  // insider, and bundler above, so it fails closed the same way — it was
  // already being fetched and normalized (see gmgnPhishingPct in gmgn.js)
  // but no preset gated on it until PRESETS.mediumwallet.
  if (Number.isFinite(preset.phishingPctMax)) {
    checks.push([
      Number.isFinite(pool.gmgnPhishingPct) && pool.gmgnPhishingPct <= preset.phishingPctMax,
      `Phishing ≤ ${preset.phishingPctMax}%`,
    ]);
  }
  // GMGN's fresh-wallet share — how much of the holder set is brand-new
  // wallets, one more rat-trader-style pattern. Also already fetched and
  // unused before PRESETS.mediumwallet.
  if (Number.isFinite(preset.freshWalletPctMax)) {
    checks.push([
      Number.isFinite(pool.gmgnFreshWalletPct) && pool.gmgnFreshWalletPct <= preset.freshWalletPctMax,
      `Fresh wallet ≤ ${preset.freshWalletPctMax}%`,
    ]);
  }
  // GMGN's total fee figure, in SOL. A tokenomics-quality read distinct from
  // feeTvl1h: it is cumulative and venue-wide rather than this pool's last
  // hour, so it tells apart a coin with a real trading history from one
  // whose chart is wash volume or already dead.
  if (Number.isFinite(preset.totalFeesMin)) {
    checks.push([
      Number.isFinite(pool.gmgnTotalFeesSol) && pool.gmgnTotalFeesSol >= preset.totalFeesMin,
      `Total fee GMGN ≥ ${preset.totalFeesMin} SOL`,
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
  // The inverse of ageHoursMax: a floor for presets that want a pool to have
  // survived past its early hours rather than caught inside them. Unknown age
  // fails closed, same as the ceiling.
  if (Number.isFinite(preset.ageHoursMin)) {
    checks.push([
      Number.isFinite(pool.ageHours) && pool.ageHours >= preset.ageHoursMin,
      `Umur pool ≥ ${preset.ageHoursMin} jam`,
    ]);
  }
  if (preset.requireVerified) {
    checks.push([pool.isVerified === true, "Token terverifikasi"]);
  }
  // Jupiter's organic score — how much of the flow is genuine rather than
  // manufactured. Fails closed like every other optional gate: a token whose
  // flow could not be judged is not a token whose flow was judged clean.
  if (Number.isFinite(preset.organicScoreMin)) {
    checks.push([
      Number.isFinite(pool.organicScore) && pool.organicScore >= preset.organicScoreMin,
      `Organic score ≥ ${preset.organicScoreMin}`,
    ]);
  }
  if (Number.isFinite(preset.holdersMin)) {
    checks.push([pool.holders >= preset.holdersMin, `Holder ≥ ${preset.holdersMin}`]);
  }
  // The ceiling EvilPanda pairs with the floor above: on a coin this young,
  // too many holders reads as already-played-out rather than healthy. Paired
  // gate, only meaningful together — see PRESETS.mediumwallet.
  if (Number.isFinite(preset.holdersMax)) {
    checks.push([pool.holders <= preset.holdersMax, `Holder ≤ ${preset.holdersMax}`]);
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
    // Liquidity actually sitting in the active bin, versus `tvl`'s count of
    // every bin in the pool. Only the discovery API reports it, so — like
    // totalLps/swaps1h below — this stays null rather than 0 when that call
    // failed, so a missing reading never masquerades as an empty pool.
    activeTvl: optionalNumber(analytics.active_tvl),
    feeActiveTvl1h: optionalNumber(analytics.fee_active_tvl_ratio),
    volumeActiveTvl1h: optionalNumber(analytics.volume_active_tvl_ratio),
    // The discovery API's own volume/fee/swap counts divided by the request's
    // 1h timeframe, i.e. flow per minute rather than per hour — useful for
    // comparing pools regardless of how long each has been trading within
    // that window.
    avgVolumePerMin: optionalNumber(analytics.avg_volume),
    avgFeePerMin: optionalNumber(analytics.avg_fee),
    avgSwapsPerMin: optionalNumber(analytics.avg_swap_count),
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

  // Derived rate figures — burst, active-bin depth, per-minute yield. Folded in
  // here rather than computed at render time so every one of them is a sortable
  // column and a filterable field like any upstream number. Phase is not folded
  // in here: it also reads fee velocity, which only exists once the server has
  // sampled the pool across scans, so it is attached alongside that.
  const marketRead = deriveMarketRead(normalized);

  const score = calculateScore(normalized);
  const risk = calculateRisk(normalized);
  // Payload-level default only. Anything rendering against a chosen preset
  // should call poolTier with that preset rather than read this field.
  const status = poolTier(score.total, PRESETS[DEFAULT_PRESET]);

  return {
    ...normalized,
    ...marketRead,
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
