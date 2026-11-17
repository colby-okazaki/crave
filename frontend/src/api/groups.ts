// Mocks of the group endpoints and live updates (see docs/API.md) until the frontend talks to the real backend.

export type Member = { id: string; nickname: string };

export type JoinResult =
  | { ok: true; groupId: string; memberId: string }
  | { ok: false; error: "GROUP_NOT_FOUND" | "GROUP_CLOSED" | "NICKNAME_TAKEN" };

export type CreateResult = { groupId: string; joinCode: string; memberId: string };

/** Only this code "exists" in the mock, so you can try both the success and the "not found" paths. */
export const MOCK_VALID_CODE = "1234";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock of POST /groups. */
export async function createGroup(_nickname: string): Promise<CreateResult> {
  await wait(400);
  return { groupId: "g_mock0001", joinCode: MOCK_VALID_CODE, memberId: "m_host" };
}

/** Mock of POST /groups/:code/join. */
export async function joinGroup(code: string, _nickname: string): Promise<JoinResult> {
  await wait(600);
  if (code !== MOCK_VALID_CODE) return { ok: false, error: "GROUP_NOT_FOUND" };
  return { ok: true, groupId: "g_mock0001", memberId: "m_guest" };
}

/**
 * Mock of the Socket.io `state` + `member_joined` events: calls `onMembers`
 * with the full member list right away, then again as fake friends join.
 * Returns a function that stops listening.
 */
export function watchMembers(
  me: Member,
  isHost: boolean,
  onMembers: (members: Member[]) => void,
): () => void {
  let members: Member[] = isHost ? [me] : [{ id: "m_host", nickname: "Colby" }, me];
  const arrivals: Member[] = [
    { id: "m_mia", nickname: "Mia" },
    { id: "m_jordan", nickname: "Jordan" },
  ];

  const first = setTimeout(() => onMembers(members), 300);
  const timers = arrivals.map((member, i) =>
    setTimeout(() => {
      members = [...members, member];
      onMembers(members);
    }, 2500 * (i + 1)),
  );

  return () => [first, ...timers].forEach(clearTimeout);
}

/** One person's progress through the cards (for the Waiting screen). */
export type MemberProgress = Member & { swiped: number; total: number };

/**
 * Mock of a live "progress" event (not in docs/API.md yet): calls `onUpdate`
 * with everyone's progress right away, then again as fake friends swipe.
 * You're always done (you only get here after your last card).
 */
/** The fake group used by the mocks: you plus Mia and Jordan (and Colby as host if you joined). */
export function mockGroup(me: Member, isHost: boolean): Member[] {
  return [
    ...(isHost ? [] : [{ id: "m_host", nickname: "Colby" }]),
    me,
    { id: "m_mia", nickname: "Mia" },
    { id: "m_jordan", nickname: "Jordan" },
  ];
}

export function watchProgress(
  me: Member,
  isHost: boolean,
  total: number,
  onUpdate: (members: MemberProgress[]) => void,
): () => void {
  const start: Record<string, number> = { m_mia: total - 3, m_jordan: Math.max(total - 8, 0) };
  let members: MemberProgress[] = mockGroup(me, isHost).map((m) => ({ ...m, swiped: start[m.id] ?? total, total }));
  const first = setTimeout(() => onUpdate(members), 300);
  // Every 1.5s, each friend who isn't done swipes one more card.
  const tick = setInterval(() => {
    members = members.map((m) => (m.swiped < m.total ? { ...m, swiped: m.swiped + 1 } : m));
    onUpdate(members);
    if (members.every((m) => m.swiped >= m.total)) clearInterval(tick);
  }, 1500);
  return () => {
    clearTimeout(first);
    clearInterval(tick);
  };
}

/** Mock of a "nudge" request (not in docs/API.md yet): pings people who are still swiping. */
export async function nudgeMembers(_groupId: string, _memberIds: string[]): Promise<void> {
  await wait(300);
}

/** Mock of "end round now" (host only; not in docs/API.md yet). */
export async function endRound(_groupId: string): Promise<void> {
  await wait(300);
}
