import { useSyncExternalStore } from "react";
import { api } from "./index";
import type { GroupRef, LiveConnection, LiveSnapshot } from "./types";

// One live connection for the group you're in, kept open while you move between
// Lobby, Swipe, Waiting and the results, and closed when you leave.
let current: { key: string; connection: LiveConnection } | null = null;

const EMPTY: LiveSnapshot = {
  members: null,
  hostId: null,
  filters: {},
  started: false,
  match: null,
  noMatch: false,
  ended: false,
};
const noop = () => () => {};

function connectionFor(group: GroupRef): LiveConnection {
  const key = `${group.groupId}:${group.memberId}`;
  if (current?.key !== key) {
    current?.connection.close();
    current = { key, connection: api.connectLive(group) };
  }
  return current.connection;
}

/** Close the live connection (Leave, Back to home, starting a new group). */
export function closeLive() {
  current?.connection.close();
  current = null;
}

/** Everything live about your group (members, host, filters, started, match…). */
export function useLive(group: GroupRef | null): LiveSnapshot {
  const connection = group ? connectionFor(group) : null;
  return useSyncExternalStore(
    connection?.subscribe ?? noop,
    connection?.getSnapshot ?? (() => EMPTY),
  );
}
