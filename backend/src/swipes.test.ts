import assert from "node:assert/strict";
import { test } from "node:test";
import type { Group } from "./groups.js";
import type { Restaurant } from "./restaurants.js";
import { isExhausted, recordSwipe } from "./swipes.js";

const place = (id: string): Restaurant => ({
  id,
  name: id,
  photoUrl: "",
  price: 1,
  rating: 4,
  distanceMeters: 100,
  address: "1 Main St",
  hours: "11:00–21:00",
  location: { lat: 0, lng: 0 },
});

const groupOf = (...ids: string[]): Group => ({
  id: "g_1",
  joinCode: "0001",
  location: { lat: 0, lng: 0 },
  filters: {},
  members: ids.map((id) => ({ id, nickname: id })),
  swipes: new Map(),
  createdAt: Date.now(),
});

test("matches only when every member likes the same place", () => {
  const g = groupOf("a", "b", "c");
  const r = place("r1");
  assert.equal(recordSwipe(g, "a", r, true).match, null);
  assert.equal(recordSwipe(g, "b", r, true).match, null);
  const last = recordSwipe(g, "c", r, true);
  assert.equal(last.match?.id, "r1");
  assert.equal(last.justMatched, true);
});

test("one no blocks that place", () => {
  const g = groupOf("a", "b");
  const r = place("r1");
  recordSwipe(g, "a", r, true);
  assert.equal(recordSwipe(g, "b", r, false).match, null);
});

test("likes on different places don't add up", () => {
  const g = groupOf("a", "b");
  recordSwipe(g, "a", place("r1"), true);
  assert.equal(recordSwipe(g, "b", place("r2"), true).match, null);
});

test("first swipe counts and repeats are harmless", () => {
  const g = groupOf("a", "b");
  const r = place("r1");
  recordSwipe(g, "a", r, false);
  recordSwipe(g, "a", r, true); // ignored
  assert.equal(recordSwipe(g, "b", r, true).match, null);
});

test("a group of one never matches", () => {
  const g = groupOf("a");
  assert.equal(recordSwipe(g, "a", place("r1"), true).match, null);
});

test("someone who joins later has to like it too", () => {
  const g = groupOf("a", "b");
  const r = place("r1");
  recordSwipe(g, "a", r, true);
  g.members.push({ id: "c", nickname: "c" });
  assert.equal(recordSwipe(g, "b", r, true).match, null);
  assert.equal(recordSwipe(g, "c", r, true).match?.id, "r1");
});

test("the first match stays, and only the first swipe reports it as new", () => {
  const g = groupOf("a", "b");
  recordSwipe(g, "a", place("r1"), true);
  recordSwipe(g, "b", place("r1"), true);
  recordSwipe(g, "a", place("r2"), true);
  const later = recordSwipe(g, "b", place("r2"), true);
  assert.equal(later.match?.id, "r1");
  assert.equal(later.justMatched, false);
});

test("out of places: everyone swiped everything and nobody matched", () => {
  const g = groupOf("a", "b");
  recordSwipe(g, "a", place("r1"), true);
  recordSwipe(g, "b", place("r1"), false);
  assert.equal(isExhausted(g, 2), false); // r2 not swiped yet
  recordSwipe(g, "a", place("r2"), false);
  assert.equal(isExhausted(g, 2), false); // b hasn't swiped r2
  recordSwipe(g, "b", place("r2"), true);
  assert.equal(isExhausted(g, 2), true);
});

test("a match means the group is never out of places", () => {
  const g = groupOf("a", "b");
  recordSwipe(g, "a", place("r1"), true);
  recordSwipe(g, "b", place("r1"), true);
  assert.equal(isExhausted(g, 1), false);
});
