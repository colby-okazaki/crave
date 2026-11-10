import { ApiError, type Filters } from "./groups.js";
import type { Restaurant, RestaurantProvider } from "./restaurants.js";

// Restaurants from OpenStreetMap through the Overpass API. Free, no key.
//
// OpenStreetMap has no photos, ratings or price levels, so those come back as null.
// The public Overpass servers are shared and sometimes busy, so this tries a list of
// servers in order, remembers answers for an hour, and gives a clear error if every
// server fails. For heavy use we'd run our own Overpass server or switch providers.

const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const DEFAULT_RADIUS_METERS = 3000;
const MAX_RADIUS_METERS = 10000;
const MAX_RESULTS = 20;
const CACHE_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Options {
  fetchFn?: typeof fetch;
  endpoints?: string[];
  timeoutMs?: number;
  now?: () => number;
}

export function createOsmProvider(options: Options = {}): RestaurantProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const endpoints =
    options.endpoints ??
    (process.env.OVERPASS_URLS?.split(",").map((u) => u.trim()).filter(Boolean) || DEFAULT_ENDPOINTS);
  const timeoutMs = options.timeoutMs ?? 8000;
  const now = options.now ?? Date.now;

  // Many groups search the same neighborhood, so share answers. The key rounds the
  // location to about 100 m; distances are still worked out from each group's exact spot.
  const cache = new Map<string, { at: number; elements: Promise<OsmElement[]> }>();

  async function fetchElements(lat: number, lng: number, radius: number): Promise<OsmElement[]> {
    const query =
      `[out:json][timeout:20];` +
      `nwr["amenity"~"^(restaurant|fast_food)$"]["name"](around:${radius},${lat},${lng});` +
      `out center tags 200;`;
    for (const url of endpoints) {
      try {
        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "crave-backend/0.1 (group restaurant picker)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as { elements?: OsmElement[] };
        if (Array.isArray(body.elements)) return body.elements;
      } catch {
        // Busy, slow or unreachable: try the next server
      }
    }
    throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't load restaurants right now. Try again in a minute.");
  }

  function elementsFor(lat: number, lng: number, radius: number): Promise<OsmElement[]> {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.elements;

    const elements = fetchElements(lat, lng, radius);
    // A failed lookup must not stick around, or the area stays broken for an hour
    elements.catch(() => {
      if (cache.get(key)?.elements === elements) cache.delete(key);
    });
    cache.set(key, { at: now(), elements });
    if (cache.size > MAX_CACHE_ENTRIES) {
      for (const [k, v] of cache) {
        if (now() - v.at >= CACHE_MS || cache.size > MAX_CACHE_ENTRIES) cache.delete(k);
      }
    }
    return elements;
  }

  return {
    async search(location, filters) {
      const radius = Math.min(filters.radiusMeters ?? DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS);
      const elements = await elementsFor(location.lat, location.lng, radius);
      return elements
        .map((el) => toRestaurant(el, location))
        .filter((r): r is Restaurant => r !== null && r.distanceMeters <= radius)
        .filter((r) => matchesCuisine(r, filters))
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, MAX_RESULTS);
    },
  };
}

function toRestaurant(el: OsmElement, origin: { lat: number; lng: number }): Restaurant | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  const lat = el.center?.lat ?? el.lat;
  const lng = el.center?.lon ?? el.lon;
  if (!name || lat === undefined || lng === undefined) return null;

  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const address = [street, tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ");
  const website = tags.website ?? tags["contact:website"];

  return {
    id: `osm_${el.type}_${el.id}`,
    name,
    photoUrl: null,
    price: null,
    rating: null,
    distanceMeters: Math.round(distanceMeters(origin, { lat, lng })),
    address: address || "Address not listed",
    hours: simpleHours(tags.opening_hours),
    location: { lat, lng },
    cuisine: cuisineLabel(tags.cuisine),
    menuUrl: website && /^https?:\/\//.test(website) ? website : undefined,
  };
}

// OpenStreetMap's opening_hours can be very detailed ("Mo-Fr 11:00-14:00; Sa off").
// We only show it when it's the same every day, and leave it out otherwise.
function simpleHours(value?: string): string | null {
  const m = value?.trim().match(/^(?:Mo-Su |daily )?(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)$/i);
  return m ? `${m[1]}–${m[2]}` : null;
}

// OpenStreetMap lists cuisines like "mexican;taco" or "ice_cream"
function osmCuisines(value?: string): string[] {
  return (value ?? "").split(";").map((c) => c.trim().toLowerCase().replace(/_/g, " ")).filter(Boolean);
}

function cuisineLabel(value?: string): string | undefined {
  const first = osmCuisines(value)[0];
  return first ? first[0].toUpperCase() + first.slice(1) : undefined;
}

function matchesCuisine(r: Restaurant, filters: Filters): boolean {
  if (!filters.cuisine?.length) return true;
  const wanted = filters.cuisine.map((c) => c.toLowerCase());
  const has = osmCuisines(r.cuisine);
  return has.some((c) => wanted.includes(c));
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
