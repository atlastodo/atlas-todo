/**
 * The `electron` module exists only inside Electron's runtime: the npm package's entry point is
 * the path of its binary. The tests run under `bun test`, whose ESM imports are strict, so the
 * named imports `src/` makes of it are stood in for here (bunfig.toml preloads this file). No
 * test calls into them: the tests exercise what `src/` computes, not Electron itself.
 */
import { mock } from "bun:test";

mock.module("electron", () => ({
  app: {},
  net: {},
  shell: {},
  contextBridge: {},
  ipcRenderer: {},
}));
