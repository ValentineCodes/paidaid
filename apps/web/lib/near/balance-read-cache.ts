const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 256;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function balanceCacheKey(parts: string[]): string {
  return parts.join("|");
}

export function readBalanceCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeBalanceCache<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) {
      cache.delete(first);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearBalanceCacheForTests(): void {
  cache.clear();
}
