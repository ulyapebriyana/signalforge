import { describe, expect, it } from "vitest";
import {
  MAX_PRICE_IMPACT_PCT,
  normalizeSlippageBps,
  planZapOut,
  resolveZapTarget,
  shortfallPct,
  summarizeExecution,
} from "./zapOut.js";

const SOL = "So11111111111111111111111111111111111111112";
const TOKEN = "Mint1111111111111111111111111111111111111111";
const OTHER = "Zzzz1111111111111111111111111111111111111111";

/** A TOKEN-SOL pool: token is side X, SOL is side Y. */
const pool = {
  name: "TOKEN-SOL",
  tokenX: { symbol: "TOKEN", address: TOKEN, decimals: 6, price: 0.002 },
  tokenY: { symbol: "SOL", address: SOL, decimals: 9, price: 75 },
};

/** 1000 TOKEN and 0.5 SOL still in the position. */
const position = { amountX: 1000, amountY: 0.5 };

/** Swapping 1000 TOKEN yields ~0.0266 SOL, floor 0.0263 at 1% slippage. */
const quote = { outAmount: 0.0266, minimumOut: 0.0263, priceImpactPct: 0.4 };

describe("slippage", () => {
  it("accepts the ordinary range", () => {
    expect(normalizeSlippageBps(50)).toBe(50);
    expect(normalizeSlippageBps(500)).toBe(500);
  });

  it("refuses a setting no wallet should be asked to sign", () => {
    expect(normalizeSlippageBps(0)).toBeNull();
    expect(normalizeSlippageBps(9_999)).toBeNull();
    expect(normalizeSlippageBps("bukan angka")).toBeNull();
    expect(normalizeSlippageBps(null)).toBeNull();
  });
});

describe("target resolution", () => {
  it("swaps the token side when leaving in SOL", () => {
    const resolved = resolveZapTarget(pool, SOL);
    expect(resolved.targetSide).toBe("y");
    expect(resolved.source.symbol).toBe("TOKEN");
  });

  it("swaps the SOL side when leaving in the token", () => {
    expect(resolveZapTarget(pool, TOKEN).targetSide).toBe("x");
  });

  it("refuses a token the pool does not hold", () => {
    expect(resolveZapTarget(pool, OTHER)).toBeNull();
  });
});

describe("plan", () => {
  const base = { position, pool, targetMint: SOL, slippageBps: 100, quote };

  it("adds the withdrawn target side to the swapped side", () => {
    const plan = planZapOut(base);
    expect(plan.ok).toBe(true);
    expect(plan.needsSwap).toBe(true);
    // 0.5 SOL already held, plus ~0.0266 SOL from swapping 1000 TOKEN.
    expect(plan.estimatedTotal).toBeCloseTo(0.5266, 6);
    expect(plan.minimumTotal).toBeCloseTo(0.5263, 6);
  });

  it("keeps the guaranteed floor below the estimate", () => {
    const plan = planZapOut(base);
    expect(plan.minimumTotal).toBeLessThan(plan.estimatedTotal);
    expect(shortfallPct(plan)).toBeGreaterThan(0);
  });

  it("plans a withdrawal with no swap when the position is already one-sided", () => {
    const plan = planZapOut({ ...base, position: { amountX: 0, amountY: 2 } });
    expect(plan.ok).toBe(true);
    expect(plan.needsSwap).toBe(false);
    // Nothing to swap means the estimate is also the guarantee.
    expect(plan.estimatedTotal).toBe(2);
    expect(plan.minimumTotal).toBe(2);
  });

  it("refuses a target that is not one of the pool's mints", () => {
    const plan = planZapOut({ ...base, targetMint: OTHER });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("target-not-in-pool");
  });

  it("refuses a route worse than the hard impact ceiling", () => {
    const plan = planZapOut({ ...base, quote: { ...quote, priceImpactPct: MAX_PRICE_IMPACT_PCT + 0.1 } });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("impact-too-high");
  });

  it("refuses rather than assumes when price impact cannot be read", () => {
    const plan = planZapOut({ ...base, quote: { ...quote, priceImpactPct: null } });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("impact-unknown");
  });

  it("refuses when the swap leg has no quote at all", () => {
    const plan = planZapOut({ ...base, quote: null });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("quote-missing");
  });

  it("warns on a thin route without blocking it", () => {
    const plan = planZapOut({ ...base, quote: { ...quote, priceImpactPct: 4 } });
    expect(plan.ok).toBe(true);
    expect(plan.warnings.join(" ")).toMatch(/price impact/i);
  });

  it("warns when slippage is set loose enough to matter", () => {
    const plan = planZapOut({ ...base, slippageBps: 500 });
    expect(plan.warnings.join(" ")).toMatch(/slippage/i);
  });

  it("refuses an out-of-range slippage before looking at anything else", () => {
    expect(planZapOut({ ...base, slippageBps: 9_999 }).reason).toBe("slippage-invalid");
  });
});

describe("execution state", () => {
  const step = (status) => ({ status });

  it("reports progress while transactions confirm", () => {
    expect(summarizeExecution([step("confirmed"), step("pending")]).state).toBe("running");
  });

  it("reports done once every transaction lands", () => {
    const summary = summarizeExecution([step("confirmed"), step("confirmed")]);
    expect(summary.state).toBe("done");
    expect(summary.done).toBe(2);
  });

  it("calls out a half-finished withdrawal rather than calling it failed", () => {
    // The dangerous case: money has already moved, so "gagal" alone would be a
    // lie and retrying blindly could withdraw twice.
    const summary = summarizeExecution([step("confirmed"), step("failed")]);
    expect(summary.state).toBe("partial");
    expect(summary.partial).toBe(true);
    expect(summary.message).toMatch(/sebagian likuiditas sudah ditarik/i);
  });

  it("reports a clean failure when nothing landed", () => {
    expect(summarizeExecution([step("failed"), step("failed")]).state).toBe("failed");
  });

  it("starts idle", () => {
    expect(summarizeExecution([]).state).toBe("idle");
  });
});
