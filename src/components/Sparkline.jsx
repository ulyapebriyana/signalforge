export function Sparkline({ values = [], width = 128, height = 38, className = "" }) {
  if (values.length < 2) return <div className={`sparkline-empty ${className}`} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  return (
    <svg className={`sparkline ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tren harga satu jam">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
