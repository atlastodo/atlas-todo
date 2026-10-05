import { useStore } from "../data/StoreProvider";

/**
 * Whether a sync cycle has completed successfully this session, so the local store holds the
 * server's state and not only what this device last saw. Once true it stays true. Always true in
 * local-only mode: there is no server, and the store on this device is the only copy.
 *
 * `initialSyncDone` is not enough for anything that writes based on local state: it also turns true
 * after a 4 s timeout or a failed first cycle, when a new device holds nothing yet and an old one
 * may hold stale values.
 */
export function useFirstSyncDone(): boolean {
  const { diagnostics, localOnly } = useStore();
  return localOnly === true || diagnostics.lastSyncAt !== null;
}
