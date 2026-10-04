/**
 * Web no-op counterpart of `haptics.ts`. Browsers have no taptic engine (`navigator.vibrate` is a
 * coarse buzz most desktops ignore), so every haptic is dropped. Metro resolves this in place of
 * `haptics.ts` on web. The surface must stay identical so call sites never branch on platform.
 */

export function setHapticsEnabled(_next: boolean): void {}

export const haptics = {
  selection(): void {},
  impact(_style: "light" | "medium" | "heavy" = "medium"): void {},
  success(): void {},
  warning(): void {},
  error(): void {},
};
