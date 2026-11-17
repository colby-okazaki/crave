import { useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar/Avatar";
import { ButtonLink } from "../../components/Button/Button";
import { Confetti } from "../../components/Confetti/Confetti";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { Member } from "../../api/groups";
import type { Restaurant } from "../../api/restaurants";
import { mapsUrl, menuUrl, milesAway, openUntil, priceLabel } from "../../utils/format";
import heartIcon from "../../assets/icons/heart-small.svg";
import styles from "./Match.module.css";

/**
 * The matched place. `match_found` only sends id, name, address, hours and
 * location, so everything else is optional (we fill it in from the card stack when we can).
 */
export type MatchedPlace = Pick<Restaurant, "id" | "name" | "address" | "location"> &
  Partial<Omit<Restaurant, "id" | "name" | "address" | "location">>;

type MatchProps = {
  /** Usually one; if there's ever more than one, you can swipe between them. */
  places: MatchedPlace[];
  /** Everyone in the group (they all liked it). */
  members: Member[];
  /** Set when the place won a quick vote (No match screen) instead of everyone liking it. */
  vote?: { count: number; total: number };
  onNewRound: () => void;
};

export function Match({ places, members, vote, onNewRound }: MatchProps) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const place = places[Math.min(active, places.length - 1)];

  // Coral page behind the screen and in the phone's status bar while this screen is up.
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousColor = meta?.content;
    root.dataset.surface = "primary";
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--color-primary").trim();
    // Celebrate: a short buzz (Android; iPhones ignore this). Browsers only allow it after a tap.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([40, 60, 40]);
    return () => {
      delete root.dataset.surface;
      if (meta && previousColor) meta.content = previousColor;
    };
  }, []);

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  }

  const many = places.length > 1;

  return (
    <div className={styles.page}>
      <Confetti />
      <Screen className={styles.screen}>
        <div className={styles.topSpace} />
        <h1 className={styles.title}>{vote ? "It's decided!" : "It's a match!"}</h1>
        <p className={styles.subtitle}>
          {vote
            ? "Your group voted for"
            : many
              ? `Everyone in your group liked ${places.length} places`
              : "Everyone in your group liked"}
        </p>

        <div
          ref={trackRef}
          className={styles.track}
          onScroll={many ? handleScroll : undefined}
          aria-roledescription={many ? "carousel" : undefined}
        >
          {places.map((p, i) => (
            <MatchCard
              key={p.id}
              place={p}
              members={members}
              vote={vote}
              label={many ? `${i + 1} of ${places.length}` : undefined}
            />
          ))}
        </div>
        {many && (
          <div className={styles.dots} aria-hidden="true">
            {places.map((p, i) => (
              <span key={p.id} className={[styles.dot, i === active && styles.dotActive].filter(Boolean).join(" ")} />
            ))}
          </div>
        )}

        <Spacer />

        <ButtonLink variant="secondary" href={mapsUrl(place)} target="_blank" rel="noopener noreferrer">
          Get directions
        </ButtonLink>
        <ButtonLink variant="secondary" href={menuUrl(place)} target="_blank" rel="noopener noreferrer">
          View menu
        </ButtonLink>
        <button type="button" className={styles.newRound} onClick={onNewRound}>
          Start a new round
        </button>
      </Screen>
    </div>
  );
}

function MatchCard({
  place: p,
  members,
  vote,
  label,
}: {
  place: MatchedPlace;
  members: Member[];
  vote?: { count: number; total: number };
  label?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const meta = [
    p.cuisine,
    priceLabel(p.price),
    p.distanceMeters != null ? milesAway(p.distanceMeters) : "",
    openUntil(p.hours),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={styles.card} aria-label={label ? `${p.name}, ${label}` : undefined}>
      <div className={styles.photo}>
        {p.photoUrl && !photoFailed && <img src={p.photoUrl} alt="" onError={() => setPhotoFailed(true)} />}
      </div>
      <div className={styles.info}>
        <h2 className={styles.name}>{p.name}</h2>
        {meta && <p className={styles.meta}>{meta}</p>}
        <div className={styles.liked}>
          {/* Everyone liked it, so show the whole group (a vote doesn't say who picked what). */}
          <ul className={styles.avatars} aria-label={vote ? "Your group" : "Liked by"}>
            {members.map((m) => (
              <li key={m.id}>
                <Avatar name={m.nickname} size="small" />
              </li>
            ))}
          </ul>
          <p className={styles.likedCount}>
            <img src={heartIcon} width={16} height={16} alt="" />
            {vote ? `${vote.count} of ${vote.total} votes` : `${members.length} of ${members.length} liked`}
          </p>
        </div>
      </div>
    </article>
  );
}
