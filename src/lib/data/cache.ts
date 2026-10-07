import "server-only"

const store = new Map<string, { at: number; value: Promise<unknown> }>()

/**
 * A short-lived in-memory cache for data every member sees the same way (tickers, published
 * targets, weeks). Admin writes call invalidate() so their own instance is fresh at once; other
 * server instances catch up within the TTL.
 */
export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = load()
  store.set(key, { at: Date.now(), value })
  value.catch(() => store.delete(key))
  return value
}

export function invalidate(...prefixes: string[]): void {
  for (const key of store.keys()) if (prefixes.some((p) => key.startsWith(p))) store.delete(key)
}
