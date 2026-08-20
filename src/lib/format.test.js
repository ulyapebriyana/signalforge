import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdExact } from "./format.js";

/**
 * The positions page shows the reader their own money, and the compact
 * formatter it used to share with the scanner cannot. These tests exist so the
 * two do not get swapped back for each other: they are both correct, for
 * different jobs.
 */
describe("formatUsdExact", () => {
  it("keeps the digits the compact formatter throws away", () => {
    // The case that motivated it: two positions $470 apart, one string.
    expect(formatUsd(12_480.55)).toBe(formatUsd(12_010));
    expect(formatUsdExact(12_480.55)).toBe("$12,480.55");
    expect(formatUsdExact(12_010)).toBe("$12,010.00");
  });

  it("keeps cents on the small numbers, which is where fees live", () => {
    expect(formatUsdExact(318.4)).toBe("$318.40");
    expect(formatUsdExact(4.2)).toBe("$4.20");
    expect(formatUsdExact(0)).toBe("$0.00");
  });

  it("renders an unpriced position as a dash rather than $0.00", () => {
    // A pool with no price feed is not a position worth nothing, and the two
    // must never print the same.
    expect(formatUsdExact(null)).toBe("—");
    expect(formatUsdExact(undefined)).toBe("—");
    expect(formatUsdExact(Number.NaN)).toBe("—");
    expect(formatUsdExact(0)).not.toBe("—");
  });

  it("keeps the sign on a negative", () => {
    expect(formatUsdExact(-1_738.2)).toBe("-$1,738.20");
  });
});
