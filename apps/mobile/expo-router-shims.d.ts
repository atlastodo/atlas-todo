import type { ComponentType } from "react";

/**
 * Type shims for runtime exports that Expo SDK 57's `expo-router` ships without declaring:
 * `useIsFocused` (re-exported by `exports.js`) and `DrawerToggleButton` (by `layouts/Drawer.js`).
 * They must come from expo-router, not `@react-navigation/*`, which SDK 56+ forbids and which would
 * read a different navigation context. This is a module augmentation, merging with expo-router's
 * declarations. Delete whichever a future types release restores.
 */
declare module "expo-router" {
  /** Whether the hosting route is currently focused (accounts for nested navigators). */
  export function useIsFocused(): boolean;
}

declare module "expo-router/drawer" {
  /** The header button that opens/closes the drawer. */
  export const DrawerToggleButton: ComponentType<{
    tintColor?: string;
    pressColor?: string;
    pressOpacity?: number;
    accessibilityLabel?: string;
  }>;
}
