/** The subset of Electron's `Input` the window's key handler reads. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * Ctrl+Q on Windows and Linux, which quits outright even with "Close to tray" on. Those platforms
 * have no app menu to carry the accelerator; macOS gets Cmd+Q from its app menu instead.
 */
export function isQuitShortcut(input: KeyInput, platform: NodeJS.Platform): boolean {
  return (
    platform !== "darwin" &&
    input.type === "keyDown" &&
    input.control &&
    !input.shift &&
    !input.alt &&
    !input.meta &&
    input.key.toLowerCase() === "q"
  );
}
