import { createNominatimProvider } from "./nominatim.js";
import { createOsmProvider } from "./osm.js";
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
export const restaurantProvider: RestaurantProvider =
  process.env.RESTAURANT_SOURCE === "osm"
    ? withFallback(createNominatimProvider(), createOsmProvider())
    : mockProvider;
