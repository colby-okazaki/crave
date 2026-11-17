import { useState, type FormEvent, type KeyboardEvent } from "react";
import { BackButton } from "../../components/BackButton/BackButton";
import { Button } from "../../components/Button/Button";
import { Screen, Spacer } from "../../components/Screen/Screen";
import { TextField } from "../../components/TextField/TextField";
import type { Place } from "../../api/types";
import pinIcon from "../../assets/icons/map-pin.svg";
import styles from "./CreateGroup.module.css";

const NICKNAME_MAX = 30; // backend limit

type CreateGroupProps = {
  initialName?: string;
  /** Last place used on this device, picked already. */
  initialPlace?: Place | null;
  onBack: () => void;
  /** Typed place → matching places (GET /geocode). */
  onSearch: (query: string) => Promise<Place[]>;
  /** Make the group. Throw to show `errorMessage(error)`. */
  onCreate: (name: string, place: Place) => Promise<void>;
  /** Turns a failed create or search into words. */
  errorMessage: (error: unknown) => string;
};

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; query: string }
  | { status: "error"; message: string };

/** "Start a group": your name and where you're eating (not in Figma; built from existing pieces). */
export function CreateGroup({ initialName = "", initialPlace = null, onBack, onSearch, onCreate, errorMessage }: CreateGroupProps) {
  const [name, setName] = useState(initialName);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>(initialPlace ? [initialPlace] : []);
  const [picked, setPicked] = useState<Place | null>(initialPlace);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [locating, setLocating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Browsers only share location on secure pages (https, or localhost on a computer).
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;
  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && picked !== null && !creating;

  let hint = "";
  if (!trimmedName) hint = "Add your name to start";
  else if (!picked) hint = "Pick where you're eating";

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setSearch({ status: "error", message: "Type at least 2 letters." });
      return;
    }
    setSearch({ status: "searching" });
    try {
      const found = await onSearch(q);
      setPlaces(found);
      setPicked(found.length === 1 ? found[0] : null);
      setSearch({ status: "done", query: q });
    } catch (error) {
      setSearch({ status: "error", message: errorMessage(error) });
    }
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter in the search box searches (instead of submitting the form).
    if (event.key === "Enter") {
      event.preventDefault();
      void runSearch();
    }
  }

  function locateMe() {
    setLocating(true);
    setSearch({ status: "idle" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here: Place = {
          label: "Your current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setPlaces([here]);
        setPicked(here);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setSearch({
          status: "error",
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location is turned off for this site. Search for a place instead."
              : "Couldn't find your location. Search for a place instead.",
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || !picked) return;
    setCreating(true);
    setCreateError("");
    try {
      await onCreate(trimmedName, picked);
    } catch (error) {
      setCreateError(errorMessage(error));
      setCreating(false);
    }
  }

  return (
    <Screen>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <BackButton onClick={onBack} />
        <h1 className={styles.title}>Start a group</h1>

        <TextField
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should friends call you?"
          maxLength={NICKNAME_MAX}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="next"
          autoFocus={!initialName}
        />

        <div className={styles.searchRow}>
          <TextField
            className={styles.searchField}
            label="Where are you eating?"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="City, neighborhood or address"
            maxLength={100}
            autoComplete="off"
            enterKeyHint="search"
          />
          <Button
            type="button"
            variant="secondary"
            className={styles.searchButton}
            onClick={() => void runSearch()}
            disabled={search.status === "searching"}
          >
            {search.status === "searching" ? "…" : "Search"}
          </Button>
        </div>

        {canLocate && (
          <button type="button" className={styles.locate} onClick={locateMe} disabled={locating}>
            <img src={pinIcon} width={20} height={20} alt="" />
            {locating ? "Finding you…" : "Use my current location"}
          </button>
        )}

        <p className={styles.status} role="status">
          {search.status === "searching" && "Searching…"}
          {search.status === "done" && places.length === 0 && `No places found for "${search.query}".`}
          {search.status === "done" && places.length > 1 && "Pick the right one:"}
          {search.status === "error" && <span className={styles.error}>{search.message}</span>}
        </p>

        {places.length > 0 && (
          <div className={styles.places} role="radiogroup" aria-label="Where you're eating">
            {places.map((place) => {
              const selected = picked?.lat === place.lat && picked?.lng === place.lng;
              return (
                <button
                  key={`${place.lat},${place.lng}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={[styles.place, selected && styles.selected].filter(Boolean).join(" ")}
                  onClick={() => setPicked(place)}
                >
                  <img src={pinIcon} width={20} height={20} alt="" />
                  <span className={styles.placeLabel}>{place.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <Spacer />

        {createError && (
          <p className={styles.createError} role="alert">
            {createError}
          </p>
        )}
        <Button type="submit" disabled={!canCreate}>
          {creating ? "Creating…" : "Create group"}
        </Button>
        <p className={styles.hint} aria-live="polite">
          {hint}
        </p>
      </form>
    </Screen>
  );
}
