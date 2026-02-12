import { useState } from "react";

function TagChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[rgba(37,99,235,0.25)] bg-[rgba(37,99,235,0.08)] px-2 py-0.5 text-[11px] text-[rgba(37,99,235,0.95)]">
      {text}
    </span>
  );
}

export function TagsCell({ selectedTags }: { selectedTags: string[] }) {
  const maxShow = 2;
  const shown = selectedTags.slice(0, maxShow);
  const rest = selectedTags.length - shown.length;
  const [tooltipStyle, setTooltipStyle] = useState<{ left: number; top: number } | null>(null);

  return (
    <div
      className="relative group flex items-center gap-2 min-w-0"
      onMouseEnter={(event) => {
        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
        setTooltipStyle({ left: rect.left, top: rect.bottom + 8 });
      }}
      onMouseLeave={() => setTooltipStyle(null)}
    >
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {shown.map((t, i) => (
          <TagChip key={`${t}-${i}`} text={t} />
        ))}
        {rest > 0 && (
          <span className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.02)] px-2 py-0.5 text-[11px] text-[rgba(0,0,0,0.55)]">
            +{rest}
          </span>
        )}
      </div>

      {selectedTags.length > 2 && (
        <div
          className="pointer-events-none fixed z-50 hidden w-[260px] rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-2 text-xs text-[rgba(0,0,0,0.72)] shadow-lg group-hover:block"
          style={tooltipStyle ? { left: tooltipStyle.left, top: tooltipStyle.top } : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((t, i) => (
              <TagChip key={`${t}-full-${i}`} text={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
