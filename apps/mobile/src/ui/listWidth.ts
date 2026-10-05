import { Platform } from "react-native";

/** The widest a web list (toolbar, header and rows) runs, in px. */
export const LIST_MAX_WIDTH = 860;

/**
 * Web lists stop at a readable width on wide screens, centred in the content area; a narrower
 * window or native is unaffected. Task lists, a project's list view and the Projects page share it.
 */
export const LIST_WIDTH_STYLE =
  Platform.OS === "web"
    ? ({ width: "100%", maxWidth: LIST_MAX_WIDTH, alignSelf: "center" } as const)
    : undefined;
