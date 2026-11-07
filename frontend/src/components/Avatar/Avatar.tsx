import styles from "./Avatar.module.css";

type AvatarProps = {
  name: string;
  /** Plays the pop-in animation (use for people who join while you're watching). */
  popIn?: boolean;
};

/** Group member bubble with their first initial (Figma "Avatar"). */
export function Avatar({ name, popIn = false }: AvatarProps) {
  // Array.from keeps emoji and accented letters in one piece.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={[styles.avatar, popIn && styles.popIn].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true">{initial}</span>
    </span>
  );
}
