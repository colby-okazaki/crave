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

// Your quick-vote pick, so a refresh on the No match screen still shows "Voted". This tab only
// (sessionStorage), like the swipe queue; cleared when the round changes or you leave.
const voteKey = (groupId: string, memberId: string) => `crave.vote.${groupId}.${memberId}`;

export function loadVote(groupId: string, memberId: string): string | null {
  try {
    return sessionStorage.getItem(voteKey(groupId, memberId));
  } catch {
    return null;
  }
}

export function saveVote(groupId: string, memberId: string, restaurantId: string) {
  try {
    sessionStorage.setItem(voteKey(groupId, memberId), restaurantId);
  } catch {
    // Not important: worst case the vote button shows again after a refresh (a second vote is ignored).
  }
}

export function clearVote(groupId: string, memberId: string) {
  try {
    sessionStorage.removeItem(voteKey(groupId, memberId));
  } catch {
    // Not important.
  }
}
