import { describe, expect, it } from "vitest";
import { appendSample, pruneStore, summarizeVelocity, VELOCITY_WINDOW_MS } from "./feeVelocity.js";

const T0 = new Date("2026-08-07T10:00:00Z").getTime();
const minutes = (n) => n * 60_000;

/** Build a window of samples 30 seconds apart, oldest first. */
const series = (values, start = T0) => values.map((v, index) => ({ t: start + index * 30_000, v }));

describe("fee velocity", () => {
  it("reports no trend until there are enough samples", () => {
    const summary = summarizeVelocity(series([2, 2]), T0 + minutes(1));
    expect(summary.trend).toBe("unknown");
    expect(summary.samples).toBe(2);
  });

  it("calls a steadily paying pool steady", () => {
    const summary = summarizeVelocity(series([2, 2.1, 1.95, 2.05, 2, 2.02]), T0 + minutes(3));
    expect(summary.trend).toBe("steady");
    expect(summary.ratioToPeak).toBeGreaterThan(0.9);
  });

  it("flags a pool whose fees are draining away", () => {
    const summary = summarizeVelocity(series([3, 2.9, 2.8, 2.2, 2.1, 2.0]), T0 + minutes(3));
    expect(summary.trend).toBe("decaying");
    expect(summary.changePct).toBeLessThan(-25);
  });

  it("calls a pool stalled once it falls well off its peak", () => {
    // The last two readings tick up, but the machine has already slowed: the
    // exit rule cares about distance from peak, not the final wiggle.
    const summary = summarizeVelocity(series([4, 3.2, 1.4, 0.6, 0.8, 0.9]), T0 + minutes(3));
    expect(summary.trend).toBe("stalled");
    expect(summary.ratioToPeak).toBeLessThan(0.4);
  });

  it("catches a pool waking back up", () => {
    const summary = summarizeVelocity(series([1, 1.1, 1.2, 1.8, 2.1, 2.4]), T0 + minutes(3));
    expect(summary.trend).toBe("rising");
  });

  it("drops samples that have aged out of the window", () => {
    const stale = [{ t: T0, v: 5 }];
    const appended = appendSample(stale, 1, T0 + VELOCITY_WINDOW_MS + minutes(1));
    expect(appended).toHaveLength(1);
    expect(appended[0].v).toBe(1);
  });

  it("overwrites rather than stacks when a scan replays the same timestamp", () => {
    let samples = appendSample([], 2, T0);
    samples = appendSample(samples, 2, T0);
    samples = appendSample(samples, 2, T0);
    expect(samples).toHaveLength(1);
  });

  it("ignores a reading that is not a number", () => {
    const samples = appendSample([{ t: T0, v: 2 }], null, T0 + 30_000);
    expect(samples).toHaveLength(1);
  });

  it("keeps a pool the scanner still returns and drops one it has forgotten", () => {
    const store = new Map([
      ["live", [{ t: T0, v: 2 }]],
      ["gone", [{ t: T0, v: 2 }]],
    ]);
    pruneStore(store, ["live"], T0 + VELOCITY_WINDOW_MS + minutes(1));
    expect([...store.keys()]).toEqual(["live"]);
  });

  it("keeps a pool that has only just dropped out of the scan", () => {
    const store = new Map([["recent", [{ t: T0, v: 2 }]]]);
    pruneStore(store, [], T0 + minutes(5));
    expect(store.has("recent")).toBe(true);
  });
});
