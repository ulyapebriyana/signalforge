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
    const both = pool(["heartattack", "slowwallet"]);
    expect(ids(alertPresetsFor(both, new Map(), NOW))).toEqual(["heartattack", "slowwallet"]);
  });

  it("judges each preset against its own score floor", () => {
    // 40 is above Slow Wallet's floor of 26 and far below Heart Attack's 65.
    // A single shared floor could only ever be right for one of the two.
    const forty = pool(["heartattack", "slowwallet"], { score: 40 });
    expect(ids(alertPresetsFor(forty, new Map(), NOW))).toEqual(["slowwallet"]);
  });

  it("judges each preset against its own risk ceiling", () => {
    // Slow Wallet caps at 45, Heart Attack at 95 — the whole difference between
    // the two plays, expressed as one number.
    const risky = pool(["heartattack", "slowwallet"], { risk: 60 });
    expect(ids(alertPresetsFor(risky, new Map(), NOW))).toEqual(["heartattack"]);
  });

  it("keeps cooldowns independent per preset", () => {
    const both = pool(["heartattack", "slowwallet"]);
    const cooldowns = new Map([[cooldownKey("pool1", "slowwallet"), NOW - minutes(5)]]);
    // Slow Wallet waits an hour, so it is still muted; Heart Attack waits 3
    // minutes and is not.
    expect(ids(alertPresetsFor(both, cooldowns, NOW))).toEqual(["heartattack"]);
  });

  it("releases a preset once its own cooldown expires", () => {
    const both = pool(["heartattack", "slowwallet"]);
    const cooldowns = new Map([[cooldownKey("pool1", "slowwallet"), NOW - minutes(70)]]);
    expect(ids(alertPresetsFor(both, cooldowns, NOW))).toEqual(["heartattack", "slowwallet"]);
  });

  it("stays silent for a pool that clears nothing", () => {
    expect(alertPresetsFor(pool([]), new Map(), NOW)).toEqual([]);
  });

  it("does not alert on a pool with no score or risk", () => {
    const unscored = { address: "x", qualifies: { slowwallet: { passed: true } } };
    expect(alertPresetsFor(unscored, new Map(), NOW)).toEqual([]);
  });

  it("reports gate-cleared presets separately from alert-worthy ones", () => {
    // Manual sends name what the pool clears, ignoring score, risk, and cooldown.
    const lowScore = pool(["slowwallet"], { score: 10 });
    expect(ids(presetsCleared(lowScore))).toEqual(["slowwallet"]);
    expect(alertPresetsFor(lowScore, new Map(), NOW)).toEqual([]);
  });
});
