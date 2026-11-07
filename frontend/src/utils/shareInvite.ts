export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** Link that opens the Join screen with the code already filled in. */
export function inviteUrl(code: string) {
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

/**
 * Opens the phone's share sheet with the code and link. Where that isn't
 * available (most desktop browsers), copies the invite to the clipboard instead.
 */
export async function shareInvite(code: string): Promise<ShareOutcome> {
  const url = inviteUrl(code);
  const text = `Help me pick where to eat! Join my group with code ${code}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Restaurant Decider", text, url });
      return "shared";
    } catch (error) {
      // Closing the share sheet throws AbortError; that's not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Anything else: fall through and try copying instead.
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}: ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
