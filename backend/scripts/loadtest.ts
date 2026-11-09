// Load test: many groups at once, each with a host and joiners on live sockets.
//
//   npm run loadtest -- --groups 50 --members 6
//
// Targets BASE_URL (default http://localhost:3000). Start the server first.
// Prints a markdown table of measured results to paste into STATS.md.

import { io, type Socket } from "socket.io-client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? fallback : Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a whole number of at least 1`);
  }
  return value;
}

const GROUPS = flag("groups", 20);
const MEMBERS = flag("members", 5); // per group, host included

const createMs: number[] = [];
const joinMs: number[] = [];
const notifyMs: number[] = []; // POST /join sent -> host's phone gets member_joined
const socketReadyMs: number[] = [];
const restaurantsMs: number[] = [];
const swipeMs: number[] = [];
const matchNotifyMs: number[] = []; // last yes sent -> host's phone gets match_found
let matches = 0;
let errors = 0;

async function post(path: string, body: unknown, memberId?: string) {
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(memberId ? { "X-Member-Id": memberId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<any>;
}

function connect(groupId: string, memberId: string): Promise<{ socket: Socket; ms: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = io(BASE_URL, { auth: { groupId, memberId }, transports: ["websocket"] });
    socket.once("state", () => resolve({ socket, ms: performance.now() - start }));
    socket.once("connect_error", reject);
  });
}

async function runGroup(g: number): Promise<Socket[]> {
  const sockets: Socket[] = [];
  try {
    let t = performance.now();
    const created = await post("/groups", {
      nickname: `host${g}`,
      location: { lat: 37.77, lng: -122.41 },
      filters: { radiusMeters: 3000 },
    });
    createMs.push(performance.now() - t);

    const host = await connect(created.groupId, created.memberId);
    sockets.push(host.socket);
    socketReadyMs.push(host.ms);
    const memberIds = [created.memberId as string];

    // The event can land before the HTTP reply does, so log every arrival by member ID
    const arrivals = new Map<string, number>();
    const waiting = new Map<string, (at: number) => void>();
    host.socket.on("member_joined", ({ member }: any) => {
      const at = performance.now();
      arrivals.set(member.id, at);
      waiting.get(member.id)?.(at);
    });
    const heardAt = (id: string) =>
      new Promise<number>((resolve, reject) => {
        const early = arrivals.get(id);
        if (early !== undefined) return resolve(early);
        waiting.set(id, resolve);
        setTimeout(() => reject(new Error("member_joined never arrived")), 5000);
      });

    for (let m = 1; m < MEMBERS; m++) {
      t = performance.now();
      const joined = await post(`/groups/${created.joinCode}/join`, { nickname: `p${g}_${m}` });
      joinMs.push(performance.now() - t);
      notifyMs.push((await heardAt(joined.memberId)) - t);

      const phone = await connect(joined.groupId, joined.memberId);
      sockets.push(phone.socket);
      socketReadyMs.push(phone.ms);
      memberIds.push(joined.memberId);
    }

    // Everyone gets the stack, then everyone swipes yes on the first place
    t = performance.now();
    const stack = await fetch(`${BASE_URL}/groups/${created.groupId}/restaurants`, {
      headers: { "X-Member-Id": created.memberId },
    });
    if (!stack.ok) throw new Error(`restaurants -> ${stack.status}`);
    const { restaurants } = (await stack.json()) as { restaurants: { id: string }[] };
    restaurantsMs.push(performance.now() - t);

    const matchHeard = new Promise<number>((resolve, reject) => {
      host.socket.once("match_found", () => resolve(performance.now()));
      setTimeout(() => reject(new Error("match_found never arrived")), 5000);
    });
    let lastSentAt = 0;
    for (const id of memberIds) {
      lastSentAt = performance.now();
      const reply = await post(`/groups/${created.groupId}/swipes`, { restaurantId: restaurants[0].id, liked: true }, id);
      swipeMs.push(performance.now() - lastSentAt);
      if (reply.match) matches++;
    }
    matchNotifyMs.push((await matchHeard) - lastSentAt);
  } catch (err) {
    errors++;
    console.error(`group ${g} failed:`, (err as Error).message);
  }
  return sockets;
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function row(label: string, values: number[]): string {
  const f = (n: number) => (Number.isNaN(n) ? "n/a" : n.toFixed(1));
  return `| ${label} | ${values.length} | ${f(pct(values, 50))} | ${f(pct(values, 95))} | ${f(pct(values, 99))} | ${f(Math.max(...values))} |`;
}

const started = performance.now();
const all = (await Promise.all(Array.from({ length: GROUPS }, (_, g) => runGroup(g)))).flat();
const seconds = (performance.now() - started) / 1000;
const httpRequests = createMs.length + joinMs.length + restaurantsMs.length + swipeMs.length;

console.log(`\nTarget: ${BASE_URL}`);
console.log(`${GROUPS} groups x ${MEMBERS} members = ${GROUPS * MEMBERS} phones, run time ${seconds.toFixed(2)} s`);
console.log(`Matches found: ${matches} of ${GROUPS} groups`);
console.log(`Live sockets open at the end: ${all.length}, failed groups: ${errors}`);
console.log(`HTTP requests: ${httpRequests} (${(httpRequests / seconds).toFixed(0)} per second)\n`);
console.log("| Measurement (ms) | Samples | p50 | p95 | p99 | Max |");
console.log("| --- | --- | --- | --- | --- | --- |");
console.log(row("POST /groups", createMs));
console.log(row("POST /groups/:code/join", joinMs));
console.log(row("Join to host notified (member_joined)", notifyMs));
console.log(row("Socket connect to first state event", socketReadyMs));
console.log(row("GET /groups/:id/restaurants", restaurantsMs));
console.log(row("POST /groups/:id/swipes", swipeMs));
console.log(row("Last yes to host notified (match_found)", matchNotifyMs));

for (const s of all) s.disconnect();
process.exit(errors > 0 ? 1 : 0);
