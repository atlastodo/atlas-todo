import { createContext, useContext } from "react";

/**
 * Opens a task's detail by id, for code with no screen to report to (a toast's Open action). The
 * root layout provides it with `router`; screens keep navigation injected (`onOpenTask`), so
 * nothing under `src/` imports expo-router. Null without a provider (tests): callers drop the action.
 */
export const OpenTaskContext = createContext<((taskId: string) => void) | null>(null);

export function useOpenTask(): ((taskId: string) => void) | null {
  return useContext(OpenTaskContext);
}
