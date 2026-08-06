import { describe, expect, it } from "vitest";
import { collectSignalEntries, getPoolSignalStatus } from "./signalTransitions.js";

const pool = (address, score, passed = true) => ({
  address,
  pair: `SOL / ${address}`,
  score,
  qualifies: { safer: { passed } },
});

describe("signal status transitions", () => {
  it("classifies only qualified watch and hot pools", () => {
    expect(getPoolSignalStatus(pool("watch", 70), "safer")).toBe("watch");
    expect(getPoolSignalStatus(pool("hot", 84), "safer")).toBe("hot");
    expect(getPoolSignalStatus(pool("blocked", 90, false), "safer")).toBe("none");
  });

  it("detects a new watch entry and a watch-to-hot upgrade", () => {
    const previous = new Map([["upgrade", "watch"], ["steady", "watch"]]);
    const { entries } = collectSignalEntries([
      pool("new", 72),
      pool("upgrade", 88),
      pool("steady", 73),
    ], "safer", previous);

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
    ], "safer", previous);

    expect(entries).toHaveLength(0);
  });
});
