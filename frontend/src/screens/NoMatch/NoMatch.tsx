import { useEffect, useState } from "react";
import { Button } from "../../components/Button/Button";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { ClosePick } from "../../api/types";
import { milesAway, priceLabel } from "../../utils/format";
import styles from "./NoMatch.module.css";

export type ClosePicksLoad =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; picks: ClosePick[] };

type NoMatchProps = {
  load: ClosePicksLoad;
  /** People in the group (for "2 of 3 liked" and "Votes in: 1 of 3"). */
  memberCount: number;
  onRetry: () => void;
  /** Send my vote. Throws an Error whose message says what went wrong. The winner arrives live. */
  onVote: (restaurantId: string) => Promise<void>;
  /** How many people have voted so far (live). */
  votesIn?: number;
  /** What you already voted for (e.g. before a refresh): shows "Voted" instead of the vote button. */
  myVote?: string;
  /** Host only: back to the lobby for a new round. Leave out for guests (they wait for the host). */
  onChangeFilters?: () => void;
  /** e.g. the new round couldn't start. */
  error?: string;
  onHome: () => void;
};

type Mode = { kind: "list" } | { kind: "picking"; pick: string | null } | { kind: "voted"; pick: string };

export function NoMatch({
  load,
  memberCount,
  onRetry,
  onVote,
  votesIn = 0,
  myVote,
  onChangeFilters,
  error,
  onHome,
}: NoMatchProps) {
  const [mode, setMode] = useState<Mode>(myVote ? { kind: "voted", pick: myVote } : { kind: "list" });
  // After a refresh the live count arrives a moment later; then show your vote again.
  useEffect(() => {
    if (myVote && mode.kind === "list") setMode({ kind: "voted", pick: myVote });
  }, [myVote]);
  const [voteError, setVoteError] = useState("");
  const picks = load.status === "ready" ? load.picks : [];
  const canVote = picks.length >= 2;
  // My own vote counts even before the live count catches up.
  const shownVotes = Math.min(Math.max(votesIn, 1), memberCount);

  async function submitVote(pick: string) {
    setVoteError("");
    setMode({ kind: "voted", pick });
    try {
      await onVote(pick);
    } catch (e) {
      setVoteError(e instanceof Error ? e.message : "Your vote didn't go through. Try again.");
      setMode({ kind: "picking", pick });
    }
  }

  let subtitle = "Nobody agreed on every spot. Here's what came closest:";
  if (mode.kind === "picking") subtitle = "Tap the place you'd pick. Most votes wins.";
  if (mode.kind === "voted") subtitle = `Votes in: ${shownVotes} of ${memberCount}. Waiting for the rest…`;
  if (load.status === "ready" && picks.length === 0) subtitle = "Nobody liked any of these places. Try different filters?";

  return (
    <Screen>
      <div className={styles.topSpace} />
      <h1 className={styles.title}>No match this time</h1>
      <p className={styles.subtitle} aria-live="polite">
        {subtitle}
      </p>

      {load.status === "loading" && <p className={styles.status}>Finding the closest picks…</p>}

      {load.status === "error" && (
        <div className={styles.status} role="alert">
          <p>Couldn't load the closest picks.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {picks.length > 0 && (
        <div
          className={styles.picks}
          role={mode.kind === "list" ? "list" : "radiogroup"}
          aria-label={mode.kind === "list" ? "Closest picks" : "Vote for one"}
        >
          {picks.map(({ restaurant: r, likes }) => {
            const selected = mode.kind !== "list" && mode.pick === r.id;
            const content = (
              <>
                <Thumb src={r.photoUrl} />
                <span className={styles.text}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.meta}>
                    {[r.cuisine, priceLabel(r.price), milesAway(r.distanceMeters).replace(" away", "")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={styles.pill}>
                  {likes} of {memberCount} liked
                </span>
              </>
            );
            if (mode.kind === "list") {
              return (
                <div key={r.id} role="listitem" className={styles.pick}>
                  {content}
                </div>
              );
            }
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={mode.kind === "voted"}
                className={[styles.pick, styles.choice, selected && styles.selected].filter(Boolean).join(" ")}
                onClick={() => setMode({ kind: "picking", pick: r.id })}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {(voteError || error) && (
        <p className={styles.error} role="alert">
          {voteError || error}
        </p>
      )}

      <Spacer />

      {mode.kind === "list" && (
        <>
          {canVote && <Button onClick={() => setMode({ kind: "picking", pick: null })}>Quick vote on top {picks.length}</Button>}
          {onChangeFilters ? (
            <Button variant="secondary" onClick={onChangeFilters}>
              Change filters & try again
            </Button>
          ) : (
            <p className={styles.waitNote}>The host can start a new round with different filters.</p>
          )}
          <button type="button" className={styles.home} onClick={onHome}>
            Back to home
          </button>
        </>
      )}

      {mode.kind === "picking" && (
        <>
          <Button disabled={!mode.pick} onClick={() => mode.pick && submitVote(mode.pick)}>
            {mode.pick ? `Vote for ${picks.find((p) => p.restaurant.id === mode.pick)?.restaurant.name}` : "Pick one to vote"}
          </Button>
          <Button variant="secondary" onClick={() => setMode({ kind: "list" })}>
            Cancel
          </Button>
        </>
      )}

      {mode.kind === "voted" && (
        <Button disabled>
          Voted · {shownVotes} of {memberCount} in
        </Button>
      )}
    </Screen>
  );
}

/** Small square photo; the gradient shows while it loads, if it fails, or if there's no photo. */
function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.thumb}>{src && !failed && <img src={src} alt="" onError={() => setFailed(true)} />}</span>
  );
}
