import { useSyncExternalStore } from "react";
import { API_URL } from "./config";
import { ApiError } from "./types";

// The free server sleeps when nobody uses it, and the first request can take up to a minute
// while it wakes. Any request still waiting after a few seconds counts as "slow", so screens
// can say the server is waking up instead of looking stuck.
const SLOW_AFTER_MS = 3000;
let slow = 0;
const slowListeners = new Set<() => void>();

function track<T>(promise: Promise<T>): Promise<T> {
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    slow += 1;
    slowListeners.forEach((l) => l());
  }, SLOW_AFTER_MS);
  const done = () => {
    clearTimeout(timer);
    if (!counted) return;
    slow -= 1;
    slowListeners.forEach((l) => l());
  };
  promise.then(done, done);
  return promise;
}

/** True while a request to the server has been waiting a while (it's probably waking up). */
export function useServerSlow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      slowListeners.add(listener);
      return () => slowListeners.delete(listener);
    },
    () => slow > 0,
  );
}

/** Nudge a sleeping server awake as soon as the app opens, so it's ready by the time someone taps. */
export function wakeServer() {
  track(fetch(`${API_URL}/health`).catch(() => {}));
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Sent as X-Member-Id, so the server knows who's asking. */
  memberId?: string;
};

/**
 * Calls the backend and returns its JSON. Throws ApiError with the server's code
 * (e.g. GROUP_NOT_FOUND), or NETWORK when the server can't be reached.
 */
export async function request<T>(path: string, { method = "GET", body, memberId }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await track(fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(memberId ? { "X-Member-Id": memberId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? "SERVER_ERROR", error?.message ?? "Something went wrong.");
  }
  return data as T;
}
