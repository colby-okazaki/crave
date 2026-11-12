import { createOsmProvider } from "./osm.js";
import { mockProvider, type RestaurantProvider } from "./restaurants.js";

// RESTAURANT_SOURCE=osm uses real places from OpenStreetMap.
// Anything else (the default) uses the fake data in docs/mock/, so tests and
// local work never depend on the internet.
export const restaurantProvider: RestaurantProvider =
  process.env.RESTAURANT_SOURCE === "osm" ? createOsmProvider() : mockProvider;
