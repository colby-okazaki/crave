import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { buildApp } from "./app.js";

let server: Server;
let base = "";

before(async () => {
  delete process.env.RATE_LIMIT;
  server = createServer(buildApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("guessing join codes gets cut off after 10 wrong tries", async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await post("/groups/0000/join", { nickname: `n${i}` })).status, 404);
  }
  const blocked = await post("/groups/0000/join", { nickname: "n11" });
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as any).error.code, "RATE_LIMITED");
  assert.ok(blocked.headers.get("retry-after"));
});

test("successful joins never count against the limit (a whole table joining at dinner)", async () => {
  // Wrong guesses above already used up this address's join allowance, so use a fresh app
  const own = createServer(buildApp());
  await new Promise<void>((resolve) => own.listen(0, resolve));
  const url = `http://localhost:${(own.address() as AddressInfo).port}`;
  const send = (path: string, body: unknown) =>
    fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const host = (await (await send("/groups", { nickname: "host", location: { lat: 1, lng: 1 }, filters: {} })).json()) as any;
  for (let i = 0; i < 15; i++) {
    assert.equal((await send(`/groups/${host.joinCode}/join`, { nickname: `friend${i}` })).status, 200);
  }
  own.closeAllConnections();
  own.close();
});

test("one address can't create groups without limit", async () => {
  const own = createServer(buildApp());
  await new Promise<void>((resolve) => own.listen(0, resolve));
  const url = `http://localhost:${(own.address() as AddressInfo).port}`;
  let last = 0;
  for (let i = 0; i < 21; i++) {
    last = (await fetch(url + "/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: "h", location: { lat: 1, lng: 1 }, filters: {} }) })).status;
  }
  assert.equal(last, 429);
  own.closeAllConnections();
  own.close();
});
