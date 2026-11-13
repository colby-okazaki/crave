// Remembers search results for an area, so many groups in the same neighborhood share one
// lookup. The key rounds the location to about 100 m; each group's distances are still
// worked out from its exact spot. A failed lookup is forgotten right away, so the area
// isn't stuck failing for the next hour.
export function areaKey(lat: number, lng: number, radius: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
}

export function createAreaCache<T>(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  const maxEntries = options.maxEntries ?? 500;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { at: number; value: Promise<T> }>();

  return function cached(key: string, load: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;

    const value = load();
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    entries.set(key, { at: now(), value });
    if (entries.size > maxEntries) {
      for (const [k, v] of entries) {
        if (now() - v.at >= ttlMs || entries.size > maxEntries) entries.delete(k);
      }
    }
    return value;
  };
}
