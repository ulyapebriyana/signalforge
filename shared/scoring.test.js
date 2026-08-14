import { describe, expect, it, vi } from "vitest";
import {
  calculateRisk,
  calculateScore,
  DEFAULT_PRESET,
  evaluatePreset,
  normalizePool,
  poolTier,
  PRESETS,
  resolvePresetId,
} from "./scoring.js";

const healthyPool = {
  marketCap: 900_000,
  tvl: 30_000,
  priceChange1h: 22,
  volume1h: 45_000,
  volumeTvl1h: 1.5,
  feeTvl1h: 1.4,
  holders: 2_000,
  isVerified: true,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
  ageHours: 36,
};

// Field-for-field copy of BUTTHOLE-SOL as the Meteora APIs served it — a pool
// the strategy behind the Auzhinta-like preset was publicly posted as running.
const auzhintaPool = {
  marketCap: 2_240_331,
  tvl: 172_838,
  priceChange1h: 16,
  volume1h: 62_158,
  volumeTvl1h: 0.36,
  feeTvl1h: 1.13,
  binStep: 100,
  baseFeePct: 2,
  feesInBothTokens: true,
  top10HoldersPct: 21.4,
  devBalancePct: 0,
  holders: 2_481,
  clusterLargestPct: 1.64,
  mintAuthorityDisabled: true,
  swapsPerTrader: 2.05,
  isVerified: false,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
  ageHours: 33.4,
};

// A token that clears every row of the Swanny-like rubric.
const swannyPool = {
  marketCap: 900_000,
  tvl: 40_000,
  priceChange1h: 4,
  volume1h: 20_000,
  volumeTvl1h: 0.5,
  feeTvl1h: 0.8,
  isBlacklisted: false,
  freezeAuthorityDisabled: true,
  mintAuthorityDisabled: true,
  rugCheckScore: 8,
  organicScore: 88,
  tokenAgeHours: 400,
  top10HoldersPct: 12,
  devBalancePct: 0,
  gmgnSniperPct: 0.5,
  gmgnSniperWallets: 3,
  gmgnInsidersPct: 0.2,
  gmgnBundlerPct: 2.1,
  gmgnPhishingPct: 1.4,
  gmgnTotalFeesSol: 250,
};

// A runner in a high-fee pool: heavy flow against thin liquidity, which is the
// only shape the VanChu-like posts ever describe entering.
const vanchuPool = {
  marketCap: 2_100_000,
  tvl: 42_000,
  priceChange1h: 64,
  volume1h: 480_000,
  volumeTvl1h: 11.4,
  feeTvl1h: 22.8,
  baseFeePct: 3,
  isVerified: false,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
  ageHours: 5,
};

// A runner mid-spike: five-minute volume well past the trigger, extravagant
// fee capture, and a holder split clean enough to survive Stage 1.
const heartAttackPool = {
  marketCap: 1_680_000,
  tvl: 83_300,
  priceChange1h: 74,
  volume1h: 544_500,
  volumeTvl1h: 6.5,
  feeTvl1h: 129.1,
  baseFeePct: 2,
  gmgnVolume5m: 78_000,
  ageHours: 0.6,
  top10HoldersPct: 24.1,
  devBalancePct: 0,
  gmgnSniperPct: 7.4,
  gmgnInsidersPct: 3.9,
  gmgnBundlerPct: 10.5,
  isVerified: false,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
};

// A calm, established pool — deep, verified, well past its migration, not
// doing anything violent. The shape of pool the $TOAD trade describes.
const slowWalletPool = {
  marketCap: 5_000_000,
  tvl: 250_000,
  priceChange1h: 5,
  volume1h: 35_000,
  volumeTvl1h: 0.2,
  feeTvl1h: 0.25,
  holders: 3_000,
  isVerified: true,
  mintAuthorityDisabled: true,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
  ageHours: 400,
};

// A migration 18 minutes old that clears every row of the checklist.
const skolmbeaghPool = {
  marketCap: 118_000,
  tvl: 6_400,
  priceChange1h: 42,
  volume1h: 91_000,
  volumeTvl1h: 14.2,
  feeTvl1h: 18.6,
  ageHours: 0.3,
  top10HoldersPct: 22.5,
  devBalancePct: 0,
  gmgnSniperPct: 8.1,
  gmgnInsidersPct: 4.4,
  gmgnBundlerPct: 11.2,
  isVerified: false,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
};

describe("SignalForge scoring", () => {
  it("scores a healthy momentum pool above the watch threshold", () => {
    expect(calculateScore(healthyPool).total).toBeGreaterThanOrEqual(65);
  });

  it("raises risk for active freeze authority and thin TVL", () => {
    const safe = calculateRisk(healthyPool).value;
    const risky = calculateRisk({ ...healthyPool, freezeAuthorityDisabled: false, tvl: 400 }).value;
    expect(risky).toBeGreaterThan(safe + 35);
  });

  it("raises risk for concentrated holders and a high developer balance", () => {
    const distributed = calculateRisk({ ...healthyPool, top10HoldersPct: 18, devBalancePct: 1 });
    const concentrated = calculateRisk({ ...healthyPool, top10HoldersPct: 62, devBalancePct: 14 });

    expect(concentrated.value).toBeGreaterThan(distributed.value + 30);
    expect(distributed.flags.some((flag) => flag.label.includes("belum tersedia"))).toBe(false);
  });

  it("keeps Yanman-like and Auzhinta-like filters distinct", () => {
    const thinAndLoose = { ...healthyPool, tvl: 7_000, priceChange1h: 26, volumeTvl1h: 0.8, feeTvl1h: 0.7 };
    expect(evaluatePreset(thinAndLoose, PRESETS.yanman).passed).toBe(true);
    expect(evaluatePreset(thinAndLoose, PRESETS.auzhinta).passed).toBe(false);
  });

  it("passes the Auzhinta-like rig through its own gate", () => {
    expect(evaluatePreset(auzhintaPool, PRESETS.auzhinta).passed).toBe(true);
  });

  it("refuses a pool that has already rolled over", () => {
    // "kalau udah ATH lama terus turun panjang, momentumnya udah lewat" — the
    // wide range is for what happens after entry, not a reason to enter a pool
    // that is already bleeding.
    const rolledOver = { ...auzhintaPool, priceChange1h: -12 };
    expect(evaluatePreset(rolledOver, PRESETS.auzhinta).misses).toContain("1h ≥ 0%");
  });

  it("accepts every bin step rig the article names", () => {
    for (const binStep of [50, 80, 100, 125, 400]) {
      expect(evaluatePreset({ ...auzhintaPool, binStep }, PRESETS.auzhinta).passed).toBe(true);
    }
    expect(evaluatePreset({ ...auzhintaPool, binStep: 20 }, PRESETS.auzhinta).passed).toBe(false);
  });

  it("rejects a pool whose fees accrue in the quote token only", () => {
    const quoteOnly = { ...auzhintaPool, feesInBothTokens: false };
    expect(evaluatePreset(quoteOnly, PRESETS.auzhinta).misses).toContain("Fee base + quote");
  });

  it("rejects a live mint authority and an unknown one alike", () => {
    expect(evaluatePreset({ ...auzhintaPool, mintAuthorityDisabled: false }, PRESETS.auzhinta).misses)
      .toContain("Mint authority off");
    expect(evaluatePreset({ ...auzhintaPool, mintAuthorityDisabled: null }, PRESETS.auzhinta).misses)
      .toContain("Mint authority off");
  });

  it("applies the article's stated holder, cluster, and dev thresholds", () => {
    expect(evaluatePreset({ ...auzhintaPool, marketCap: 399_000 }, PRESETS.auzhinta).misses)
      .toContain("MC ≥ $400000");
    expect(evaluatePreset({ ...auzhintaPool, holders: 480 }, PRESETS.auzhinta).misses)
      .toContain("Holder ≥ 500");
    expect(evaluatePreset({ ...auzhintaPool, top10HoldersPct: 41 }, PRESETS.auzhinta).misses)
      .toContain("Top-10 holder ≤ 40%");
    expect(evaluatePreset({ ...auzhintaPool, devBalancePct: 3.1 }, PRESETS.auzhinta).misses)
      .toContain("Saldo dev ≤ 1%");
  });

  it("rejects the coordinated-cluster shape the article walks through", () => {
    // The rejected example: one cluster of 371 wallets holding 47.95%.
    const clustered = { ...auzhintaPool, clusterLargestPct: 47.95 };
    expect(evaluatePreset(clustered, PRESETS.auzhinta).misses).toContain("Cluster terbesar ≤ 40%");
  });

  it("treats a token with no clusters as clean, not unknown", () => {
    // An empty network list is a real answer and must not fail the gate.
    expect(evaluatePreset({ ...auzhintaPool, clusterLargestPct: 0 }, PRESETS.auzhinta).passed).toBe(true);
  });

  it("fails the cluster gate closed when the graph could not be read", () => {
    expect(evaluatePreset({ ...auzhintaPool, clusterLargestPct: null }, PRESETS.auzhinta).misses)
      .toContain("Cluster terbesar ≤ 40%");
  });

  it("catches a cluster that hides behind a healthy top-10", () => {
    // The whole reason the cluster gate exists: many small linked wallets read
    // as harmless one by one, so top-10 concentration never sees them.
    const hidden = { ...auzhintaPool, top10HoldersPct: 12, clusterLargestPct: 44 };
    const { passed, misses } = evaluatePreset(hidden, PRESETS.auzhinta);
    expect(passed).toBe(false);
    expect(misses).toEqual(["Cluster terbesar ≤ 40%"]);
  });

  it("flags the wash-trade shape without punishing normal flow", () => {
    expect(evaluatePreset({ ...auzhintaPool, swapsPerTrader: 1.7 }, PRESETS.auzhinta).passed).toBe(true);
    expect(evaluatePreset({ ...auzhintaPool, swapsPerTrader: 14 }, PRESETS.auzhinta).misses)
      .toContain("Swap per trader ≤ 6");
  });

  it("rejects the rig when the pool has stopped paying", () => {
    const stalled = { ...auzhintaPool, feeTvl1h: 0.2, volumeTvl1h: 0.05, volume1h: 4_000 };
    const { passed, misses } = evaluatePreset(stalled, PRESETS.auzhinta);
    expect(passed).toBe(false);
    expect(misses).toContain("Fee/TVL ≥ 1%");
  });

  it("rejects the wrong rig even when the pool is paying well", () => {
    const wrongRig = { ...auzhintaPool, binStep: 20, baseFeePct: 0.2 };
    const { misses } = evaluatePreset(wrongRig, PRESETS.auzhinta);
    expect(misses).toEqual(expect.arrayContaining(["Bin step ≥ 50", "Base fee ≥ 2%"]));
  });

  it("fails the concentration gate closed when holder data is missing", () => {
    const unknown = { ...auzhintaPool, top10HoldersPct: null, devBalancePct: null };
    const { misses } = evaluatePreset(unknown, PRESETS.auzhinta);
    expect(misses).toEqual(expect.arrayContaining(["Top-10 holder ≤ 40%", "Saldo dev ≤ 1%"]));
  });

  it("passes a clean token through the Swanny-like screen", () => {
    expect(evaluatePreset(swannyPool, PRESETS.swanny).passed).toBe(true);
  });

  it("tolerates yellow but rejects red", () => {
    // Top-10 at 22% is yellow in the rubric and must not fail the screen.
    expect(evaluatePreset({ ...swannyPool, top10HoldersPct: 22 }, PRESETS.swanny).passed).toBe(true);
    // 31% crosses into red.
    expect(evaluatePreset({ ...swannyPool, top10HoldersPct: 31 }, PRESETS.swanny).misses)
      .toContain("Top-10 holder ≤ 30%");
  });

  it("fails every GMGN row when no key is configured", () => {
    // emptyGmgnFields leaves them null, and unknown is not clean.
    const noKey = { ...swannyPool, gmgnSniperWallets: null, gmgnSniperPct: null, gmgnInsidersPct: null,
      gmgnBundlerPct: null, gmgnPhishingPct: null, gmgnTotalFeesSol: null };
    const { misses } = evaluatePreset(noKey, PRESETS.swanny);
    expect(misses).toEqual(expect.arrayContaining([
      "Sniper ≤ 5%", "Jumlah sniper ≤ 15", "Insider ≤ 12%",
      "Bundler ≤ 12%", "Phishing ≤ 8%", "Total fee ≥ 20 SOL",
    ]));
  });

  it("catches the sniper and phishing shapes the rubric exists for", () => {
    expect(evaluatePreset({ ...swannyPool, gmgnSniperWallets: 22 }, PRESETS.swanny).misses)
      .toContain("Jumlah sniper ≤ 15");
    expect(evaluatePreset({ ...swannyPool, gmgnPhishingPct: 65.1 }, PRESETS.swanny).misses)
      .toContain("Phishing ≤ 8%");
  });

  it("judges token age opposite to how Auzhinta-like judges pool age", () => {
    // A six-hour-old token is red for Swanny-like and irrelevant to the other,
    // which cares about the pool being fresh instead.
    const brandNew = { ...swannyPool, tokenAgeHours: 6 };
    expect(evaluatePreset(brandNew, PRESETS.swanny).misses).toContain("Umur token ≥ 24 jam");
    expect(evaluatePreset({ ...auzhintaPool, ageHours: 6 }, PRESETS.auzhinta).passed).toBe(true);
  });

  it("passes a runner in a high-fee pool through the VanChu-like gate", () => {
    expect(evaluatePreset(vanchuPool, PRESETS.vanchu).passed).toBe(true);
  });

  it("rejects the 1% pool that the VanChu-like posts blame for a loss", () => {
    // The stated mistake: right token, right volume, wrong fee tier. The pool
    // still clears every other gate, so the fee tier has to be what stops it.
    const cheapPool = { ...vanchuPool, baseFeePct: 1 };
    const { passed, misses } = evaluatePreset(cheapPool, PRESETS.vanchu);
    expect(passed).toBe(false);
    expect(misses).toEqual(["Base fee ≥ 2%"]);
  });

  it("refuses to enter a token that is not already running", () => {
    // Entry is always into a move in progress. A flat or bleeding pool is not
    // an early entry here, it is the wrong preset.
    expect(evaluatePreset({ ...vanchuPool, priceChange1h: 4 }, PRESETS.vanchu).misses)
      .toContain("1h ≥ 15%");
    expect(evaluatePreset({ ...vanchuPool, priceChange1h: -20 }, PRESETS.vanchu).passed).toBe(false);
  });

  it("rejects a busy pool that is not turning over fast enough", () => {
    // Thin liquidity against heavy flow is the edge; a deep pool doing the same
    // absolute volume pays far less per dollar and is not the same trade.
    const deep = { ...vanchuPool, tvl: 900_000, volumeTvl1h: 0.53, feeTvl1h: 1.1 };
    expect(evaluatePreset(deep, PRESETS.vanchu).misses)
      .toEqual(expect.arrayContaining(["Vol/TVL ≥ 3x", "Fee/TVL ≥ 2%"]));
  });

  it("declares no bin step gate, because the source never names one", () => {
    expect(PRESETS.vanchu.binStepMin).toBeUndefined();
    expect(PRESETS.vanchu.binStepMax).toBeUndefined();
    for (const binStep of [10, 20, 100, 400]) {
      expect(evaluatePreset({ ...vanchuPool, binStep }, PRESETS.vanchu).passed).toBe(true);
    }
  });

  it("passes a fresh migration through the Skolmbeagh-like checklist", () => {
    expect(evaluatePreset(skolmbeaghPool, PRESETS.skolmbeagh).passed).toBe(true);
  });

  it("closes the 30-minute window the whole preset turns on", () => {
    // "After an hour, the fee yield drops from around 50% to about 20%."
    expect(evaluatePreset({ ...skolmbeaghPool, ageHours: 0.5 }, PRESETS.skolmbeagh).passed).toBe(true);
    expect(evaluatePreset({ ...skolmbeaghPool, ageHours: 0.9 }, PRESETS.skolmbeagh).misses)
      .toContain("Umur pool ≤ 0.5 jam");
  });

  it("keeps the market cap band the thread stays inside", () => {
    // Over $200K the DLMM pools open and the play is over.
    expect(evaluatePreset({ ...skolmbeaghPool, marketCap: 240_000 }, PRESETS.skolmbeagh).misses)
      .toContain("MC ≤ $200000");
  });

  it("gates top-10 concentration from both sides", () => {
    // "Should be between 10% and 35%" — the floor is the unusual half, and it
    // is in the source on purpose.
    expect(evaluatePreset({ ...skolmbeaghPool, top10HoldersPct: 8 }, PRESETS.skolmbeagh).misses)
      .toContain("Top-10 holder ≥ 10%");
    expect(evaluatePreset({ ...skolmbeaghPool, top10HoldersPct: 36 }, PRESETS.skolmbeagh).misses)
      .toContain("Top-10 holder ≤ 35%");
  });

  it("walks away from any dev balance at all", () => {
    // "If the dev holds tokens, I stay away" — zero, not merely low.
    expect(evaluatePreset({ ...skolmbeaghPool, devBalancePct: 0.4 }, PRESETS.skolmbeagh).misses)
      .toContain("Saldo dev ≤ 0%");
  });

  it("applies the sniper, insider, and bundler ceilings", () => {
    expect(evaluatePreset({ ...skolmbeaghPool, gmgnSniperPct: 16 }, PRESETS.skolmbeagh).misses)
      .toContain("Sniper ≤ 15%");
    expect(evaluatePreset({ ...skolmbeaghPool, gmgnInsidersPct: 22 }, PRESETS.skolmbeagh).misses)
      .toContain("Insider ≤ 15%");
    expect(evaluatePreset({ ...skolmbeaghPool, gmgnBundlerPct: 40 }, PRESETS.skolmbeagh).misses)
      .toContain("Bundler ≤ 15%");
  });

  it("goes quiet rather than open when no GMGN key is configured", () => {
    // Same fail-closed posture as the Swanny-like rubric: an unread metric is
    // not a clean one, so the preset simply stops producing candidates.
    const noKey = { ...skolmbeaghPool, gmgnSniperPct: null, gmgnInsidersPct: null, gmgnBundlerPct: null };
    const { passed, misses } = evaluatePreset(noKey, PRESETS.skolmbeagh);
    expect(passed).toBe(false);
    expect(misses).toEqual(["Sniper ≤ 15%", "Insider ≤ 15%", "Bundler ≤ 15%"]);
  });

  it("keeps the two new presets from qualifying each other's pools", () => {
    // A 30-minute microcap is too small and too young for VanChu-like; a $2.1M
    // runner five hours in is too big and too old for Skolmbeagh-like.
    expect(evaluatePreset(skolmbeaghPool, PRESETS.vanchu).passed).toBe(false);
    expect(evaluatePreset(vanchuPool, PRESETS.skolmbeagh).passed).toBe(false);
  });

  it("passes a mid-spike runner through the Heart Attack gate", () => {
    expect(evaluatePreset(heartAttackPool, PRESETS.heartattack).passed).toBe(true);
  });

  it("turns on the five-minute volume trigger the user asked for", () => {
    // $50K/5m is the whole preset. Just under it is not a near miss, it is the
    // trigger not having fired.
    expect(evaluatePreset({ ...heartAttackPool, gmgnVolume5m: 49_000 }, PRESETS.heartattack).misses)
      .toEqual(["Vol 5m ≥ $50000"]);
    expect(evaluatePreset({ ...heartAttackPool, gmgnVolume5m: 50_000 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("goes silent without a GMGN key rather than waving runners through", () => {
    // Volume 5m, sniper, insider, and bundler are all GMGN-backed. No key means
    // no reading, and no reading is not a pass — same posture as Skolmbeagh-like.
    const noKey = {
      ...heartAttackPool,
      gmgnVolume5m: null,
      gmgnSniperPct: null,
      gmgnInsidersPct: null,
      gmgnBundlerPct: null,
    };
    const { passed, misses } = evaluatePreset(noKey, PRESETS.heartattack);
    expect(passed).toBe(false);
    expect(misses).toEqual([
      "Vol 5m ≥ $50000",
      "Sniper ≤ 15%",
      "Insider ≤ 15%",
      "Bundler ≤ 15%",
    ]);
  });

  it("applies Stage 1 — the rugpull checks borrowed from Skolmbeagh-like", () => {
    // "Quickly going through holders, distribution" before any liquidity moves.
    expect(evaluatePreset({ ...heartAttackPool, devBalancePct: 0.5 }, PRESETS.heartattack).misses)
      .toContain("Saldo dev ≤ 0%");
    expect(evaluatePreset({ ...heartAttackPool, top10HoldersPct: 42 }, PRESETS.heartattack).misses)
      .toContain("Top-10 holder ≤ 35%");
    expect(evaluatePreset({ ...heartAttackPool, gmgnSniperPct: 18 }, PRESETS.heartattack).misses)
      .toContain("Sniper ≤ 15%");
  });

  it("keeps VanChu-like's fee tier lesson, the most expensive one in the posts", () => {
    expect(evaluatePreset({ ...heartAttackPool, baseFeePct: 1 }, PRESETS.heartattack).misses)
      .toContain("Base fee ≥ 2%");
  });

  it("does not borrow Skolmbeagh-like's top-10 floor", () => {
    // The floor screens supply scattered across bots on a just-migrated token.
    // A runner that has already moved is past the moment that reads, so only
    // the ceiling carries over.
    expect(PRESETS.heartattack.top10HoldersMin).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, top10HoldersPct: 6 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("treats a day-old runner as a trend rather than a heart attack", () => {
    expect(evaluatePreset({ ...heartAttackPool, ageHours: 30 }, PRESETS.heartattack).misses)
      .toContain("Umur pool ≤ 24 jam");
  });

  it("separates Heart Attack from the two presets it borrows from", () => {
    // Skolmbeagh-like's fresh migration is too small-cap and too illiquid;
    // VanChu-like's runner carries no GMGN reading at all, so the 5m trigger
    // it never declares cannot fire here.
    expect(evaluatePreset(skolmbeaghPool, PRESETS.heartattack).passed).toBe(false);
    expect(evaluatePreset(vanchuPool, PRESETS.heartattack).passed).toBe(false);
    // And the borrowing runs one way only — neither source preset gains a
    // five-minute gate it never declared.
    expect(PRESETS.vanchu.volume5mMin).toBeUndefined();
    expect(PRESETS.skolmbeagh.volume5mMin).toBeUndefined();
    expect(evaluatePreset({ ...vanchuPool, gmgnVolume5m: null }, PRESETS.vanchu).passed).toBe(true);
  });

  it("passes a calm, established pool through the Slow Wallet gate", () => {
    expect(evaluatePreset(slowWalletPool, PRESETS.slowwallet).passed).toBe(true);
  });

  it("rejects a runner, because that is what the vanchu preset is for", () => {
    expect(evaluatePreset({ ...slowWalletPool, priceChange1h: 45 }, PRESETS.slowwallet).misses)
      .toContain("1h ≤ 20%");
  });

  it("rejects a pool that has not survived its first week", () => {
    // The inverse of Skolmbeagh-like's ageHoursMax: "proven" means past the
    // early hours, not caught inside them.
    expect(evaluatePreset({ ...slowWalletPool, ageHours: 20 }, PRESETS.slowwallet).misses)
      .toContain("Umur pool ≥ 168 jam");
  });

  it("requires verification, unlike every other preset", () => {
    expect(evaluatePreset({ ...slowWalletPool, isVerified: false }, PRESETS.slowwallet).misses)
      .toContain("Token terverifikasi");
  });

  it("keeps Slow Wallet and VanChu-like from qualifying each other's pools", () => {
    // A calm $5M pool sitting flat is too slow and too big a cap gap for
    // VanChu-like's runner gate; a $2.1M pool up 64% in an hour is exactly
    // the momentum Slow Wallet's ceiling exists to exclude.
    expect(evaluatePreset(slowWalletPool, PRESETS.vanchu).passed).toBe(false);
    expect(evaluatePreset(vanchuPool, PRESETS.slowwallet).passed).toBe(false);
  });

  it("leaves the presets that predate the new gates untouched", () => {
    // The new optional gates must stay opt-in: an existing preset that never
    // declared them cannot start failing on a field it does not screen.
    for (const preset of [PRESETS.yanman, PRESETS.auzhinta, PRESETS.swanny]) {
      expect(preset.top10HoldersMin).toBeUndefined();
      expect(preset.sniperPctMax).toBeUndefined();
      expect(preset.insidersPctMax).toBeUndefined();
      expect(preset.bundlerPctMax).toBeUndefined();
      expect(preset.ageHoursMin).toBeUndefined();
      expect(preset.requireVerified).toBeUndefined();
      expect(preset.volume5mMin).toBeUndefined();
    }
    expect(evaluatePreset(healthyPool, PRESETS.yanman).passed).toBe(true);
    expect(evaluatePreset(auzhintaPool, PRESETS.auzhinta).passed).toBe(true);
    expect(evaluatePreset(swannyPool, PRESETS.swanny).passed).toBe(true);
  });

  it("reports a gate result for every preset that exists", () => {
    const normalized = normalizePool({
      address: "pool",
      token_x: { address: "token", symbol: "TOKEN" },
      token_y: { address: "sol", symbol: "SOL" },
      volume: {}, fees: {}, protocol_fees: {}, fee_tvl_ratio: {}, pool_config: {},
    });
    expect(Object.keys(normalized.qualifies).sort()).toEqual(Object.keys(PRESETS).sort());
  });

  it("leaves the other presets untouched by the rubric gate", () => {
    expect(PRESETS.yanman.rubric).toBeUndefined();
    expect(PRESETS.auzhinta.rubric).toBeUndefined();
    expect(evaluatePreset(healthyPool, PRESETS.yanman).passed).toBe(true);
  });

  it("reads the Hot/Watch ladder off the active preset", () => {
    // 53 is what the pool behind the Auzhinta-like preset actually scored: a
    // Watch there, nothing at all on the ladder built for verified pools.
    expect(poolTier(53, "auzhinta")).toBe("watch");
    expect(poolTier(53, "yanman")).toBe("early");
    expect(poolTier(62, "auzhinta")).toBe("hot");
    expect(poolTier(62, "yanman")).toBe("early");
  });

  it("keeps the Yanman-like ladder on its original thresholds", () => {
    expect(poolTier(80, "yanman")).toBe("hot");
    expect(poolTier(65, "yanman")).toBe("watch");
    expect(poolTier(50, "yanman")).toBe("early");
    expect(poolTier(49, "yanman")).toBe("skip");
  });

  it("reads the Heart Attack ladder high, matching what these pools actually score", () => {
    // Extreme momentum, fee efficiency far past the 2% cap, full volume
    // quality, and full freshness are 80 of the 100 points, and this preset
    // gates hard on all four — so the ladder sits above VanChu-like's.
    expect(calculateScore(heartAttackPool).total).toBeGreaterThanOrEqual(PRESETS.heartattack.hotScore);
    expect(poolTier(85, "heartattack")).toBe("hot");
    expect(poolTier(70, "heartattack")).toBe("watch");
    expect(poolTier(55, "heartattack")).toBe("early");
    expect(poolTier(54, "heartattack")).toBe("skip");
  });

  it("reads the Slow Wallet ladder low, matching what the score model can actually give it", () => {
    // Momentum capped at 20% and freshness capped at 5 (often 3) keep even a
    // qualifying pool well under the 65/80 shared default.
    expect(poolTier(55, "slowwallet")).toBe("hot");
    expect(poolTier(40, "slowwallet")).toBe("watch");
    expect(poolTier(28, "slowwallet")).toBe("early");
    expect(poolTier(27, "slowwallet")).toBe("skip");
  });

  it("falls back to the default ladder for an unknown preset id", () => {
    expect(poolTier(70, "safer")).toBe(poolTier(70, DEFAULT_PRESET));
    expect(resolvePresetId("safer")).toBe(DEFAULT_PRESET);
  });

  it("leaves Yanman-like untouched by the optional gates", () => {
    // No bin step, base fee, holder split, or age on the fixture at all.
    expect(evaluatePreset(healthyPool, PRESETS.yanman).passed).toBe(true);
  });

  it("normalizes the non-SOL token as the base asset", () => {
    vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));
    const normalized = normalizePool({
      address: "pool",
      name: "TOKEN-SOL",
      token_x: { address: "token", symbol: "TOKEN", market_cap: 400_000, holders: 700, freeze_authority_disabled: true },
      token_y: { address: "sol", symbol: "SOL", market_cap: 1_000_000_000, holders: 1_000_000, freeze_authority_disabled: true },
      created_at: new Date("2026-08-01T00:00:00Z").getTime(),
      tvl: 20_000,
      volume: { "1h": 25_000, "24h": 100_000 },
      fees: { "1h": 200 },
      protocol_fees: { "1h": 20 },
      fee_tvl_ratio: { "1h": 1 },
      pool_config: { base_fee_pct: 0.2 },
      dynamic_fee_pct: 0.1,
      is_blacklisted: false,
    }, { priceChange1h: 15, sparkline: [1, 2] }, {
      total_lps: 42,
      swap_count: 180,
      unique_traders: 73,
      token_x: {
        address: "token",
        top_holders_pct: 27.5,
        dev_balance_pct: 3.25,
        warnings: [{ type: "HAS_MINT_AUTHORITY", message: "Mint authority aktif", severity: "warning" }],
        organic_score: 82.4,
        organic_score_label: "high",
      },
      token_y: { address: "sol", top_holders_pct: 12, dev_balance_pct: 0 },
    }, {
      score_normalised: 7,
      risks: [{ name: "Mutable metadata", description: "Metadata dapat diubah", level: "warn", score: 7 }],
      lpLockedPct: 72.5,
    });

    expect(normalized.baseSymbol).toBe("TOKEN");
    expect(normalized.pair).toBe("SOL / TOKEN");
    expect(normalized.volumeTvl1h).toBe(1.25);
    expect(normalized.totalLps).toBe(42);
    expect(normalized.swaps1h).toBe(180);
    expect(normalized.traders1h).toBe(73);
    expect(normalized.top10HoldersPct).toBe(27.5);
    expect(normalized.devBalancePct).toBe(3.25);
    expect(normalized.jupShieldStatus).toBe("warning");
    expect(normalized.jupShieldWarnings).toHaveLength(1);
    expect(normalized.organicScore).toBe(82.4);
    expect(normalized.organicScoreLabel).toBe("high");
    expect(normalized.rugCheckScore).toBe(7);
    expect(normalized.rugCheckRiskCount).toBe(1);
    expect(normalized.rugCheckStatus).toBe("warning");
    expect(normalized.rugCheckLpLockedPct).toBe(72.5);
    expect(normalized.totalFees1h).toBe(220);
    expect(normalized.lpFees1h).toBe(200);
    expect(normalized.protocolFees1h).toBe(20);
  });

  it("keeps optional analytics empty when discovery data is unavailable", () => {
    const normalized = normalizePool({
      address: "pool-without-analytics",
      token_x: { symbol: "TOKEN" },
      token_y: { symbol: "SOL" },
      volume: {},
      fees: {},
      protocol_fees: {},
      fee_tvl_ratio: {},
      pool_config: {},
    });

    expect(normalized.totalLps).toBeNull();
    expect(normalized.swaps1h).toBeNull();
    expect(normalized.traders1h).toBeNull();
    expect(normalized.top10HoldersPct).toBeNull();
    expect(normalized.devBalancePct).toBeNull();
    expect(normalized.jupShieldStatus).toBeNull();
    expect(normalized.jupShieldWarnings).toBeNull();
    expect(normalized.organicScore).toBeNull();
    expect(normalized.rugCheckScore).toBeNull();
    expect(normalized.rugCheckRisks).toBeNull();
  });

  it("marks empty security warning lists as clear", () => {
    const normalized = normalizePool({
      address: "clear-pool",
      token_x: { address: "token", symbol: "TOKEN" },
      token_y: { address: "sol", symbol: "SOL" },
      volume: {},
      fees: {},
      protocol_fees: {},
      fee_tvl_ratio: {},
      pool_config: {},
    }, {}, {
      token_x: { address: "token", warnings: [], organic_score: 91, organic_score_label: "high" },
    }, { score_normalised: 1, risks: [], lpLockedPct: 100 });

    expect(normalized.jupShieldStatus).toBe("clear");
    expect(normalized.rugCheckStatus).toBe("clear");
    expect(normalized.rugCheckRiskCount).toBe(0);
  });
});
