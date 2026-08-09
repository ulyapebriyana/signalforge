import { describe, expect, it } from "vitest";
import { bandOf, gateLabel, rubricReport, rubricTally, SWANNY_GMGN_KEYS, SWANNY_RUBRIC } from "./swannyRubric.js";

const spec = (key) => SWANNY_RUBRIC.find((row) => row.key === key);

describe("Swanny rubric bands", () => {
  it("reads a ceiling metric the way the tool does", () => {
    const top10 = spec("top10HoldersPct"); // green ≤15, yellow ≤30
    expect(bandOf(12, top10)).toBe("green");
    expect(bandOf(15, top10)).toBe("green");
    expect(bandOf(22, top10)).toBe("yellow");
    expect(bandOf(30, top10)).toBe("yellow");
    expect(bandOf(31, top10)).toBe("red");
  });

  it("flips the comparison for the inverse metrics", () => {
    const mcap = spec("marketCap"); // green ≥500K, yellow ≥100K
    expect(bandOf(750_000, mcap)).toBe("green");
    expect(bandOf(500_000, mcap)).toBe("green");
    expect(bandOf(250_000, mcap)).toBe("yellow");
    expect(bandOf(99_000, mcap)).toBe("red");
  });

  it("treats token age as safer when older, unlike the pool-age gate", () => {
    const age = spec("tokenAgeHours"); // green ≥168h, yellow ≥24h
    expect(bandOf(200, age)).toBe("green");
    expect(bandOf(40, age)).toBe("yellow");
    expect(bandOf(6, age)).toBe("red");
  });

  it("never calls a missing value green", () => {
    for (const row of SWANNY_RUBRIC) {
      expect(bandOf(null, row)).toBe("unknown");
      expect(bandOf(undefined, row)).toBe("unknown");
      expect(bandOf(Number.NaN, row)).toBe("unknown");
    }
  });

  it("names the rows that cannot be filled without a GMGN key", () => {
    expect(SWANNY_GMGN_KEYS).toEqual([
      "gmgnSniperPct",
      "gmgnSniperWallets",
      "gmgnInsidersPct",
      "gmgnBundlerPct",
      "gmgnPhishingPct",
      "gmgnTotalFeesSol",
    ]);
  });

  it("names a failed row by its requirement, not by a negation", () => {
    // "Bundler tidak merah" prefixed with a cross made readers unpick a double
    // negative to learn that bundler was red.
    expect(gateLabel(spec("gmgnBundlerPct"))).toBe("Bundler ≤ 12%");
    expect(gateLabel(spec("organicScore"))).toBe("Organic score ≥ 50");
    expect(gateLabel(spec("tokenAgeHours"))).toBe("Umur token ≥ 24 jam");
    expect(gateLabel(spec("gmgnTotalFeesSol"))).toBe("Total fee ≥ 20 SOL");
    expect(gateLabel(spec("marketCap"))).toBe("Market cap ≥ $100,000");
  });

  it("keeps every gate label free of negations", () => {
    for (const row of SWANNY_RUBRIC) {
      expect(gateLabel(row)).not.toMatch(/tidak|bukan|non-/i);
      expect(gateLabel(row)).toMatch(/[≥≤]/);
    }
  });

  it("reports every row and tallies the bands", () => {
    const pool = { rugCheckScore: 8, organicScore: 91, marketCap: 900_000, tokenAgeHours: 300 };
    const report = rubricReport(pool);
    expect(report).toHaveLength(SWANNY_RUBRIC.length);
    expect(report[0]).toMatchObject({ key: "rugCheckScore", value: 8, band: "green" });

    const tally = rubricTally(pool);
    expect(tally.green).toBe(4);
    expect(tally.unknown).toBe(SWANNY_RUBRIC.length - 4);
  });
});
