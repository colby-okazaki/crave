import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Primary = main action, Secondary = other action (Figma "Button" component). */
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...rest} />;
}

/** A link that looks like a Button (e.g. "Get directions" opens Maps). */
export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: "primary" | "secondary" }) {
  const classes = [styles.button, styles[variant], styles.link, className].filter(Boolean).join(" ");
  return <a className={classes} {...rest} />;
}
