import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import styles from "./AddChip.module.css";

type Option = { id: string; label: string };

type AddChipProps = {
  /** Everything that can be added. */
  options: Option[];
  /** Ids to leave out of the list (e.g. chips already on screen). */
  exclude: string[];
  onAdd: (id: string) => void;
  /** Accessible name of the "+" button, e.g. "Add a cuisine". */
  label: string;
  placeholder: string;
  /** Shown when nothing matches, e.g. (q) => `No cuisines match "${q}"`. */
  noMatchText: (query: string) => string;
};

/**
 * A "+" chip. Tapping it turns it into a search box with a dropdown of
 * matching options; picking one calls onAdd. Follows the ARIA combobox pattern,
 * so arrow keys, Enter and Escape work and screen readers announce the list.
 */
export function AddChip({ options, exclude, onAdd, label, placeholder, noMatchText }: AddChipProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const plusRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef(false);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = options.filter((o) => !exclude.includes(o.id));
    if (!q) return available;
    const hits = available.filter((o) => o.label.toLowerCase().includes(q));
    // Names that start with what you typed go first ("th" → Thai before Ethiopian).
    return [
      ...hits.filter((o) => o.label.toLowerCase().startsWith(q)),
      ...hits.filter((o) => !o.label.toLowerCase().startsWith(q)),
    ];
  }, [options, exclude, query]);

  // Keep the dropdown on screen when it opens; put focus back on "+" after closing with the keyboard.
  useEffect(() => {
    if (open) {
      listRef.current?.scrollIntoView({ block: "nearest" });
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      plusRef.current?.focus();
    }
  }, [open]);

  // Keep the highlighted option visible while moving with arrow keys.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close(returnFocus: boolean) {
    restoreFocus.current = returnFocus;
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function pick(option: Option) {
    onAdd(option.id);
    close(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = matches[active];
      if (option) pick(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  if (!open) {
    return (
      <button
        ref={plusRef}
        type="button"
        className={styles.plus}
        aria-label={label}
        onClick={() => {
          // Render the search box now and focus it during the tap: iOS only opens the keyboard then.
          flushSync(() => setOpen(true));
          inputRef.current?.focus();
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
    );
  }

  const activeOption = matches[active];

  return (
    <div className={styles.combo}>
      <input
        ref={inputRef}
        className={styles.input}
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
        // Tapping anywhere else closes it (options keep focus with preventDefault below).
        onBlur={() => close(false)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="done"
      />
      <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
        {matches.length === 0 ? (
          <li className={styles.empty} role="presentation">
            {noMatchText(query.trim())}
          </li>
        ) : (
          matches.map((option, i) => (
            <li
              key={option.id}
              id={`${listId}-${option.id}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className={styles.option}
              // Stop the tap from blurring the input (which would close the list first).
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(option)}
            >
              {option.label}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
