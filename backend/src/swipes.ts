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

// After someone leaves, the people still here may already agree: the leaver might have been the
// only one who hadn't liked a place. Returns the first place in the stack everyone left liked.
export function matchAfterLeave(group: Group, stack: Restaurant[]): Restaurant | null {
  if (group.match || group.members.length < MIN_MEMBERS_FOR_MATCH) return null;
  const found = stack.find((r) => {
    const votes = group.swipes.get(r.id);
    return votes !== undefined && group.members.every((m) => votes.get(m.id) === true);
  });
  if (found) group.match = found;
  return found ?? null;
}

// The places people liked most, for the "no match" screen: most likes first, ties keep the
// stack's order (nearest first). Only places someone liked, at most 3. Only current members count.
export function closestPicks(group: Group, stack: Restaurant[], limit = 3): { restaurantId: string; likes: number }[] {
  const ids = new Set(group.members.map((m) => m.id));
  return stack
    .map((r) => {
      let likes = 0;
      for (const [memberId, liked] of group.swipes.get(r.id) ?? []) if (liked && ids.has(memberId)) likes++;
      return { restaurantId: r.id, likes };
    })
    .filter((p) => p.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit);
}

// Quick vote: once every current member has voted, the place with the most votes wins and
// becomes the group's match. A tie goes to the place that was liked more, then the nearer one
// (the order closestPicks returns). Returns null while someone is still to vote.
export function decideVote(
  group: Group,
  stack: Restaurant[],
): { winner: Restaurant; votes: Record<string, number> } | null {
  const votes = group.votes;
  if (group.match || !votes || group.members.length === 0) return null;
  if (!group.members.every((m) => votes.has(m.id))) return null;
  const tally: Record<string, number> = {};
  for (const m of group.members) {
    const pick = votes.get(m.id)!;
    tally[pick] = (tally[pick] ?? 0) + 1;
  }
  const order = closestPicks(group, stack).map((p) => p.restaurantId);
  const winnerId = Object.keys(tally).sort(
    (a, b) => tally[b] - tally[a] || order.indexOf(a) - order.indexOf(b),
  )[0];
  const winner = stack.find((r) => r.id === winnerId);
  if (!winner) return null;
  group.match = winner;
  group.exhausted = false;
  return { winner, votes: tally };
}
