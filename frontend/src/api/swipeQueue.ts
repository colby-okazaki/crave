import { useSyncExternalStore } from "react";
import { api } from "./index";
import { ApiError, type GroupRef } from "./types";

/**
 * Swipes waiting to reach the server, sent one at a time and retried until they get there.
 * Also remembers which cards you've swiped, so a refresh picks up where you left off.
 * Both are kept in sessionStorage (this tab only), so a refresh doesn't lose anything.
 * Re-sending is safe: the server only counts your first swipe on a place.
 */

type QueuedSwipe = { restaurantId: string; liked: boolean };

export type SwipeQueueSnapshot = {
  /** Swipes not on the server yet. */
  pending: number;
  /** The last try failed (bad connection or server trouble); retrying. */
  retrying: boolean;
  /** A swipe's answer said there's a match / no match (the socket says so too). */
  match: string | null;
  noMatch: boolean;
  /** The server doesn't know this group any more. */
  ended: boolean;
};

const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

class SwipeQueue {
  private outbox: QueuedSwipe[];
  private swiped: Set<string>;
  private snapshot: SwipeQueueSnapshot;
  private listeners = new Set<() => void>();
  private sending = false;
  private failures = 0;
  private retryTimer: number | undefined;

  constructor(private group: GroupRef) {
    this.outbox = readJson<QueuedSwipe[]>(this.key("outbox")) ?? [];
    this.swiped = new Set(readJson<string[]>(this.key("swiped")) ?? []);
    this.snapshot = { pending: this.outbox.length, retrying: false, match: null, noMatch: false, ended: false };
    window.addEventListener("online", this.retryNow);
    // Anything left over from before a refresh goes out right away.
    if (this.outbox.length) void this.flush();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Cards already swiped this round (sent or still waiting). */
  swipedIds(): ReadonlySet<string> {
    return this.swiped;
  }

  add(restaurantId: string, liked: boolean) {
    if (this.swiped.has(restaurantId)) return;
    this.swiped.add(restaurantId);
    this.outbox.push({ restaurantId, liked });
    this.save();
    this.update({ pending: this.outbox.length });
    void this.flush();
  }

  /** New round in the same group: forget this round's swipes. */
  reset() {
    window.clearTimeout(this.retryTimer);
    this.outbox = [];
    this.swiped.clear();
    this.failures = 0;
    this.save();
    this.update({ pending: 0, retrying: false, match: null, noMatch: false });
  }

  /** Someone joined after the round ended with no match, which reopens it: forget that answer. */
  reopen() {
    this.update({ noMatch: false });
  }

  close() {
    window.clearTimeout(this.retryTimer);
    window.removeEventListener("online", this.retryNow);
    this.listeners.clear();
  }

  private retryNow = () => {
    window.clearTimeout(this.retryTimer);
    void this.flush();
  };

  private async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.outbox.length) {
        const next = this.outbox[0];
        try {
          const result = await api.sendSwipe(this.group.groupId, this.group.memberId, next.restaurantId, next.liked);
          this.failures = 0;
          this.outbox.shift();
          this.save();
          this.update({
            pending: this.outbox.length,
            retrying: false,
            ...(result.match ? { match: result.match.restaurantId } : {}),
            ...(result.noMatch ? { noMatch: true } : {}),
          });
        } catch (error) {
          if (isWorthRetrying(error)) {
            // Try again later; keep the swipe at the front so the order stays the same.
            this.update({ retrying: true });
            const wait = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
            this.failures += 1;
            this.retryTimer = window.setTimeout(() => void this.flush(), wait);
            return;
          }
          // The server refused it for good (e.g. the group is gone): drop it and move on.
          this.outbox.shift();
          this.save();
          this.update({
            pending: this.outbox.length,
            ...(error instanceof ApiError && error.code === "GROUP_NOT_FOUND" ? { ended: true } : {}),
          });
        }
      }
    } finally {
      this.sending = false;
    }
  }

  private update(patch: Partial<SwipeQueueSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private key(kind: string) {
    return `crave.${kind}.${this.group.groupId}.${this.group.memberId}`;
  }

  private save() {
    writeJson(this.key("outbox"), this.outbox);
    writeJson(this.key("swiped"), [...this.swiped]);
  }
}

/** Bad connection, rate limit or server trouble: worth trying again. Anything else won't change. */
function isWorthRetrying(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  return error.code === "NETWORK" || error.status === 429 || error.status >= 500;
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the queue still works, it just won't survive a refresh.
  }
}

let current: { key: string; queue: SwipeQueue } | null = null;

/** The swipe queue for your group (one at a time; switching groups starts a new one). */
export function swipeQueueFor(group: GroupRef): SwipeQueue {
  const key = `${group.groupId}:${group.memberId}`;
  if (current?.key !== key) {
    current?.queue.close();
    current = { key, queue: new SwipeQueue(group) };
  }
  return current.queue;
}

/** You left the group: drop anything unsent (the server has forgotten you anyway). */
export function closeSwipeQueue(group: GroupRef) {
  swipeQueueFor(group).reset();
  current?.queue.close();
  current = null;
}

const EMPTY: SwipeQueueSnapshot = { pending: 0, retrying: false, match: null, noMatch: false, ended: false };
const noop = () => () => {};

/** Live state of your swipe queue (how many are waiting, whether it's retrying…). */
export function useSwipeQueue(group: GroupRef | null): SwipeQueueSnapshot {
  const queue = group ? swipeQueueFor(group) : null;
  return useSyncExternalStore(queue?.subscribe ?? noop, queue?.getSnapshot ?? (() => EMPTY));
}

/** "Reconnecting… 2 swipes waiting to send", or nothing when all is well. */
export function queueNotice(q: SwipeQueueSnapshot): string | undefined {
  if (!q.retrying || q.pending === 0) return undefined;
  return `Reconnecting… ${q.pending} ${q.pending === 1 ? "swipe" : "swipes"} waiting to send`;
}
