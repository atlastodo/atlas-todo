export interface ListKeyboardNav {
  /** Only listen while the list is on screen (e.g. the palette is open). */
  enabled: boolean;
  /** Number of rows, so the highlight can clamp and wrap sensibly. */
  count: number;
  /** Run the row at `index` (Enter). */
  onEnter: (index: number) => void;
  /** Dismiss (Escape). */
  onEscape: () => void;
}

/**
 * Arrow/Enter/Escape navigation for a keyboard-driven list: a native no-op, since a phone has no
 * hardware keyboard (the highlight stays at 0). Metro resolves `useListKeyboardNav.web.ts` for the
 * browser.
 */
export function useListKeyboardNav(_opts: ListKeyboardNav): number {
  return 0;
}
