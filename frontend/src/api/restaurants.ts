// Mocks of GET /groups/:id/restaurants and POST /groups/:id/swipes (see docs/API.md)
// until the frontend talks to the real backend.

export type Restaurant = {
  id: string;
  name: string;
  /** null when the source has no photo: show the placeholder gradient. */
  photoUrl: string | null;
  /** 1–4, shown as $ to $$$$. null when unknown (always, with OpenStreetMap). */
  price: number | null;
  /** 0–5, one decimal. null when unknown (always, with OpenStreetMap). */
  rating: number | null;
  distanceMeters: number;
  address: string;
  /** Opening hours today, e.g. "11:00–21:00". null when unknown: hide the line. */
  hours: string | null;
  location: { lat: number; lng: number };
  /** Not in the API yet (Figma shows "Mexican · $$ · 0.8 mi away"). */
  cuisine?: string;
  /** Not in the API yet (Figma shows "4.6 · 1.2k reviews"). */
  reviewCount?: number;
  /** Not in the API yet: extra photos for the Details sheet (falls back to photoUrl). */
  photos?: string[];
  /** Not in the API yet: "Popular dishes" in the Details sheet. */
  popularDishes?: string[];
  /** Not in the API yet: "View menu" link (falls back to a web search). */
  menuUrl?: string;
};

export type SwipeResult = { ok: true; match: { restaurantId: string } | null; noMatch?: boolean };

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

/** A place that came close, and how many people liked it. */
export type ClosePick = { restaurant: Restaurant; likes: number };

/**
 * Mock of "closest picks" for the No match screen (not in docs/API.md yet):
 * the top 3 places by likes (ties: closest first). Places nobody liked are left out.
 */
export async function getClosestPicks(groupId: string, memberIds: string[], myId: string): Promise<ClosePick[]> {
  const restaurants = await getRestaurants(groupId);
  const likedBy = (id: string, r: Restaurant) => (id === myId ? myLikes.has(r.id) : FRIEND_LIKES[id]?.includes(r.id));
  return restaurants
    .map((restaurant) => ({ restaurant, likes: memberIds.filter((id) => likedBy(id, restaurant)).length }))
    .filter((p) => p.likes > 0)
    .sort((a, b) => b.likes - a.likes || a.restaurant.distanceMeters - b.restaurant.distanceMeters)
    .slice(0, 3);
}

export type VoteResult = { winnerId: string; votes: Record<string, number> };

/**
 * Mock of a quick vote (not in docs/API.md yet). Your vote counts first; the fake
 * friends vote a second apart. Most votes wins; a tie goes to the place higher in the list.
 */
export function castVote(
  _groupId: string,
  myPick: string,
  options: string[],
  memberCount: number,
  onVotesIn: (count: number) => void,
): Promise<VoteResult> {
  return new Promise((resolve) => {
    const votes: Record<string, number> = { [myPick]: 1 };
    let count = 1;
    onVotesIn(count);
    const friends = memberCount - 1;
    if (friends <= 0) return resolve({ winnerId: myPick, votes });
    const timer = setInterval(() => {
      // Friends split between the top pick and yours.
      const pick = count % 2 === 1 ? options[0] : myPick;
      votes[pick] = (votes[pick] ?? 0) + 1;
      count += 1;
      onVotesIn(count);
      if (count >= memberCount) {
        clearInterval(timer);
        const winnerId = options.reduce((best, id) => ((votes[id] ?? 0) > (votes[best] ?? 0) ? id : best), options[0]);
        setTimeout(() => resolve({ winnerId, votes }), 500);
      }
    }, 1000);
  });
}
