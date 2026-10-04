import { useStore } from "../data/StoreProvider";

/**
 * Whether a sync cycle has completed successfully this session, so the local store holds the
 * server's state and not only what this device last saw. Once true it stays true.
 *
 * `initialSyncDone` is not enough for anything that writes based on local state: it also turns true
 * after a 4 s timeout or a failed first cycle, when a new device holds nothing yet and an old one
 * may hold stale values.
 */
export function useFirstSyncDone(): boolean {
  return useStore().diagnostics.lastSyncAt !== null;
}
