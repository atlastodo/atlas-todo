import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The permissions drawer (`PermissionsSheetHost`): one sheet listing what this device still has to
 * allow before reminders reach the user on time. Permissions belong to the device, not the account,
 * so whether it was seen is remembered here, never in synced preferences: signing in to an existing
 * account on a new phone skips onboarding but still gets the drawer.
 */

type Opener = () => void;

let opener: Opener | null = null;

/** The mounted host receives every open from now on. Returns an unregister. */
export function registerPermissionsSheet(next: Opener): () => void {
  opener = next;
  return () => {
    if (opener === next) opener = null;
  };
}

/** Open the drawer (Settings → Notifications). With no host mounted nothing happens. */
export function openPermissionsSheet(): void {
  opener?.();
}

export const PERMISSIONS_SHEET_SEEN_KEY = "atlas.permissionsSheet.seen";

/** Whether the drawer was already closed on this device, so it no longer opens by itself. */
export async function permissionsSheetSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PERMISSIONS_SHEET_SEEN_KEY)) === "1";
  } catch {
    return false;
  }
}

export function rememberPermissionsSheetSeen(): void {
  AsyncStorage.setItem(PERMISSIONS_SHEET_SEEN_KEY, "1").catch(() => {});
}
