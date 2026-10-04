/**
 * Keyboard-shortcut dispatch: pure and DOM-free. [`HOTKEY_BINDINGS`] is the single source of truth,
 * walked by `dispatchHotkey` and rendered by the help UIs.
 *
 * Cmd/Ctrl-K fires even while typing; every other binding is inert then, and any modifier
 * suppresses single-key shortcuts. A missing or declining (`false`) handler reports unhandled so the
 * browser default survives. Escape clears a multi-selection but never reports handled, so an open
 * dialog still closes.
 */

export interface HotkeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  typing: boolean;
}

export type HotkeyHandler = () => void | boolean;

export interface HotkeyHandlers {
  openPalette?: HotkeyHandler;
  focusSearch?: HotkeyHandler;
  openHelp?: HotkeyHandler;
  focusQuickAdd?: HotkeyHandler;
  cursorNext?: HotkeyHandler;
  cursorPrev?: HotkeyHandler;
  openCursor?: HotkeyHandler;
  completeCursor?: HotkeyHandler;
  rescheduleCursor?: HotkeyHandler;
  deleteCursor?: HotkeyHandler;
  clearSelection?: HotkeyHandler;
  selectAll?: HotkeyHandler;
  copySelection?: HotkeyHandler;
  duplicateSelection?: HotkeyHandler;
  cutSelection?: HotkeyHandler;
}

export type HotkeyGroup = "global" | "navigation" | "taskActions" | "selection";

export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  "global",
  "navigation",
  "taskActions",
  "selection",
];

export interface HotkeyBinding {
  action: keyof HotkeyHandlers;
  triggerKeys: string[];
  displayKeys: string[];
  descriptionKey: string;
  group: HotkeyGroup;
  mod?: boolean;
  /** Fires even while focus is in a text field (only Cmd/Ctrl-K). */
  whileTyping?: boolean;
  /** Fires, but reports unhandled so the event is not preventDefaulted (Escape). */
  noPreventDefault?: boolean;
}

// In help-UI order.
export const HOTKEY_BINDINGS: readonly HotkeyBinding[] = [
  // Global & Search.
  {
    action: "openPalette",
    triggerKeys: ["k"],
    displayKeys: ["Mod", "K"],
    descriptionKey: "about.shortcutCommandPalette",
    group: "global",
    mod: true,
    whileTyping: true,
  },
  {
    action: "focusSearch",
    triggerKeys: ["/"],
    displayKeys: ["/"],
    descriptionKey: "about.shortcutFocusSearch",
    group: "global",
  },
  {
    action: "openHelp",
    triggerKeys: ["?"],
    displayKeys: ["?"],
    descriptionKey: "about.shortcutQuickHelp",
    group: "global",
  },
  // Navigation.
  {
    action: "cursorNext",
    triggerKeys: ["j"],
    displayKeys: ["J"],
    descriptionKey: "about.shortcutNextTask",
    group: "navigation",
  },
  {
    action: "cursorPrev",
    triggerKeys: ["k"],
    displayKeys: ["K"],
    descriptionKey: "about.shortcutPrevTask",
    group: "navigation",
  },
  {
    action: "openCursor",
    triggerKeys: ["o", "Enter"],
    displayKeys: ["Enter", "O"],
    descriptionKey: "about.shortcutOpenTask",
    group: "navigation",
  },
  // Task actions.
  {
    action: "focusQuickAdd",
    triggerKeys: ["a", "q"],
    displayKeys: ["A", "Q"],
    descriptionKey: "about.shortcutFocusQuickAdd",
    group: "taskActions",
  },
  {
    action: "completeCursor",
    triggerKeys: ["c", "x"],
    displayKeys: ["C", "X"],
    descriptionKey: "about.shortcutCompleteTask",
    group: "taskActions",
  },
  {
    action: "rescheduleCursor",
    triggerKeys: ["t"],
    displayKeys: ["T"],
    descriptionKey: "about.shortcutRescheduleTask",
    group: "taskActions",
  },
  {
    action: "deleteCursor",
    triggerKeys: ["#", "Backspace", "Delete"],
    displayKeys: ["⌫", "Del"],
    descriptionKey: "about.shortcutDeleteTask",
    group: "taskActions",
  },
  // Multi-select.
  {
    action: "selectAll",
    triggerKeys: ["a"],
    displayKeys: ["Mod", "A"],
    descriptionKey: "about.shortcutSelectAll",
    group: "selection",
    mod: true,
  },
  {
    action: "copySelection",
    triggerKeys: ["c"],
    displayKeys: ["Mod", "C"],
    descriptionKey: "about.shortcutCopyTasks",
    group: "selection",
    mod: true,
  },
  {
    action: "cutSelection",
    triggerKeys: ["x"],
    displayKeys: ["Mod", "X"],
    descriptionKey: "about.shortcutCutTasks",
    group: "selection",
    mod: true,
  },
  {
    action: "duplicateSelection",
    triggerKeys: ["d"],
    displayKeys: ["Mod", "D"],
    descriptionKey: "about.shortcutDuplicateTasks",
    group: "selection",
    mod: true,
  },
  {
    action: "clearSelection",
    triggerKeys: ["Escape"],
    displayKeys: ["Esc"],
    descriptionKey: "about.shortcutClearSelection",
    group: "selection",
    noPreventDefault: true,
  },
];

// Returns `true` when the caller should `preventDefault`.
export function dispatchHotkey(input: HotkeyInput, h: HotkeyHandlers): boolean {
  const { key, metaKey, ctrlKey, altKey, typing } = input;
  const mod = metaKey || ctrlKey;
  const lower = key.toLowerCase();

  for (const binding of HOTKEY_BINDINGS) {
    // A mod combo needs Cmd/Ctrl held; a bare key forbids it (and Alt), so Cmd/Ctrl-J stays the
    // browser's. Single keys match the exact `key`: Shift must not widen "j".
    if ((binding.mod ?? false) !== mod) continue;
    const matches = binding.mod
      ? binding.triggerKeys.includes(lower)
      : binding.triggerKeys.includes(key);
    if (!matches) continue;
    if (!binding.mod && altKey) continue;
    // Bindings are inert while a text field holds focus, except those marked otherwise.
    if (typing && !binding.whileTyping) continue;
    // Unwired or declined: unhandled, so the browser default survives.
    const handler = h[binding.action];
    if (!handler) continue;
    if (handler() === false) return false;
    return !binding.noPreventDefault;
  }
  return false;
}
