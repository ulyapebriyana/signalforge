import { describe, expect, it } from "vitest";
import { alertPresetsFor, cooldownKey, presetsCleared } from "./alertRouting.js";
import { PRESETS } from "./scoring.js";

const NOW = new Date("2026-08-10T12:00:00Z").getTime();
const minutes = (n) => n * 60_000;

/** A pool that clears whichever preset ids are listed, at a given score/risk. */
const pool = (passing, { score = 90, risk = 10, address = "pool1" } = {}) => ({
  address,
  score,
  risk,
  qualifies: Object.fromEntries(
    Object.keys(PRESETS).map((id) => [id, { passed: passing.includes(id), misses: [] }]),
  ),
});

const ids = (presets) => presets.map((preset) => preset.id);

describe("alert routing", () => {
  it("alerts on every preset a pool clears, not just one", () => {
    const both = pool(["yanman", "auzhinta"]);
    expect(ids(alertPresetsFor(both, new Map(), NOW))).toEqual(["yanman", "auzhinta"]);
  });

  it("judges each preset against its own score floor", () => {
    // 55 is above Auzhinta-like's floor of 48 and below Yanman-like's 65. The
    // old shared floor of 65 would have silenced the former entirely.
    const midFifties = pool(["yanman", "auzhinta"], { score: 55 });
    expect(ids(alertPresetsFor(midFifties, new Map(), NOW))).toEqual(["auzhinta"]);
  });

  it("judges each preset against its own risk ceiling", () => {
    const risky = pool(["yanman", "auzhinta"], { risk: 75 });
    // Yanman-like caps at 72, Auzhinta-like at 78.
    expect(ids(alertPresetsFor(risky, new Map(), NOW))).toEqual(["auzhinta"]);
  });

  it("keeps cooldowns independent per preset", () => {
    const both = pool(["yanman", "auzhinta"]);
    const cooldowns = new Map([[cooldownKey("pool1", "yanman"), NOW - minutes(5)]]);
    // Yanman-like waits 15 minutes, so it is still muted; Auzhinta-like is not.
    expect(ids(alertPresetsFor(both, cooldowns, NOW))).toEqual(["auzhinta"]);
  });

  it("releases a preset once its own cooldown expires", () => {
    const both = pool(["yanman", "auzhinta"]);
    const cooldowns = new Map([[cooldownKey("pool1", "yanman"), NOW - minutes(20)]]);
    expect(ids(alertPresetsFor(both, cooldowns, NOW))).toEqual(["yanman", "auzhinta"]);
  });

  it("stays silent for a pool that clears nothing", () => {
    expect(alertPresetsFor(pool([]), new Map(), NOW)).toEqual([]);
  });

  it("does not alert on a pool with no score or risk", () => {
    const unscored = { address: "x", qualifies: { yanman: { passed: true } } };
    expect(alertPresetsFor(unscored, new Map(), NOW)).toEqual([]);
  });

  it("reports gate-cleared presets separately from alert-worthy ones", () => {
    // Manual sends name what the pool clears, ignoring score, risk, and cooldown.
    const lowScore = pool(["yanman"], { score: 10 });
    expect(ids(presetsCleared(lowScore))).toEqual(["yanman"]);
    expect(alertPresetsFor(lowScore, new Map(), NOW)).toEqual([]);
  });
});
