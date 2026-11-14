import { createGate } from "./gate.js";
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

// RESTAURANT_SOURCE=osm uses real places from OpenStreetMap: Nominatim first, and the
// Overpass servers if Nominatim fails. Anything else (the default) uses the fake data in
// docs/mock/, so tests and local work never depend on the internet.
const useOsm = process.env.RESTAURANT_SOURCE === "osm";

// Restaurant lookups and place searches both go to Nominatim, which allows one request a
// second in total, so they share one line.
const nominatimGate = createGate();

export const restaurantProvider: RestaurantProvider = useOsm
  ? withFallback(createNominatimProvider({ gate: nominatimGate }), createOsmProvider())
  : mockProvider;

export const placeFinder: PlaceFinder = useOsm ? createNominatimPlaceFinder({ gate: nominatimGate }) : mockPlaceFinder;
