// The real backend (see docs/API.md and backend/README.md for running it).
import { io } from "socket.io-client";
import { API_URL } from "./config";
import { request } from "./http";
import {
  ApiError,
  type ApiFilters,
  type CraveApi,
  type CreateResult,
  type GroupRef,
  type JoinError,
  type LiveConnection,
  type LiveSnapshot,
  type MatchPayload,
  type Member,
  type Place,
  type Restaurant,
  type SwipeResult,
} from "./types";

const JOIN_ERRORS: JoinError[] = ["GROUP_NOT_FOUND", "GROUP_CLOSED", "NICKNAME_TAKEN", "RATE_LIMITED", "NETWORK"];

/** Live updates over Socket.io. One connection per group; reconnects on its own. */
function connectLive(group: GroupRef): LiveConnection {
  let snapshot: LiveSnapshot = {
    members: null,
    hostId: null,
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

  const socket = io(API_URL, { auth: { groupId: group.groupId, memberId: group.memberId } });

  socket.on(
    "state",
    (state: {
      members: Member[];
      hostId?: string | null;
      filters?: ApiFilters;
      started?: boolean;
      noMatch?: boolean;
      match: { restaurant: MatchPayload } | null;
    }) =>
      update({
        members: state.members,
        hostId: state.hostId ?? null,
        filters: state.filters ?? {},
        started: state.started ?? false,
        noMatch: state.noMatch ?? false,
        match: state.match?.restaurant ?? null,
      }),
  );
  socket.on("member_joined", ({ member }: { member: Member }) => {
    const members = snapshot.members ?? [];
    if (!members.some((m) => m.id === member.id)) update({ members: [...members, member] });
  });
  socket.on("filters_changed", ({ filters }: { filters: ApiFilters }) => update({ filters }));
  socket.on("round_started", () => update({ started: true }));
  socket.on("match_found", ({ restaurant }: { restaurant: MatchPayload }) => update({ match: restaurant }));
  socket.on("no_match", () => update({ noMatch: true }));
  socket.on("connect_error", (error) => {
    // The server doesn't know this group (it closed, or the server restarted): stop retrying.
    if (error.message === "GROUP_NOT_FOUND") {
      socket.disconnect();
      update({ ended: true });
    }
    // Anything else (server down, bad Wi-Fi): Socket.io keeps retrying by itself.
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      socket.disconnect();
      listeners.clear();
    },
  };
}

export const realApi: CraveApi = {
  createGroup: (nickname, location, filters) =>
    request<CreateResult>("/groups", { method: "POST", body: { nickname, location, filters } }),

  async joinGroup(code, nickname) {
    try {
      const result = await request<{ groupId: string; memberId: string }>(`/groups/${encodeURIComponent(code)}/join`, {
        method: "POST",
        body: { nickname },
      });
      return { ok: true, groupId: result.groupId, memberId: result.memberId };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "SERVER_ERROR";
      return { ok: false, error: (JOIN_ERRORS as string[]).includes(code) ? (code as JoinError) : "SERVER_ERROR" };
    }
  },

  async geocode(query) {
    const { places } = await request<{ places: Place[] }>(`/geocode?q=${encodeURIComponent(query)}`);
    return places;
  },

  async updateFilters(groupId, memberId, filters) {
    await request(`/groups/${groupId}/filters`, { method: "PATCH", body: { filters }, memberId });
  },

  async startRound(groupId, memberId) {
    await request(`/groups/${groupId}/start`, { method: "POST", memberId });
  },

  async getRestaurants(groupId, memberId) {
    const { restaurants } = await request<{ restaurants: Restaurant[] }>(`/groups/${groupId}/restaurants`, { memberId });
    return restaurants;
  },

  sendSwipe: (groupId, memberId, restaurantId, liked) =>
    request<SwipeResult>(`/groups/${groupId}/swipes`, { method: "POST", body: { restaurantId, liked }, memberId }),

  connectLive,
  // The server can't restart a round in the same group yet, so "play again" means a new group.
  canPlayAgain: false,
};
