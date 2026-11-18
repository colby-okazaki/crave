import { useServerSlow } from "../../api/http";
import type { LiveSnapshot } from "../../api/types";
import { Banner } from "./Banner";

type StatusBannerProps = {
  /** The screen's own message (e.g. "Mia nudged you"); it wins over the connection notes. */
  message?: string | null;
  /** Your group's live connection, on group screens. */
  live?: LiveSnapshot;
};

/** One banner per screen: the screen's message, else "waking up", else "reconnecting". */
export function StatusBanner({ message, live }: StatusBannerProps) {
  const slow = useServerSlow();
  // Only after the first `state`, so the normal first connect doesn't flash a warning.
  const reconnecting = live && live.members !== null && !live.connected && !live.ended;
  let text = message || null;
  if (!text && slow) text = "Waking up the server… This can take up to a minute.";
  if (!text && reconnecting) text = "Reconnecting…";
  return <Banner message={text} />;
}
