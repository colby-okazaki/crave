import type { Group } from "./groups.js";
import type { Restaurant } from "./restaurants.js";

// A match needs everyone in the group, and a group of one has nobody to agree with
export const MIN_MEMBERS_FOR_MATCH = 2;

// Saves one swipe and checks for a match. Runs start to finish without waiting on
// anything, so two swipes arriving together can't both claim to be the match.
//
// - A member's first swipe on a place is the one that counts; sending it again changes nothing.
// - A match needs every current member to have liked the place, so someone who joins
//   later has to like it too. Once a match exists it stays: every later swipe gets it back.
export function recordSwipe(
  group: Group,
  memberId: string,
  restaurant: Restaurant,
  liked: boolean,
): { match: Restaurant | null; justMatched: boolean } {
  let votes = group.swipes.get(restaurant.id);
  if (!votes) {
    votes = new Map();
    group.swipes.set(restaurant.id, votes);
  }
  if (!votes.has(memberId)) votes.set(memberId, liked);

  if (group.match) return { match: group.match, justMatched: false };

  const everyoneLiked =
    group.members.length >= MIN_MEMBERS_FOR_MATCH &&
    group.members.every((m) => votes.get(m.id) === true);
  if (everyoneLiked) {
    group.match = restaurant;
    return { match: restaurant, justMatched: true };
  }
  return { match: null, justMatched: false };
}

// What phones get for a match: enough for the match screen (address, hours, directions)
export function matchPayload(r: Restaurant) {
  return { id: r.id, name: r.name, address: r.address, hours: r.hours, location: r.location };
}

// True when every member has swiped on every place in the stack and nobody matched.
// The front end shows "no match: widen filters or start over".
export function isExhausted(group: Group, stackSize: number): boolean {
  if (group.match || stackSize === 0 || group.members.length < MIN_MEMBERS_FOR_MATCH) return false;
  let swipedAll = 0;
  for (const votes of group.swipes.values()) {
    if (group.members.every((m) => votes.has(m.id))) swipedAll++;
  }
  return swipedAll >= stackSize;
}
