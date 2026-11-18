import { createGate } from "./gate.js";
import { createGoogleProvider, createPhotoHandler } from "./google.js";
import { createNominatimProvider } from "./nominatim.js";
import { createOsmProvider } from "./osm.js";
import { createNominatimPlaceFinder, mockPlaceFinder, type PlaceFinder } from "./places.js";
import { mockProvider, type RestaurantProvider } from "./restaurants.js";

// Try one source, and if it fails try the next
export function withFallback(primary: RestaurantProvider, backup: RestaurantProvider): RestaurantProvider {
  return {
    async search(location, filters) {
      try {
        return await primary.search(location, filters);
      } catch {
        return backup.search(location, filters);
      }
    },
  };
}

// RESTAURANT_SOURCE picks where restaurants come from:
// - google: Google Places, with photos, prices and ratings. Needs GOOGLE_PLACES_API_KEY and is billed
//   per request. If Google fails (or the quota runs out) it falls back to OpenStreetMap.
// - osm: real places from OpenStreetMap, free: Nominatim first, and the Overpass servers if it fails.
// - anything else (the default): the fake data in docs/mock/, so tests and local work never
//   depend on the internet.
const googleKey = process.env.GOOGLE_PLACES_API_KEY;
const useGoogle = process.env.RESTAURANT_SOURCE === "google" && !!googleKey;
if (process.env.RESTAURANT_SOURCE === "google" && !googleKey) {
  console.warn("RESTAURANT_SOURCE=google but GOOGLE_PLACES_API_KEY is empty: using OpenStreetMap instead.");
}
const useOsm = process.env.RESTAURANT_SOURCE === "osm" || process.env.RESTAURANT_SOURCE === "google";

// Restaurant lookups and place searches both go to Nominatim, which allows one request a
// second in total, so they share one line.
const nominatimGate = createGate();

const osmProvider = withFallback(createNominatimProvider({ gate: nominatimGate }), createOsmProvider());

export const restaurantProvider: RestaurantProvider = useGoogle
  ? withFallback(createGoogleProvider({ apiKey: googleKey! }), osmProvider)
  : useOsm
    ? osmProvider
    : mockProvider;

// Serves Google's photos to phones (only exists when Google is the source)
export const photoHandler = useGoogle ? createPhotoHandler({ apiKey: googleKey! }) : undefined;

export const placeFinder: PlaceFinder = useOsm ? createNominatimPlaceFinder({ gate: nominatimGate }) : mockPlaceFinder;
