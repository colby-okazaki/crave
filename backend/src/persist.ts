import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exportGroups, importGroups } from "./groups.js";

// Saves every open group so a restart or a sleep doesn't end them. The whole state is one
// small JSON snapshot (groups are few and short-lived), written every few seconds and again
// when the server is told to stop.
//
// - DATABASE_URL set: kept in one row of a Postgres table (survives Render's free disk wipes)
// - DATA_FILE set: kept in a file (survives restarts on a machine with a persistent disk)
// - neither: in memory only, as before
export interface Storage {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

export function fileStorage(path: string): Storage {
  return {
    async load() {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
    async save(json) {
      await mkdir(dirname(path), { recursive: true });
      // Write beside the file and rename, so a crash mid-write never leaves half a file
      await writeFile(`${path}.tmp`, json);
      await rename(`${path}.tmp`, path);
    },
  };
}

export async function postgresStorage(url: string): Promise<Storage> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    // Hosted Postgres (Render, Neon, Supabase) needs TLS; local ones usually don't
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await pool.query("CREATE TABLE IF NOT EXISTS crave_state (id integer PRIMARY KEY, data text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now())");
  return {
    async load() {
      const res = await pool.query("SELECT data FROM crave_state WHERE id = 1");
      return res.rows[0]?.data ?? null;
    },
    async save(json) {
      await pool.query(
        "INSERT INTO crave_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1, saved_at = now()",
        [json],
      );
    },
  };
}

export async function pickStorage(env = process.env): Promise<Storage | null> {
  if (env.DATABASE_URL) return postgresStorage(env.DATABASE_URL);
  if (env.DATA_FILE) return fileStorage(env.DATA_FILE);
  return null;
}

export async function saveNow(storage: Storage): Promise<void> {
  await storage.save(JSON.stringify(await exportGroups()));
}

export async function restore(storage: Storage): Promise<number> {
  const raw = await storage.load();
  if (!raw) return 0;
  try {
    return importGroups(JSON.parse(raw));
  } catch {
    console.warn("Saved groups couldn't be read, starting empty.");
    return 0;
  }
}

// Loads what was saved, then keeps saving. Returns a function that saves once more (for shutdown).
export async function startPersistence(storage: Storage, everyMs = 5000): Promise<() => Promise<void>> {
  const loaded = await restore(storage);
  if (loaded) console.log(`Restored ${loaded} open group${loaded === 1 ? "" : "s"}.`);
  let last = "";
  const tick = async () => {
    try {
      const json = JSON.stringify(await exportGroups());
      if (json !== last) {
        await storage.save(json);
        last = json;
      }
    } catch (err) {
      console.warn("Couldn't save groups:", (err as Error).message);
    }
  };
  setInterval(tick, everyMs).unref();
  return tick;
}
