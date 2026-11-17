import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar/Avatar";
import { Button } from "../../components/Button/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { MemberProgress } from "../../api/groups";
import checkIcon from "../../assets/icons/check.svg";
import styles from "./Waiting.module.css";

/** Figma notes: Nudge has a 1 minute cooldown. */
export const NUDGE_COOLDOWN_MS = 60_000;

type WaitingProps = {
  /** Everyone's progress, or null while we're still connecting. */
  members: MemberProgress[] | null;
  myId: string;
  isHost: boolean;
  /** Ping the people who are still swiping. */
  onNudge: (memberIds: string[]) => Promise<void>;
  /** Host only: stop the round and use the likes so far. */
  onEndRound: () => void;
};

export function Waiting({ members, myId, isHost, onNudge, onEndRound }: WaitingProps) {
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

  const stillSwiping = (members ?? []).filter((m) => m.swiped < m.total && m.id !== myId);
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const coolingDown = secondsLeft > 0;

  let subtitle = "Checking on your friends…";
  if (members) {
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

      {members && (
        <ul className={styles.list} aria-label="Who's done">
          {members.map((m) => {
            const done = m.swiped >= m.total;
            const isMe = m.id === myId;
            return (
              <li key={m.id} className={styles.row}>
                <Avatar name={m.nickname} />
                <span className={styles.name}>
                  {m.nickname}
                  {/* Avoid "You (you)" when the host hasn't set a name yet. */}
                  {isMe && m.nickname !== "You" && " (you)"}
                </span>
                <span className={[styles.pill, done ? styles.done : styles.swiping].join(" ")}>
                  {done ? "Done" : `Swiping · ${m.swiped} of ${m.total}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Spacer />

      {stillSwiping.length > 0 && (
        <Button variant="secondary" onClick={handleNudge} disabled={coolingDown}>
          {nudgeLabel}
        </Button>
      )}
      {isHost && stillSwiping.length > 0 && (
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
          onEndRound();
        }}
        onCancel={() => setConfirmEnd(false)}
      >
        Everyone stops swiping, and we'll pick from the places liked so far.
      </ConfirmDialog>
    </Screen>
  );
}
