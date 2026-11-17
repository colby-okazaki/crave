import type { Place } from "../api/types";

// Remembered on this device so returning people don't retype things.
// Storage can be blocked (private mode), so every read and write is allowed to fail.
const NICKNAME_KEY = "crave.nickname";
const LOCATION_KEY = "crave.location";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not important.
  }
}

export const loadNickname = () => read(NICKNAME_KEY) ?? "";
export const saveNickname = (name: string) => write(NICKNAME_KEY, name);

export function loadPlace(): Place | null {
  try {
    const place = JSON.parse(read(LOCATION_KEY) ?? "null");
    return typeof place?.lat === "number" && typeof place?.lng === "number" && typeof place?.label === "string"
      ? place
      : null;
  } catch {
    return null;
  }
}
export const savePlace = (place: Place) => write(LOCATION_KEY, JSON.stringify(place));
