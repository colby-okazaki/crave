/**
 * Where the backend lives. Defaults to port 3000 on the same computer that served the app,
 * so a phone opening the Vite "Network" address reaches the server too.
 * Set VITE_API_URL (see .env.example) when the backend is somewhere else.
 */
export const API_URL: string =
  import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

/** Fake-data mode (npm run dev:mock): no backend needed. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
