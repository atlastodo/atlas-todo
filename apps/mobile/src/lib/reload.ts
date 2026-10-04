/**
 * Restart the app after a crash.
 *
 * `expo-updates` can relaunch the JS bundle, which clears whatever bad state caused the crash
 * without the user having to kill the app by hand. It throws in Expo Go and in a dev client, so the
 * caller gets `false` and can fall back to navigating home.
 *
 * Metro resolves `reload.web.ts` in the browser, where a plain page reload does the same job.
 */

import * as Updates from "expo-updates";

export async function reloadApp(): Promise<boolean> {
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}
