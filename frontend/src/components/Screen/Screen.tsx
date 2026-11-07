import type { ReactNode } from "react";
import styles from "./Screen.module.css";

/** Full-height phone column shared by every screen (24px sides, 60/36 top/bottom, 16px gap). */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={[styles.screen, className].filter(Boolean).join(" ")}>{children}</main>;
}

/** Flexible empty space, like the "spacer" frames in Figma. */
export function Spacer() {
  return <div className={styles.spacer} />;
}
