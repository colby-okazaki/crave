import { USE_MOCKS } from "./config";
import { mockApi } from "./mock";
import { realApi } from "./real";
import type { CraveApi } from "./types";

/** The server the app talks to: the real backend, or fake data with `npm run dev:mock`. */
export const api: CraveApi = USE_MOCKS ? mockApi : realApi;
export { USE_MOCKS };
