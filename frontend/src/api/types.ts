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

/** One person's progress through the cards (Waiting screen; fake-data mode only for now). */
export type MemberProgress = Member & { swiped: number; total: number };

/** A place that came close, and how many people liked it (No match; fake-data mode only for now). */
export type ClosePick = { restaurant: Restaurant; likes: number };

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
};

export type LiveConnection = {
  getSnapshot: () => LiveSnapshot;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
};

/** Who you are in a group (passed between screens). */
export type GroupRef = { groupId: string; memberId: string; nickname: string; isHost: boolean };

/**
 * Everything the screens need from a server. The real backend and fake-data mode both
 * implement it. The optional ones only exist in fake-data mode for now; screens hide
 * those features when they're missing.
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
  /** Can a matched / unmatched group play another round? (Real backend: not yet, so start a new group.) */
  canPlayAgain: boolean;

  watchProgress?(me: Member, isHost: boolean, total: number, onUpdate: (members: MemberProgress[]) => void): () => void;
  nudgeMembers?(groupId: string, memberIds: string[]): Promise<void>;
  endRound?(groupId: string): Promise<void>;
  getClosestPicks?(groupId: string, memberIds: string[], myId: string): Promise<ClosePick[]>;
  castVote?(
    groupId: string,
    myPick: string,
    options: string[],
    memberCount: number,
    onVotesIn: (count: number) => void,
  ): Promise<VoteResult>;
}
