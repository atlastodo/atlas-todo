import * as fs from "node:fs";

/**
 * The desktop shell's own preferences: JSON in userData beside window-state.json. They belong
 * to this install, not the account. Reading is best-effort; a missing or corrupt file means defaults.
 */
export interface DesktopSettings {
  /** Windows/Linux: closing the window hides it to the tray instead of quitting the app. */
  closeToTray: boolean;
  /** Whether to check for updates automatically in the background (ignored when updates are disabled). */
  autoCheckUpdates: boolean;
}

/** What Settings' "Close to tray" row reads: whether there is a tray, and the choice. */
export interface CloseToTrayState {
  available: boolean;
  enabled: boolean;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  closeToTray: false,
  autoCheckUpdates: true,
};

export function loadDesktopSettings(file: string): DesktopSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<DesktopSettings> | null;
    return {
      closeToTray: raw?.closeToTray === true,
      autoCheckUpdates: raw?.autoCheckUpdates !== false,
    };
  } catch {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

export function saveDesktopSettings(file: string, settings: DesktopSettings): void {
  fs.writeFileSync(file, JSON.stringify(settings));
}
