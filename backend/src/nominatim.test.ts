import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "./groups.js";
import { createNominatimProvider } from "./nominatim.js";
import { withFallback } from "./providers.js";
import type { RestaurantProvider } from "./restaurants.js";

const HERE = { lat: 37.8716, lng: -122.2727 };

const item = (id: number, name: string | undefined, extra: Record<string, unknown> = {}, dLat = 0.001) => ({
  osm_type: "node",
  osm_id: id,
  lat: String(HERE.lat + dLat),
  lon: String(HERE.lng),
  name,
  address: { house_number: "12", road: "Shattuck Avenue", city: "Berkeley", state: "California" },
  extratags: { cuisine: "pizza" },
  ...extra,
});

function fakeFetch(answers: Array<unknown | "fail">) {
  const urls: string[] = [];
  const fn = (async (url: string) => {
    const answer = answers[Math.min(urls.length, answers.length - 1)];
    urls.push(String(url));
    if (answer === "fail") return new Response("busy", { status: 503 });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, urls };
}

const quick = { minGapMs: 0, sleep: async () => {} };

test("turns Nominatim results into cards, with photo, hours and website when there are some", async () => {
  const f = fakeFetch([
    [
      item(1, "Near Pizza", { extratags: { cuisine: "pizza", opening_hours: "Mo-Su 11:00-21:00", website: "https://near.example", image: "https://img.example/near.jpg" } }),
      item(2, undefined), // no name: skipped
      item(3, "Far Away", {}, 0.5), // outside the radius
    ],
    [],
  ]);
  const out = await createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", ...quick }).search(HERE, { radiusMeters: 3000 });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Near Pizza");
  assert.equal(out[0].id, "osm_node_1");
  assert.equal(out[0].address, "12 Shattuck Avenue, Berkeley, California");
  assert.equal(out[0].cuisine, "Pizza");
  assert.equal(out[0].hours, "11:00–21:00");
  assert.equal(out[0].menuUrl, "https://near.example");
  assert.equal(out[0].photoUrl, "https://img.example/near.jpg");
  assert.equal(out[0].price, null);
  assert.equal(out[0].rating, null);
});

test("looks up restaurants and fast food, merges them, nearest first, and drops duplicates", async () => {
  const f = fakeFetch([
    [item(1, "Sit Down", {}, 0.004), item(9, "Both Lists", {}, 0.002)],
    [item(2, "Quick Bite", {}, 0.001), item(9, "Both Lists", {}, 0.002)],
  ]);
  const out = await createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", ...quick }).search(HERE, { radiusMeters: 3000 });
  assert.deepEqual(out.map((r) => r.name), ["Quick Bite", "Both Lists", "Sit Down"]);
  assert.equal(f.urls.length, 2);
  assert.match(f.urls[0], /amenity=restaurant/);
  assert.match(f.urls[1], /amenity=fast_food/);
  assert.match(f.urls[0], /bounded=1/);
});

test("filters by cuisine", async () => {
  const f = fakeFetch([[item(1, "Pizza Place"), item(2, "Taco Place", { extratags: { cuisine: "mexican;taco" } })], []]);
  const out = await createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", ...quick }).search(HERE, { radiusMeters: 3000, cuisine: ["Mexican"] });
  assert.deepEqual(out.map((r) => r.name), ["Taco Place"]);
});

test("a second search of the same area doesn't call Nominatim again", async () => {
  const f = fakeFetch([[item(1, "A")], []]);
  const p = createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", ...quick });
  await p.search(HERE, { radiusMeters: 3000 });
  await p.search({ lat: HERE.lat + 0.0001, lng: HERE.lng }, { radiusMeters: 3000 });
  assert.equal(f.urls.length, 2); // restaurant + fast food, once
});

test("keeps one request a second", async () => {
  const f = fakeFetch([[item(1, "A")], []]);
  let clock = 1_000_000;
  const naps: number[] = [];
  const p = createNominatimProvider({
    fetchFn: f.fn,
    baseUrl: "http://n",
    minGapMs: 1100,
    now: () => clock,
    sleep: async (ms) => {
      naps.push(ms);
      clock += ms;
    },
  });
  await p.search(HERE, { radiusMeters: 3000 });
  // First request goes straight away, the second has to wait out the gap
  assert.equal(naps.length, 1);
  assert.equal(naps[0], 1100);
});

test("says it's busy when too many searches are already waiting", async () => {
  const f = fakeFetch([[], []]);
  const p = createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", minGapMs: 0, maxWaiting: 1, sleep: async () => {} });
  const searches = [0, 1, 2].map((i) => p.search({ lat: 10 + i, lng: 10 }, { radiusMeters: 3000 }).then(() => "ok", (e: unknown) => (e as ApiError).code));
  const results = await Promise.all(searches);
  assert.ok(results.includes("RESTAURANTS_UNAVAILABLE"));
});

test("when Nominatim fails it says so, and the failure isn't remembered", async () => {
  const f = fakeFetch(["fail", [item(1, "A")], []]);
  const p = createNominatimProvider({ fetchFn: f.fn, baseUrl: "http://n", ...quick });
  await assert.rejects(p.search(HERE, { radiusMeters: 3000 }), (e: unknown) => e instanceof ApiError && e.code === "RESTAURANTS_UNAVAILABLE" && e.status === 503);
  assert.equal((await p.search(HERE, { radiusMeters: 3000 })).length, 1);
});

test("falls back to the second source when the first fails", async () => {
  const broken: RestaurantProvider = { search: async () => { throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "down"); } };
  const working: RestaurantProvider = { search: async () => [] };
  assert.deepEqual(await withFallback(broken, working).search(HERE, {}), []);
  await assert.rejects(withFallback(broken, broken).search(HERE, {}), (e: unknown) => e instanceof ApiError && e.status === 503);
});
