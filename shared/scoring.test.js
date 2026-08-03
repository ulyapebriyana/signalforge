import { describe, expect, it, vi } from "vitest";
import { calculateRisk, calculateScore, evaluatePreset, normalizePool, PRESETS } from "./scoring.js";

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

describe("SignalForge scoring", () => {
  it("scores a healthy momentum pool above the watch threshold", () => {
    expect(calculateScore(healthyPool).total).toBeGreaterThanOrEqual(65);
  });

  it("raises risk for active freeze authority and thin TVL", () => {
    const safe = calculateRisk(healthyPool).value;
    const risky = calculateRisk({ ...healthyPool, freezeAuthorityDisabled: false, tvl: 400 }).value;
    expect(risky).toBeGreaterThan(safe + 35);
  });

  it("keeps Safer and Yanman-like filters distinct", () => {
    const aggressiveOnly = { ...healthyPool, tvl: 7_000, priceChange1h: 26, volumeTvl1h: 0.8, feeTvl1h: 0.7 };
    expect(evaluatePreset(aggressiveOnly, PRESETS.safer).passed).toBe(false);
    expect(evaluatePreset(aggressiveOnly, PRESETS.yanman).passed).toBe(true);
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
    });

    expect(normalized.baseSymbol).toBe("TOKEN");
    expect(normalized.pair).toBe("SOL / TOKEN");
    expect(normalized.volumeTvl1h).toBe(1.25);
    expect(normalized.totalLps).toBe(42);
    expect(normalized.swaps1h).toBe(180);
    expect(normalized.traders1h).toBe(73);
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
  });
});
