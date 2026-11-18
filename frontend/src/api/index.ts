import { USE_MOCKS } from "./config";
import { realApi } from "./real";
import type { CraveApi } from "./types";

/**
 * The server the app talks to: the real backend, or fake data with `npm run dev:mock`.
 * A live binding: `loadApi()` swaps in the fake one before the app renders.
 */
export let api: CraveApi = realApi;
export { USE_MOCKS };

/**
 * Loads fake-data mode only when it's on. Because the import sits behind the build-time flag,
 * a normal build leaves the fake restaurants and friends out of the app entirely.
 */
export async function loadApi() {
  if (import.meta.env.VITE_USE_MOCKS === "true") api = (await import("./mock")).mockApi;
}
