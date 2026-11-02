import { useContext, useEffect } from "react";
import { pruneOwnActivity } from "@atlastodo/shared";
import { useStore } from "../data/StoreProvider";
import { AuthContext } from "../auth/AuthContext";
import { usePreferences } from "./usePreferences";
import { useFirstSyncDone } from "./useFirstSyncDone";
import { effectiveActivityRetention, useInstancePolicy } from "./useInstancePolicy";
import { useNow } from "./useNow";

/** How often a long-running session prunes again. */
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Applies the "delete my activity after" setting, or the server's limit when that is stricter
 * (`GET /instance/policy`: the server cannot delete encrypted activity itself, so clients do):
 * deletes the user's own activity entries older than it, on every device (the deletes sync). Runs after the first sync of the session, so it
 * sees entries other devices wrote, again when the setting changes, and every few hours while the
 * app stays open (a desktop session can run for weeks). Others' entries are theirs
 * to prune. Mount it once near the app root.
 */
export function useActivityPrune(): void {
  const { store, kick } = useStore();
  const myId = useContext(AuthContext)?.session?.user.id;
  const { activityRetentionDays } = usePreferences();
  const serverDays = useInstancePolicy()?.activity_retention_days ?? 0;
  const days = effectiveActivityRetention(activityRetentionDays, serverDays);
  const firstSyncDone = useFirstSyncDone();
  const tick = Math.floor(useNow(PRUNE_EVERY_MS) / PRUNE_EVERY_MS);
  useEffect(() => {
    if (!firstSyncDone || !myId || days <= 0) return;
    if (pruneOwnActivity(store, myId, days * DAY_MS) > 0) kick();
  }, [store, kick, myId, days, firstSyncDone, tick]);
}
