import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { corsOrigin } from "./cors.js";
import { ApiError, createGroup, findGroupForMember, joinGroup } from "./groups.js";
import { emitToGroup } from "./live.js";
import { mockProvider } from "./restaurants.js";

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

export function buildApp() {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/groups", (req, res) => {
    const nickname = readNickname(req.body?.nickname);
    const location = readLocation(req.body?.location);
    const filters = req.body?.filters ?? {};
    res.status(201).json(createGroup({ nickname, location, filters }));
  });

  app.post("/groups/:code/join", (req, res) => {
    const nickname = readNickname(req.body?.nickname);
    const result = joinGroup(req.params.code, nickname);
    const member = result.members.find((m) => m.id === result.memberId);
    emitToGroup(result.groupId, "member_joined", { member });
    res.json(result);
  });

  app.get("/groups/:id/restaurants", async (req, res) => {
    const group = findGroupForMember(req.params.id, req.header("X-Member-Id") ?? "");
    if (!group) {
      throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
    }
    // Cache the request itself, so two phones asking at once share one search
    group.restaurants ??= mockProvider.search(group.location, group.filters);
    res.json({ restaurants: await group.restaurants });
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
