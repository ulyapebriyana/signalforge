import { emptyGmgnFields } from "./gmgn.js";
import { bandOf, gateLabel, SWANNY_RUBRIC } from "./swannyRubric.js";

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
  // own gate below: `volume5mMin` (50_000, not @0xMrBeefman's 1M),
  // `marketCapMin` (lowered from $300K to $150K), `tvlMin` (removed outright,
  // was $10K), `volume1hMin` (removed outright, was lowered from $200K to
  // $50K to $25K before that), `volumeTvlMin` (removed outright, was
  // loosened from 3x to 1x before that), `feeTvlMin` (removed outright, was
  // 5%), `baseFeeMin` (removed outright, was 2%), `devBalanceMax` (loosened
  // from 0 to 10%), `ageHoursMax` (removed outright, was 24h), and
  // `bundlerPctMax` (loosened from Skolmbeagh-like's 15% to 50%). None of
  // these are transcription errors — they are recorded here so a later reader
  // does not mistake them for source-backed numbers.
  //
  // NEEDS `GMGN_API_KEY`. Volume 5m, sniper, insider, and bundler all come from
  // GMGN and every one of them fails closed, so without a key this preset is
  // silent — the same posture as Skolmbeagh-like.
  heartattack: {
    id: "heartattack",
    label: "Heart Attack",
    // The gate the whole preset turns on. GMGN's `price.volume_5m`, finer than
    // anything Meteora exposes — Meteora stops at one hour, which is far too
    // coarse for a play measured in minutes.
    volume5mMin: 50_000,
    // Lowered from the original $300K to $150K on the user's explicit
    // instruction — inside Skolmbeagh-like's $50K–$200K band now, not above
    // it, so a runner can qualify here earlier in its life than the first cut
    // assumed. The Metlex "HEART ATTACK · RUNNER" alert that prompted this
    // preset showed MC $1.68M, still comfortably inside the $150K–$15M range.
    marketCapMin: 150_000,
    marketCapMax: 15_000_000,
    // "Ripping upward with almost no corrections." Entry is never into
    // something flat and never into something bleeding.
    momentumMin: 20,
    momentumMax: 2_000,
    // No tvlMin, volume1hMin, volumeTvlMin, or feeTvlMin gate, on the user's
    // explicit instruction — each was previously set (tvlMin was $10K; the
    // other three were $25K, 1x, 5% respectively) but the user decided the 5m
    // spike gate above already does the heavy lifting on flow and removed all
    // four outright rather than loosen them further. Thin liquidity against
    // violent flow was the original rationale for the TVL floor, exactly as
    // in VanChu-like, but it no longer gates here.
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
    // Loosened from Skolmbeagh-like's 15% to 50% on the user's explicit
    // instruction. This is a real weakening of the rugpull check, not a
    // rounding difference — at 50% a pool can clear this gate with half its
    // volume run through bundled buys. Left in rather than argued with, but
    // named so it reads as a deliberate choice, not an oversight.
    bundlerPctMax: 50,
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
  // Modelled on @0xVanChu's *other* wallet — the one he says takes "noticeably
  // less time and nerves" than the Action Wallet the `vanchu` preset below
  // reconstructs: "Bid-Ask on more proven tokens, without the constant race
  // for new shitcoins and without the need to stare at the chart."
  //
  // Unlike every other preset in this file, this is NOT a reconstruction of a
  // published checklist — he never posted one for Slow Wallet, only fragments.
  // The one concrete trade he did share: $TOAD, Bid-Ask, range −42%, 20,000
  // USDC deposited, ~3% return over an 11-hour hold, price staying inside a
  // 15% band the whole time. The thresholds below are my own synthesis around
  // those fragments, at the user's explicit request ("menurutmu kayak gimana
  // metode screeningnya") rather than a transcription — flagged here so this
  // preset is never mistaken for the same kind of source-backed gate as its
  // six siblings.
  slowwallet: {
    id: "slowwallet",
    label: "Slow Wallet",
    // "Proven tokens" as opposed to the shitcoins Action Wallet chases. The
    // upstream pipeline filter already caps candidates at $15M (see
    // server/index.mjs), so a higher ceiling here would be decorative — same
    // reasoning as VanChu-like's marketCapMax.
    marketCapMin: 2_000_000,
    marketCapMax: 15_000_000,
    // A 20,000 USDC single-sided deposit is the one deposit size on record.
    // The pool has to be deep enough to take that without brutal price impact,
    // so this floor sits above every other preset's — deep liquidity is the
    // whole point of "proven," not a side effect of it.
    tvlMin: 100_000,
    // The $TOAD position "traded sideways within 15% the whole" hold, and the
    // $LUNA position he named moved 5% → 2% as it calmed — this is a preset
    // for a token that is not doing anything violent right now. A wide bid-ask
    // range still earns on a mild pullback, so the floor is negative; the
    // ceiling excludes anything that has become a runner, which is what the
    // `vanchu` preset is for.
    momentumMin: -15,
    momentumMax: 20,
    // Still needs to be a real, trading pool — just not a runner. $20K/hour is
    // enough to matter against a $100K+ TVL floor without demanding vanchu-
    // grade turnover.
    volume1hMin: 20_000,
    volumeTvlMin: 0.15,
    // Back-computed from the one trade on record: 20,000 USDC, ~3% return over
    // 11 hours ≈ ~0.27%/hr average fee/TVL. Set a shade under that so the gate
    // does not exclude the very trade it is modelled on.
    feeTvlMin: 0.2,
    requireFreezeOff: true,
    // "Proven" implies the standard rug levers are already closed off, not
    // merely tolerated.
    requireMintOff: true,
    requireVerified: true,
    // An established community, not a just-migrated one — well above
    // Auzhinta-like's 500, which is itself the floor for a much younger token.
    holdersMin: 1_000,
    // The plain inverse of Skolmbeagh-like's 0.5-hour ceiling: a pool has to
    // have survived at least a week before it counts as "proven" rather than
    // "still in its violent early hours."
    ageHoursMin: 168,
    // The lowest ceiling of any preset, and the point of the exercise — Slow
    // Wallet exists because Action Wallet costs "adrenaline and stress."
    // A genuinely established, verified, deep pool clears this with room to
    // spare; nothing here is tuned to let a risky pool through the back door.
    maxRisk: 45,
    // The 100-point model rewards momentum and freshness, and this preset
    // deliberately scores low on both (momentum capped at 20%, and a pool
    // ≥168h old never earns more than 5 of the 10 freshness points, often 3).
    // A qualifying pool lands roughly 35–55 in practice — the same shape of
    // mismatch as Auzhinta-like, and for the same reason: reusing the 65/80
    // ladder would gate every alert off.
    minScore: 35,
    hotScore: 55,
    watchScore: 40,
    earlyScore: 28,
    // No reason to ping often for a position meant to sit for hours.
    cooldownMinutes: 60,
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
    [pool.priceChange1h !== null && pool.priceChange1h >= preset.momentumMin, `1h ≥ ${preset.momentumMin}%`],
    [pool.priceChange1h !== null && pool.priceChange1h <= preset.momentumMax, `1h ≤ ${preset.momentumMax}%`],
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
      `Vol 5m ≥ $${preset.volume5mMin}`,
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
