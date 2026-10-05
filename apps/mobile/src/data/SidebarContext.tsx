import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useIsTablet } from "../hooks/useIsWide";

/**
 * Whether the wide-screen sidebar is collapsed.
 *
 * On a wide viewport the drawer is a *permanent* sidebar, collapsed to an icon-only rail by a button
 * in its own header; the `(drawer)` layout reads `collapsed` to size it. Narrow viewports ignore this
 * and navigate by the bottom bar instead.
 *
 * A tablet and a desktop each keep their own state: a tablet starts as the rail (a full sidebar
 * leaves its content too little room), a desktop starts expanded. Resizing across the boundary
 * therefore switches to that width's state rather than carrying the other one over.
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
  const isTablet = useIsTablet();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const value = useMemo<SidebarApi>(
    () =>
      isTablet
        ? { collapsed: tabletCollapsed, toggle: () => setTabletCollapsed((c) => !c) }
        : { collapsed: desktopCollapsed, toggle: () => setDesktopCollapsed((c) => !c) },
    [isTablet, tabletCollapsed, desktopCollapsed],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/** Read the sidebar state. Returns a no-op default when no provider is mounted (e.g. in tests). */
export function useSidebar(): SidebarApi {
  return useContext(SidebarContext) ?? { collapsed: false, toggle: () => {} };
}
