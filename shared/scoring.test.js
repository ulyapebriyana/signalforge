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
