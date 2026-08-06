import { useId } from "react";
import { heatColor } from "../../lib/heat.js";

/** Filled area sparkline. Tinted by the pool's own heat so it reads with the row. */
export function Spark({ values = [], score = 60, width = 120, height = 34, showAxis = false }) {
  const gradientId = useId();
  if (!Array.isArray(values) || values.length < 2) {
    return <div className="fx-spark-empty" style={{ width, height }} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const color = heatColor(score);

  return (
    <svg
      className="fx-spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Tren harga satu jam"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showAxis ? (
        <line x1="0" y1={height - pad} x2={width} y2={height - pad} stroke="currentColor" strokeOpacity="0.14" />
      ) : null}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={points.at(-1)[0]} cy={points.at(-1)[1]} r="2" fill={color} />
    </svg>
  );
}

const RADAR_AXES = [
  ["momentum", "Momentum", 25],
  ["feeEfficiency", "Fee", 25],
  ["volumeQuality", "Volume", 20],
  ["security", "Keamanan", 20],
  ["freshness", "Segar", 10],
];

/** Five-axis read of the score breakdown — one axis per scoring component. */
export function ScoreRadar({ breakdown = {}, score = 0, size = 190 }) {
  // The box is wider than it is tall so the outer labels have room to sit
  // beside the plot without being clipped by the viewBox.
  const width = size * 1.25;
  const center = width / 2;
  const middle = size / 2;
  const radius = size / 2 - 42;
  const color = heatColor(score);

  const point = (index, ratio) => {
    const angle = (Math.PI * 2 * index) / RADAR_AXES.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * ratio, middle + Math.sin(angle) * radius * ratio];
  };

  const shape = RADAR_AXES.map(([key, , max], index) => {
    const ratio = Math.max(0.02, Math.min(1, (breakdown[key] || 0) / max));
    return point(index, ratio);
  });

  const polygon = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg
      className="fx-radar"
      viewBox={`0 0 ${width} ${size}`}
      role="img"
      aria-label="Rincian skor per komponen"
    >
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={polygon(RADAR_AXES.map((_, index) => point(index, ring)))}
          fill="none"
          stroke="currentColor"
          strokeOpacity={ring === 1 ? 0.22 : 0.1}
        />
      ))}
      {RADAR_AXES.map((_, index) => {
        const [x, y] = point(index, 1);
        return <line key={index} x1={center} y1={middle} x2={x} y2={y} stroke="currentColor" strokeOpacity="0.1" />;
      })}
      <polygon points={polygon(shape)} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      {shape.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="2.5" fill={color} />
      ))}
      {RADAR_AXES.map(([key, label, max], index) => {
        const [x, y] = point(index, 1.34);
        const anchor = x > center + 4 ? "start" : x < center - 4 ? "end" : "middle";
        return (
          <text key={key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fx-radar-label">
            <tspan x={x} dy="-0.35em">
              {label}
            </tspan>
            <tspan x={x} dy="1.15em" fill={color}>
              {breakdown[key] ?? 0}/{max}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** Half-dial for risk. Risk is not heat — it uses the caution/scorch ramp instead. */
export function RiskDial({ risk = 0, size = 128 }) {
  const value = Math.max(0, Math.min(100, risk));
  const radius = size / 2 - 10;
  const center = size / 2;
  const circumference = Math.PI * radius;
  const color = value <= 35 ? "var(--f-quench)" : value <= 55 ? "var(--f-caution)" : "var(--f-scorch)";

  return (
    <div className="fx-dial" style={{ width: size, height: size / 2 + 22 }}>
      <svg viewBox={`0 0 ${size} ${size / 2 + 6}`} aria-hidden="true">
        <path
          d={`M 10 ${center} A ${radius} ${radius} 0 0 1 ${size - 10} ${center}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d={`M 10 ${center} A ${radius} ${radius} 0 0 1 ${size - 10} ${center}`}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (value / 100) * circumference}
        />
      </svg>
      <strong className="f-num" style={{ color }}>
        {value}
      </strong>
    </div>
  );
}

/** Score distribution across the enriched set. */
export function Distribution({ buckets = [] }) {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="fx-dist">
      {buckets.map((bucket) => {
        const mid = (bucket.floor + Math.min(100, bucket.ceil)) / 2;
        return (
          <div className="fx-dist-col" key={bucket.label}>
            <span className="fx-dist-count f-num">{bucket.count}</span>
            <div className="fx-dist-track">
              <i
                style={{
                  height: `${(bucket.count / peak) * 100}%`,
                  background: heatColor(mid),
                  boxShadow: `0 0 12px ${heatColor(mid)}55`,
                }}
              />
            </div>
            <span className="fx-dist-label f-num">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}
