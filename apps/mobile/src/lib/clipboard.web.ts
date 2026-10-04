/**
 * Copy text to the clipboard on the browser build (Metro picks this over `clipboard.ts`).
 *
 * `expo-clipboard`'s web path fails here for two reasons. It awaits `navigator.clipboard.writeText`
 * before its `execCommand("copy")` fallback, but `navigator.clipboard` needs a secure context and a
 * self-hosted app may be on plain http, so the fallback runs after the user gesture has ended. And
 * the fallback selects a temporary textarea, which fails once a context-menu copy has unmounted its
 * modal. It also ignores `execCommand`'s result and reports success regardless.
 *
 * So the write happens here synchronously inside the click handler, before any caller unmounts,
 * and the result is the real one.
 */
export function copyText(text: string): Promise<boolean> {
  // Invoked synchronously; only its promise settles later. It does not touch the document.
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      // A late rejection (permissions, focus) still gets the legacy attempt.
      () => execCommandCopy(text),
    );
  }
  return Promise.resolve(execCommandCopy(text));
}

/** How long a copied secret may stay on the clipboard. */
export const SECRET_CLIPBOARD_MS = 60_000;

/**
 * Copy a secret (the recovery phrase) and blank the clipboard after {@link SECRET_CLIPBOARD_MS}. A
 * page cannot read the clipboard back without a prompt, so unlike native it blanks unconditionally.
 * Browsers only allow the write while the page has focus.
 */
export function copySecret(text: string): Promise<boolean> {
  const copied = copyText(text);
  setTimeout(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText("").catch(() => {});
    }
  }, SECRET_CLIPBOARD_MS);
  return copied;
}

/**
 * The pre-`navigator.clipboard` route: copy from an offscreen textarea, restoring the previous
 * focus and selection.
 */
function execCommandCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  // Off-screen, not hidden (a hidden field cannot hold a selection); `readonly` keeps mobile Safari's keyboard down.
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
    active?.focus?.();
  }
}
