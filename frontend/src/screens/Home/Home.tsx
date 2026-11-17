import { Button } from "../../components/Button/Button";
import { Screen, Spacer } from "../../components/Screen/Screen";
import pinIcon from "../../assets/icons/pin.svg";
import styles from "./Home.module.css";

type HomeProps = {
  /** Area we search around, e.g. "Berkeley, CA". */
  /** Area we search around, e.g. "Berkeley, California". Hidden until one is picked. */
  locationLabel?: string;
  /** A short message, e.g. "That group has ended." */
  notice?: string;
  onCreateGroup: () => void;
  onJoinWithCode: () => void;
  onChangeLocation: () => void;
};

export function Home({ locationLabel, notice, onCreateGroup, onJoinWithCode, onChangeLocation }: HomeProps) {
  return (
    <Screen>
      <Spacer />

      <div className={styles.appIcon}>
        <img src={pinIcon} width={40} height={40} alt="" />
      </div>
      <p className={styles.eyebrow}>Restaurant Decider</p>
      <h1 className={styles.title}>Can't decide where to eat?</h1>
      <p className={styles.body}>
        Swipe on nearby spots with your friends. When everyone likes the same place, it's a match.
      </p>

      <Spacer />

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <Button onClick={onCreateGroup}>Create a group</Button>
      <Button variant="secondary" onClick={onJoinWithCode}>
        Join with a code
      </Button>
      {locationLabel && (
        <p className={styles.location}>
          Near {locationLabel} ·{" "}
          <button type="button" className={styles.changeButton} onClick={onChangeLocation}>
            Change
          </button>
        </p>
      )}
    </Screen>
  );
}
