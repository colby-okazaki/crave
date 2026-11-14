import { createAreaCache } from "./areacache.js";
import { createGate, type Gate } from "./gate.js";
import { ApiError } from "./groups.js";

// Turns what someone types ("Berkeley", "Shattuck Ave, Oakland") into coordinates the
// restaurant search can use. The sign-up form can also skip this and send the phone's own
// location.
export interface Place {
  label: string;
  lat: number;
  lng: number;
}

export interface PlaceFinder {
  search(query: string): Promise<Place[]>;
}

// Used when RESTAURANT_SOURCE isn't osm, so local work doesn't need the internet
export const mockPlaceFinder: PlaceFinder = {
  async search() {
    return [{ label: "Berkeley, California", lat: 37.8716, lng: -122.2727 }];
  },
};

const DEFAULT_URL = "https://nominatim.openstreetmap.org/search";
const DAY_MS = 24 * 60 * 60 * 1000;

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

interface Options {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  gate?: Gate;
  timeoutMs?: number;
  now?: () => number;
}

const unavailable = () =>
  new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't look that place up right now. Try again in a minute.");

export function createNominatimPlaceFinder(options: Options = {}): PlaceFinder {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? process.env.NOMINATIM_URL ?? DEFAULT_URL;
  const timeoutMs = options.timeoutMs ?? 8000;
  const gate = options.gate ?? createGate({ now: options.now });
  // Places don't move, so remember answers for a day
  const cached = createAreaCache<Place[]>({ ttlMs: DAY_MS, now: options.now });

  async function lookup(query: string): Promise<Place[]> {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      dedupe: "1",
      "accept-language": "en",
    });
    try {
      await gate.waitForTurn();
      const res = await fetchFn(`${baseUrl}?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "crave-backend/0.1 (group restaurant picker)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw unavailable();
      const body = await res.json();
      if (!Array.isArray(body)) throw unavailable();
      return (body as NominatimPlace[]).map(toPlace).filter((p): p is Place => p !== null);
    } catch (err) {
      throw err instanceof ApiError ? err : unavailable();
    }
  }

  return {
    search(query) {
      const key = query.trim().toLowerCase().replace(/\s+/g, " ");
      return cached(key, () => lookup(key));
    },
  };
}

// "Berkeley, California" is easier to read than Nominatim's full address with county and zip
function toPlace(item: NominatimPlace): Place | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = item.address ?? {};
  const parts = [item.name ?? a.road, a.city ?? a.town ?? a.village, a.state, a.country_code === "us" ? undefined : a.country];
  const label = [...new Set(parts.filter((p): p is string => Boolean(p)))].join(", ");
  return { label: label || item.display_name || "Unnamed place", lat, lng };
}
