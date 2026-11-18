// The real backend (see docs/API.md and backend/README.md for running it).
import { io } from "socket.io-client";
import { API_URL } from "./config";
import { request } from "./http";
import {
  ApiError,
  EMPTY_SNAPSHOT,
  resetRound,
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
  type Progress,
  type Restaurant,
  type ResultRow,
  type SwipeResult,
  type VoteAnswer,
} from "./types";

type ProgressRow = Progress & { memberId: string };

const JOIN_ERRORS: JoinError[] = ["GROUP_NOT_FOUND", "GROUP_CLOSED", "NICKNAME_TAKEN", "RATE_LIMITED", "NETWORK"];

/** Live updates over Socket.io. One connection per group; reconnects on its own. */
function connectLive(group: GroupRef): LiveConnection {
  let snapshot: LiveSnapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();
  const set = (next: LiveSnapshot) => {
    snapshot = next;
    listeners.forEach((l) => l());
  };
  const update = (patch: Partial<LiveSnapshot>) => set({ ...snapshot, ...patch });

  const socket = io(API_URL, { auth: { groupId: group.groupId, memberId: group.memberId } });

  socket.on(
    "state",
    (state: {
      members: Member[];
      hostId?: string | null;
      filters?: ApiFilters;
      started?: boolean;
      progress?: ProgressRow[];
      votesIn?: number;
      noMatch?: boolean;
      match: { restaurant: MatchPayload } | null;
    }) =>
      update({
        members: state.members,
        hostId: state.hostId ?? null,
        filters: state.filters ?? {},
        started: state.started ?? false,
        progress: Object.fromEntries((state.progress ?? []).map(({ memberId, swiped, total }) => [memberId, { swiped, total }])),
        vote: state.votesIn ? { votesIn: state.votesIn, total: state.members.length } : null,
        noMatch: state.noMatch ?? false,
        match: state.match?.restaurant ?? null,
      }),
  );
  socket.on("member_joined", ({ member }: { member: Member }) => {
    const members = snapshot.members ?? [];
    if (!members.some((m) => m.id === member.id)) update({ members: [...members, member] });
  });
  socket.on("member_left", ({ memberId, hostId }: { memberId: string; hostId: string | null }) => {
    const { [memberId]: _gone, ...progress } = snapshot.progress;
    update({ members: (snapshot.members ?? []).filter((m) => m.id !== memberId), hostId, progress });
  });
  socket.on("filters_changed", ({ filters }: { filters: ApiFilters }) => update({ filters }));
  socket.on("round_started", () => update({ started: true }));
  socket.on("progress", (row: ProgressRow | undefined) => {
    if (!row) return;
    update({ progress: { ...snapshot.progress, [row.memberId]: { swiped: row.swiped, total: row.total } } });
  });
  socket.on("nudged", ({ memberIds, from }: { memberIds: string[]; from: Member }) => {
    if (memberIds.includes(group.memberId)) update({ nudge: { from, at: Date.now() } });
  });
  socket.on("vote_update", (vote: VoteAnswer) => update({ vote }));
  socket.on(
    "vote_result",
    ({ winner, votes }: { winner: MatchPayload; votes: Record<string, number> }) =>
      update({ voteResult: { winnerId: winner.id, votes } }),
  );
  socket.on("match_found", ({ restaurant }: { restaurant: MatchPayload }) => update({ match: restaurant }));
  socket.on("no_match", () => update({ noMatch: true }));
  socket.on("round_reset", ({ filters }: { filters: ApiFilters }) => set(resetRound(snapshot, filters ?? {})));
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

  async leaveGroup(groupId, memberId) {
    await request(`/groups/${groupId}/leave`, { method: "POST", memberId });
  },

  async nudge(groupId, memberId, memberIds) {
    await request(`/groups/${groupId}/nudge`, { method: "POST", body: { memberIds }, memberId });
  },

  async endRound(groupId, memberId) {
    await request(`/groups/${groupId}/end`, { method: "POST", memberId });
  },

  async getResults(groupId, memberId) {
    const { results } = await request<{ results: ResultRow[] }>(`/groups/${groupId}/results`, { memberId });
    return results;
  },

  async vote(groupId, memberId, restaurantId) {
    const { votesIn, total } = await request<VoteAnswer>(`/groups/${groupId}/vote`, {
      method: "POST",
      body: { restaurantId },
      memberId,
    });
    return { votesIn, total };
  },

  async newRound(groupId, memberId, filters) {
    await request(`/groups/${groupId}/new-round`, {
      method: "POST",
      body: filters ? { filters } : undefined,
      memberId,
    });
  },
};
