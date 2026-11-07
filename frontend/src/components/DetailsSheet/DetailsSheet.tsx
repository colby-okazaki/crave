import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Restaurant } from "../../api/restaurants";
import { hoursToday, mapsUrl, menuUrl } from "../../utils/format";
import { Button } from "../Button/Button";
import { ChipLabel } from "../Chip/Chip";
import { Rating, restaurantMeta } from "../RestaurantCard/RestaurantCard";
import pinIcon from "../../assets/icons/map-pin.svg";
import clockIcon from "../../assets/icons/clock.svg";
import externalIcon from "../../assets/icons/external.svg";
import styles from "./DetailsSheet.module.css";

export type SheetAction = "like" | "pass" | null;

type DetailsSheetProps = {
  restaurant: Restaurant;
  /** Called after the sheet has slid away, with what the person chose (null = just closed). */
  onClosed: (action: SheetAction) => void;
};

// Keep in sync with --duration-sheet in theme.css.
const CLOSE_MS = 260;
// Drag down further than this (or flick) to close.
const CLOSE_DISTANCE = 120;
const FLICK_SPEED = 0.5; // px per ms

/**
 * Bottom sheet with more about a restaurant (Figma "6. Details sheet").
 * Closes by dragging it down, tapping the dim area, the handle, or Escape.
 * Render it only while it should be open; it animates itself in and out.
 */
export function DetailsSheet({ restaurant: r, onClosed }: DetailsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const drag = useRef<{ pointerId: number; startY: number; dy: number; lastY: number; lastT: number; vy: number } | null>(
    null,
  );
  // When everything fits, the whole sheet can be dragged; otherwise only the top part (so the rest can scroll).
  const [fits, setFits] = useState(true);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const check = () => setFits(body.scrollHeight <= body.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  function place(dy: number, animate: boolean) {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    const height = sheet?.offsetHeight ?? 1;
    const transition = animate ? `transform var(--duration-sheet) var(--ease-sheet)` : "none";
    if (sheet) {
      sheet.style.transition = transition;
      sheet.style.transform = `translateY(${dy}px)`;
    }
    if (scrim) {
      scrim.style.transition = animate ? `opacity var(--duration-sheet) var(--ease-sheet)` : "none";
      scrim.style.opacity = String(1 - Math.min(dy / height, 1));
    }
  }

  function close(action: SheetAction) {
    if (closing.current) return;
    closing.current = true;
    place(sheetRef.current?.offsetHeight ?? window.innerHeight, true);
    window.setTimeout(() => {
      dialogRef.current?.close();
      onClosed(action);
    }, CLOSE_MS);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (closing.current || e.button !== 0) return;
    // Let buttons and links work normally.
    if ((e.target as HTMLElement).closest("a, button:not([data-handle])")) return;
    // If the content scrolls, only the top part (handle + photos) drags the sheet.
    if (!fits && !(e.target as HTMLElement).closest("[data-drag-zone]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, vy: 0 };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const raw = e.clientY - d.startY;
    // Pulling up just stretches a little; pulling down follows the finger.
    d.dy = raw < 0 ? raw / 6 : raw;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    place(d.dy, false);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.dy > CLOSE_DISTANCE || (d.vy > FLICK_SPEED && d.dy > 20)) close(null);
    else place(0, true);
  }

  function handlePointerCancel() {
    if (!drag.current) return;
    drag.current = null;
    place(0, true);
  }

  const photos = (r.photos?.length ? r.photos : [r.photoUrl]).slice(0, 3);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="details-title"
      onCancel={(e) => {
        // Escape key: animate out instead of vanishing.
        e.preventDefault();
        close(null);
      }}
    >
      <div ref={scrimRef} className={styles.scrim} onClick={() => close(null)} />
      <div
        ref={sheetRef}
        className={[styles.sheet, fits && styles.dragAnywhere].filter(Boolean).join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className={styles.dragZone} data-drag-zone>
          <button type="button" className={styles.handle} data-handle aria-label="Close details" onClick={() => close(null)}>
            <span className={styles.handleBar} />
          </button>
          <div className={styles.photos}>
            {photos.map((src) => (
              <Photo key={src} src={src} />
            ))}
          </div>
        </div>

        <div ref={bodyRef} className={styles.body}>
          <h2 id="details-title" className={styles.title}>
            {r.name}
          </h2>
          <p className={styles.meta}>{restaurantMeta(r)}</p>
          <Rating restaurant={r} />

          <hr className={styles.divider} />

          <a className={styles.infoRow} href={mapsUrl(r)} target="_blank" rel="noopener noreferrer">
            <img src={pinIcon} width={20} height={20} alt="" />
            <span>
              {r.address}
              <span className="sr-only"> (opens in Maps)</span>
            </span>
          </a>
          <p className={styles.infoRow}>
            <img src={clockIcon} width={20} height={20} alt="" />
            <span>{hoursToday(r.hours)}</span>
          </p>

          {r.popularDishes && r.popularDishes.length > 0 && (
            <>
              <h3 className={styles.sectionLabel}>Popular dishes</h3>
              <ul className={styles.dishes}>
                {r.popularDishes.map((dish) => (
                  <li key={dish}>
                    <ChipLabel>{dish}</ChipLabel>
                  </li>
                ))}
              </ul>
            </>
          )}

          <a className={styles.menuLink} href={menuUrl(r)} target="_blank" rel="noopener noreferrer">
            View menu
            <img src={externalIcon} width={16} height={16} alt="" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={() => close("pass")}>
            Pass
          </Button>
          <Button onClick={() => close("like")}>Like</Button>
        </div>
      </div>
    </dialog>
  );
}

/** Photo thumbnail; the gradient shows while it loads or if it fails. */
function Photo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.photo}>
      {!failed && <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />}
    </div>
  );
}
