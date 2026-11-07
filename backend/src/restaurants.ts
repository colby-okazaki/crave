import { readFile } from "node:fs/promises";
import type { Filters } from "./groups.js";

export interface Restaurant {
  id: string;
  name: string;
  photoUrl: string;
  price: number;
  rating: number;
  distanceMeters: number;
  address: string;
  hours: string;
  location: { lat: number; lng: number };
}

// Anything that can find restaurants near a point. The real Google Places or Yelp
// provider will implement this too, so nothing else in the server has to change.
export interface RestaurantProvider {
  search(location: { lat: number; lng: number }, filters: Filters): Promise<Restaurant[]>;
}

const MOCK_FILE = new URL("../../docs/mock/restaurants.json", import.meta.url);

// Serves the shared fake data from docs/mock/ (the same file the front end uses)
export const mockProvider: RestaurantProvider = {
  async search(_location, filters) {
    const { restaurants } = JSON.parse(await readFile(MOCK_FILE, "utf8")) as {
      restaurants: Restaurant[];
    };
    return restaurants.filter(
      (r) =>
        (filters.radiusMeters === undefined || r.distanceMeters <= filters.radiusMeters) &&
        (!filters.price?.length || filters.price.includes(r.price)),
    );
  },
};
