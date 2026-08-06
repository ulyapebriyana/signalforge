// Score is rendered as temperature everywhere in the Forge interface: cold iron
// at the bottom of the range, white-hot at the top. The stops below are the only
// place that mapping is defined.
const STOPS = [
  [0, [90, 76, 66]], // cold iron
  [40, [138, 74, 34]], // dull heat
  [55, [194, 65, 12]], // ember
  [70, [255, 106, 31]], // working heat
  [84, [255, 154, 60]], // hot
  [100, [255, 217, 160]], // white hot
];

const mix = (a, b, t) => Math.round(a + (b - a) * t);

export function heatRgb(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  let lower = STOPS[0];
  let upper = STOPS.at(-1);
  for (let index = 0; index < STOPS.length - 1; index += 1) {
    if (value >= STOPS[index][0] && value <= STOPS[index + 1][0]) {
      lower = STOPS[index];
      upper = STOPS[index + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const t = (value - lower[0]) / span;
  return [0, 1, 2].map((channel) => mix(lower[1][channel], upper[1][channel], t));
}

export const heatColor = (score) => `rgb(${heatRgb(score).join(" ")})`;
export const heatGlow = (score, alpha = 0.35) => `rgb(${heatRgb(score).join(" ")} / ${alpha})`;

/** CSS custom properties to hang on any element that should read as "this hot". */
export const heatVars = (score) => ({
  "--heat": heatColor(score),
  "--heat-soft": heatGlow(score, 0.16),
  "--heat-line": heatGlow(score, 0.42),
});

// Status is a pure score band. Whether a pool clears the preset gate is a
// separate question, answered in the drawer and the "Lolos gate" tab.
export const STATUS_META = {
  hot: { label: "Hot", blurb: "skor 80 ke atas" },
  watch: { label: "Watch", blurb: "skor 65–79" },
  early: { label: "Early", blurb: "skor 50–64" },
  skip: { label: "Skip", blurb: "skor di bawah 50" },
};

export const riskBand = (risk) => (risk <= 35 ? "low" : risk <= 55 ? "medium" : "high");
export const riskLabel = (risk) => ({ low: "Rendah", medium: "Sedang", high: "Tinggi" })[riskBand(risk)];
