import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "./groups.js";
import { createOsmProvider } from "./osm.js";

const HERE = { lat: 37.8716, lng: -122.2727 };

const el = (id: number, tags: Record<string, string>, dLat = 0.001) => ({
  type: "node",
  id,
  lat: HERE.lat + dLat,
  lon: HERE.lng,
  tags,
});

const SAMPLE = {
  elements: [
    el(1, { name: "Far Taqueria", cuisine: "mexican;taco", opening_hours: "Mo-Su 10:00-22:00", website: "https://far.example" }, 0.03),
    el(2, { name: "Near Pizza", cuisine: "pizza", "addr:housenumber": "12", "addr:street": "Shattuck Ave", "addr:city": "Berkeley", "addr:state": "CA", opening_hours: "Mo-Fr 11:00-14:00; Sa off" }, 0.001),
    el(3, { cuisine: "thai" }), // no name: skipped
    { type: "way", id: 4, center: { lat: HERE.lat + 0.002, lon: HERE.lng }, tags: { name: "Way Ramen", cuisine: "ramen" } },
    el(5, { name: "Outside Radius" }, 0.5),
  ],
};

function fakeFetch(handlers: Array<() => Response | Promise<Response>>) {
  let calls = 0;
  const fn = (async () => {
    const h = handlers[Math.min(calls, handlers.length - 1)];
    calls++;
    return h();
  }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}
const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });
const busy = () => new Response("busy", { status: 502 });

test("turns OpenStreetMap places into cards, nearest first", async () => {
  const f = fakeFetch([ok(SAMPLE)]);
  const out = await createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a"] }).search(HERE, { radiusMeters: 3000 });

  assert.deepEqual(out.map((r) => r.name), ["Near Pizza", "Way Ramen"]);
  const pizza = out[0];
  assert.equal(pizza.id, "osm_node_2");
  assert.equal(pizza.address, "12 Shattuck Ave, Berkeley, CA");
  assert.equal(pizza.cuisine, "Pizza");
  assert.equal(pizza.photoUrl, null);
  assert.equal(pizza.price, null);
  assert.equal(pizza.rating, null);
  assert.equal(pizza.hours, null); // too complicated to show as one line
  assert.ok(pizza.distanceMeters > 80 && pizza.distanceMeters < 140);
  assert.equal(out[1].address, "Address not listed");
});

test("shows simple opening hours and the website", async () => {
  const f = fakeFetch([ok(SAMPLE)]);
  const out = await createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a"] }).search(HERE, { radiusMeters: 5000 });
  const far = out.find((r) => r.name === "Far Taqueria")!;
  assert.equal(far.hours, "10:00–22:00");
  assert.equal(far.menuUrl, "https://far.example");
});

test("filters by cuisine, and caps the radius", async () => {
  const f = fakeFetch([ok(SAMPLE)]);
  const p = createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a"] });
  const out = await p.search(HERE, { radiusMeters: 5000, cuisine: ["Mexican"] });
  assert.deepEqual(out.map((r) => r.name), ["Far Taqueria"]);
});

test("a second search of the same area doesn't call the server again", async () => {
  const f = fakeFetch([ok(SAMPLE)]);
  const p = createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a"] });
  await p.search(HERE, { radiusMeters: 3000 });
  await p.search({ lat: HERE.lat + 0.0001, lng: HERE.lng }, { radiusMeters: 3000 });
  assert.equal(f.calls(), 1);
});

test("moves on to the next server when one is busy", async () => {
  const f = fakeFetch([busy, ok(SAMPLE)]);
  const out = await createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a", "http://b"] }).search(HERE, { radiusMeters: 3000 });
  assert.equal(out.length, 2);
  assert.equal(f.calls(), 2);
});

test("when every server fails it says so, and the failure isn't remembered", async () => {
  const f = fakeFetch([busy, busy, ok(SAMPLE)]);
  const p = createOsmProvider({ fetchFn: f.fn, endpoints: ["http://a", "http://b"] });
  await assert.rejects(p.search(HERE, { radiusMeters: 3000 }), (e: unknown) => e instanceof ApiError && e.code === "RESTAURANTS_UNAVAILABLE" && e.status === 503);
  assert.equal((await p.search(HERE, { radiusMeters: 3000 })).length, 2);
});
