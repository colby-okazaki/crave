import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../../components/Avatar/Avatar";
import { BackButton } from "../../components/BackButton/BackButton";
import { Button } from "../../components/Button/Button";
import { AddChip } from "../../components/AddChip/AddChip";
import { Chip } from "../../components/Chip/Chip";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Screen, Spacer } from "../../components/Screen/Screen";
import type { Member } from "../../api/groups";
import { ALL_CUISINES, DEFAULT_CUISINE_IDS, cuisineLabel } from "../../data/cuisines";
import type { ShareOutcome } from "../../utils/shareInvite";
import shareIcon from "../../assets/icons/share.svg";
import styles from "./Lobby.module.css";

export type LobbyFilters = {
  distanceMiles: number;
  /** 1–4, shown as $ to $$$$ (same scale as the API's `price`). */
  price: number;
  /** Cuisine ids; empty means "any". */
  cuisines: string[];
};

/** The last option means "20 miles or more". */
export const DISTANCE_OPTIONS = [1, 3, 5, 10, 20];
const MAX_DISTANCE = DISTANCE_OPTIONS[DISTANCE_OPTIONS.length - 1];
export const PRICE_OPTIONS = [1, 2, 3, 4];
export const DEFAULT_FILTERS: LobbyFilters = { distanceMiles: 3, price: 2, cuisines: [] };

/** Swiping needs at least two people (Figma: "grey until ≥2 people"). */
export const MIN_MEMBERS_TO_START = 2;

const SHARE_LABELS: Record<ShareOutcome, string> = {
  shared: "Share invite",
  cancelled: "Share invite",
  copied: "Invite copied!",
  failed: "Couldn't share",
};

type LobbyProps = {
  /** 4-digit join code, as text (keeps a leading zero). */
  code: string;
  /** Everyone in the group, or null while we're still connecting. */
  members: Member[] | null;
  myId: string;
  isHost: boolean;
  filters: LobbyFilters;
  onFiltersChange: (filters: LobbyFilters) => void;
  onShareInvite: () => Promise<ShareOutcome>;
  onStart: () => void;
  onLeave: () => void;
};

export function Lobby({
  code,
  members,
  myId,
  isHost,
  filters,
  onFiltersChange,
  onShareInvite,
  onStart,
  onLeave,
}: LobbyProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("shared");
  const [announcement, setAnnouncement] = useState("");
  // Cuisines added with "+" stay on screen even if unselected, so they can be tapped again.
  const [addedCuisines, setAddedCuisines] = useState<string[]>([]);

  // People already here when the screen opens appear instantly; later arrivals pop in.
  const initialIds = useRef<Set<string> | null>(null);
  if (members && !initialIds.current) initialIds.current = new Set(members.map((m) => m.id));

  // Tell screen reader users when someone joins.
  const prevIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!members) return;
    const prev = prevIds.current;
    prevIds.current = new Set(members.map((m) => m.id));
    if (!prev) return;
    const joined = members.filter((m) => !prev.has(m.id) && m.id !== myId);
    if (joined.length) setAnnouncement(`${joined.map((m) => m.nickname).join(", ")} joined`);
  }, [members, myId]);

  // Put the share button label back after a moment.
  useEffect(() => {
    if (shareOutcome === "shared" || shareOutcome === "cancelled") return;
    const timer = setTimeout(() => setShareOutcome("shared"), 2000);
    return () => clearTimeout(timer);
  }, [shareOutcome]);

  async function handleShare() {
    const outcome = await onShareInvite();
    setShareOutcome(outcome);
    if (outcome === "copied") setAnnouncement("Invite copied");
    if (outcome === "failed") setAnnouncement("Couldn't share the invite");
  }

  // Default chips, then anything added here or already in the filters (e.g. picked by the host).
  const cuisineChips = [...new Set([...DEFAULT_CUISINE_IDS, ...addedCuisines, ...filters.cuisines])];

  function addCuisine(id: string) {
    setAddedCuisines((list) => (list.includes(id) ? list : [...list, id]));
    if (!filters.cuisines.includes(id)) onFiltersChange({ ...filters, cuisines: [...filters.cuisines, id] });
    setAnnouncement(`${cuisineLabel(id)} added`);
  }

  function toggleCuisine(id: string) {
    const cuisines = filters.cuisines.includes(id)
      ? filters.cuisines.filter((c) => c !== id)
      : [...filters.cuisines, id];
    onFiltersChange({ ...filters, cuisines });
  }

  const count = members?.length ?? 0;
  const canStart = count >= MIN_MEMBERS_TO_START;
  // Only the host picks filters; guests see them read-only.
  const readOnly = !isHost;

  return (
    <Screen className={styles.screen}>
      <header className={styles.header}>
        <BackButton label="Leave" onClick={() => setConfirmLeave(true)} className={styles.leave} />
        {isHost && <p className={styles.hostTag}>You're the host</p>}
      </header>

      <section className={styles.codeCard} aria-labelledby="group-code-label">
        <h2 id="group-code-label" className={styles.overline}>
          Group code
        </h2>
        <p className={styles.code}>
          <span aria-hidden="true">{code}</span>
          {/* Spaced out so screen readers read digits, not "one thousand…". */}
          <span className="sr-only">{code.split("").join(" ")}</span>
        </p>
        <button type="button" className={styles.share} onClick={handleShare}>
          <img src={shareIcon} width={16} height={16} alt="" />
          {SHARE_LABELS[shareOutcome]}
        </button>
      </section>

      <h2 className={styles.sectionTitle}>
        Who's here{members ? ` (${count})` : ""}
      </h2>
      <div className={styles.members}>
        {members === null ? (
          <p className={styles.membersHint}>Connecting…</p>
        ) : (
          <ul className={styles.memberList}>
            {members.map((m) => (
              <li key={m.id}>
                <Avatar name={m.id === myId ? `${m.nickname} (you)` : m.nickname} popIn={!initialIds.current?.has(m.id)} />
              </li>
            ))}
            <li>
              <button type="button" className={styles.inviteSlot} onClick={handleShare} aria-label="Invite friends">
                <span aria-hidden="true">+</span>
              </button>
            </li>
          </ul>
        )}
        {members && !canStart && (
          <p id="lobby-start-hint" className={styles.membersHint}>
            Share the code so friends can join
          </p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <h2 className={styles.sectionTitle}>Filters</h2>

      <FilterGroup id="filter-distance" label="Distance" tight>
        {DISTANCE_OPTIONS.map((miles) => (
          <Chip
            key={miles}
            selected={filters.distanceMiles === miles}
            disabled={readOnly}
            onClick={() => onFiltersChange({ ...filters, distanceMiles: miles })}
          >
            {miles === MAX_DISTANCE ? `${miles}+ mi` : `${miles} mi`}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup id="filter-price" label="Price">
        {PRICE_OPTIONS.map((level) => (
          <Chip
            key={level}
            selected={filters.price === level}
            disabled={readOnly}
            onClick={() => onFiltersChange({ ...filters, price: level })}
            aria-label={`${level} of ${PRICE_OPTIONS.length}`}
          >
            {"$".repeat(level)}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup id="filter-cuisine" label="Cuisine (pick any)">
        {cuisineChips.map((id) => (
          <Chip
            key={id}
            selected={filters.cuisines.includes(id)}
            disabled={readOnly}
            onClick={() => toggleCuisine(id)}
          >
            {cuisineLabel(id)}
          </Chip>
        ))}
        {!readOnly && (
          <AddChip
            options={ALL_CUISINES}
            exclude={cuisineChips}
            onAdd={addCuisine}
            label="Add a cuisine"
            placeholder="Search cuisines"
            noMatchText={(q) => `No cuisines match "${q}"`}
          />
        )}
      </FilterGroup>

      <Spacer />

      {isHost ? (
        <Button
          onClick={onStart}
          disabled={!canStart}
          aria-describedby={!canStart && members ? "lobby-start-hint" : undefined}
        >
          Start swiping
        </Button>
      ) : (
        <p className={styles.waiting} aria-live="polite">
          Waiting for the host to start…
        </p>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave group?"
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmLeave(false);
          onLeave();
        }}
        onCancel={() => setConfirmLeave(false)}
      >
        {isHost && count > 1
          ? "Someone else in the group will become the host."
          : "You can rejoin later with the code."}
      </ConfirmDialog>
    </Screen>
  );
}

function FilterGroup({
  id,
  label,
  tight = false,
  children,
}: {
  id: string;
  label: string;
  /** Slightly smaller gap between chips. */
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.filterGroup}>
      <p id={id} className={styles.filterLabel}>
        {label}
      </p>
      <div role="group" aria-labelledby={id} className={[styles.chips, tight && styles.tight].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}
