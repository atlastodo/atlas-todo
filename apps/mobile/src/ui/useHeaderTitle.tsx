import { useCallback, useLayoutEffect, type ReactElement } from "react";
import { useNavigation } from "expo-router";
import { HeaderTitle } from "./HeaderTitle";
import type { LucideIcon } from "./icons";

/**
 * Set the nav-header title to a coloured icon + name, shared by the project and filter routes so the
 * "glyph left of the name" header is defined once. Imports expo-router's `useNavigation`, so it is
 * used only from route files, never from a screen.
 */
export function useHeaderTitle(opts: { icon: LucideIcon; title: string; color?: string }): void {
  const navigation = useNavigation();
  const { icon: Icon, title, color } = opts;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: ({ tintColor }: { tintColor?: string }) => (
        <HeaderTitle icon={Icon} title={title} color={color} tintColor={tintColor} />
      ),
      // The header's right slot otherwise has a zero flex basis, so wide actions overflow leftward
      // over the title. Sized to its content instead, it holds its room and the title shrinks.
      headerTitleContainerStyle: { flexShrink: 1, minWidth: 0 },
      headerRightContainerStyle: { flexBasis: "auto", flexShrink: 0 },
    });
  }, [navigation, Icon, title, color]);
}

/**
 * A setter for the nav header's `headerRight`, for a screen that publishes its own header actions
 * (the project screen's). Stable across renders, so a screen can depend on it in an effect; `null`
 * clears the slot again (the project route also shows folders, which have no such actions). Route
 * files only, for the same reason as {@link useHeaderTitle}.
 */
export function useHeaderRight(): (actions: ReactElement | null) => void {
  const navigation = useNavigation();
  return useCallback(
    (actions: ReactElement | null) => {
      navigation.setOptions({ headerRight: actions ? () => actions : undefined });
    },
    [navigation],
  );
}
