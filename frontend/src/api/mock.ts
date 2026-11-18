// Fake-data mode (npm run dev:mock): the whole app works without the backend, with fake
// friends who join, swipe, nudge and vote. Same shape as the real client in real.ts.
import { createGroup, joinGroup, watchMembers } from "./mockGroups";
import { getRestaurants, MOCK_MATCH_ID, mockResults, mockStack, resetMyLikes, sendSwipe } from "./mockRestaurants";
import {
  ApiError,
  EMPTY_SNAPSHOT,
  resetRound,
  type CraveApi,
  type GroupRef,
  type LiveConnection,
  type LiveSnapshot,
  type MatchPayload,
  type Member,
  type Place,
  type Restaurant,
} from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_PLACES: Place[] = [
  { label: "Berkeley, California", lat: 37.8716, lng: -122.2727 },
  { label: "Berkeley County, West Virginia", lat: 39.4535, lng: -78.0396 },
];

const STACK = mockStack();
const TOTAL = STACK.length;
/** Where each fake friend is when the round starts (Jordan is slow, so there's someone to nudge). */
const HEAD_START: Record<string, number> = { m_host: TOTAL - 2, m_mia: TOTAL - 3, m_jordan: Math.max(TOTAL - 8, 0) };
const NUDGE_COOLDOWN_MS = 60_000;

const matchPayload = ({ id, name, address, hours, location }: Restaurant): MatchPayload => ({
  id,
  name,
  address,
  hours,
  location,
});

/** The fake group you're in. One at a time, like the real live connection. */
class FakeGroup {
  private snapshot: LiveSnapshot;
  private listeners = new Set<() => void>();
  /** This round's timers (friends swiping, voting…), cleared by a new round. */
  private timers: number[] = [];
  private stopMembers: () => void;
  private mySwipes = new Set<string>();
  private nudgedAt = new Map<string, number>();
  private votes: Record<string, string> = {};

  constructor(private me: GroupRef) {
    this.snapshot = { ...EMPTY_SNAPSHOT, hostId: me.isHost ? me.memberId : "m_host", connected: true };
    this.stopMembers = watchMembers({ id: me.memberId, nickname: me.nickname }, me.isHost, (members) =>
      this.update({ members }),
    );
    this.waitForFakeHost();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  close() {
    this.clearTimers();
    this.stopMembers();
    this.listeners.clear();
  }

  /** The round starts: the fake friends start swiping, and someone nudges you if you're slow. */
  start() {
    if (this.snapshot.started) return;
    this.update({ started: true });
    this.later(1500, () => this.tick(), true);
    this.later(20_000, () => {
      if (this.mySwipes.size >= TOTAL || this.snapshot.match || this.snapshot.noMatch) return;
      const from = this.friends()[0];
      if (from) this.update({ nudge: { from, at: Date.now() } });
    });
  }

  recordSwipe(restaurantId: string, liked: boolean) {
    this.mySwipes.add(restaurantId);
    this.setProgress(this.me.memberId, this.mySwipes.size);
    // Everyone else already liked Ramen Yoshi, so liking it makes the match.
    const place = STACK.find((r) => r.id === restaurantId);
    if (liked && restaurantId === MOCK_MATCH_ID && place) this.update({ match: matchPayload(place) });
    this.checkAllDone();
  }

  nudge(memberIds: string[]) {
    const now = Date.now();
    const fresh = memberIds.filter((id) => now - (this.nudgedAt.get(id) ?? 0) >= NUDGE_COOLDOWN_MS);
    if (fresh.length === 0) throw new ApiError(429, "NUDGE_COOLDOWN", "You just nudged them. Give it a minute.");
    fresh.forEach((id) => this.nudgedAt.set(id, now));
  }

  endRound() {
    this.clearTimers();
    if (!this.snapshot.match) this.update({ noMatch: true });
  }

  results() {
    return mockResults(this.memberIds(), this.me.memberId);
  }

  /** Your vote counts first; the fake friends vote a second apart, split between the top pick and yours. */
  vote(restaurantId: string) {
    if (!this.snapshot.noMatch || this.snapshot.match) {
      throw new ApiError(409, "NO_VOTE_OPEN", "A vote only opens when the round ends with no match.");
    }
    const options = this.results().map((r) => r.restaurantId);
    if (!options.includes(restaurantId)) throw new ApiError(400, "INVALID_INPUT", "Vote for one of the closest picks.");
    this.votes[this.me.memberId] ??= restaurantId;
    const total = this.memberIds().length;
    this.update({ vote: { votesIn: Object.keys(this.votes).length, total } });

    const waiting = this.friends().filter((f) => !this.votes[f.id]);
    waiting.forEach((friend, i) =>
      this.later(1000 * (i + 1), () => {
        this.votes[friend.id] = i % 2 === 0 ? options[0] : restaurantId;
        const votesIn = Object.keys(this.votes).length;
        this.update({ vote: { votesIn, total } });
        if (votesIn >= total) this.finishVote(options);
      }),
    );
    if (waiting.length === 0) this.finishVote(options);
    return { votesIn: Object.keys(this.votes).length, total };
  }

  newRound() {
    this.clearTimers();
    this.mySwipes.clear();
    this.votes = {};
    resetMyLikes();
    this.set(resetRound(this.snapshot, this.snapshot.filters));
    this.waitForFakeHost();
  }

  private finishVote(options: string[]) {
    const counts: Record<string, number> = {};
    Object.values(this.votes).forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));
    // Most votes wins; a tie goes to the place higher in the list (more likes, then nearer).
    const winnerId = options.reduce((best, id) => ((counts[id] ?? 0) > (counts[best] ?? 0) ? id : best), options[0]);
    const winner = STACK.find((r) => r.id === winnerId);
    this.later(500, () => {
      this.update({ voteResult: { winnerId, votes: counts } });
      if (winner) this.update({ match: matchPayload(winner) });
    });
  }

  /** Every 1.5 s, each friend who isn't done swipes one more card. */
  private tick() {
    for (const friend of this.friends()) {
      const swiped = this.snapshot.progress[friend.id]?.swiped ?? HEAD_START[friend.id] ?? 0;
      this.setProgress(friend.id, Math.min(swiped + 1, TOTAL));
    }
    this.checkAllDone();
  }

  /** Everyone swiped everything and nobody matched (liking Ramen Yoshi would have matched). */
  private checkAllDone() {
    const { progress, match, noMatch } = this.snapshot;
    if (match || noMatch) return this.clearTimers();
    const done = this.memberIds().every((id) => (progress[id]?.swiped ?? 0) >= TOTAL);
    if (done) {
      this.clearTimers();
      this.later(1200, () => this.update({ noMatch: true }));
    }
  }

  /** If you joined as a guest, the fake host starts the round after a while. */
  private waitForFakeHost() {
    if (!this.me.isHost) this.later(8000, () => this.start());
  }

  private setProgress(memberId: string, swiped: number) {
    this.update({ progress: { ...this.snapshot.progress, [memberId]: { swiped, total: TOTAL } } });
  }

  private friends(): Member[] {
    return (this.snapshot.members ?? []).filter((m) => m.id !== this.me.memberId);
  }

  private memberIds() {
    return (this.snapshot.members ?? []).map((m) => m.id);
  }

  private later(ms: number, run: () => void, repeat = false) {
    this.timers.push(repeat ? window.setInterval(run, ms) : window.setTimeout(run, ms));
  }

  private clearTimers() {
    // Intervals and timeouts share one id space in browsers, so either clear works for both.
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers = [];
  }

  private set(next: LiveSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private update(patch: Partial<LiveSnapshot>) {
    this.set({ ...this.snapshot, ...patch });
  }
}

let fake: FakeGroup | null = null;

function connectLive(group: GroupRef): LiveConnection {
  const mine = new FakeGroup(group);
  fake = mine;
  return {
    getSnapshot: mine.getSnapshot,
    subscribe: mine.subscribe,
    close: () => {
      mine.close();
      if (fake === mine) fake = null;
    },
  };
}

/** Runs `fn` on the fake group, after a short pause like a real request. */
async function withGroup<T>(fn: (group: FakeGroup) => T): Promise<T> {
  await wait(300);
  if (!fake) throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
  return fn(fake);
}

export const mockApi: CraveApi = {
  createGroup: (nickname) => createGroup(nickname),
  joinGroup,
  geocode: async () => {
    await wait(400);
    return MOCK_PLACES;
  },
  updateFilters: async () => {},
  startRound: (_groupId) => withGroup((g) => g.start()),
  getRestaurants: (groupId) => getRestaurants(groupId),
  async sendSwipe(groupId, _memberId, restaurantId, liked) {
    const result = await sendSwipe(groupId, restaurantId, liked);
    fake?.recordSwipe(restaurantId, liked);
    return result;
  },
  connectLive,
  leaveGroup: async () => {},
  nudge: (_groupId, _memberId, memberIds) => withGroup((g) => g.nudge(memberIds)),
  endRound: (_groupId) => withGroup((g) => g.endRound()),
  getResults: (_groupId) => withGroup((g) => g.results()),
  vote: (_groupId, _memberId, restaurantId) => withGroup((g) => g.vote(restaurantId)),
  newRound: (_groupId) => withGroup((g) => g.newRound()),
};
