import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

// Join codes are only 4 digits (10,000 possibilities), so without a limit someone could
// try every code and join strangers' groups. Limits are per IP address, per minute.
//
// - join: only failed attempts count (wrong code, taken nickname), so six friends on the
//   same Wi-Fi joining one group at dinner never run into it
// - create: stops one address from filling up all the codes
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

export function createLimiters(): { general: RequestHandler; create: RequestHandler; join: RequestHandler } {
  if (process.env.RATE_LIMIT === "off") {
    const pass: RequestHandler = (_req, _res, next) => next();
    return { general: pass, create: pass, join: pass };
  }
  return {
    general: limiter(300),
    create: limiter(20),
    join: limiter(10, { failedOnly: true }),
  };
}
