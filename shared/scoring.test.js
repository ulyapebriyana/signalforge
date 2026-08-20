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
  volatileGateLabels,
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

// SOL/XST as the live scan of 2026-08-19 served it — the pool that scored
// highest of the three clearing every retuned Slow Wallet gate. Kept as real
// field values rather than round numbers so the gates stay anchored to a pool
// that actually existed.
const slowWalletPool = {
  marketCap: 41_700_000,
  tvl: 71_000,
  priceChange1h: -5.1,
  volume1h: 62_000,
  volumeTvl1h: 0.88,
  feeTvl1h: 0.183,
  holders: 3_000,
  top10HoldersPct: 8.2,
  devBalancePct: 0,
  organicScore: 81,
  isVerified: true,
  mintAuthorityDisabled: true,
  freezeAuthorityDisabled: true,
  isBlacklisted: false,
  ageHours: 400,
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

  it("passes a mid-spike runner through the Heart Attack gate", () => {
    expect(evaluatePreset(heartAttackPool, PRESETS.heartattack).passed).toBe(true);
  });

  it("turns on the five-minute volume trigger the user asked for", () => {
    // $40K/5m is the whole preset. Just under it is not a near miss, it is the
    // trigger not having fired.
    expect(evaluatePreset({ ...heartAttackPool, gmgnVolume5m: 39_000 }, PRESETS.heartattack).misses)
      .toEqual(["Vol 5m ≥ $40000"]);
    expect(evaluatePreset({ ...heartAttackPool, gmgnVolume5m: 40_000 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("holds the market cap and bundler gates at their revised thresholds", () => {
    // Lowered from $300K and 15% respectively on the user's explicit
    // instruction — each boundary is tested at both sides so a future revert
    // has to be deliberate, not accidental.
    expect(evaluatePreset({ ...heartAttackPool, marketCap: 99_999 }, PRESETS.heartattack).misses)
      .toContain("MC ≥ $100000");
    expect(evaluatePreset({ ...heartAttackPool, marketCap: 100_000 }, PRESETS.heartattack).passed).toBe(true);

    expect(evaluatePreset({ ...heartAttackPool, gmgnBundlerPct: 80.1 }, PRESETS.heartattack).misses)
      .toContain("Bundler ≤ 80%");
    expect(evaluatePreset({ ...heartAttackPool, gmgnBundlerPct: 80 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("declares no active TVL or avg volume/min gate, on the user's explicit instruction", () => {
    // Added briefly, then removed by the same explicit instruction — the
    // preset stays without a narrower TVL/volume floor.
    expect(PRESETS.heartattack.activeTvlMin).toBeUndefined();
    expect(PRESETS.heartattack.avgVolumePerMinMin).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, activeTvl: 0, avgVolumePerMin: 0 }, PRESETS.heartattack).passed)
      .toBe(true);
  });

  it("declares no TVL, hourly-volume, volume/TVL, or fee/TVL gate, on the user's explicit instruction", () => {
    expect(PRESETS.heartattack.tvlMin).toBeUndefined();
    expect(PRESETS.heartattack.volume1hMin).toBeUndefined();
    expect(PRESETS.heartattack.volumeTvlMin).toBeUndefined();
    expect(PRESETS.heartattack.feeTvlMin).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, tvl: 0, volume1h: 1, volumeTvl1h: 0, feeTvl1h: 0 }, PRESETS.heartattack).passed)
      .toBe(true);
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
      "Vol 5m ≥ $40000",
      "Sniper ≤ 15%",
      "Insider ≤ 15%",
      "Bundler ≤ 80%",
    ]);
  });

  it("applies Stage 1 — the rugpull checks that run before liquidity moves", () => {
    // "Quickly going through holders, distribution" before any liquidity moves.
    // Dev balance loosened from 0% to 10% on the user's explicit instruction.
    expect(evaluatePreset({ ...heartAttackPool, devBalancePct: 10.1 }, PRESETS.heartattack).misses)
      .toContain("Saldo dev ≤ 10%");
    expect(evaluatePreset({ ...heartAttackPool, devBalancePct: 10 }, PRESETS.heartattack).passed).toBe(true);
    expect(evaluatePreset({ ...heartAttackPool, top10HoldersPct: 42 }, PRESETS.heartattack).misses)
      .toContain("Top-10 holder ≤ 35%");
    expect(evaluatePreset({ ...heartAttackPool, gmgnSniperPct: 18 }, PRESETS.heartattack).misses)
      .toContain("Sniper ≤ 15%");
  });

  it("declares no base fee gate, on the user's explicit instruction", () => {
    expect(PRESETS.heartattack.baseFeeMin).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, baseFeePct: 1 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("declares no top-10 floor, only a ceiling", () => {
    // A floor screens supply scattered across bots on a just-migrated token.
    // A runner that has already moved is past the moment that reads, so only
    // the ceiling applies here.
    expect(PRESETS.heartattack.top10HoldersMin).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, top10HoldersPct: 6 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("declares no age gate, on the user's explicit instruction", () => {
    expect(PRESETS.heartattack.ageHoursMax).toBeUndefined();
    expect(evaluatePreset({ ...heartAttackPool, ageHours: 400 }, PRESETS.heartattack).passed).toBe(true);
  });

  it("keeps Heart Attack and Slow Wallet from qualifying each other's pools", () => {
    // The two presets are deliberate opposites: a 36-minute-old unverified
    // runner up 74% cannot clear a gate built around verified, week-old, deep
    // pools, and a calm verified pool has no five-minute spike to trigger on.
    expect(evaluatePreset(heartAttackPool, PRESETS.slowwallet).passed).toBe(false);
    expect(evaluatePreset(slowWalletPool, PRESETS.heartattack).passed).toBe(false);
  });

  it("passes a calm, established pool through the Slow Wallet gate", () => {
    expect(evaluatePreset(slowWalletPool, PRESETS.slowwallet).passed).toBe(true);
  });

  it("rejects a runner, because that is what Heart Attack is for", () => {
    expect(evaluatePreset({ ...slowWalletPool, priceChange1h: 45 }, PRESETS.slowwallet).misses)
      .toContain("1h ≤ 20%");
  });

  it("rejects a pool that has not survived its first week", () => {
    // "Proven" means past the early hours, not caught inside them.
    expect(evaluatePreset({ ...slowWalletPool, ageHours: 20 }, PRESETS.slowwallet).misses)
      .toContain("Umur pool ≥ 168 jam");
  });

  it("requires verification, unlike Heart Attack", () => {
    expect(evaluatePreset({ ...slowWalletPool, isVerified: false }, PRESETS.slowwallet).misses)
      .toContain("Token terverifikasi");
  });

  it("applies the three safety gates the 2026-08-19 retune paid for", () => {
    // Top-10 concentration is the gate that earned its place: the one pool the
    // loosened activity floors would otherwise have admitted was a $240M
    // verified token with 62.8% of supply in ten wallets.
    expect(evaluatePreset({ ...slowWalletPool, top10HoldersPct: 62.8 }, PRESETS.slowwallet).misses)
      .toContain("Top-10 holder ≤ 40%");
    expect(evaluatePreset({ ...slowWalletPool, devBalancePct: 5.1 }, PRESETS.slowwallet).misses)
      .toContain("Saldo dev ≤ 5%");
    expect(evaluatePreset({ ...slowWalletPool, organicScore: 69 }, PRESETS.slowwallet).misses)
      .toContain("Organic score ≥ 70");
  });

  it("fails the new gates closed when the reading is missing", () => {
    // Same posture as every other optional gate: unread is not clean.
    const blind = { ...slowWalletPool, top10HoldersPct: null, devBalancePct: null, organicScore: null };
    expect(evaluatePreset(blind, PRESETS.slowwallet).misses).toEqual([
      "Top-10 holder ≤ 40%",
      "Saldo dev ≤ 5%",
      "Organic score ≥ 70",
    ]);
  });

  it("admits the established pairs the old $15M ceiling made unreachable", () => {
    // The ceiling was the reason a preset written for proven tokens could never
    // see one: every established pair on Solana trades above $15M.
    expect(evaluatePreset(slowWalletPool, PRESETS.slowwallet).passed).toBe(true);
    expect(slowWalletPool.marketCap).toBeGreaterThan(15_000_000);
    expect(evaluatePreset({ ...slowWalletPool, marketCap: 500_000_001 }, PRESETS.slowwallet).misses)
      .toContain("MC ≤ $500000000");
  });

  it("takes a calm pool paying far less than the $TOAD trade did", () => {
    // 0.2%/h was back-computed from that trade and is not a rate a deep
    // verified pair sustains. 0.03 is the floor now; just under it still fails.
    expect(evaluatePreset({ ...slowWalletPool, feeTvl1h: 0.03 }, PRESETS.slowwallet).passed).toBe(true);
    expect(evaluatePreset({ ...slowWalletPool, feeTvl1h: 0.029 }, PRESETS.slowwallet).misses)
      .toContain("Fee/TVL ≥ 0.03%");
  });

  it("keeps the optional gates opt-in", () => {
    // The new optional gates must stay opt-in: an existing preset that never
    // declared them cannot start failing on a field it does not screen.
    expect(PRESETS.slowwallet.top10HoldersMin).toBeUndefined();
    expect(PRESETS.slowwallet.volume5mMin).toBeUndefined();
    expect(PRESETS.slowwallet.sniperPctMax).toBeUndefined();
    expect(PRESETS.heartattack.ageHoursMin).toBeUndefined();
    expect(PRESETS.heartattack.requireVerified).toBeUndefined();
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

  it("reads the Hot/Watch ladder off the active preset", () => {
    // The same score means different things on the two ladders: 55 is a Hot on
    // the ladder built for calm verified pools and nothing at all on the one
    // built for runners that routinely score in the eighties.
    expect(poolTier(55, "slowwallet")).toBe("hot");
    expect(poolTier(55, "heartattack")).toBe("early");
  });

  it("reads the Heart Attack ladder high, matching what these pools actually score", () => {
    // Extreme momentum, fee efficiency far past the 2% cap, full volume
    // quality, and full freshness are 80 of the 100 points, and this preset
    // gates hard on all four — so its ladder sits far above Slow Wallet's.
    expect(calculateScore(heartAttackPool).total).toBeGreaterThanOrEqual(PRESETS.heartattack.hotScore);
    expect(poolTier(85, "heartattack")).toBe("hot");
    expect(poolTier(70, "heartattack")).toBe("watch");
    expect(poolTier(55, "heartattack")).toBe("early");
    expect(poolTier(54, "heartattack")).toBe("skip");
  });

  it("reads the Slow Wallet ladder low, matching what the score model can actually give it", () => {
    // Momentum capped at 20% and freshness capped at 5 (often 3) keep even a
    // qualifying pool far under the 65/80 shared default. The three pools that
    // cleared every gate in the 2026-08-19 live scan scored 39, 30 and 27, so
    // the ladder is set where those land rather than where the model's range
    // suggests they should.
    expect(poolTier(39, "slowwallet")).toBe("hot");
    expect(poolTier(30, "slowwallet")).toBe("watch");
    expect(poolTier(27, "slowwallet")).toBe("early");
    expect(poolTier(23, "slowwallet")).toBe("skip");
  });

  it("falls back to the default ladder for an unknown preset id", () => {
    expect(poolTier(70, "safer")).toBe(poolTier(70, DEFAULT_PRESET));
    expect(resolvePresetId("safer")).toBe(DEFAULT_PRESET);
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
      active_tvl: 8_000,
      fee_active_tvl_ratio: 2.5,
      volume_active_tvl_ratio: 3.125,
      avg_volume: 416.6,
      avg_fee: 3.3,
      avg_swap_count: 3,
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
    expect(normalized.activeTvl).toBe(8_000);
    expect(normalized.feeActiveTvl1h).toBe(2.5);
    expect(normalized.volumeActiveTvl1h).toBe(3.125);
    expect(normalized.avgVolumePerMin).toBe(416.6);
    expect(normalized.avgFeePerMin).toBe(3.3);
    expect(normalized.avgSwapsPerMin).toBe(3);
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
    expect(normalized.activeTvl).toBeNull();
    expect(normalized.feeActiveTvl1h).toBeNull();
    expect(normalized.volumeActiveTvl1h).toBeNull();
    expect(normalized.avgVolumePerMin).toBeNull();
    expect(normalized.avgFeePerMin).toBeNull();
    expect(normalized.avgSwapsPerMin).toBeNull();
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

  /**
   * These exist because the server matches misses by their rendered label —
   * that string is the only handle `evaluatePreset` gives it. If a threshold
   * moves and the two sides render it differently, the GMGN refresh rule stops
   * matching and goes quiet with no error anywhere, which is exactly the kind
   * of failure that takes weeks to notice. Anchoring the labels to the misses
   * `evaluatePreset` actually produces is what keeps the two from drifting.
   */
  describe("volatileGateLabels", () => {
    it("renders labels that evaluatePreset actually emits as misses", () => {
      const preset = PRESETS.heartattack;
      const stalled = {
        ...heartAttackPool,
        marketCap: 20_000,        // fails MC ≥, so both MC bounds are exercised
        priceChange1h: 0,         // fails 1h ≥
        gmgnVolume5m: 100,        // fails Vol 5m ≥
      };
      const { misses } = evaluatePreset(stalled, preset);
      const volatile = volatileGateLabels(preset);

      for (const label of ["MC ≥ $100000", "1h ≥ 10%", "Vol 5m ≥ $40000"]) {
        expect(misses).toContain(label);
        expect(volatile.has(label)).toBe(true);
      }
    });

    it("excludes the structural gates, which is what makes the rule selective", () => {
      const preset = PRESETS.heartattack;
      const dirty = { ...heartAttackPool, freezeAuthorityDisabled: false, top10HoldersPct: 90 };
      const { misses } = evaluatePreset(dirty, preset);
      const volatile = volatileGateLabels(preset);

      expect(misses).toContain("Freeze authority off");
      expect(misses).toContain("Top-10 holder ≤ 35%");
      for (const miss of misses) expect(volatile.has(miss)).toBe(false);
    });

    it("only names gates the preset declares", () => {
      // Slow Wallet has no five-minute volume gate, so no label for one.
      const volatile = volatileGateLabels(PRESETS.slowwallet);
      expect([...volatile].some((label) => label.startsWith("Vol 5m"))).toBe(false);
      expect(volatile.has("1h ≥ " + PRESETS.slowwallet.momentumMin + "%")).toBe(true);
    });

    it("accepts a preset id as well as a preset object", () => {
      expect(volatileGateLabels("heartattack")).toEqual(volatileGateLabels(PRESETS.heartattack));
    });
  });
});
