// Fake-data mode: restaurants, swipes and closest picks (npm run dev:mock).
import type { Restaurant, ResultRow, SwipeResult } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Made-up places around Berkeley (the mocked location on Home).
const MOCK: Array<[string, string, number, number, number, string, number]> = [
  // name, cuisine, price, rating, distanceMeters, hours, reviewCount
  ["Casa Luna Taqueria", "Mexican", 2, 4.6, 1290, "10:00–22:00", 1240],
  ["Bangkok Corner", "Thai", 2, 4.4, 650, "11:00–21:30", 812],
  ["Slice of Shattuck", "Pizza", 1, 4.5, 400, "11:00–23:00", 2030],
  ["Kumo Sushi Bar", "Sushi", 3, 4.7, 2100, "17:00–22:00", 640],
  ["Patty Wagon", "Burgers", 2, 4.2, 980, "11:00–22:00", 1530],
  ["Saffron House", "Indian", 2, 4.5, 1700, "11:30–21:30", 905],
  ["Golden Noodle", "Chinese", 1, 4.3, 520, "10:30–21:00", 1780],
  ["Seoul Grill", "Korean", 3, 4.6, 3100, "16:00–23:00", 430],
  ["Little Lemon Cafe", "Mediterranean", 2, 4.4, 1450, "08:00–16:00", 377],
  ["Pho Real", "Vietnamese", 1, 4.5, 2400, "10:00–21:00", 1120],
  ["Trattoria Nonna", "Italian", 3, 4.6, 3600, "17:00–22:30", 960],
  ["Smoke & Oak BBQ", "BBQ", 2, 4.3, 4200, "11:00–20:00", 588],
  ["Green Bowl", "Vegan", 2, 4.1, 750, "09:00–20:00", 245],
  ["Ramen Yoshi", "Ramen", 2, 4.7, 1900, "11:30–22:00", 2210],
  ["Le Petit Bistro", "French", 4, 4.8, 5200, "17:30–22:00", 318],
  ["Athena Gyros", "Greek", 1, 4.4, 1100, "10:30–21:00", 690],
  ["Tidewater Seafood", "Seafood", 3, 4.3, 6400, "12:00–21:00", 512],
  ["Morning Glory", "Breakfast & Brunch", 2, 4.6, 880, "07:00–14:00", 1430],
  ["Night Owl Tacos", "Mexican", 1, 4.2, 1600, "18:00–02:00", 760],
  ["Copper Pot Curry", "Indian", 2, 4.3, 2800, "11:00–22:00", 455],
];

const MOCK_DISHES: Record<string, string[]> = {
  Mexican: ["Al pastor tacos", "Burrito", "Horchata"],
  Thai: ["Pad see ew", "Green curry", "Mango sticky rice"],
  Pizza: ["Margherita", "Pepperoni slice", "Garlic knots"],
  Sushi: ["Omakase", "Spicy tuna roll", "Miso soup"],
  Burgers: ["Double smash burger", "Garlic fries", "Milkshake"],
  Indian: ["Butter chicken", "Garlic naan", "Samosas"],
  Chinese: ["Hand-pulled noodles", "Pork dumplings", "Mapo tofu"],
  Korean: ["Galbi", "Bibimbap", "Kimchi pancake"],
  Ramen: ["Tonkotsu ramen", "Gyoza", "Karaage"],
};

/** Mock of GET /groups/:id/restaurants. Every member gets the same list in the same order. */
export async function getRestaurants(_groupId: string): Promise<Restaurant[]> {
  await wait(500);
  return mockStack();
}

/** The fake card stack, right away. */
export function mockStack(): Restaurant[] {
  return MOCK.map(([name, cuisine, price, rating, distanceMeters, hours, reviewCount], i) => {
    const id = `r_${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      name,
      cuisine,
      price,
      rating,
      reviewCount,
      distanceMeters,
      hours,
      photoUrl: `https://picsum.photos/seed/crave-${id}/600/800`,
      photos: [1, 2, 3].map((n) => `https://picsum.photos/seed/crave-${id}-${n}/300/220`),
      popularDishes: MOCK_DISHES[cuisine],
      address: `${100 + i * 37} Shattuck Ave, Berkeley, CA`,
      location: { lat: 37.8715 + i * 0.001, lng: -122.2681 - i * 0.001 },
    };
  });
}

// The mock remembers your likes so "closest picks" can count them.
const myLikes = new Set<string>();
// What the fake friends liked (Ramen Yoshi, r_014, is liked by everyone: the mock match).
const FRIEND_LIKES: Record<string, string[]> = {
  m_host: ["r_002", "r_005", "r_010", "r_014", "r_016"],
  m_mia: ["r_002", "r_006", "r_010", "r_014", "r_018"],
  m_jordan: ["r_002", "r_003", "r_010", "r_014"],
};

/** In the mock, everyone else already liked this place, so liking it makes a match. */
export const MOCK_MATCH_ID = "r_014"; // Ramen Yoshi

/** Mock of POST /groups/:id/swipes. Liking Ramen Yoshi (card 14) makes a match; pass it to reach Waiting. */
export async function sendSwipe(_groupId: string, restaurantId: string, liked: boolean): Promise<SwipeResult> {
  await wait(150);
  if (liked) myLikes.add(restaurantId);
  else myLikes.delete(restaurantId);
  return { ok: true, match: liked && restaurantId === MOCK_MATCH_ID ? { restaurantId } : null };
}

/** New round: forget your likes. */
export function resetMyLikes() {
  myLikes.clear();
}

/**
 * Mock of GET /groups/:id/results: the top 3 places by likes (ties: card order, which is
 * nearest first). Places nobody liked are left out.
 */
export function mockResults(memberIds: string[], myId: string): ResultRow[] {
  const likedBy = (id: string, r: Restaurant) => (id === myId ? myLikes.has(r.id) : FRIEND_LIKES[id]?.includes(r.id));
  return mockStack()
    .map((restaurant) => ({ restaurantId: restaurant.id, likes: memberIds.filter((id) => likedBy(id, restaurant)).length }))
    .filter((p) => p.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3);
}
