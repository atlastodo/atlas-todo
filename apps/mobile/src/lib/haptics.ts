import * as Haptics from "expo-haptics";

/**
 * Tactile feedback: the single place every haptic goes through. Never call `expo-haptics` directly
 * from a component. This module exposes a small semantic API (what the touch means) and holds the
 * `haptics_enabled` gate, a module-level flag set from the synced preference by `useHapticsPref`;
 * a disabled gate makes every method a no-op. Metro resolves `haptics.web.ts` (all no-ops) on web,
 * so components never branch on `Platform.OS`.
 *
 * All calls are fire-and-forget: a haptic must never break a render or gesture, and Android devices
 * often have no vibrator, so every call swallows its rejection.
 */

let enabled = true;

/** Track the synced `haptics_enabled` preference. Called by `useHapticsPref`. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

function run(fire: () => Promise<void>): void {
  if (!enabled) return;
  fire().catch(() => {});
}

export const haptics = {
  /** A light tick for discrete state changes: selecting a row, picking an option, crossing a threshold. */
  selection(): void {
    run(() => Haptics.selectionAsync());
  },
  /** A physical bump. `medium` for a lift/menu-open, `light` for a minor commit, `heavy` sparingly. */
  impact(style: "light" | "medium" | "heavy" = "medium"): void {
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    run(() => Haptics.impactAsync(map[style]));
  },
  /** The "done" notification: completing a task, a successful action. */
  success(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** The "careful" notification: a destructive confirm. */
  warning(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** The "failed" notification: an error or rejection. */
  error(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
