import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { buildApp } from "./app.js";
import { createGoogleProvider, createPhotoHandler } from "./google.js";
import { mockProvider } from "./restaurants.js";
import { mockPlaceFinder } from "./places.js";

const HERE = { lat: 37.8716, lng: -122.2727 };
// A Wednesday at 12:00 UTC; Berkeley is 8 hours behind, so it's Wednesday morning there
const NOW = Date.UTC(2026, 10, 18, 12, 0);

const place = (id: string, name: string, dLat: number, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name} St, Berkeley, CA`,
  location: { latitude: HERE.lat + dLat, longitude: HERE.lng },
  ...extra,
});

const SAMPLE = {
  places: [
    place("far", "Far Pho", 0.02, {
      priceLevel: "PRICE_LEVEL_MODERATE",
      rating: 4.46,
      photos: [{ name: "places/far/photos/AbC_123-x" }],
      primaryTypeDisplayName: { text: "Vietnamese Restaurant" },
      websiteUri: "https://far.example",
      utcOffsetMinutes: -480,
      regularOpeningHours: {
        periods: [
          { open: { day: 3, hour: 11, minute: 0 }, close: { day: 3, hour: 21, minute: 30 } },
          { open: { day: 4, hour: 9, minute: 0 }, close: { day: 4, hour: 10, minute: 0 } },
        ],
      },
    }),
    place("near", "Near Pizza", 0.001, {
      priceLevel: "PRICE_LEVEL_EXPENSIVE",
      photos: [{ name: "places/near/photos/Zed9" }],
      primaryTypeDisplayName: { text: "Restaurant" },
    }),
    { id: "noname", location: { latitude: HERE.lat, longitude: HERE.lng } },
    place("nophoto", "No Photo Cafe", 0.002),
  ],
};

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test("turns Google places into cards: photo, price, rating, hours, cuisine, nearest first", async () => {
  const f = fakeFetch(SAMPLE);
  const out = await createGoogleProvider({ apiKey: "k", fetchFn: f.fn, publicUrl: "https://api.test", now: () => NOW }).search(HERE, { radiusMeters: 5000 });

  assert.deepEqual(out.map((r) => r.name), ["Near Pizza", "No Photo Cafe", "Far Pho"]);
  const far = out.find((r) => r.name === "Far Pho")!;
  assert.equal(far.id, "gp_far");
  assert.equal(far.photoUrl, "https://api.test/photos/far/AbC_123-x");
  assert.equal(far.price, 2);
  assert.equal(far.rating, 4.5);
  assert.equal(far.hours, "11:00–21:30");
  assert.equal(far.cuisine, "Vietnamese");
  assert.equal(far.menuUrl, "https://far.example");
  assert.equal(far.address, "Far Pho St, Berkeley, CA");

  const near = out[0];
  assert.equal(near.price, 3);
  assert.equal(near.cuisine, undefined); // plain "Restaurant" says nothing
  assert.equal(out[1].photoUrl, null);
  assert.equal(out[1].price, null);
  assert.equal(out[1].rating, null);
  assert.equal(out[1].hours, null);
});

test("the key goes in a header, never in a link phones get", async () => {
  const f = fakeFetch(SAMPLE);
  const out = await createGoogleProvider({ apiKey: "SECRET", fetchFn: f.fn, publicUrl: "https://api.test", now: () => NOW }).search(HERE, {});
  assert.equal((f.calls[0].init!.headers as Record<string, string>)["X-Goog-Api-Key"], "SECRET");
  assert.ok(!f.calls[0].url.includes("SECRET"));
  assert.ok(!JSON.stringify(out).includes("SECRET"));
});

test("radius and price filters apply, and a cuisine filter uses a text search", async () => {
  const f = fakeFetch(SAMPLE);
  const provider = createGoogleProvider({ apiKey: "k", fetchFn: f.fn, publicUrl: "https://api.test", now: () => NOW });

  const close = await provider.search(HERE, { radiusMeters: 500 });
  assert.deepEqual(close.map((r) => r.name), ["Near Pizza", "No Photo Cafe"]);

  // Price 2 only: Near Pizza is $$$ so it goes; unknown prices stay
  const cheap = await provider.search(HERE, { radiusMeters: 5000, price: [1, 2] });
  assert.deepEqual(cheap.map((r) => r.name), ["No Photo Cafe", "Far Pho"]);

  assert.ok(f.calls[0].url.endsWith("places:searchNearby"));
  await provider.search(HERE, { cuisine: ["middle_eastern", "thai"] });
  const last = f.calls[f.calls.length - 1];
  assert.ok(last.url.endsWith("places:searchText"));
  assert.equal(JSON.parse(String(last.init!.body)).textQuery, "middle eastern or thai restaurant");
});

test("if Google fails, the search errors so the server can fall back", async () => {
  const f = fakeFetch({ error: "quota" }, 429);
  await assert.rejects(
    createGoogleProvider({ apiKey: "k", fetchFn: f.fn }).search(HERE, {}),
    (e: any) => e.status === 503 && e.code === "RESTAURANTS_UNAVAILABLE",
  );
});

let server: Server;
let base = "";
let upstreamCalls: string[] = [];

before(async () => {
  process.env.RATE_LIMIT = "off";
  const upstream = (async (url: string, init?: RequestInit) => {
    upstreamCalls.push(String(url));
    assert.equal((init!.headers as Record<string, string>)["X-Goog-Api-Key"], "SECRET");
    if (String(url).includes("/missing/")) return new Response("no", { status: 404 });
    return new Response(Buffer.from("fake-jpeg-bytes"), { status: 200, headers: { "content-type": "image/jpeg" } });
  }) as unknown as typeof fetch;
  server = createServer(buildApp(mockProvider, mockPlaceFinder, createPhotoHandler({ apiKey: "SECRET", fetchFn: upstream })));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test("photos are served through us, and the same photo is only fetched from Google once", async () => {
  upstreamCalls = [];
  const a = await fetch(`${base}/photos/near/Zed9`);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("content-type"), "image/jpeg");
  assert.match(a.headers.get("cache-control") ?? "", /max-age=3600/);
  assert.equal(await a.text(), "fake-jpeg-bytes");
  const b = await fetch(`${base}/photos/near/Zed9`);
  assert.equal(await b.text(), "fake-jpeg-bytes");
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0], "https://places.googleapis.com/v1/places/near/photos/Zed9/media?maxWidthPx=800");
});

test("the photo route can't be used to fetch anything but photos", async () => {
  upstreamCalls = [];
  assert.equal((await fetch(`${base}/photos/near/..%2F..%2Fother`)).status, 404);
  assert.equal((await fetch(`${base}/photos/a.b/c`)).status, 404);
  assert.equal((await fetch(`${base}/photos/missing/gone`)).status, 404);
  assert.equal(upstreamCalls.filter((u) => !u.includes("/missing/")).length, 0);
});
