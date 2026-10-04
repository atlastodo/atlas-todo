import type { TextInputProps } from "react-native";

/**
 * How Enter behaves in the app's "add" inputs, as prop bags every such field spreads, so quick-add,
 * the board column and the rest cannot drift apart.
 *
 * On the phone, adding a task dismisses the keyboard so the new task is visible, while fields typed
 * in runs (a section, column, label, subtask) keep it up. The browser makes no such distinction
 * (see `submitBehavior.web.ts`).
 */

/** Add-a-task fields: quick-add, the board column's add card. */
export const ADD_TASK_SUBMIT: TextInputProps = { submitBehavior: "blurAndSubmit" };

/** Fields typed in runs: new section, new column, new project, new label, new subtask, comment. */
export const KEEP_FOCUS_SUBMIT: TextInputProps = { submitBehavior: "submit" };
