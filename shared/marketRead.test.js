import { describe, expect, it } from "vitest";
import {
  BURST_LABEL,
  burstBand,
  classifyPhase,
  deriveMarketRead,
  MARKET_CONDITION_META,
  PHASE_META,
  projectFees,
  readMarket,
} from "./marketRead.js";

const pool = (overrides = {}) => ({
  tvl: 100_000,
  activeTvl: 90_000,
  volume1h: 600_000,
  volume24h: 14_400_000,
  gmgnVolume1m: 10_000,
  gmgnVolume5m: 50_000,
  feeTvl1h: 2,
  swaps1h: 4_800,
  ageHours: 48,
  priceChange1h: 40,
  ...overrides,
});

describe("token burst", () => {
  it("compares the last minute against the five-minute average pace", () => {
    // 50K over 5m is 10K/min, and the last minute did 10K. Same pace.
    expect(deriveMarketRead(pool()).tokenBurst).toBe(1);
  });

  it("reads above 1 when the last minute outran the window", () => {
    expect(deriveMarketRead(pool({ gmgnVolume1m: 25_000 })).tokenBurst).toBe(2.5);
  });

  it("stays null without a GMGN reading, rather than reading as zero flow", () => {
    expect(deriveMarketRead(pool({ gmgnVolume1m: null })).tokenBurst).toBeNull();
    expect(deriveMarketRead(pool({ gmgnVolume5m: null })).tokenBurst).toBeNull();
  });

  it("stays null on a token too quiet for the ratio to mean anything", () => {
    expect(deriveMarketRead(pool({ gmgnVolume5m: 200 })).tokenBurst).toBeNull();
  });
});

describe("pool burst", () => {
  it("compares this hour's pace against the pool's own daily pace", () => {
    // 600K/h against 14.4M/day is exactly the daily average.
    expect(deriveMarketRead(pool()).poolBurst).toBe(1);
  });

  it("clips the daily window to the pool's age, so a young pool is not inflated", () => {
    // Two hours old: the "24h" figure covers two hours, so the honest daily pace
    // is volume24h/120min, not volume24h/1440min.
    const young = deriveMarketRead(pool({ ageHours: 2, volume24h: 1_200_000 }));
    expect(young.poolBurst).toBe(1);
    // Without the age clip this same pool would have read 12x.
    expect(young.poolBurstIsYoung).toBe(true);
  });

  it("uses the full day for a pool old enough to have one", () => {
    expect(deriveMarketRead(pool({ ageHours: 200 })).poolBurst).toBe(1);
    expect(deriveMarketRead(pool({ ageHours: 200 })).poolBurstIsYoung).toBe(false);
  });

  it("does not divide by a zero-age window", () => {
    expect(Number.isFinite(deriveMarketRead(pool({ ageHours: 0 })).poolBurst)).toBe(true);
  });

  it("stays null on a pool with too little daily volume to compare against", () => {
    expect(deriveMarketRead(pool({ volume24h: 500 })).poolBurst).toBeNull();
  });

  it("bands both readings, and every band has a label", () => {
    expect(burstBand(3)).toBe("erupting");
    expect(burstBand(1.5)).toBe("accelerating");
    expect(burstBand(0.9)).toBe("holding");
    expect(burstBand(0.5)).toBe("cooling");
    expect(burstBand(0.1)).toBe("dying");
    expect(burstBand(null)).toBe("unknown");
    for (const band of ["erupting", "accelerating", "holding", "cooling", "dying", "unknown"]) {
      expect(BURST_LABEL[band]).toBeTruthy();
    }
  });
});

describe("fee rate", () => {
  it("turns fee/TVL per hour into the per-minute unit a short hold is paid in", () => {
    const read = deriveMarketRead(pool());
    expect(read.feePerMinPct).toBeCloseTo(0.0333, 4);
    expect(read.minutesTo1Pct).toBe(30);
  });

  it("does not divide by a zero fee rate", () => {
    expect(deriveMarketRead(pool({ feeTvl1h: 0 })).minutesTo1Pct).toBeNull();
  });
});

describe("flow against depth", () => {
  it("counts how much of the pool's TVL trades through per minute", () => {
    expect(deriveMarketRead(pool()).poolTurnover).toBeCloseTo(0.1);
  });

  it("sizes an average trade against pool TVL", () => {
    const read = deriveMarketRead(pool());
    expect(read.avgTradeSize).toBeCloseTo(125);
    expect(read.tradeImpact).toBeCloseTo(0.00125);
  });

  it("estimates what share of the token's flow runs through this pool", () => {
    // Token does 50K/5m, so ~600K/h extrapolated; the pool did 600K of it.
    expect(deriveMarketRead(pool()).venueShare).toBe(1);
    expect(deriveMarketRead(pool({ volume1h: 60_000 })).venueShare).toBeCloseTo(0.1);
  });

  it("caps the venue share at 1 rather than reporting an impossible 300%", () => {
    expect(deriveMarketRead(pool({ volume1h: 5_000_000 })).venueShare).toBe(1);
  });

  it("reports active TVL as the plain share it is, never as an active-bin subset", () => {
    expect(deriveMarketRead(pool()).activeShare).toBeCloseTo(0.9);
    // Upstream really does report a share above 1 on some pools, and that has to
    // survive rather than be clamped into looking like a subset.
    expect(deriveMarketRead(pool({ activeTvl: 101_000 })).activeShare).toBeCloseTo(1.01);
    expect(deriveMarketRead(pool({ activeTvl: null })).activeShare).toBeNull();
  });
});

describe("phase", () => {
  const read = (overrides = {}, trend = "steady") => {
    const base = pool(overrides);
    return { ...base, ...deriveMarketRead(base), feeVelocity: { trend } };
  };

  it("calls a pool igniting when the last minute doubles the window and price is up", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 25_000 }))).toBe("igniting");
  });

  it("does not call it igniting while the price is falling", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 25_000, priceChange1h: -12 }))).toBe("running");
  });

  it("calls a pool running when the pace holds and fees are steady", () => {
    expect(classifyPhase(read())).toBe("running");
  });

  it("lets a stalled fee override a hot minute", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 40_000 }, "stalled"))).toBe("dead");
  });

  it("reads decaying fees against still-strong flow as the peak", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 20_000 }, "decaying"))).toBe("peaking");
  });

  it("reads decaying fees against weak flow as fading", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 3_000 }, "decaying"))).toBe("fading");
  });

  it("calls collapsed flow dead even while fees still read steady", () => {
    expect(classifyPhase(read({ gmgnVolume1m: 200 }))).toBe("dead");
  });

  it("falls back to pool burst when GMGN gave nothing", () => {
    const noGmgn = read({ gmgnVolume1m: null, gmgnVolume5m: null, volume1h: 60_000 });
    // 60K/h against a 600K/h daily pace is 0.1x — collapsed.
    expect(classifyPhase(noGmgn)).toBe("dead");
  });

  it("falls back to fee velocity alone when neither burst is readable", () => {
    const blind = { volume1h: null, gmgnVolume1m: null, gmgnVolume5m: null, volume24h: null };
    expect(classifyPhase({ ...blind, ...deriveMarketRead(blind), feeVelocity: { trend: "rising" } })).toBe("igniting");
    expect(classifyPhase({ ...blind, ...deriveMarketRead(blind), feeVelocity: { trend: "steady" } })).toBe("running");
    expect(classifyPhase({ ...blind, ...deriveMarketRead(blind), feeVelocity: { trend: "unknown" } })).toBe("unknown");
  });

  it("returns unknown when neither witness has anything to say", () => {
    expect(classifyPhase({})).toBe("unknown");
  });

  it("has meta for every phase it can return", () => {
    for (const phase of ["igniting", "running", "peaking", "fading", "dead", "unknown"]) {
      expect(PHASE_META[phase].label).toBeTruthy();
      expect(PHASE_META[phase].action).toBeTruthy();
    }
  });
});

describe("fee projection", () => {
  it("projects the current rate over a hold", () => {
    const projected = projectFees(deriveMarketRead(pool()), 1_000, 10);
    // 0.0333%/min on $1,000 is $0.33/min.
    expect(projected.perMinute).toBeCloseTo(0.333, 2);
    expect(projected.overHold).toBeCloseTo(3.33, 1);
  });

  it("derives the rate itself when handed a raw pool", () => {
    expect(projectFees(pool(), 1_000, 10).perMinute).toBeCloseTo(0.333, 2);
  });

  it("returns null rather than a zero projection when the rate is unreadable", () => {
    expect(projectFees(pool({ feeTvl1h: null }), 1_000)).toBeNull();
    expect(projectFees(pool(), 0)).toBeNull();
  });
});

describe("market read", () => {
  const scanned = (phases) =>
    phases.map((phase) => ({ phase, tokenBurst: 1, volume1h: 1_000, totalFees1h: 60 }));

  it("calls the market hot when several pools are igniting at once", () => {
    expect(readMarket(scanned(["igniting", "igniting", "igniting", "dead"])).condition).toBe("panas");
  });

  it("calls it active when enough are live without three igniting", () => {
    expect(readMarket(scanned(["igniting", "running", "running", "running"])).condition).toBe("aktif");
  });

  it("calls it thin on a single live pool", () => {
    expect(readMarket(scanned(["running", "dead", "fading"])).condition).toBe("tipis");
  });

  it("calls it quiet when nothing is running", () => {
    expect(readMarket(scanned(["dead", "fading", "peaking"])).condition).toBe("sepi");
    expect(readMarket([]).condition).toBe("sepi");
  });

  it("classifies pools that arrive without a phase already attached", () => {
    const base = pool();
    expect(readMarket([{ ...base, ...deriveMarketRead(base), feeVelocity: { trend: "steady" } }]).phases.running).toBe(1);
  });

  it("totals only the readings it actually has", () => {
    const read = readMarket([
      { phase: "running", volume1h: 1_000, totalFees1h: 60, tokenBurst: 1 },
      { phase: "dead", volume1h: null, totalFees1h: null, tokenBurst: null, poolBurst: null },
    ]);
    expect(read.volume1h).toBe(1_000);
    expect(read.feePerHour).toBe(60);
    expect(read.feePerMin).toBe(1);
    expect(read.burstReadable).toBe(1);
    expect(read.medianBurst).toBe(1);
  });

  it("falls back to pool burst for the median when token burst is missing", () => {
    expect(readMarket([{ phase: "running", poolBurst: 2, volume1h: 1 }]).medianBurst).toBe(2);
  });

  it("has meta for every condition it can name", () => {
    for (const condition of ["panas", "aktif", "tipis", "sepi"]) {
      expect(MARKET_CONDITION_META[condition].label).toBeTruthy();
    }
  });
});
