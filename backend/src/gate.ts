import { ApiError } from "./groups.js";

// A one-at-a-time line with a minimum gap between turns. Nominatim allows one request a
// second for everything, so restaurant lookups and place searches share one gate.
// When too many are already waiting, new ones are turned away instead of queued forever.
export interface Gate {
  waitForTurn(): Promise<void>;
}

export function createGate(
  options: { minGapMs?: number; maxWaiting?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Gate {
  const minGapMs = options.minGapMs ?? 1100;
  const maxWaiting = options.maxWaiting ?? 20;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let line: Promise<void> = Promise.resolve();
  let lastAt = 0;
  let waiting = 0;

  return {
    waitForTurn() {
      if (waiting >= maxWaiting) {
        throw new ApiError(503, "RESTAURANTS_UNAVAILABLE", "Couldn't load that right now. Try again in a minute.");
      }
      waiting++;
      const turn = line.then(async () => {
        const wait = lastAt + minGapMs - now();
        if (wait > 0) await sleep(wait);
        lastAt = now();
        waiting--;
      });
      line = turn;
      return turn;
    },
  };
}
