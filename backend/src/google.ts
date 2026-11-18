import type { RequestHandler } from "express";
import { ApiError, type Filters } from "./groups.js";
import { DEFAULT_RADIUS_METERS, distanceMeters, MAX_RADIUS_METERS } from "./osm.js";
import type { Restaurant, RestaurantProvider } from "./restaurants.js";

// Real restaurants with photos, prices and ratings from the Google Places API (New).
// Needs a key (GOOGLE_PLACES_API_KEY) on a billing-enabled Google Cloud project, and every
// request is billed, so keep a budget cap on the project. Switched on with RESTAURANT_SOURCE=google.
const API = "https://places.googleapis.com/v1";
const MAX_RESULTS = 20;
// Google's own limit for a search circle
const GOOGLE_MAX_RADIUS = 50_000;

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.priceLevel",
  "places.rating",
  "places.photos",
  "places.regularOpeningHours",
  "places.utcOffsetMinutes",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
].join(",");

const PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  priceLevel?: string;
  rating?: number;
  photos?: { name?: string }[];
  regularOpeningHours?: { periods?: { open?: { day?: number; hour?: number; minute?: number }; close?: { hour?: number; minute?: number } }[] };
  utcOffsetMinutes?: number;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
}

interface Options {
  apiKey: string;
  fetchFn?: typeof fetch;
  // Where phones can reach this server, so photo links point back at it
  publicUrl?: string;
  now?: () => number;
}

const two = (n: number | undefined) => String(n ?? 0).padStart(2, "0");

// "11:00–21:00" for today in the place's own time zone, or null when it's closed, open all day
// or unknown
function hoursToday(place: GooglePlace, now: number): string | null {
  const periods = place.regularOpeningHours?.periods;
  if (!periods?.length) return null;
  const today = new Date(now + (place.utcOffsetMinutes ?? 0) * 60_000).getUTCDay();
  const todays = periods.filter((p) => p.open?.day === today && p.close);
  if (!todays.length) return null;
  const first = todays[0].open!;
  const last = todays[todays.length - 1].close!;
  return `${two(first.hour)}:${two(first.minute)}–${two(last.hour)}:${two(last.minute)}`;
}

export function toGoogleRestaurant(
  place: GooglePlace,
  origin: { lat: number; lng: number },
  publicUrl: string,
  now: number,
): Restaurant | null {
  const name = place.displayName?.text?.trim();
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || !name || lat === undefined || lng === undefined) return null;

  const photo = /^places\/([\w-]+)\/photos\/([\w-]+)$/.exec(place.photos?.[0]?.name ?? "");
  const cuisine = place.primaryTypeDisplayName?.text?.replace(/ restaurant$/i, "").trim();
  return {
    id: `gp_${place.id}`,
    name,
    photoUrl: photo ? `${publicUrl}/photos/${photo[1]}/${photo[2]}` : null,
    price: PRICE[place.priceLevel ?? ""] ?? null,
    rating: typeof place.rating === "number" ? Math.round(place.rating * 10) / 10 : null,
    distanceMeters: Math.round(distanceMeters(origin, { lat, lng })),
    address: place.formattedAddress ?? "Address not listed",
    hours: hoursToday(place, now),
    location: { lat, lng },
    ...(cuisine && cuisine.toLowerCase() !== "restaurant" ? { cuisine } : {}),
    ...(place.websiteUri ? { menuUrl: place.websiteUri } : {}),
  };
}

export function createGoogleProvider(options: Options): RestaurantProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const publicUrl = options.publicUrl ?? defaultPublicUrl();
  const now = options.now ?? Date.now;

  async function post(path: string, body: unknown): Promise<{ places?: GooglePlace[] }> {
    let res: Response;
    try {
      res = await fetchFn(`${API}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": options.apiKey, "X-Goog-FieldMask": FIELDS },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't reach the restaurant service. Try again.");
    }
    if (!res.ok) throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "The restaurant service is busy. Try again.");
    return (await res.json()) as { places?: GooglePlace[] };
  }

  return {
    async search(location: { lat: number; lng: number }, filters: Filters) {
      const radius = Math.min(filters.radiusMeters ?? DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS, GOOGLE_MAX_RADIUS);
      const center = { latitude: location.lat, longitude: location.lng };
      const circle = { circle: { center, radius } };

      // A cuisine filter is a text search ("mexican or thai restaurant"); otherwise plain nearby search
      const data = filters.cuisine?.length
        ? await post("places:searchText", {
            textQuery: `${filters.cuisine.map((c) => c.replace(/_/g, " ")).join(" or ")} restaurant`,
            includedType: "restaurant",
            locationBias: circle,
            rankPreference: "DISTANCE",
            pageSize: MAX_RESULTS,
          })
        : await post("places:searchNearby", {
            includedTypes: ["restaurant"],
            locationRestriction: circle,
            rankPreference: "DISTANCE",
            maxResultCount: MAX_RESULTS,
          });

      const t = now();
      return (data.places ?? [])
        .map((p) => toGoogleRestaurant(p, location, publicUrl, t))
        .filter((r): r is Restaurant => r !== null && r.distanceMeters <= radius)
        .filter((r) => !filters.price?.length || r.price === null || filters.price.includes(r.price))
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, MAX_RESULTS);
    },
  };
}

function defaultPublicUrl(): string {
  return (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
}

// GET /photos/:placeId/:photoId serves a place photo from Google. Phones ask us, not Google,
// so the API key never leaves the server. Only well-formed photo IDs are passed on, so this
// can't be used to fetch anything else with the key. Kept for an hour in memory to avoid paying
// for the same photo once per phone.
const PHOTO_TTL_MS = 60 * 60 * 1000;
const PHOTO_CACHE_MAX = 200;

export function createPhotoHandler(options: { apiKey: string; fetchFn?: typeof fetch; now?: () => number }): RequestHandler {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; type: string; bytes: Buffer }>();

  return async (req, res, next) => {
    try {
      const place = String(req.params.placeId);
      const photo = String(req.params.photoId);
      if (!/^[\w-]{1,200}$/.test(place) || !/^[\w-]{1,600}$/.test(photo)) {
        throw new ApiError(404, "NOT_FOUND", "That photo doesn't exist.");
      }
      const key = `${place}/${photo}`;
      let entry = cache.get(key);
      if (!entry || now() - entry.at > PHOTO_TTL_MS) {
        let upstream: Response;
        try {
          upstream = await fetchFn(`${API}/places/${place}/photos/${photo}/media?maxWidthPx=800`, {
            headers: { "X-Goog-Api-Key": options.apiKey },
            signal: AbortSignal.timeout(8000),
          });
        } catch {
          throw new ApiError(502, "PHOTO_UNAVAILABLE", "Couldn't load that photo.");
        }
        if (!upstream.ok) throw new ApiError(upstream.status === 404 ? 404 : 502, "PHOTO_UNAVAILABLE", "Couldn't load that photo.");
        entry = { at: now(), type: upstream.headers.get("content-type") ?? "image/jpeg", bytes: Buffer.from(await upstream.arrayBuffer()) };
        if (cache.size >= PHOTO_CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, entry);
      }
      res.set({ "Content-Type": entry.type, "Cache-Control": "public, max-age=3600" }).send(entry.bytes);
    } catch (err) {
      next(err);
    }
  };
}
