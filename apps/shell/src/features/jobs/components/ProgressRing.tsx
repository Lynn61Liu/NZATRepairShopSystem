export function ProgressRing({
  value,
  size = 34,
}: {
  value: number | null;
  size?: number;
}) {
  if (value === null) {
    return <div className="h-2 w-8 rounded-full bg-[rgba(0,0,0,0.12)]" />;
  }

  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;

  const color =
    pct >= 80
      ? "stroke-[rgba(34,197,94,1)]"
      : pct >= 40
      ? "stroke-[rgba(245,158,11,1)]"
      : "stroke-[rgba(239,68,68,1)]";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          className="stroke-[rgba(0,0,0,0.10)]"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          className={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-[rgba(0,0,0,0.60)]">
        {pct}%
      </span>
    </div>
  );
}
