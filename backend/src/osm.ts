import { areaKey, createAreaCache } from "./areacache.js";
import { ApiError, type Filters } from "./groups.js";
import type { Restaurant, RestaurantProvider } from "./restaurants.js";

// Restaurants from OpenStreetMap through the Overpass API. Free, no key.
//
// OpenStreetMap has no ratings or price levels (and only some places have a photo), so those
// come back as null.
// The public Overpass servers are shared and sometimes busy, so this tries a list of
// servers in order, remembers answers for an hour, and gives a clear error if every
// server fails. For heavy use we'd run our own Overpass server or switch providers.

const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
export const DEFAULT_RADIUS_METERS = 3000;
export const MAX_RADIUS_METERS = 10000;
const MAX_RESULTS = 20;

export interface OsmElement {
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
  const cached = createAreaCache<OsmElement[]>({ now: options.now });

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

  return {
    async search(location, filters) {
      const radius = Math.min(filters.radiusMeters ?? DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS);
      const key = areaKey(location.lat, location.lng, radius);
      const elements = await cached(key, () => fetchElements(location.lat, location.lng, radius));
      return toStack(elements, location, filters, radius);
    },
  };
}

// Turns raw OpenStreetMap elements into the cards a group swipes through: drops anything
// without a name or position or outside the radius, applies the cuisine filter, nearest first.
export function toStack(
  elements: OsmElement[],
  location: { lat: number; lng: number },
  filters: Filters,
  radius: number,
): Restaurant[] {
  return elements
    .map((el) => toRestaurant(el, location))
    .filter((r): r is Restaurant => r !== null && r.distanceMeters <= radius)
    .filter((r) => matchesCuisine(r, filters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_RESULTS);
}

export function toRestaurant(el: OsmElement, origin: { lat: number; lng: number }): Restaurant | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  const lat = el.center?.lat ?? el.lat;
  const lng = el.center?.lon ?? el.lon;
  if (!name || lat === undefined || lng === undefined) return null;

  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const address = [street, tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ");
  const website = tags.website ?? tags["contact:website"];
  const image = tags.image;

  return {
    id: `osm_${el.type}_${el.id}`,
    name,
    photoUrl: image && /^https?:\/\//.test(image) ? image : null,
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

export function matchesCuisine(r: Restaurant, filters: Filters): boolean {
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
