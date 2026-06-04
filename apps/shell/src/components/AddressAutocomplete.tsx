import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui";

const addressCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function getPrefixFromQuery(value: string) {
  const match = value.toLowerCase().match(/[a-z]{2,}/);
  if (match?.[0]) return match[0].slice(0, 2);

  const letters = value.toLowerCase().match(/[a-z]/g);
  if (letters && letters.length >= 2) return `${letters[0]}${letters[1]}`;
  return null;
}

function getAddressAssetUrl(prefix: string) {
  return new URL(`address/${prefix}.json`, window.location.origin + import.meta.env.BASE_URL).toString();
}

async function loadPrefix(prefix: string) {
  if (addressCache.has(prefix)) return addressCache.get(prefix) || [];
  if (inflight.has(prefix)) return inflight.get(prefix) || [];

  const promise = fetch(getAddressAssetUrl(prefix))
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data.map(String) : [];
    })
    .catch(() => [])
    .then((list) => {
      addressCache.set(prefix, list);
      inflight.delete(prefix);
      return list;
    });

  inflight.set(prefix, promise);
  return promise;
}

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxSuggestions?: number;
  disabled?: boolean;
};

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "输入地址",
  className,
  maxSuggestions = 8,
  disabled = false,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<number | null>(null);

  const query = useMemo(() => normalizeQuery(value), [value]);
  const prefix = useMemo(() => getPrefixFromQuery(query), [query]);

  useEffect(() => {
    let cancelled = false;

    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (disabled) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!prefix || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const handle = window.setTimeout(async () => {
      const list = await loadPrefix(prefix);
      if (cancelled) return;
      const filtered = list
        .filter((item) => item.toLowerCase().includes(query))
        .slice(0, maxSuggestions);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setActiveIndex(filtered.length ? 0 : -1);
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [prefix, query, maxSuggestions, disabled]);

  const commitSelection = (next: string) => {
    onChange(next);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        commitSelection(suggestions[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    blurTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  const handleFocus = () => {
    if (disabled) return;
    if (suggestions.length) setOpen(true);
  };

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={className}
        autoComplete="off"
        disabled={disabled}
      />
      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-white shadow-lg">
          <ul className="max-h-[260px] overflow-auto py-1 text-base">
            {suggestions.map((item, index) => {
              const active = index === activeIndex;
              return (
                <li key={`${item}-${index}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(item)}
                    className={[
                      "w-full px-3 py-2 text-left transition",
                      active ? "bg-[rgba(220,38,38,0.12)] text-[rgba(0,0,0,0.9)]" : "text-[rgba(0,0,0,0.75)]",
                      "hover:bg-[rgba(0,0,0,0.06)]",
                    ].join(" ")}
                  >
                    {item}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
