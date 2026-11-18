import styles from "./Banner.module.css";

type BannerProps = {
  /** What to say; nothing shows when it's empty. */
  message?: string | null;
};

/** A short message that slides in at the top of the screen (e.g. "Mia nudged you"). */
export function Banner({ message }: BannerProps) {
  return (
    <div className={styles.slot} role="status" aria-live="polite">
      {message && (
        <p key={message} className={styles.banner}>
          {message}
        </p>
      )}
    </div>
  );
}
