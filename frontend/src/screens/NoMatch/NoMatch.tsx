import { useState } from "react";
import { Button } from "../../components/Button/Button";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { ClosePick, Restaurant, VoteResult } from "../../api/types";
import { milesAway, priceLabel } from "../../utils/format";
import styles from "./NoMatch.module.css";

export type ClosePicksLoad =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; picks: ClosePick[] };

type NoMatchProps = {
  /** Leave out when the server can't tell us the closest picks (the list is hidden). */
  load?: ClosePicksLoad;
  /** People in the group (for "2 of 3 liked" and "Votes in: 1 of 3"). */
  memberCount: number;
  onRetry: () => void;
  /** Send my vote; `onVotesIn` reports how many people have voted so far. Leave out to hide Quick vote. */
  onVote?: (restaurantId: string, onVotesIn: (count: number) => void) => Promise<VoteResult>;
  onVoteResult: (winner: Restaurant, result: VoteResult) => void;
  onChangeFilters: () => void;
  /** "Change filters & try again", or "Start a new group" when the server can't replay a round. */
  changeFiltersLabel?: string;
  onHome: () => void;
};

type Mode = { kind: "list" } | { kind: "picking"; pick: string | null } | { kind: "voted"; pick: string; votesIn: number };

export function NoMatch({
  load,
  memberCount,
  onRetry,
  onVote,
  onVoteResult,
  onChangeFilters,
  changeFiltersLabel = "Change filters & try again",
  onHome,
}: NoMatchProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [voteFailed, setVoteFailed] = useState(false);
  const picks = load?.status === "ready" ? load.picks : [];
  const canVote = Boolean(onVote) && picks.length >= 2;

  async function submitVote(pick: string) {
    setVoteFailed(false);
    setMode({ kind: "voted", pick, votesIn: 1 });
    if (!onVote) return;
    try {
      const result = await onVote(pick, (votesIn) => setMode({ kind: "voted", pick, votesIn }));
      const winner = picks.find((p) => p.restaurant.id === result.winnerId)?.restaurant;
      if (winner) onVoteResult(winner, result);
    } catch {
      setVoteFailed(true);
      setMode({ kind: "picking", pick });
    }
  }

  let subtitle = "Nobody agreed on every spot. Here's what came closest:";
  if (mode.kind === "picking") subtitle = "Tap the place you'd pick. Most votes wins.";
  if (mode.kind === "voted") subtitle = `Votes in: ${mode.votesIn} of ${memberCount}. Waiting for the rest…`;
  if (!load) subtitle = "Nobody agreed on every spot this time.";
  if (load?.status === "ready" && picks.length === 0) subtitle = "Nobody liked any of these places. Try different filters?";

  return (
    <Screen>
      <div className={styles.topSpace} />
      <h1 className={styles.title}>No match this time</h1>
      <p className={styles.subtitle} aria-live="polite">
        {subtitle}
      </p>

      {load?.status === "loading" && <p className={styles.status}>Finding the closest picks…</p>}

      {load?.status === "error" && (
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

      {voteFailed && (
        <p className={styles.error} role="alert">
          Your vote didn't go through. Try again.
        </p>
      )}

      <Spacer />

      {mode.kind === "list" && (
        <>
          {canVote && <Button onClick={() => setMode({ kind: "picking", pick: null })}>Quick vote on top {picks.length}</Button>}
          <Button variant="secondary" onClick={onChangeFilters}>
            {changeFiltersLabel}
          </Button>
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
          Voted · {mode.votesIn} of {memberCount} in
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
