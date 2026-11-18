// Shapes shared by the real backend client and the fake-data mode (see docs/API.md).

export type Member = { id: string; nickname: string };

export type LatLng = { lat: number; lng: number };

/** A typed place turned into coordinates (GET /geocode), or the phone's own location. */
export type Place = LatLng & { label: string };

/** Filters as the backend takes them. Leave a field out for "any". */
export type ApiFilters = { radiusMeters?: number; price?: number[]; cuisine?: string[] };

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
  location: LatLng;
  /** Optional: only when the source knows it. */
  cuisine?: string;
  /** Not in the API yet (Figma shows "4.6 · 1.2k reviews"). */
  reviewCount?: number;
  /** Not in the API yet: extra photos for the Details sheet (falls back to photoUrl). */
  photos?: string[];
  /** Not in the API yet: "Popular dishes" in the Details sheet. */
  popularDishes?: string[];
  /** Optional: "View menu" link (falls back to a web search). */
  menuUrl?: string;
};

/** What `match_found` (and `state.match`) sends: just the basics. */
export type MatchPayload = Pick<Restaurant, "id" | "name" | "address" | "hours" | "location">;

export type CreateResult = { groupId: string; joinCode: string; memberId: string };

export type JoinError =
  | "GROUP_NOT_FOUND"
  | "GROUP_CLOSED"
  | "NICKNAME_TAKEN"
  | "RATE_LIMITED"
  | "NETWORK"
  | "SERVER_ERROR";

export type JoinResult = { ok: true; groupId: string; memberId: string } | { ok: false; error: JoinError };

export type SwipeResult = { ok: true; match: { restaurantId: string } | null; noMatch?: boolean };

/** How far one person is through the cards (`progress` event). `total` is 0 until the cards were fetched. */
export type Progress = { swiped: number; total: number };

/** A place that came close, and how many people liked it (GET /groups/:id/results). */
export type ClosePick = { restaurant: Restaurant; likes: number };

/** What GET /groups/:id/results sends, before we look up the full cards. */
export type ResultRow = { restaurantId: string; likes: number };

/** The answer to POST /groups/:id/vote. */
export type VoteAnswer = { votesIn: number; total: number };

/** The quick vote is over (`vote_result`): the winner's id, and how many votes each place got. */
export type VoteResult = { winnerId: string; votes: Record<string, number> };

/** An error from the backend (`{ error: { code, message } }`), or NETWORK when it can't be reached. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Everything live about a group, kept up to date over Socket.io. */
export type LiveSnapshot = {
  /** null until the first `state` arrives. */
  members: Member[] | null;
  hostId: string | null;
  filters: ApiFilters;
  started: boolean;
  match: MatchPayload | null;
  noMatch: boolean;
  /** The server doesn't know this group any more (closed, or the server restarted). */
  ended: boolean;
  /** Everyone's progress through the cards, by member id. */
  progress: Record<string, Progress>;
  /** The quick vote, once someone has voted. */
  vote: VoteAnswer | null;
  /** The quick vote's outcome; `match` is set to the winner right after. */
  voteResult: VoteResult | null;
  /** Someone nudged me (`at` changes with every nudge, so the same person can nudge twice). */
  nudge: { from: Member; at: number } | null;
  /** Goes up by one each time the host starts a new round (`round_reset`). */
  round: number;
  /** The live connection is up right now (false while it reconnects). */
  connected: boolean;
};

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  members: null,
  hostId: null,
  filters: {},
  started: false,
  match: null,
  noMatch: false,
  ended: false,
  progress: {},
  vote: null,
  voteResult: null,
  nudge: null,
  round: 0,
  connected: false,
};

/** What a new round clears (the members, host and live connection stay). */
export function resetRound(snapshot: LiveSnapshot, filters: ApiFilters): LiveSnapshot {
  return {
    ...snapshot,
    filters,
    started: false,
    match: null,
    noMatch: false,
    progress: {},
    vote: null,
    voteResult: null,
    nudge: null,
    round: snapshot.round + 1,
  };
}

export type LiveConnection = {
  getSnapshot: () => LiveSnapshot;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
};

/** Who you are in a group (passed between screens). */
export type GroupRef = { groupId: string; memberId: string; nickname: string; isHost: boolean };

/**
 * Everything the screens need from a server. The real backend and fake-data mode
 * (npm run dev:mock) both implement it. Shapes follow docs/API.md.
 */
export interface CraveApi {
  createGroup(nickname: string, location: LatLng, filters: ApiFilters): Promise<CreateResult>;
  joinGroup(code: string, nickname: string): Promise<JoinResult>;
  geocode(query: string): Promise<Place[]>;
  updateFilters(groupId: string, memberId: string, filters: ApiFilters): Promise<void>;
  startRound(groupId: string, memberId: string): Promise<void>;
  getRestaurants(groupId: string, memberId: string): Promise<Restaurant[]>;
  sendSwipe(groupId: string, memberId: string, restaurantId: string, liked: boolean): Promise<SwipeResult>;
  connectLive(group: GroupRef): LiveConnection;
  /** Leave for good: your member id stops working and your swipes are removed. */
  leaveGroup(groupId: string, memberId: string): Promise<void>;
  /** Ping people who are still swiping. Throws NUDGE_COOLDOWN if they were all nudged in the last minute. */
  nudge(groupId: string, memberId: string, memberIds: string[]): Promise<void>;
  /** Host only: stop the round. Everyone gets `no_match` (or `match_found` if there already was one). */
  endRound(groupId: string, memberId: string): Promise<void>;
  /** Up to 3 places someone liked, most likes first. */
  getResults(groupId: string, memberId: string): Promise<ResultRow[]>;
  /** Vote in the quick vote. The winner arrives live (`vote_result`, then `match_found`). */
  vote(groupId: string, memberId: string, restaurantId: string): Promise<VoteAnswer>;
  /** Host only: same group, fresh round. Everyone gets `round_reset` and goes back to the lobby. */
  newRound(groupId: string, memberId: string, filters?: ApiFilters): Promise<void>;
}
