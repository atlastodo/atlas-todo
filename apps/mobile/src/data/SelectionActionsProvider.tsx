import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useScreenFocused } from "./ScreenFocusContext";

/**
 * Bridges the root keyboard-shortcut layer to the on-screen task list's selection actions. Copy /
 * cut / duplicate need the list's own data (in `GroupedTaskList` / `ProjectTaskList`) but the
 * hotkey listener is mounted at the app root, so the active list registers its actions here and
 * the root's Cmd/Ctrl-C/X/D handlers call them (as `CursorProvider` does for j/k/o). Inert on native.
 */

export interface SelectionActions {
  /** Copy the current selection to the clipboard (with its own "copied" toast). */
  copy: () => void;
  /** Duplicate the current selection (with an undo toast). */
  duplicate: () => void;
  /** Copy then delete the current selection (soft-delete, with an undo toast). */
  cut: () => void;
}

interface SelectionActionsContextValue {
  /** Register the active list's actions (call on mount); pass the same object to {@link clear}. */
  register: (actions: SelectionActions) => void;
  clear: (actions: SelectionActions) => void;
  /** Root-level triggers: they call the registered actions if a list is mounted, else no-op. */
  copySelection: () => void;
  duplicateSelection: () => void;
  cutSelection: () => void;
}

const SelectionActionsContext = createContext<SelectionActionsContextValue | null>(null);

export function SelectionActionsProvider({ children }: { children: ReactNode }) {
  const activeRef = useRef<SelectionActions | null>(null);

  const register = useCallback((actions: SelectionActions) => {
    activeRef.current = actions;
  }, []);
  const clear = useCallback((actions: SelectionActions) => {
    // On navigation the next screen may register before the old one's cleanup runs.
    if (activeRef.current === actions) activeRef.current = null;
  }, []);

  const value = useMemo<SelectionActionsContextValue>(
    () => ({
      register,
      clear,
      copySelection: () => activeRef.current?.copy(),
      duplicateSelection: () => activeRef.current?.duplicate(),
      cutSelection: () => activeRef.current?.cut(),
    }),
    [register, clear],
  );

  return (
    <SelectionActionsContext.Provider value={value}>{children}</SelectionActionsContext.Provider>
  );
}

export function useSelectionActions(): SelectionActionsContextValue {
  const ctx = useContext(SelectionActionsContext);
  if (!ctx) throw new Error("useSelectionActions must be used within a SelectionActionsProvider");
  return ctx;
}

/**
 * Register a list's selection actions for the lifetime of the component. `actions` may be recreated
 * each render; a stable wrapper reads the latest via a ref, so the registration never churns.
 */
export function useRegisterSelectionActions(actions: SelectionActions): void {
  const { register, clear } = useSelectionActions();
  const focused = useScreenFocused();
  const ref = useRef(actions);
  ref.current = actions;
  const stable = useRef<SelectionActions | null>(null);
  if (!stable.current) {
    stable.current = {
      copy: () => ref.current.copy(),
      duplicate: () => ref.current.duplicate(),
      cut: () => ref.current.cut(),
    };
  }
  // Only while focused: the drawer/tabs keep visited screens mounted, and a background list would
  // steal Cmd-C/D/X from the visible one.
  useEffect(() => {
    if (!focused) return;
    const a = stable.current!;
    register(a);
    return () => clear(a);
  }, [register, clear, focused]);
}
