import { randomBytes, randomInt } from "node:crypto";
import type { Restaurant } from "./restaurants.js";

export interface Member {
  id: string;
  nickname: string;
}

export interface Filters {
  radiusMeters?: number;
  price?: number[];
  cuisine?: string[];
}

export interface Group {
  id: string;
  joinCode: string;
  location: { lat: number; lng: number };
  filters: Filters;
  members: Member[];
  // Searched once per group so everyone swipes the same cards in the same order
  restaurants?: Promise<Restaurant[]>;
  createdAt: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Digits only: 4 numbers are quick to say out loud and type. Codes are strings, so a
// leading zero ("0427") is kept. Only needs to be unique among groups open right now.
const CODE_ALPHABET = "0123456789";
const CODE_LENGTH = 4;
const GROUP_TTL_MS = Number(process.env.GROUP_TTL_HOURS ?? 24) * 60 * 60 * 1000;

// In memory for now; swap for the database later without changing the API
const groupsByCode = new Map<string, Group>();
const groupsById = new Map<string, Group>();

export function findGroupForMember(groupId: string, memberId: string): Group | undefined {
  const group = groupsById.get(groupId);
  if (!group || isExpired(group)) return undefined;
  return group.members.some((m) => m.id === memberId) ? group : undefined;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function newJoinCode(): string {
  // Only 10,000 codes exist, so stop trying rather than loop forever if nearly all are in use
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    if (!groupsByCode.has(code)) return code;
  }
  throw new ApiError(503, "SERVER_BUSY", "Too many groups are open right now. Try again in a minute.");
}

// Frees groups past their lifetime. Between sweeps an expired group still answers
// GROUP_CLOSED; once swept, its code answers GROUP_NOT_FOUND.
export function removeExpiredGroups(now = Date.now()): number {
  let removed = 0;
  for (const group of groupsById.values()) {
    if (isExpired(group, now)) {
      groupsById.delete(group.id);
      groupsByCode.delete(group.joinCode);
      removed++;
    }
  }
  return removed;
}

function isExpired(group: Group, now = Date.now()): boolean {
  return now - group.createdAt > GROUP_TTL_MS;
}

export function createGroup(input: {
  nickname: string;
  location: { lat: number; lng: number };
  filters: Filters;
}) {
  const host: Member = { id: newId("m"), nickname: input.nickname };
  const group: Group = {
    id: newId("g"),
    joinCode: newJoinCode(),
    location: input.location,
    filters: input.filters,
    members: [host],
    createdAt: Date.now(),
  };
  groupsByCode.set(group.joinCode, group);
  groupsById.set(group.id, group);
  return { groupId: group.id, joinCode: group.joinCode, memberId: host.id };
}

export function joinGroup(joinCode: string, nickname: string) {
  const group = groupsByCode.get(joinCode.toUpperCase());
  if (!group) {
    throw new ApiError(404, "GROUP_NOT_FOUND", "That code doesn't match an open group.");
  }
  if (isExpired(group)) {
    throw new ApiError(410, "GROUP_CLOSED", "That group has closed. Start a new one.");
  }
  const taken = group.members.some(
    (m) => m.nickname.toLowerCase() === nickname.toLowerCase(),
  );
  if (taken) {
    throw new ApiError(409, "NICKNAME_TAKEN", "Someone in the group already has that nickname.");
  }
  const member: Member = { id: newId("m"), nickname };
  group.members.push(member);
  return { groupId: group.id, memberId: member.id, members: group.members };
}
