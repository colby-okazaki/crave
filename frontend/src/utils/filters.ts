import type { ApiFilters } from "../api/types";
import { DISTANCE_OPTIONS, PRICE_OPTIONS, type LobbyFilters } from "../screens/Lobby/Lobby";

const METERS_PER_MILE = 1609.344;

/**
 * Lobby chips → what the backend takes.
 * Price "$$" is sent as "up to $$" ([1, 2]); waiting on Colby to confirm (see PR #21).
 */
export function toApiFilters(f: LobbyFilters): ApiFilters {
  return {
    radiusMeters: Math.round(f.distanceMiles * METERS_PER_MILE),
    price: PRICE_OPTIONS.filter((level) => level <= f.price),
    ...(f.cuisines.length ? { cuisine: f.cuisines } : {}),
  };
}

/** What the host picked (from the server) → Lobby chips, for guests. */
export function fromApiFilters(a: ApiFilters, fallback: LobbyFilters): LobbyFilters {
  const miles = a.radiusMeters ? a.radiusMeters / METERS_PER_MILE : null;
  const distanceMiles =
    miles === null
      ? fallback.distanceMiles
      : DISTANCE_OPTIONS.reduce((best, option) => (Math.abs(option - miles) < Math.abs(best - miles) ? option : best));
  return {
    distanceMiles,
    price: a.price?.length ? Math.max(...a.price) : fallback.price,
    cuisines: a.cuisine ?? [],
  };
}
