import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar/Avatar";
import { Button } from "../../components/Button/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { Member } from "../../api/types";
import checkIcon from "../../assets/icons/check.svg";
import styles from "./Waiting.module.css";

/** Figma notes: Nudge has a 1 minute cooldown. */
export const NUDGE_COOLDOWN_MS = 60_000;

/** Someone in the group; `swiped` / `total` only when the server tracks progress. */
type WaitingMember = Member & { swiped?: number; total?: number };

type WaitingProps = {
  /** Everyone in the group, or null while we're still connecting. */
  members: WaitingMember[] | null;
  myId: string;
  isHost: boolean;
  /** Ping the people who are still swiping. Leave out to hide the button. */
  onNudge?: (memberIds: string[]) => Promise<void>;
  /** Host only: stop the round and use the likes so far. Leave out to hide it. */
  onEndRound?: () => void;
  /** e.g. "Reconnecting… 2 swipes waiting to send". */
  notice?: string;
};

/** Done, still swiping, or unknown (the server doesn't track progress yet). */
function progressOf(m: WaitingMember, myId: string): "done" | "swiping" | "unknown" {
  if (m.id === myId) return "done"; // you only get here after your last card
  if (m.swiped === undefined || m.total === undefined) return "unknown";
  return m.swiped >= m.total ? "done" : "swiping";
}

export function Waiting({ members, myId, isHost, onNudge, onEndRound, notice }: WaitingProps) {
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Tick once a second while the Nudge button is cooling down.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const tracked = (members ?? []).some((m) => m.id !== myId && progressOf(m, myId) !== "unknown");
  const stillSwiping = (members ?? []).filter((m) => progressOf(m, myId) === "swiping");
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const coolingDown = secondsLeft > 0;

  let subtitle = "Checking on your friends…";
  if (members && !tracked) subtitle = "Waiting for everyone to finish…";
  else if (members) {
    subtitle =
      stillSwiping.length === 0
        ? "Everyone's done! Finding your match…"
        : `Waiting on ${stillSwiping.length} ${stillSwiping.length === 1 ? "friend" : "friends"} to finish…`;
  }

  let nudgeLabel = stillSwiping.length === 1 ? `Nudge ${stillSwiping[0].nickname}` : `Nudge ${stillSwiping.length} friends`;
  if (coolingDown) nudgeLabel = `Nudged · again in 0:${String(secondsLeft).padStart(2, "0")}`;

  async function handleNudge() {
    const startedAt = Date.now();
    setCooldownUntil(startedAt + NUDGE_COOLDOWN_MS);
    setNow(startedAt);
    if (!onNudge) return;
    try {
      await onNudge(stillSwiping.map((m) => m.id));
    } catch {
      // Didn't go through: let them try again right away.
      setCooldownUntil(0);
    }
  }

  return (
    <Screen>
      <Spacer />

      <div className={styles.check} aria-hidden="true">
        <img src={checkIcon} width={44} height={44} alt="" />
      </div>
      <h1 className={styles.title}>You're done swiping!</h1>
      <p className={styles.subtitle} aria-live="polite">
        {subtitle}
      </p>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {members && (
        <ul className={styles.list} aria-label="Who's done">
          {members.map((m) => {
            const progress = progressOf(m, myId);
            const isMe = m.id === myId;
            return (
              <li key={m.id} className={styles.row}>
                <Avatar name={m.nickname} />
                <span className={styles.name}>
                  {m.nickname}
                  {/* Avoid "You (you)" when the host hasn't set a name yet. */}
                  {isMe && m.nickname !== "You" && " (you)"}
                </span>
                {progress !== "unknown" && (
                  <span className={[styles.pill, progress === "done" ? styles.done : styles.swiping].join(" ")}>
                    {progress === "done" ? "Done" : `Swiping · ${m.swiped} of ${m.total}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Spacer />

      {onNudge && stillSwiping.length > 0 && (
        <Button variant="secondary" onClick={handleNudge} disabled={coolingDown}>
          {nudgeLabel}
        </Button>
      )}
      {onEndRound && isHost && stillSwiping.length > 0 && (
        <button type="button" className={styles.endRound} onClick={() => setConfirmEnd(true)}>
          End round now
        </button>
      )}

      <ConfirmDialog
        open={confirmEnd}
        title="End round now?"
        confirmLabel="End round"
        onConfirm={() => {
          setConfirmEnd(false);
          onEndRound?.();
        }}
        onCancel={() => setConfirmEnd(false)}
      >
        Everyone stops swiping, and we'll pick from the places liked so far.
      </ConfirmDialog>
    </Screen>
  );
}
