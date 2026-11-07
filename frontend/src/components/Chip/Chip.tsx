import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** Figma "Chip" component: Default ↔ Selected (coral). */
  selected: boolean;
};

/** Same look as a Chip, but just a label (not tappable), e.g. "Popular dishes". */
export function ChipLabel({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/** Filter chip. A toggle button, so screen readers hear "selected / not selected". */
export function Chip({ selected, className, ...rest }: ChipProps) {
  const classes = [styles.chip, selected && styles.selected, className].filter(Boolean).join(" ");
  return <button type="button" aria-pressed={selected} className={classes} {...rest} />;
}
