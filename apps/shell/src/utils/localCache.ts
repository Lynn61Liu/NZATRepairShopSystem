type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getCachedValue<T>(key: string): CacheEnvelope<T> | null {
  const fromMemory = memoryCache.get(key);
  if (fromMemory) {
    return fromMemory as CacheEnvelope<T>;
  }

  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "number" || !("data" in parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function setCachedValue<T>(key: string, data: T): CacheEnvelope<T> {
  const envelope: CacheEnvelope<T> = {
    savedAt: Date.now(),
    data,
  };

  memoryCache.set(key, envelope);

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(key, JSON.stringify(envelope));
    } catch {
      // Ignore storage write failures and keep the in-memory copy.
    }
  }

  return envelope;
}

export function removeCachedValue(key: string) {
  memoryCache.delete(key);

  if (canUseStorage()) {
    window.localStorage.removeItem(key);
  }
}

export async function readThroughCache<T>({
  key,
  fetcher,
  ttlMs,
}: {
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
}): Promise<T> {
  const cached = getCachedValue<T>(key);
  if (cached) {
    const isExpired = typeof ttlMs === "number" && ttlMs >= 0 && Date.now() - cached.savedAt > ttlMs;
    if (!isExpired) {
      return cached.data;
    }
  }

  const data = await fetcher();
  setCachedValue(key, data);
  return data;
}
