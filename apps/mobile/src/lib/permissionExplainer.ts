import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureNotifyPermission, readNotifyPermission } from "./notify";

/**
 * Our own explainer in front of a browser or OS permission prompt, so the prompt never shows up
 * without context. Callers ask through {@link explainNotifications} or {@link explainStorage}; the
 * one mounted `PermissionExplainerHost` shows the dialog, and its primary button runs the real
 * request (a press is the user gesture a browser needs before it will prompt).
 */

export type ExplainerKind = "notifications" | "storage";

/** `granted`: the prompt was allowed. `refused`: asked, but the browser or OS said no. */
export type ExplainerResult = "granted" | "refused" | "dismissed";

export interface ExplainerRequest {
  kind: ExplainerKind;
  /** The real permission request, run from the primary button's press. */
  allow: () => Promise<boolean>;
  settle: (result: ExplainerResult) => void;
}

type Host = (request: ExplainerRequest) => void;

let host: Host | null = null;

/** The host receives every request from now on. Returns an unregister. */
export function registerExplainerHost(next: Host): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

/** Show the explainer for `kind`. With no host mounted (bare test renders) nothing is asked. */
export function showExplainer(
  kind: ExplainerKind,
  allow: () => Promise<boolean>,
): Promise<ExplainerResult> {
  const current = host;
  if (!current) return Promise.resolve("dismissed");
  return new Promise((settle) => current({ kind, allow, settle }));
}

export const DISMISSED_KEY: Record<ExplainerKind, string> = {
  notifications: "atlas.explainer.notifications.dismissed",
  storage: "atlas.explainer.storage.dismissed",
};

async function wasDismissed(kind: ExplainerKind): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISMISSED_KEY[kind])) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(kind: ExplainerKind): void {
  AsyncStorage.setItem(DISMISSED_KEY[kind], "1").catch(() => {});
}

/**
 * Explain reminders, then ask for notification permission, while it is still undecided; resolves to
 * whether notifications are allowed. `implicit` marks a request the user did not ask for directly
 * (a quick-add reminder, leaving onboarding's reminders step): once "Not now" is chosen those stay
 * quiet, while turning reminders on or adding one by hand always explains again.
 */
export async function explainNotifications({ implicit = false } = {}): Promise<boolean> {
  const permission = await readNotifyPermission();
  if (permission === "granted") return true;
  // Denied for good or unsupported: no prompt would show. NotifyPermissionHint says what to do.
  if (permission !== "default") return false;
  if (implicit && (await wasDismissed("notifications"))) return false;
  const result = await showExplainer("notifications", ensureNotifyPermission);
  if (result === "dismissed" && implicit) rememberDismissal("notifications");
  return result === "granted";
}

/**
 * Explain why the browser should keep the local database, then call `navigator.storage.persist()`.
 * Shown once: a dismissal or a refusal is remembered (Settings → Data can still ask again). Inert
 * where there is nothing to ask: already persisted, or no persist() (Safari, native).
 */
export async function explainStorage(storage: StorageManager | undefined): Promise<void> {
  if (typeof storage?.persist !== "function" || typeof storage.persisted !== "function") return;
  try {
    if (await storage.persisted()) return;
  } catch {
    return;
  }
  if (await wasDismissed("storage")) return;
  const result = await showExplainer("storage", () => storage.persist());
  if (result !== "granted") rememberDismissal("storage");
}
