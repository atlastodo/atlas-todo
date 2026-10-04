import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Whether the wide-screen sidebar is collapsed.
 *
 * On a wide viewport the drawer is a *permanent* sidebar, so the phone's hamburger (which toggles a
 * slide-in overlay) does nothing there. Instead a header button collapses/expands this sidebar; the
 * `(drawer)` layout reads `collapsed` to switch the drawer between permanent (expanded) and a hidden
 * overlay (collapsed). Narrow viewports ignore this and keep the hamburger.
 *
 * Lives above the navigator (mounted in the composition root) so both the drawer header and the tab
 * header can read/toggle the same state.
 */
export interface SidebarApi {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarApi | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo<SidebarApi>(
    () => ({ collapsed, toggle: () => setCollapsed((c) => !c) }),
    [collapsed],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/** Read the sidebar state. Returns a no-op default when no provider is mounted (e.g. in tests). */
export function useSidebar(): SidebarApi {
  return useContext(SidebarContext) ?? { collapsed: false, toggle: () => {} };
}
