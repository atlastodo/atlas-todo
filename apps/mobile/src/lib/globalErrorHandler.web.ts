/**
 * Web global error handler: `error` catches uncaught exceptions outside React and
 * `unhandledrejection` a promise nobody awaited (the more common case here, since sync, persistence
 * and the API client are async). Neither listener calls `preventDefault`, so the console still logs.
 */

import { captureError } from "./crashReporter";

let installed = false;

export function installGlobalErrorHandler(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    void captureError(event.error ?? event.message, "crash");
  });
  window.addEventListener("unhandledrejection", (event) => {
    void captureError(event.reason, "crash");
  });
}
