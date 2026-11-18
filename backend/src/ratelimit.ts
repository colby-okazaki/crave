import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

// Join codes are only 4 digits (10,000 possibilities), so without a limit someone could
// try every code and join strangers' groups. Limits are per IP address, per minute.
//
// - join: only failed attempts count (wrong code, taken nickname), so six friends on the
//   same Wi-Fi joining one group at dinner never run into it
// - create: stops one address from filling up all the codes
// - geocode: place searches go to a shared outside service, so keep one address polite
// - photos: restaurant photos, kept out of the general count because a swipe stack loads many at once
// - general: a loose ceiling on everything else
//
// RATE_LIMIT=off turns them all off (used by the tests and the load test).
function limiter(max: number, options: { failedOnly?: boolean } = {}): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: options.failedOnly ?? false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many tries. Wait a minute and try again." },
      });
    },
  });
}

export function createLimiters(): { general: RequestHandler; create: RequestHandler; join: RequestHandler; geocode: RequestHandler; photos: RequestHandler } {
  if (process.env.RATE_LIMIT === "off") {
    const pass: RequestHandler = (_req, _res, next) => next();
    return { general: pass, create: pass, join: pass, geocode: pass, photos: pass };
  }
  return {
    general: limiter(300),
    create: limiter(20),
    join: limiter(10, { failedOnly: true }),
    geocode: limiter(30),
    // A card stack loads up to 20 photos per phone, so a table of friends on one Wi-Fi needs room
    photos: limiter(600),
  };
}
