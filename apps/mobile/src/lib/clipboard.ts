import * as Clipboard from "expo-clipboard";
import { SecureClipboard } from "../../modules/atlas-secure-clipboard";

/** How long a copied secret may stay on the clipboard. */
export const SECRET_CLIPBOARD_MS = 60_000;

/**
 * Copy text to the system clipboard on native, returning whether it succeeded. Rejections are
 * swallowed so a caller can decide whether to show a toast. The browser resolves `clipboard.web.ts`
 * instead (see that file for why expo-clipboard's web path is unsuitable).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy a secret (the recovery phrase, which alone recovers the account) on native. On Android it is
 * marked sensitive, so the system preview and honouring keyboards keep it out of view and history.
 * After {@link SECRET_CLIPBOARD_MS} it is cleared unless something else was copied since; this is
 * best effort, since it needs the app running and Android lets only the focused app read the clipboard.
 */
export async function copySecret(text: string): Promise<boolean> {
  try {
    if (SecureClipboard) await SecureClipboard.setSensitiveStringAsync(text);
    else await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
  setTimeout(() => void clearIfStill(text), SECRET_CLIPBOARD_MS);
  return true;
}

async function clearIfStill(text: string): Promise<void> {
  try {
    if ((await Clipboard.getStringAsync()) === text) await Clipboard.setStringAsync("");
  } catch {
    // No access now; nothing more to do.
  }
}
