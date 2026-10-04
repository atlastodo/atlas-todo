import type { TextInputProps } from "react-native";

/**
 * The web `submitBehavior.ts`: every add input keeps the caret after Enter, so a run of tasks is
 * typed Enter-after-Enter. The phone blurs to uncover the list from the on-screen keyboard, which
 * does not exist here.
 *
 * It must say `blurOnSubmit`, not `submitBehavior`: react-native-web's TextInput knows only the
 * legacy prop (see its `handleKeyDown`), and its single-line default is to blur.
 * `blurOnSubmit: false` still fires `onSubmitEditing`; it only skips the blur.
 */

/** Add-a-task fields: quick-add, the board column's add card. */
export const ADD_TASK_SUBMIT: TextInputProps = { blurOnSubmit: false };

/** Fields typed in runs: new section, new column, new project, new label, new subtask, comment. */
export const KEEP_FOCUS_SUBMIT: TextInputProps = { blurOnSubmit: false };
