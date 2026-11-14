import { areaKey, createAreaCache } from "./areacache.js";
import { createGate, type Gate } from "./gate.js";
import { ApiError } from "./groups.js";
import { DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS, toStack, type OsmElement } from "./osm.js";
import type { Restaurant, RestaurantProvider } from "./restaurants.js";

// Restaurants from OpenStreetMap's Nominatim search. Free, no key, and it answers when the
// shared Overpass servers are busy. Some places also come with a photo, hours and a website.
//
// Nominatim's rules (https://operations.osmfoundation.org/policies/nominatim/): at most one
// request a second, a User-Agent that names the app, and no bulk use. So requests go through
// a one-a-second line, answers are remembered for an hour, and when the line gets long we
// say "busy" instead of making phones wait. Past a small app we'd need our own Nominatim
// server (set NOMINATIM_URL) or a paid provider.

const DEFAULT_URL = "https://nominatim.openstreetmap.org/search";
const KINDS = ["restaurant", "fast_food"];
const METERS_PER_DEGREE = 111_320;

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
}

interface Options {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  // Share one gate with anything else that talks to Nominatim; made here if not given
  gate?: Gate;
  minGapMs?: number;
  maxWaiting?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const unavailable = () =>
  new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't load restaurants right now. Try again in a minute.");

export function createNominatimProvider(options: Options = {}): RestaurantProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? process.env.NOMINATIM_URL ?? DEFAULT_URL;
  const timeoutMs = options.timeoutMs ?? 8000;
  const gate =
    options.gate ??
    createGate({ minGapMs: options.minGapMs, maxWaiting: options.maxWaiting, now: options.now, sleep: options.sleep });
  const cached = createAreaCache<OsmElement[]>({ now: options.now });

  async function searchKind(kind: string, lat: number, lng: number, radius: number): Promise<NominatimItem[]> {
    const dLat = radius / METERS_PER_DEGREE;
    const dLng = radius / (METERS_PER_DEGREE * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const params = new URLSearchParams({
      amenity: kind,
      viewbox: `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`, // left, top, right, bottom
      bounded: "1",
      format: "jsonv2",
      addressdetails: "1",
      extratags: "1",
      limit: "40",
      "accept-language": "en",
    });
    await gate.waitForTurn();
    const res = await fetchFn(`${baseUrl}?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "crave-backend/0.1 (group restaurant picker)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw unavailable();
    const body = await res.json();
    if (!Array.isArray(body)) throw unavailable();
    return body as NominatimItem[];
  }

  async function fetchElements(lat: number, lng: number, radius: number): Promise<OsmElement[]> {
    try {
      const found: OsmElement[] = [];
      const seen = new Set<string>();
      for (const kind of KINDS) {
        for (const item of await searchKind(kind, lat, lng, radius)) {
          const id = `${item.osm_type}${item.osm_id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          found.push(toElement(item));
        }
      }
      return found;
    } catch (err) {
      throw err instanceof ApiError ? err : unavailable();
    }
  }

  return {
    async search(location, filters): Promise<Restaurant[]> {
      const radius = Math.min(filters.radiusMeters ?? DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS);
      const key = areaKey(location.lat, location.lng, radius);
      const elements = await cached(key, () => fetchElements(location.lat, location.lng, radius));
      return toStack(elements, location, filters, radius);
    },
  };
}

// Dress a Nominatim result up as the same kind of element Overpass gives, so both
// sources share one way of turning places into cards.
function toElement(item: NominatimItem): OsmElement {
  const a = item.address ?? {};
  const tags: Record<string, string> = { ...(item.extratags ?? {}) };
  if (item.name) tags.name = item.name;
  if (a.house_number) tags["addr:housenumber"] = a.house_number;
  if (a.road) tags["addr:street"] = a.road;
  const city = a.city ?? a.town ?? a.village;
  if (city) tags["addr:city"] = city;
  if (a.state) tags["addr:state"] = a.state;
  return { type: item.osm_type, id: item.osm_id, lat: Number(item.lat), lon: Number(item.lon), tags };
}
