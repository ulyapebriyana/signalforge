import { describe, expect, it } from "vitest";
import { collectSignalEntries, getPoolSignalStatus } from "./signalTransitions.js";

const pool = (address, score, passed = true) => ({
  address,
  pair: `SOL / ${address}`,
  score,
  qualifies: { slowwallet: { passed } },
});

describe("signal status transitions", () => {
  it("classifies only qualified watch and hot pools", () => {
    expect(getPoolSignalStatus(pool("watch", 32), "slowwallet")).toBe("watch");
    expect(getPoolSignalStatus(pool("hot", 40), "slowwallet")).toBe("hot");
    expect(getPoolSignalStatus(pool("blocked", 90, false), "slowwallet")).toBe("none");
  });

  it("signals on the active preset's ladder, not a fixed one", () => {
    // 32 is what a deep, verified, calm pool actually scores — a real Watch
    // under Slow Wallet and nothing at all under Heart Attack, whose pools
    // routinely score in the eighties. A fixed floor made the former
    // unreachable.
    const calm = { address: "m", pair: "SOL / M", score: 32, qualifies: { slowwallet: { passed: true }, heartattack: { passed: true } } };
    expect(getPoolSignalStatus(calm, "slowwallet")).toBe("watch");
    expect(getPoolSignalStatus(calm, "heartattack")).toBe("none");
  });

  it("detects a new watch entry and a watch-to-hot upgrade", () => {
    const previous = new Map([["upgrade", "watch"], ["steady", "watch"]]);
    const { entries } = collectSignalEntries([
      pool("new", 32),
      pool("upgrade", 44),
      pool("steady", 33),
    ], "slowwallet", previous);

    expect(entries.map(({ pool: item, status, previousStatus }) => [item.address, status, previousStatus])).toEqual([
      ["new", "watch", "none"],
      ["upgrade", "hot", "watch"],
    ]);
  });

  it("does not alert for a repeated status or a downgrade", () => {
    const previous = new Map([["steady", "hot"], ["downgrade", "hot"]]);
    const { entries } = collectSignalEntries([
      pool("steady", 90),
      pool("downgrade", 32),
    ], "slowwallet", previous);

    expect(entries).toHaveLength(0);
  });
});
