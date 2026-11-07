import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "../../components/Button/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { DetailsSheet } from "../../components/DetailsSheet/DetailsSheet";
import { RestaurantCard } from "../../components/RestaurantCard/RestaurantCard";
import { Screen } from "../../components/Screen/Screen";
import type { Restaurant } from "../../api/restaurants";
import xIcon from "../../assets/icons/x.svg";
import infoIcon from "../../assets/icons/info.svg";
import heartIcon from "../../assets/icons/heart.svg";
import heartWhiteIcon from "../../assets/icons/heart-white.svg";
import styles from "./Swipe.module.css";

export type SwipeLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; restaurants: Restaurant[] };

type Intent = "like" | "pass" | null;

type SwipeProps = {
  load: SwipeLoadState;
  onRetry: () => void;
  /** Nothing matched the filters: go back and change them. */
  onChangeFilters: () => void;
  onSwipe: (restaurant: Restaurant, liked: boolean) => void;
  /** Swiped through every card. */
  onFinished: () => void;
  onLeave: () => void;
};

// Keep in sync with --duration-fly in theme.css.
const FLY_MS = 280;
// Movement under this is a tap, not a drag.
const TAP_SLOP = 6;
// A fast flick counts even before the 1/4-width line.
const FLICK_SPEED = 0.5; // px per ms

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function Swipe({ load, onRetry, onChangeFilters, onSwipe, onFinished, onLeave }: SwipeProps) {
  const restaurants = load.status === "ready" ? load.restaurants : [];
  const total = restaurants.length;
  const [index, setIndex] = useState(0);
  const [intent, setIntent] = useState<Intent>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [detailsFor, setDetailsFor] = useState<Restaurant | null>(null);

  const current = restaurants[index];
  const next = restaurants[index + 1];
  const finished = load.status === "ready" && total > 0 && index >= total;

  // The drag writes styles straight to these elements (no re-render per frame).
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const likeRef = useRef<HTMLDivElement>(null);
  const nopeRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    moved: boolean;
    lastX: number;
    lastT: number;
    vx: number;
  } | null>(null);
  const offset = useRef({ dx: 0, dy: 0 });
  const flying = useRef(false);
  const intentRef = useRef<Intent>(null);

  // A new top card starts centered, with the stamps hidden.
  useLayoutEffect(() => {
    for (const el of [cardRef.current, nextRef.current, likeRef.current, nopeRef.current]) {
      if (!el) continue;
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
    }
    offset.current = { dx: 0, dy: 0 };
  }, [index, load.status]);

  // Load the next few photos early so cards never show up blank.
  useEffect(() => {
    for (const r of restaurants.slice(index + 1, index + 4)) new Image().src = r.photoUrl;
  }, [restaurants, index]);

  // Only when it becomes true (onFinished may be a new function every render).
  useEffect(() => {
    if (finished) onFinished();
  }, [finished]);

  // Arrow keys swipe too (handy on a laptop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirmLeave || detailsFor || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") flyOut(1);
      if (e.key === "ArrowLeft") flyOut(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const threshold = () => (cardRef.current?.offsetWidth ?? 340) / 4;

  /** Move the top card (and everything that reacts to it) to dx, dy. */
  function paint(dx: number, dy: number, mode: "drag" | "snap" | "fly") {
    offset.current = { dx, dy };
    const reduce = reducedMotion();
    const rotation = reduce ? 0 : clamp(dx / 16, -20, 20);
    const progress = clamp(Math.abs(dx) / threshold(), 0, 1);
    const cardTransition =
      mode === "drag"
        ? "none"
        : mode === "snap"
          ? `transform var(--duration-snap) ${reduce ? "var(--ease-out)" : "var(--ease-snap)"}`
          : `transform var(--duration-fly) var(--ease-out), opacity var(--duration-fly) linear`;
    const fade = mode === "drag" ? "none" : `opacity var(--duration-press) var(--ease-out)`;
    const grow = mode === "drag" ? "none" : `transform var(--duration-fly) var(--ease-out)`;

    const card = cardRef.current;
    if (card) {
      card.style.transition = cardTransition;
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`;
      // With reduced motion the card fades away instead of spinning off.
      card.style.opacity = mode === "fly" && reduce ? "0" : "";
    }
    if (likeRef.current) {
      likeRef.current.style.transition = fade;
      likeRef.current.style.opacity = String(dx > 0 ? progress : 0);
    }
    if (nopeRef.current) {
      nopeRef.current.style.transition = fade;
      nopeRef.current.style.opacity = String(dx < 0 ? progress : 0);
    }
    // The card underneath grows into place as you drag.
    if (nextRef.current) {
      nextRef.current.style.transition = grow;
      nextRef.current.style.transform = `translateY(${12 * (1 - progress)}px) scale(${0.95 + 0.05 * progress})`;
    }
  }

  function updateIntent(dx: number) {
    const nextIntent: Intent = Math.abs(dx) >= threshold() ? (dx > 0 ? "like" : "pass") : null;
    if (nextIntent === intentRef.current) return;
    intentRef.current = nextIntent;
    setIntent(nextIntent);
    // Little buzz when you cross the line (Android; iPhones ignore this).
    if (nextIntent) navigator.vibrate?.(10);
  }

  function snapBack() {
    paint(0, 0, "snap");
    updateIntent(0);
  }

  function flyOut(direction: 1 | -1) {
    if (!current || flying.current) return;
    flying.current = true;
    const liked = direction > 0;
    intentRef.current = liked ? "like" : "pass";
    setIntent(intentRef.current);

    const width = cardRef.current?.offsetWidth ?? 340;
    const { dy } = offset.current;
    paint(direction * (window.innerWidth + width), dy + 40, "fly");
    // paint() sets stamp opacity from distance; make sure the right one is fully shown.
    const stamp = liked ? likeRef.current : nopeRef.current;
    if (stamp) stamp.style.opacity = "1";

    const swiped = current;
    window.setTimeout(() => {
      onSwipe(swiped, liked);
      flying.current = false;
      intentRef.current = null;
      setIntent(null);
      setIndex((i) => i + 1);
    }, FLY_MS);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (flying.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
    };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.dx = e.clientX - d.startX;
    d.dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(d.dx, d.dy) < TAP_SLOP) return;
    d.moved = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vx = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    paint(d.dx, d.dy, "drag");
    updateIntent(d.dx);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      if (current) setDetailsFor(current);
      return;
    }
    const flick = Math.abs(d.vx) > FLICK_SPEED && Math.abs(d.dx) > 30 && Math.sign(d.vx) === Math.sign(d.dx);
    if (Math.abs(d.dx) >= threshold() || flick) flyOut(d.dx > 0 ? 1 : -1);
    else snapBack();
  }

  function handlePointerCancel() {
    if (!drag.current) return;
    drag.current = null;
    snapBack();
  }

  const position = Math.min(index + 1, total);
  const hint =
    intent === "like" ? "Let go to like" : intent === "pass" ? "Let go to pass" : "Swipe right to like · left to pass";
  const canAct = Boolean(current) && !finished;

  return (
    <Screen className={styles.screen}>
      <header className={styles.topBar}>
        <button type="button" className={styles.leave} onClick={() => setConfirmLeave(true)}>
          Leave
        </button>
        {total > 0 && (
          <p className={styles.counter}>
            {position} of {total}
          </p>
        )}
      </header>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: total ? `${(position / total) * 100}%` : "0%" }} />
      </div>

      <div className={styles.stage}>
        {load.status === "loading" && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderPhoto} />
            <p className={styles.message}>Finding places near you…</p>
          </div>
        )}

        {load.status === "error" && (
          <div className={styles.notice} role="alert">
            <p className={styles.noticeTitle}>Couldn't load restaurants</p>
            <p className={styles.message}>Check your connection and try again.</p>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {load.status === "ready" && total === 0 && (
          <div className={styles.notice}>
            <p className={styles.noticeTitle}>Nothing matched your filters</p>
            <p className={styles.message}>Try a bigger distance or more cuisines.</p>
            <Button variant="secondary" onClick={onChangeFilters}>
              Change filters
            </Button>
          </div>
        )}

        {finished && (
          <div className={styles.notice}>
            <p className={styles.noticeTitle}>That's every place!</p>
            <p className={styles.message}>Waiting for everyone else to finish…</p>
          </div>
        )}

        {/* Keyed by restaurant so the card underneath becomes the top card without reloading. */}
        {next && (
          <div key={next.id} ref={nextRef} className={styles.next} aria-hidden="true">
            <RestaurantCard restaurant={next} />
          </div>
        )}
        {current && (
          <div
            key={current.id}
            ref={cardRef}
            className={styles.top}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <RestaurantCard
              restaurant={current}
              overlay={
                <>
                  <div ref={likeRef} className={`${styles.stamp} ${styles.likeStamp}`} aria-hidden="true">
                    LIKE
                  </div>
                  <div ref={nopeRef} className={`${styles.stamp} ${styles.nopeStamp}`} aria-hidden="true">
                    NOPE
                  </div>
                </>
              }
            />
          </div>
        )}
      </div>

      {/* Tell screen readers which card is up. */}
      <p className="sr-only" aria-live="polite">
        {current ? `${current.name}, ${position} of ${total}` : ""}
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={[styles.action, styles.pass, intent === "like" && styles.faded, intent === "pass" && styles.grown]
            .filter(Boolean)
            .join(" ")}
          onClick={() => flyOut(-1)}
          disabled={!canAct}
          aria-label="Pass"
        >
          <img src={xIcon} width={28} height={28} alt="" />
        </button>
        <button
          type="button"
          className={[styles.action, styles.details, intent && styles.faded].filter(Boolean).join(" ")}
          onClick={() => current && setDetailsFor(current)}
          disabled={!canAct}
          aria-label="Details"
        >
          <img src={infoIcon} width={22} height={22} alt="" />
        </button>
        <button
          type="button"
          className={[styles.action, styles.like, intent === "pass" && styles.faded, intent === "like" && styles.likeActive]
            .filter(Boolean)
            .join(" ")}
          onClick={() => flyOut(1)}
          disabled={!canAct}
          aria-label="Like"
        >
          {intent === "like" ? (
            <img src={heartWhiteIcon} width={32} height={32} alt="" />
          ) : (
            <img src={heartIcon} width={28} height={28} alt="" />
          )}
        </button>
      </div>
      <p
        className={[styles.hint, intent === "like" && styles.hintLike, intent === "pass" && styles.hintPass]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      >
        {hint}
      </p>

      {detailsFor && (
        <DetailsSheet
          restaurant={detailsFor}
          onClosed={(action) => {
            setDetailsFor(null);
            // Like / Pass in the sheet swipes the card away too.
            if (action) flyOut(action === "like" ? 1 : -1);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave group?"
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmLeave(false);
          onLeave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
