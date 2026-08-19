import { beforeEach, describe, expect, it } from "vitest";
import {
  alignPinning,
  clearTablePrefs,
  loadTablePrefs,
  moveColumnId,
  normalizeOrder,
  saveTablePrefs,
} from "./tablePrefs.js";

const MIDDLE = ["phase", "tvl", "risk", "ageHours"];
const DEFAULTS = ["phase", "tvl"];

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

beforeEach(() => store.clear());

describe("normalizeOrder", () => {
  it("keeps every known column exactly once, with the link last", () => {
    const order = normalizeOrder(["score", "tvl", "link", "star"], MIDDLE);
    expect(order).toEqual(["pair", "score", "tvl", "star", "phase", "risk", "ageHours", "link"]);
  });

  it("drops ids the catalogue no longer has", () => {
    expect(normalizeOrder(["star", "pair", "score", "gone", "tvl"], MIDDLE)).not.toContain("gone");
  });

  it("covers hidden columns too, so un-hiding one cannot strand it past the link", () => {
    // The order arriving here lists only the preset's visible columns.
    const order = normalizeOrder(["star", "pair", "score", "tvl", "link"], MIDDLE);
    expect(order.indexOf("risk")).toBeGreaterThan(-1);
    expect(order.indexOf("risk")).toBeLessThan(order.indexOf("link"));
  });
});

describe("alignPinning", () => {
  const order = ["star", "pair", "score", "phase", "tvl", "risk", "link"];

  it("re-sorts each region by the order array", () => {
    expect(alignPinning({ start: ["score", "star", "pair"], end: ["link"] }, order)).toEqual({
      start: ["star", "pair", "score"],
      end: ["link"],
    });
  });

  it("drops ids missing from the order and de-duplicates", () => {
    expect(alignPinning({ start: ["star", "star", "gone"] }, order)).toEqual({
      start: ["star"],
      end: [],
    });
  });

  it("tolerates a missing end region", () => {
    expect(alignPinning({ start: [] }, order)).toEqual({ start: [], end: [] });
  });
});

describe("moveColumnId", () => {
  const order = ["a", "b", "c", "d"];

  it("lands after the target when dragged rightwards", () => {
    expect(moveColumnId(order, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("lands before the target when dragged leftwards", () => {
    expect(moveColumnId(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("swaps a neighbouring pair rather than doing nothing", () => {
    expect(moveColumnId(order, "b", "c")).toEqual(["a", "c", "b", "d"]);
    expect(moveColumnId(order, "c", "b")).toEqual(["a", "c", "b", "d"]);
  });

  it("returns the same array for a no-op, so the caller can skip the render", () => {
    expect(moveColumnId(order, "b", "b")).toBe(order);
    expect(moveColumnId(order, "b", "zz")).toBe(order);
  });
});

describe("loadTablePrefs", () => {
  it("opens a untouched preset on its own columns, with the rest hidden", () => {
    const prefs = loadTablePrefs("vanchu", DEFAULTS, MIDDLE);
    expect(prefs.columnOrder).toEqual(["star", "pair", "score", "phase", "tvl", "risk", "ageHours", "link"]);
    expect(prefs.columnVisibility).toEqual({ risk: false, ageHours: false });
    expect(prefs.columnPinning).toEqual({ start: ["star", "pair", "score"], end: [] });
  });

  it("round-trips a saved layout, pinning included", () => {
    saveTablePrefs("vanchu", {
      columnOrder: ["star", "pair", "tvl", "score", "phase", "risk", "ageHours", "link"],
      columnVisibility: { phase: false },
      columnPinning: { start: ["star", "pair"], end: ["link"] },
    });
    const prefs = loadTablePrefs("vanchu", DEFAULTS, MIDDLE);
    expect(prefs.columnOrder).toEqual(["star", "pair", "tvl", "score", "phase", "risk", "ageHours", "link"]);
    expect(prefs.columnVisibility).toEqual({ phase: false });
    expect(prefs.columnPinning).toEqual({ start: ["star", "pair"], end: ["link"] });
  });

  it("realigns a stored pinning that disagrees with the stored order", () => {
    saveTablePrefs("vanchu", {
      columnOrder: ["pair", "star", "score", "phase", "tvl", "risk", "ageHours", "link"],
      columnVisibility: {},
      columnPinning: { start: ["star", "pair", "score"], end: [] },
    });
    expect(loadTablePrefs("vanchu", DEFAULTS, MIDDLE).columnPinning.start).toEqual([
      "pair",
      "star",
      "score",
    ]);
  });

  it("ignores a columnSizing key left over from when the table could be resized", () => {
    store.set(
      "signalforge:table:vanchu",
      JSON.stringify({
        v: 2,
        columnOrder: ["star", "pair", "score", "tvl", "phase", "risk", "ageHours", "link"],
        columnVisibility: {},
        columnSizing: { tvl: 400 },
        columnPinning: { start: ["star", "pair", "score"], end: [] },
      }),
    );
    expect(loadTablePrefs("vanchu", DEFAULTS, MIDDLE)).not.toHaveProperty("columnSizing");
  });

  it("migrates a v1 array into the split slices", () => {
    store.set("signalforge:columns:vanchu", JSON.stringify(["risk", "tvl"]));
    const prefs = loadTablePrefs("vanchu", DEFAULTS, MIDDLE);
    expect(prefs.columnOrder).toEqual(["star", "pair", "score", "risk", "tvl", "phase", "ageHours", "link"]);
    expect(prefs.columnVisibility).toEqual({ phase: false, ageHours: false });
  });

  it("falls back to the preset defaults when the stored blob is corrupt", () => {
    store.set("signalforge:table:vanchu", "{not json");
    expect(loadTablePrefs("vanchu", DEFAULTS, MIDDLE).columnVisibility).toEqual({
      risk: false,
      ageHours: false,
    });
  });

  it("clears both formats", () => {
    store.set("signalforge:columns:vanchu", JSON.stringify(["risk"]));
    saveTablePrefs("vanchu", { columnOrder: [], columnVisibility: {}, columnPinning: {} });
    clearTablePrefs("vanchu");
    expect(store.size).toBe(0);
  });
});
