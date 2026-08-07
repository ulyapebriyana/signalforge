import { describe, expect, it } from "vitest";
import { collectSignalEntries, getPoolSignalStatus } from "./signalTransitions.js";

const pool = (address, score, passed = true) => ({
  address,
  pair: `SOL / ${address}`,
  score,
  qualifies: { yanman: { passed } },
});

describe("signal status transitions", () => {
  it("classifies only qualified watch and hot pools", () => {
    expect(getPoolSignalStatus(pool("watch", 70), "yanman")).toBe("watch");
    expect(getPoolSignalStatus(pool("hot", 84), "yanman")).toBe("hot");
    expect(getPoolSignalStatus(pool("blocked", 90, false), "yanman")).toBe("none");
  });

  it("signals on the active preset's ladder, not a fixed one", () => {
    // A mid-fifties memecoin pool is a real signal under Auzhinta-like and
    // nothing under Yanman-like. Before the ladder moved onto the preset, the
    // fixed 65 floor made the former unreachable.
    const midFifties = { address: "m", pair: "SOL / M", score: 53, qualifies: { yanman: { passed: true }, auzhinta: { passed: true } } };
    expect(getPoolSignalStatus(midFifties, "auzhinta")).toBe("watch");
    expect(getPoolSignalStatus(midFifties, "yanman")).toBe("none");
  });

  it("detects a new watch entry and a watch-to-hot upgrade", () => {
    const previous = new Map([["upgrade", "watch"], ["steady", "watch"]]);
    const { entries } = collectSignalEntries([
      pool("new", 72),
      pool("upgrade", 88),
      pool("steady", 73),
    ], "yanman", previous);

    expect(entries.map(({ pool: item, status, previousStatus }) => [item.address, status, previousStatus])).toEqual([
      ["new", "watch", "none"],
      ["upgrade", "hot", "watch"],
    ]);
  });

  it("does not alert for a repeated status or a downgrade", () => {
    const previous = new Map([["steady", "hot"], ["downgrade", "hot"]]);
    const { entries } = collectSignalEntries([
      pool("steady", 90),
      pool("downgrade", 70),
    ], "yanman", previous);

    expect(entries).toHaveLength(0);
  });
});
