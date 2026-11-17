import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { io } from "socket.io-client";
import { buildApp } from "./app.js";
import { ApiError } from "./groups.js";
import { attachLive } from "./live.js";

let server: Server;
let base = "";

before(async () => {
  // These tests make many groups from one address, so the rate limits stay off here
  process.env.RATE_LIMIT = "off";
  server = createServer(buildApp());
  attachLive(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(method: string, path: string, body?: unknown, memberId?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(memberId ? { "X-Member-Id": memberId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function newGroup(members: number) {
  const host = (await call("POST", "/groups", {
    nickname: "host",
    location: { lat: 37.77, lng: -122.41 },
    filters: {},
  })).body;
  const ids = [host.memberId as string];
  for (let i = 1; i < members; i++) {
    ids.push((await call("POST", `/groups/${host.joinCode}/join`, { nickname: `p${i}` })).body.memberId);
  }
  const list = (await call("GET", `/groups/${host.groupId}/restaurants`, undefined, ids[0])).body;
  return { groupId: host.groupId as string, joinCode: host.joinCode as string, ids, restaurants: list.restaurants as { id: string }[] };
}

test("everyone liking the same place returns a match and tells every phone", async () => {
  const { groupId, ids, restaurants } = await newGroup(3);
  const socket = io(base, { auth: { groupId, memberId: ids[0] }, transports: ["websocket"] });
  await new Promise((resolve) => socket.once("state", resolve));
  const heard = new Promise<any>((resolve) => socket.once("match_found", resolve));

  const target = restaurants[0].id;
  assert.equal((await call("POST", `/groups/${groupId}/swipes`, { restaurantId: target, liked: true }, ids[0])).body.match, null);
  assert.equal((await call("POST", `/groups/${groupId}/swipes`, { restaurantId: target, liked: true }, ids[1])).body.match, null);
  const last = await call("POST", `/groups/${groupId}/swipes`, { restaurantId: target, liked: true }, ids[2]);
  assert.deepEqual(last.body, { ok: true, match: { restaurantId: target }, noMatch: false });
  assert.equal((await heard).restaurant.id, target);
  socket.disconnect();

  // A phone that connects afterwards catches up through the state event
  const late = io(base, { auth: { groupId, memberId: ids[1] }, transports: ["websocket"] });
  const state = await new Promise<any>((resolve) => late.once("state", resolve));
  assert.equal(state.match.restaurant.id, target);
  late.disconnect();
});

test("bad swipes get clear errors", async () => {
  const { groupId, ids, restaurants } = await newGroup(2);
  const swipe = (body: unknown, who = ids[0]) => call("POST", `/groups/${groupId}/swipes`, body, who);

  assert.equal((await swipe({ restaurantId: restaurants[0].id, liked: "yes" })).body.error.code, "INVALID_INPUT");
  assert.equal((await swipe({ restaurantId: "nope", liked: true })).body.error.code, "INVALID_INPUT");
  assert.equal((await swipe({ restaurantId: restaurants[0].id, liked: true }, "m_stranger")).status, 404);
  assert.equal((await call("POST", "/groups/g_nope/swipes", { restaurantId: "x", liked: true }, ids[0])).status, 404);
});

test("swiping before the stack was ever fetched is refused", async () => {
  const host = (await call("POST", "/groups", { nickname: "h", location: { lat: 1, lng: 1 }, filters: {} })).body;
  const res = await call("POST", `/groups/${host.groupId}/swipes`, { restaurantId: "r_001", liked: true }, host.memberId);
  assert.equal(res.body.error.code, "INVALID_INPUT");
});

test("everyone saying no to everything fires no_match once, and a late joiner reopens it", async () => {
  const { groupId, joinCode, ids, restaurants } = await newGroup(2);
  const socket = io(base, { auth: { groupId, memberId: ids[0] }, transports: ["websocket"] });
  await new Promise((resolve) => socket.once("state", resolve));
  let events = 0;
  socket.on("no_match", () => events++);
  const heard = new Promise((resolve) => socket.once("no_match", resolve));

  let last: any;
  for (const r of restaurants) {
    for (const who of ids) {
      last = await call("POST", `/groups/${groupId}/swipes`, { restaurantId: r.id, liked: false }, who);
    }
  }
  assert.equal(last.body.noMatch, true);
  await heard;

  // Sending a swipe again must not announce it a second time
  await call("POST", `/groups/${groupId}/swipes`, { restaurantId: restaurants[0].id, liked: false }, ids[0]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(events, 1);

  const fresh = io(base, { auth: { groupId, memberId: ids[1] }, transports: ["websocket"] });
  assert.equal((await new Promise<any>((resolve) => fresh.once("state", resolve))).noMatch, true);
  fresh.disconnect();

  // Someone joining afterwards hasn't swiped, so the group has places left again
  const joined = (await call("POST", `/groups/${joinCode}/join`, { nickname: "late" })).body;
  const again = io(base, { auth: { groupId, memberId: joined.memberId }, transports: ["websocket"] });
  assert.equal((await new Promise<any>((resolve) => again.once("state", resolve))).noMatch, false);
  again.disconnect();
  socket.disconnect();
});

// A group still in the lobby (newGroup() fetches the cards, which locks the filters)
async function lobbyGroup() {
  const host = (await call("POST", "/groups", { nickname: "host", location: { lat: 37.77, lng: -122.41 }, filters: {} })).body;
  const guest = (await call("POST", `/groups/${host.joinCode}/join`, { nickname: "guest" })).body;
  return { groupId: host.groupId as string, hostId: host.memberId as string, guestId: guest.memberId as string };
}

test("state tells phones who the host is, the filters, and whether the round started", async () => {
  const { groupId, hostId, guestId } = await lobbyGroup();
  const socket = io(base, { auth: { groupId, memberId: guestId }, transports: ["websocket"] });
  const state = await new Promise<any>((resolve) => socket.once("state", resolve));
  assert.equal(state.hostId, hostId);
  assert.deepEqual(state.filters, {});
  assert.equal(state.started, false);
  socket.disconnect();
});

test("the host can change filters in the lobby and every phone hears about it", async () => {
  const { groupId, hostId, guestId } = await lobbyGroup();
  const socket = io(base, { auth: { groupId, memberId: guestId }, transports: ["websocket"] });
  await new Promise((resolve) => socket.once("state", resolve));
  const heard = new Promise<any>((resolve) => socket.once("filters_changed", resolve));

  const filters = { radiusMeters: 4828, price: [1, 2], cuisine: ["mexican", "thai"] };
  const res = await call("PATCH", `/groups/${groupId}/filters`, { filters }, hostId);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, filters });
  assert.deepEqual((await heard).filters, filters);

  // A phone that connects afterwards gets them in state
  const late = io(base, { auth: { groupId, memberId: hostId }, transports: ["websocket"] });
  assert.deepEqual((await new Promise<any>((resolve) => late.once("state", resolve))).filters, filters);
  late.disconnect();
  socket.disconnect();
});

test("only the host can change filters, and bad filters are refused", async () => {
  const { groupId, hostId, guestId } = await lobbyGroup();
  const patch = (filters: unknown, who = hostId) => call("PATCH", `/groups/${groupId}/filters`, { filters }, who);

  const guest = await patch({ radiusMeters: 1000 }, guestId);
  assert.equal(guest.status, 403);
  assert.equal(guest.body.error.code, "NOT_HOST");
  assert.equal((await patch({ radiusMeters: 1000 }, "m_stranger")).status, 404);
  assert.equal((await patch({ radiusMeters: -5 })).body.error.code, "INVALID_INPUT");
  assert.equal((await patch({ price: [0, 5] })).body.error.code, "INVALID_INPUT");
  assert.equal((await patch({ cuisine: "thai" })).body.error.code, "INVALID_INPUT");
  assert.equal((await patch("everything")).body.error.code, "INVALID_INPUT");
});

test("starting the round tells every phone, and locks the filters", async () => {
  const { groupId, hostId, guestId } = await lobbyGroup();
  const socket = io(base, { auth: { groupId, memberId: guestId }, transports: ["websocket"] });
  await new Promise((resolve) => socket.once("state", resolve));
  let events = 0;
  socket.on("round_started", () => events++);
  const heard = new Promise((resolve) => socket.once("round_started", resolve));

  assert.equal((await call("POST", `/groups/${groupId}/start`, {}, guestId)).body.error.code, "NOT_HOST");
  assert.deepEqual((await call("POST", `/groups/${groupId}/start`, {}, hostId)).body, { ok: true });
  await heard;
  // Sending it again is harmless and doesn't announce it twice
  assert.deepEqual((await call("POST", `/groups/${groupId}/start`, {}, hostId)).body, { ok: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(events, 1);

  const locked = await call("PATCH", `/groups/${groupId}/filters`, { filters: { radiusMeters: 1000 } }, hostId);
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error.code, "ROUND_STARTED");

  const late = io(base, { auth: { groupId, memberId: hostId }, transports: ["websocket"] });
  assert.equal((await new Promise<any>((resolve) => late.once("state", resolve))).started, true);
  late.disconnect();
  socket.disconnect();
});

test("filters can't change once the cards were fetched", async () => {
  const { groupId, ids } = await newGroup(2);
  const res = await call("PATCH", `/groups/${groupId}/filters`, { filters: { radiusMeters: 1000 } }, ids[0]);
  assert.equal(res.body.error.code, "ROUND_STARTED");
});

test("if finding restaurants fails, the next request tries again", async () => {
  let calls = 0;
  const flaky = {
    async search() {
      calls++;
      if (calls === 1) throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't load restaurants right now.");
      return [];
    },
  };
  const own = createServer(buildApp(flaky));
  await new Promise<void>((resolve) => own.listen(0, resolve));
  const url = `http://localhost:${(own.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>);
  const host = await post("/groups", { nickname: "h", location: { lat: 1, lng: 1 }, filters: {} });
  const get = () => fetch(`${url}/groups/${host.groupId}/restaurants`, { headers: { "X-Member-Id": host.memberId } });

  const first = await get();
  assert.equal(first.status, 503);
  assert.equal(((await first.json()) as any).error.code, "RESTAURANTS_UNAVAILABLE");
  const second = await get();
  assert.equal(second.status, 200);
  own.closeAllConnections();
  own.close();
});

test("/geocode finds places for a typed location and rejects bad searches", async () => {
  const finder = { search: async (q: string) => [{ label: `${q}, California`, lat: 1, lng: 2 }] };
  const own = createServer(buildApp(undefined, finder));
  await new Promise<void>((resolve) => own.listen(0, resolve));
  const url = `http://localhost:${(own.address() as AddressInfo).port}`;

  const ok = await fetch(`${url}/geocode?q=${encodeURIComponent("  Berkeley ")}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { places: [{ label: "Berkeley, California", lat: 1, lng: 2 }] });

  for (const bad of ["", "?q=a", `?q=${"x".repeat(101)}`]) {
    const res = await fetch(`${url}/geocode${bad}`);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as any).error.code, "INVALID_INPUT");
  }
  own.closeAllConnections();
  own.close();
});
