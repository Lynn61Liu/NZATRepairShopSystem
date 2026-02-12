import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type TagOption = {
  id: string;       // e.g. "vip"
  label: string;    // e.g. "VIP"
  colorKey?: string; // 可选：如果你后面接 tagColorMap
};

type Props = {
  options: TagOption[];
  value: string[];                 // selected ids
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxChips?: number;               // 默认显示几个 chip，其余显示 +N
};

export function MultiTagSelect({
  options,
  value,
  onChange,
  placeholder = "Choose a tag",
  maxChips = 2,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const selectedOptions = useMemo(() => {
    const map = new Map(options.map((o) => [o.id, o]));
    return value.map((id) => map.get(id)).filter(Boolean) as TagOption[];
  }, [options, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, q]);

  const visibleChips = selectedOptions.slice(0, maxChips);
  const rest = selectedOptions.length - visibleChips.length;

  function toggle(id: string) {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* control */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "h-9 w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-2",
          "flex items-center justify-between gap-2",
          "outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]",
        ].join(" ")}
      >
        <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
          {selectedOptions.length === 0 ? (
            <span className="text-sm text-[rgba(0,0,0,0.45)]">{placeholder}</span>
          ) : (
            <>
              {visibleChips.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(37,99,235,0.25)] bg-[rgba(37,99,235,0.08)] px-2 py-0.5 text-[12px] text-[rgba(37,99,235,0.95)]"
                >
                  {t.label}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-[rgba(0,0,0,0.08)]"
                    title="Remove"
                  >
                    <X size={12} />
                  </span>
                </span>
              ))}
              {rest > 0 && (
                <span className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.02)] px-2 py-0.5 text-[12px] text-[rgba(0,0,0,0.55)]">
                  +{rest}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {selectedOptions.length > 0 && (
            <span
              onClick={clearAll}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[rgba(0,0,0,0.45)] hover:bg-[rgba(0,0,0,0.04)]"
              title="Clear"
            >
              <X size={16} />
            </span>
          )}
          <ChevronDown
            size={18}
            className={[
              "text-[rgba(0,0,0,0.45)] transition",
              open ? "rotate-180" : "",
            ].join(" ")}
          />
        </div>
      </button>

      {/* dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-full rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white shadow-lg">
          {/* search */}
          <div className="p-2 border-b border-[rgba(0,0,0,0.06)]">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(0,0,0,0.40)]"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="h-9 w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]"
              />
            </div>
          </div>

          {/* options */}
          <div className="max-h-56 overflow-auto p-2">
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 rounded-[8px] px-2 py-2 hover:bg-[rgba(0,0,0,0.03)] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 accent-[var(--ds-primary)]"
                    />
                    <span className="h-2.5 w-2.5 rounded-full bg-[rgba(37,99,235,0.55)]" />
                    <span className="text-sm text-[rgba(0,0,0,0.72)] truncate">
                      {o.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="px-2 py-6 text-sm text-[rgba(0,0,0,0.45)]">
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
