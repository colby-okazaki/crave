import { useMemo, type CSSProperties } from "react";
import styles from "./Confetti.module.css";

const COLORS = [
  "var(--color-confetti-yellow)",
  "var(--color-on-primary)",
  "var(--color-confetti-blue)",
  "var(--color-confetti-pink)",
];

// The pieces that stay put, where Figma has them (left as % of a 390px frame, top in px).
const RESTING: Array<[left: number, top: number, rotate: number]> = [
  [7.7, 40, 0],
  [28.2, 84, -37],
  [76.9, 40, -74],
  [87.2, 136, -21],
  [15.4, 161, -58],
  [66, 64, -5], // moved up from Figma's spot, where it sat on the title
  [46.2, 23, -42],
  [89.7, 250, -79],
  [5.1, 295, -26],
];

const FALLING_COUNT = 36;

/** Confetti for the Match screen: a burst that falls once, plus the few pieces from Figma that stay. */
export function Confetti() {
  // Random once per mount, so re-renders don't reshuffle the pieces.
  const falling = useMemo(
    () =>
      Array.from({ length: FALLING_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
        drift: (Math.random() - 0.5) * 80,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );

  return (
    <div className={styles.confetti} aria-hidden="true">
      {RESTING.map(([left, top, rotate], i) => (
        <span
          key={`rest-${i}`}
          className={styles.piece}
          style={{ left: `${left}%`, top, rotate: `${rotate}deg`, background: COLORS[i % COLORS.length] }}
        />
      ))}
      {falling.map((p, i) => (
        <span
          key={`fall-${i}`}
          className={`${styles.piece} ${styles.falling}`}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--spin": `${p.spin}deg`,
              "--drift": `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
