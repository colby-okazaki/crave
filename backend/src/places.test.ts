import assert from "node:assert/strict";
import { test } from "node:test";
import { createGate } from "./gate.js";
import { ApiError } from "./groups.js";
import { createNominatimPlaceFinder } from "./places.js";

const berkeley = {
  lat: "37.8708393",
  lon: "-122.272863",
  name: "Berkeley",
  address: { city: "Berkeley", state: "California", country: "United States", country_code: "us" },
};
const paris = {
  lat: "48.85",
  lon: "2.35",
  name: "Paris",
  address: { city: "Paris", state: "Ile-de-France", country: "France", country_code: "fr" },
};

function fakeFetch(answers: unknown[]) {
  const urls: string[] = [];
  const fn = (async (url: string) => {
    const answer = answers[Math.min(urls.length, answers.length - 1)];
    urls.push(String(url));
    if (answer === "fail") return new Response("busy", { status: 503 });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, urls };
}
const gate = () => createGate({ minGapMs: 0, sleep: async () => {} });

test("turns a typed place into short labels and coordinates", async () => {
  const f = fakeFetch([[berkeley, paris, { lat: "x", lon: "y", name: "Broken" }]]);
  const out = await createNominatimPlaceFinder({ fetchFn: f.fn, baseUrl: "http://n", gate: gate() }).search("Berkeley");
  assert.deepEqual(out, [
    { label: "Berkeley, California", lat: 37.8708393, lng: -122.272863 },
    { label: "Paris, Ile-de-France, France", lat: 48.85, lng: 2.35 },
  ]);
  assert.match(f.urls[0], /q=berkeley/);
});

test("the same search typed a different way is answered from memory", async () => {
  const f = fakeFetch([[berkeley]]);
  const finder = createNominatimPlaceFinder({ fetchFn: f.fn, baseUrl: "http://n", gate: gate() });
  await finder.search("Berkeley");
  await finder.search("  berkeley  ");
  assert.equal(f.urls.length, 1);
});

test("no match is an empty list, not an error", async () => {
  const f = fakeFetch([[]]);
  assert.deepEqual(await createNominatimPlaceFinder({ fetchFn: f.fn, baseUrl: "http://n", gate: gate() }).search("zzzz"), []);
});

test("a failed lookup says so and isn't remembered", async () => {
  const f = fakeFetch(["fail", [berkeley]]);
  const finder = createNominatimPlaceFinder({ fetchFn: f.fn, baseUrl: "http://n", gate: gate() });
  await assert.rejects(finder.search("Berkeley"), (e: unknown) => e instanceof ApiError && e.code === "RESTAURANTS_UNAVAILABLE");
  assert.equal((await finder.search("Berkeley")).length, 1);
});
