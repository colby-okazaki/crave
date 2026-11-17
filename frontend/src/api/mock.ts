// Fake-data mode (npm run dev:mock): the whole app works without the backend, with fake
// friends who join, swipe and vote. Same shape as the real client in real.ts.
import { createGroup, endRound, joinGroup, nudgeMembers, watchMembers, watchProgress } from "./mockGroups";
import { castVote, getClosestPicks, getRestaurants, sendSwipe } from "./mockRestaurants";
import type { CraveApi, GroupRef, LiveConnection, LiveSnapshot, Place } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_PLACES: Place[] = [
  { label: "Berkeley, California", lat: 37.8716, lng: -122.2727 },
  { label: "Berkeley County, West Virginia", lat: 39.4535, lng: -78.0396 },
];

/** Fake live updates: friends join, and if you joined as a guest the fake host starts after a while. */
function connectLive(group: GroupRef): LiveConnection {
  const me = { id: group.memberId, nickname: group.nickname };
  let snapshot: LiveSnapshot = {
    members: null,
    hostId: group.isHost ? me.id : "m_host",
    filters: {},
    started: false,
    match: null,
    noMatch: false,
    ended: false,
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<LiveSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };
  const stopMembers = watchMembers(me, group.isHost, (members) => update({ members }));
  const hostStarts = group.isHost ? undefined : setTimeout(() => update({ started: true }), 8000);
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      stopMembers();
      clearTimeout(hostStarts);
      listeners.clear();
    },
  };
}

export const mockApi: CraveApi = {
  createGroup: (nickname) => createGroup(nickname),
  joinGroup,
  geocode: async () => {
    await wait(400);
    return MOCK_PLACES;
  },
  updateFilters: async () => {},
  startRound: async () => {},
  getRestaurants: (groupId) => getRestaurants(groupId),
  sendSwipe: (groupId, _memberId, restaurantId, liked) => sendSwipe(groupId, restaurantId, liked),
  connectLive,
  canPlayAgain: true,
  watchProgress,
  nudgeMembers,
  endRound,
  getClosestPicks,
  castVote,
};

