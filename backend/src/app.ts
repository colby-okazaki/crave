import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { corsOrigin } from "./cors.js";
import { ApiError, createGroup, findGroupForMember, isHost, joinGroup, leaveGroup, progressOf, resetRound, type Filters, type Group } from "./groups.js";
import { emitToGroup } from "./live.js";
import { photoHandler as defaultPhotoHandler, placeFinder, restaurantProvider } from "./providers.js";
import type { PlaceFinder } from "./places.js";
import { photoCheck } from "./google.js";
import type { Restaurant, RestaurantProvider } from "./restaurants.js";
import { createLimiters } from "./ratelimit.js";
import { closestPicks, decideVote, isExhausted, matchAfterLeave, matchPayload, recordSwipe } from "./swipes.js";

function invalid(message: string): never {
  throw new ApiError(400, "INVALID_INPUT", message);
}

function readNickname(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 30) {
    invalid("Nickname is required (1 to 30 characters).");
  }
  return value.trim();
}

function readLocation(value: any): { lat: number; lng: number } {
  const { lat, lng } = value ?? {};
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    invalid("Location needs a valid lat and lng.");
  }
  return { lat, lng };
}

// Filters the host can set: all optional, checked so bad values never reach the search
function readFilters(value: any): Filters {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("Filters must be an object.");
  const filters: Filters = {};
  if (value.radiusMeters !== undefined) {
    if (typeof value.radiusMeters !== "number" || !(value.radiusMeters > 0) || value.radiusMeters > 100_000) {
      invalid("radiusMeters must be a positive number of meters.");
    }
    filters.radiusMeters = value.radiusMeters;
  }
  if (value.price !== undefined) {
    if (!Array.isArray(value.price) || !value.price.every((p: unknown) => p === 1 || p === 2 || p === 3 || p === 4)) {
      invalid("price must be a list of levels from 1 to 4.");
    }
    filters.price = value.price;
  }
  if (value.cuisine !== undefined) {
    if (
      !Array.isArray(value.cuisine) ||
      value.cuisine.length > 50 ||
      !value.cuisine.every((c: unknown) => typeof c === "string" && c.length > 0 && c.length <= 40)
    ) {
      invalid("cuisine must be a list of short names.");
    }
    filters.cuisine = value.cuisine;
  }
  return filters;
}

// The group for a host-only action: must be a member, and the host
function hostGroup(groupId: string, memberId: string): Group {
  const group = findGroupForMember(groupId, memberId);
  if (!group) throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
  if (!isHost(group, memberId)) throw new ApiError(403, "NOT_HOST", "Only the host can do that.");
  return group;
}

// If a quick vote is open and everyone left has voted, announce the winner to the group
function announceVote(group: Group, stack: Restaurant[]) {
  const decided = decideVote(group, stack);
  if (!decided) return;
  emitToGroup(group.id, "vote_result", { winner: matchPayload(decided.winner), votes: decided.votes });
  emitToGroup(group.id, "match_found", { restaurant: matchPayload(decided.winner) });
}

const NUDGE_COOLDOWN_MS = 60_000;

export function buildApp(
  provider: RestaurantProvider = restaurantProvider,
  finder: PlaceFinder = placeFinder,
  photoHandler: RequestHandler | undefined = defaultPhotoHandler,
) {
  const app = express();
  // Behind a host's proxy, set TRUST_PROXY to how many proxies sit in front (usually 1)
  // so limits count each visitor's real address instead of the proxy's
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));
  const limits = createLimiters();
  app.use(cors({ origin: corsOrigin }));
  // Photos have their own, bigger limit and don't count toward the general one
  if (photoHandler) app.get("/photos/:placeId/:photoId", limits.photos, photoHandler);
  app.use(limits.general);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    // photoCheck is only there once a Google search has run (temporary, to debug missing photos)
    const google = photoCheck();
    res.json(google ? { ok: true, google } : { ok: true });
  });

  // Typed location -> coordinates, for the screen where someone picks where to eat
  app.get("/geocode", limits.geocode, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2 || q.length > 100) invalid("Type at least 2 characters (up to 100) to search for a place.");
    res.json({ places: await finder.search(q) });
  });

  app.post("/groups", limits.create, (req, res) => {
    const nickname = readNickname(req.body?.nickname);
    const location = readLocation(req.body?.location);
    const filters = req.body?.filters ?? {};
    res.status(201).json(createGroup({ nickname, location, filters }));
  });

  app.post("/groups/:code/join", limits.join, (req, res) => {
    const nickname = readNickname(req.body?.nickname);
    const result = joinGroup(String(req.params.code), nickname);
    const member = result.members.find((m) => m.id === result.memberId);
    emitToGroup(result.groupId, "member_joined", { member, reopened: result.reopened });
    const { reopened: _reopened, ...body } = result;
    res.json(body);
  });

  // Host changes filters in the lobby. Locked once the round starts or the cards were fetched,
  // because everyone has to swipe the same stack.
  app.patch("/groups/:id/filters", (req, res) => {
    const group = hostGroup(req.params.id, req.header("X-Member-Id") ?? "");
    if (group.started || group.restaurants) {
      throw new ApiError(409, "ROUND_STARTED", "The round has started, so the filters can't change.");
    }
    group.filters = readFilters(req.body?.filters);
    emitToGroup(group.id, "filters_changed", { filters: group.filters });
    res.json({ ok: true, filters: group.filters });
  });

  // Host starts the round: every phone in the lobby moves to swiping. Safe to send twice.
  app.post("/groups/:id/start", (req, res) => {
    const group = hostGroup(req.params.id, req.header("X-Member-Id") ?? "");
    if (!group.started) {
      group.started = true;
      emitToGroup(group.id, "round_started", {});
    }
    res.json({ ok: true });
  });

  // A member leaves for good. Everyone else is told, and the group is re-checked: with the leaver's
  // votes gone, the rest may now match, or may have run out of places.
  app.post("/groups/:id/leave", async (req, res) => {
    const memberId = req.header("X-Member-Id") ?? "";
    const group = findGroupForMember(req.params.id, memberId);
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    const { hostId, closed } = leaveGroup(group, memberId);
    if (closed) {
      res.json({ ok: true });
      return;
    }
    emitToGroup(group.id, "member_left", { memberId, hostId });

    const stack = await (group.restaurants ?? Promise.resolve([] as Restaurant[])).catch(() => [] as Restaurant[]);
    const match = matchAfterLeave(group, stack);
    if (match) emitToGroup(group.id, "match_found", { restaurant: matchPayload(match) });
    announceVote(group, stack);
    const exhausted = isExhausted(group, stack.length);
    if (exhausted && !group.exhausted) emitToGroup(group.id, "no_match", {});
    group.exhausted = exhausted;
    res.json({ ok: true });
  });

  // Host ends the round early: the group gets its match if it has one, otherwise no_match.
  app.post("/groups/:id/end", (req, res) => {
    const group = hostGroup(req.params.id, req.header("X-Member-Id") ?? "");
    if (group.match) {
      emitToGroup(group.id, "match_found", { restaurant: matchPayload(group.match) });
    } else if (!group.exhausted) {
      group.exhausted = true;
      emitToGroup(group.id, "no_match", {});
    }
    res.json({ ok: true, match: group.match ? { restaurantId: group.match.id } : null, noMatch: !group.match });
  });

  // Ping people who are slow to swipe. Anyone can nudge, once a minute per person.
  app.post("/groups/:id/nudge", (req, res) => {
    const memberId = req.header("X-Member-Id") ?? "";
    const group = findGroupForMember(req.params.id, memberId);
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    const ids = req.body?.memberIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || !ids.every((i: unknown) => typeof i === "string")) {
      invalid("memberIds must be a list of member IDs.");
    }
    const targets = [...new Set<string>(ids)].filter((id) => id !== memberId && group.members.some((m) => m.id === id));
    if (targets.length === 0) invalid("Pick someone else in the group to nudge.");
    const now = Date.now();
    group.nudges ??= new Map();
    if (targets.every((t) => now - (group.nudges!.get(`${memberId}>${t}`) ?? 0) < NUDGE_COOLDOWN_MS)) {
      throw new ApiError(429, "NUDGE_COOLDOWN", "You just nudged them. Give it a minute.");
    }
    // Skip anyone nudged in the last minute, nudge the rest
    const fresh = targets.filter((t) => now - (group.nudges!.get(`${memberId}>${t}`) ?? 0) >= NUDGE_COOLDOWN_MS);
    for (const t of fresh) group.nudges.set(`${memberId}>${t}`, now);
    const from = group.members.find((m) => m.id === memberId)!;
    emitToGroup(group.id, "nudged", { memberIds: fresh, from: { id: from.id, nickname: from.nickname } });
    res.json({ ok: true, nudged: fresh });
  });

  // Quick vote after a no-match: pick one of the closest picks. First vote counts.
  app.post("/groups/:id/vote", async (req, res) => {
    const memberId = req.header("X-Member-Id") ?? "";
    const group = findGroupForMember(req.params.id, memberId);
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    if (group.match || !group.exhausted) {
      throw new ApiError(409, "NO_VOTE_OPEN", "A vote only opens when the round ends with no match.");
    }
    const stack = group.restaurants ? await group.restaurants : [];
    const picks = closestPicks(group, stack);
    const restaurantId = req.body?.restaurantId;
    if (typeof restaurantId !== "string" || !picks.some((p) => p.restaurantId === restaurantId)) {
      invalid("Vote for one of the closest picks.");
    }
    group.votes ??= new Map();
    if (!group.votes.has(memberId)) {
      group.votes.set(memberId, restaurantId);
      emitToGroup(group.id, "vote_update", { votesIn: group.votes.size, total: group.members.length });
    }
    announceVote(group, stack);
    // announceVote may have just set the match, which TypeScript can't see from here
    const decided = (group as Group).match;
    res.json({
      ok: true,
      votesIn: group.votes.size,
      total: group.members.length,
      winner: decided ? { restaurantId: decided.id } : null,
    });
  });

  // Host starts the same group over (cards and swipes cleared, back in the lobby)
  app.post("/groups/:id/new-round", (req, res) => {
    const group = hostGroup(req.params.id, req.header("X-Member-Id") ?? "");
    const filters = req.body?.filters === undefined ? undefined : readFilters(req.body.filters);
    resetRound(group, filters);
    emitToGroup(group.id, "round_reset", { filters: group.filters });
    res.json({ ok: true, filters: group.filters });
  });

  // For the "no match" screen: the places the most people liked
  app.get("/groups/:id/results", async (req, res) => {
    const group = findGroupForMember(req.params.id, req.header("X-Member-Id") ?? "");
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    const stack = group.restaurants ? await group.restaurants : [];
    res.json({ results: closestPicks(group, stack) });
  });

  app.get("/groups/:id/restaurants", async (req, res) => {
    const group = findGroupForMember(req.params.id, req.header("X-Member-Id") ?? "");
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    // Cache the request itself, so two phones asking at once share one search
    if (!group.restaurants) {
      const search = provider.search(group.location, group.filters);
      group.restaurants = search;
      // If it fails, forget it so the next request tries again instead of failing forever
      search.catch(() => {
        if (group.restaurants === search) group.restaurants = undefined;
      });
    }
    const restaurants = await group.restaurants;
    group.stackSize = restaurants.length;
    res.json({ restaurants });
  });

  app.post("/groups/:id/swipes", async (req, res) => {
    const memberId = req.header("X-Member-Id") ?? "";
    const group = findGroupForMember(req.params.id, memberId);
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    const { restaurantId, liked } = req.body ?? {};
    if (typeof restaurantId !== "string" || typeof liked !== "boolean") {
      invalid("A swipe needs a restaurantId (text) and liked (true or false).");
    }
    // Only places this group was actually shown can be swiped on
    const stack = group.restaurants ? await group.restaurants : [];
    const restaurant = stack.find((r) => r.id === restaurantId);
    if (!restaurant) invalid("That restaurant isn't in this group's stack.");

    const { match, justMatched } = recordSwipe(group, memberId, restaurant, liked);
    if (justMatched) emitToGroup(group.id, "match_found", { restaurant: matchPayload(restaurant) });

    // Tell the group once when everyone has run out of places with no match
    const exhausted = isExhausted(group, stack.length);
    if (exhausted && !group.exhausted) emitToGroup(group.id, "no_match", {});
    group.exhausted = exhausted;
    emitToGroup(group.id, "progress", progressOf(group).find((p) => p.memberId === memberId));

    res.json({ ok: true, match: match ? { restaurantId: match.id } : null, noMatch: exhausted });
  });

  app.use((_req, _res, next) => {
    next(new ApiError(404, "NOT_FOUND", "That endpoint doesn't exist."));
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // Malformed JSON body from express.json()
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "Request body isn't valid JSON." } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our end." } });
  };
  app.use(onError);

  return app;
}
