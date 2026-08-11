import { describe, expect, it } from "vitest";
import {
  binIdToPrice,
  collectPositionAlerts,
  isEarning,
  rangeProgress,
  rangeState,
  summarizePosition,
  summarizeWallet,
  toDecimalAmount,
} from "./lpPositions.js";

/** A SOL-USDC shaped pool: 9 decimals against 6, priced either side. */
const pool = {
  name: "SOL-USDC",
  binStep: 20,
  tvl: 5_233_836,
  apr: 0.108,
  feeTvl1h: 0.42,
  tokenX: { symbol: "SOL", decimals: 9, price: 75 },
  tokenY: { symbol: "USDC", decimals: 6, price: 1 },
};

/** 1 SOL and 75 USDC sitting in a range that straddles the active bin. */
const position = {
  positionKey: "pos1",
  poolAddress: "pool1",
  binStep: 20,
  lowerBinId: -10,
  upperBinId: 10,
  activeBinId: 0,
  totalXAmount: "1000000000",
  totalYAmount: "75000000",
  feeX: "10000000",
  feeY: "500000",
  claimedFeeX: "0",
  claimedFeeY: "2000000",
  lastUpdatedAt: 1_754_900_000,
};

describe("raw amounts", () => {
  it("converts base units to a human amount", () => {
    expect(toDecimalAmount("1000000000", 9)).toBe(1);
    expect(toDecimalAmount("75000000", 6)).toBe(75);
  });

  it("reports null rather than NaN when the mint's decimals are unknown", () => {
    expect(toDecimalAmount("1000", undefined)).toBeNull();
    expect(toDecimalAmount(null, 9)).toBeNull();
  });
});

describe("bin prices", () => {
  it("puts bin zero at the decimal-adjusted parity price", () => {
    // 1.0 in base units, scaled by 10^(9-6) — a SOL priced in USDC.
    expect(binIdToPrice(0, 20, 9, 6)).toBeCloseTo(1000, 6);
  });

  it("steps geometrically by the bin step", () => {
    const step = binIdToPrice(1, 20, 9, 6) / binIdToPrice(0, 20, 9, 6);
    expect(step).toBeCloseTo(1.002, 9);
  });

  it("prices lower bins under higher ones", () => {
    expect(binIdToPrice(-10, 20, 9, 6)).toBeLessThan(binIdToPrice(10, 20, 9, 6));
  });

  it("refuses a pool with no bin step rather than guessing", () => {
    expect(binIdToPrice(5, 0, 9, 6)).toBeNull();
    expect(binIdToPrice(5, null, 9, 6)).toBeNull();
  });
});

describe("range state", () => {
  it("places the active bin across the range", () => {
    expect(rangeProgress(0, -10, 10)).toBeCloseTo(0.5, 9);
    expect(rangeProgress(-10, -10, 10)).toBe(0);
    expect(rangeProgress(10, -10, 10)).toBe(1);
  });

  it("reads a position the price has fallen through as below", () => {
    expect(rangeState(rangeProgress(-20, -10, 10))).toBe("below");
  });

  it("reads a position the price has run past as above", () => {
    expect(rangeState(rangeProgress(20, -10, 10))).toBe("above");
  });

  it("warns while still earning, before the position goes flat", () => {
    // Bin 9 of a -10..10 range is inside and still collecting, but one more
    // move up ends it — that is the moment worth acting on.
    const state = rangeState(rangeProgress(9, -10, 10));
    expect(state).toBe("edge");
    expect(isEarning(state)).toBe(true);
  });

  it("treats a comfortably centred position as inside", () => {
    expect(rangeState(rangeProgress(0, -10, 10))).toBe("inside");
  });

  it("stops counting an out-of-range position as earning", () => {
    expect(isEarning("below")).toBe(false);
    expect(isEarning("above")).toBe(false);
  });

  it("handles a single-bin position, which has no width to divide by", () => {
    expect(rangeState(rangeProgress(5, 5, 5))).toBe("inside");
    expect(rangeState(rangeProgress(4, 5, 5))).toBe("below");
    expect(rangeState(rangeProgress(6, 5, 5))).toBe("above");
  });

  it("reports unknown when a bin id is missing", () => {
    expect(rangeProgress(null, -10, 10)).toBeNull();
    expect(rangeState(null)).toBe("unknown");
  });
});

describe("position summary", () => {
  it("values both sides of the position in dollars", () => {
    const summary = summarizePosition(position, pool);
    // 1 SOL at $75 plus 75 USDC at $1.
    expect(summary.valueUsd).toBeCloseTo(150, 6);
  });

  it("separates fees still owed from fees already taken", () => {
    const summary = summarizePosition(position, pool);
    // 0.01 SOL + 0.5 USDC unclaimed; 2 USDC claimed.
    expect(summary.unclaimedFeesUsd).toBeCloseTo(1.25, 6);
    expect(summary.claimedFeesUsd).toBeCloseTo(2, 6);
    expect(summary.totalFeesUsd).toBeCloseTo(3.25, 6);
  });

  it("shows the range as prices, not just bin ids", () => {
    const summary = summarizePosition(position, pool);
    expect(summary.lowerPrice).toBeLessThan(summary.activePrice);
    expect(summary.upperPrice).toBeGreaterThan(summary.activePrice);
  });

  it("carries the pool's own fee rate through, so the exit call has both halves", () => {
    const summary = summarizePosition(position, pool);
    expect(summary.poolFeeTvl1h).toBe(0.42);
    expect(summary.pair).toBe("SOL-USDC");
  });

  it("declines to total a position it can only half price", () => {
    const unpriced = { ...pool, tokenY: { ...pool.tokenY, price: null } };
    const summary = summarizePosition(position, unpriced);
    expect(summary.valueUsd).toBeNull();
    // The range verdict does not depend on price and still stands.
    expect(summary.rangeState).toBe("inside");
  });
});

describe("position alerts", () => {
  /** A position record with only the fields the transition rules read. */
  const at = (state, key = "pos1") => ({ positionKey: key, rangeState: state, earning: isEarning(state) });

  it("says nothing the first time it sees a position", () => {
    const { entries, currentStates } = collectPositionAlerts([at("above")], new Map());
    expect(entries).toEqual([]);
    // The state is still recorded, so the next read has a baseline to compare.
    expect(currentStates.get("pos1")).toBe("above");
  });

  it("fires when an earning position goes flat", () => {
    const previous = new Map([["pos1", "inside"]]);
    const { entries } = collectPositionAlerts([at("below")], previous);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("out-of-range");
    expect(entries[0].previousState).toBe("inside");
  });

  it("warns once a centred position drifts to the edge", () => {
    const { entries } = collectPositionAlerts([at("edge")], new Map([["pos1", "inside"]]));
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("near-edge");
  });

  it("still fires when a position skips the edge and exits outright", () => {
    const { entries } = collectPositionAlerts([at("above")], new Map([["pos1", "edge"]]));
    expect(entries[0].kind).toBe("out-of-range");
  });

  it("stays quiet while nothing changes", () => {
    expect(collectPositionAlerts([at("edge")], new Map([["pos1", "edge"]])).entries).toEqual([]);
  });

  it("stays quiet when a position comes back into range", () => {
    expect(collectPositionAlerts([at("inside")], new Map([["pos1", "above"]])).entries).toEqual([]);
    expect(collectPositionAlerts([at("inside")], new Map([["pos1", "edge"]])).entries).toEqual([]);
  });

  it("does not treat an unreadable position as an exit", () => {
    expect(collectPositionAlerts([at("unknown")], new Map([["pos1", "inside"]])).entries).toEqual([]);
  });

  it("tracks positions independently", () => {
    const previous = new Map([["pos1", "inside"], ["pos2", "inside"]]);
    const { entries } = collectPositionAlerts([at("above", "pos1"), at("inside", "pos2")], previous);
    expect(entries).toHaveLength(1);
    expect(entries[0].position.positionKey).toBe("pos1");
  });
});

describe("wallet summary", () => {
  const inside = summarizePosition(position, pool);
  const out = summarizePosition({ ...position, positionKey: "pos2", activeBinId: 40 }, pool);

  it("counts which positions are still working", () => {
    const totals = summarizeWallet([inside, out]);
    expect(totals.positionCount).toBe(2);
    expect(totals.earningCount).toBe(1);
    expect(totals.outOfRangeCount).toBe(1);
  });

  it("adds up value and fees across positions", () => {
    const totals = summarizeWallet([inside, out]);
    expect(totals.valueUsd).toBeCloseTo(300, 6);
    expect(totals.totalFeesUsd).toBeCloseTo(6.5, 6);
  });

  it("skips an unpriceable position instead of counting it as zero", () => {
    const unpriced = summarizePosition(position, { ...pool, tokenX: { ...pool.tokenX, price: null } });
    const totals = summarizeWallet([inside, unpriced]);
    expect(totals.pricedCount).toBe(1);
    expect(totals.valueUsd).toBeCloseTo(150, 6);
  });

  it("reports null value when nothing could be priced at all", () => {
    const unpriced = summarizePosition(position, { ...pool, tokenX: { ...pool.tokenX, price: null } });
    expect(summarizeWallet([unpriced]).valueUsd).toBeNull();
  });
});
