import { forwardRef, useState, type KeyboardEvent } from "react";
import styles from "./CodeInput.module.css";

type CodeInputProps = {
  value: string;
  length: number;
  onChange: (value: string) => void;
  /** Called when Enter is pressed. */
  onEnter?: () => void;
  invalid?: boolean;
  /** Change this number to replay the shake (e.g. after a wrong code). */
  shakeKey?: number;
  autoFocus?: boolean;
  "aria-describedby"?: string;
};

/**
 * One real <input> laid over the boxes. This keeps the phone keyboard, paste
 * and backspace working normally, while the boxes just display each digit.
 * Only digits are accepted.
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { value, length, onChange, onEnter, invalid = false, shakeKey = 0, autoFocus, ...aria },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onEnter?.();
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Re-keying only the boxes replays the shake without remounting the input (keeps the keyboard open). */}
      <div
        key={shakeKey}
        className={[styles.boxes, invalid && shakeKey > 0 ? styles.shake : ""].join(" ")}
        aria-hidden="true"
      >
        {Array.from({ length }, (_, i) => {
          const isActive = focused && i === activeIndex;
          const classes = [styles.box, isActive && styles.active, invalid && styles.invalid]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={i} className={classes}>
              {value[i] ?? (isActive ? <span className={styles.cursor} /> : null)}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Keep the (hidden) caret at the end so typing always fills the next box.
        onSelect={(e) => {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        maxLength={length}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        // Number keypad on phones (pattern is what triggers it on older iOS).
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        aria-label="Group code"
        aria-invalid={invalid}
        {...aria}
      />
    </div>
  );
});
