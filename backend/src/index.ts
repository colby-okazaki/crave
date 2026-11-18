import { createServer } from "node:http";
import { buildApp } from "./app.js";
import { removeExpiredGroups } from "./groups.js";
import { attachLive } from "./live.js";
import { pickStorage, startPersistence } from "./persist.js";

const port = Number(process.env.PORT ?? 3000);

// Groups survive restarts when DATABASE_URL or DATA_FILE is set (see persist.ts)
const storage = await pickStorage().catch((err) => {
  console.warn("Couldn't open storage, groups stay in memory only:", err.message);
  return null;
});
const saveAgain = storage ? await startPersistence(storage) : null;

const server = createServer(buildApp());
attachLive(server);

const CLEANUP_EVERY_MS = 10 * 60 * 1000;
setInterval(removeExpiredGroups, CLEANUP_EVERY_MS).unref();

server.listen(port, () => {
  console.log(`Crave back end listening on http://localhost:${port}`);
});

// Hosts send SIGTERM before a restart or redeploy: save once more so nobody loses their group
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await saveAgain?.();
    process.exit(0);
  });
}
