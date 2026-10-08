import type { ViewProps } from "react-native";
import { useSelectionOptional } from "../data/SelectionProvider";

export type OutsidePressProps = Pick<ViewProps, "onStartShouldSetResponder" | "onResponderRelease">;

/**
 * Leave select mode on a tap that lands on no task: spread on a list's root View. Rows and buttons
 * claim the touch first (the deepest responder wins), so only a tap on empty space, a group header
 * or padding reaches the root. A scroll steals the responder before release, so scrolling never
 * exits. The selection toolbar swallows its own touches. Metro resolves `useOutsidePressExit.web.ts`
 * on web, which listens on the document instead.
 */
export function useOutsidePressExit(): OutsidePressProps {
  const sel = useSelectionOptional();
  if (!sel?.mode) return {};
  return {
    onStartShouldSetResponder: () => true,
    onResponderRelease: () => sel.clear(),
  };
}
