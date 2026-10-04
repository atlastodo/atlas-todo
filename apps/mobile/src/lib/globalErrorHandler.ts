/**
 * Native: catch errors that never reach a React error boundary (a boundary only sees throws during
 * render, commit or lifecycle; an exception in a timer, gesture callback or promise chain goes
 * straight to React Native's global handler).
 *
 * A fatal error is saved to disk synchronously before the previous handler runs, because in a
 * release build that handler ends the process before an async report could go anywhere. A
 * non-fatal error goes to the previous handler first, so the dev LogBox still shows it. This layer
 * only adds a report; it never replaces the debugger.
 *
 * Metro resolves `globalErrorHandler.web.ts` for the browser build.
 */

import { captureError, captureFatalSync, flushQueue } from "./crashReporter";

let installed = false;

export function installGlobalErrorHandler(): void {
  if (installed) return;
  // `ErrorUtils` is an RN global; guard so a bare-Node context (jest, a script) does not blow up at load.
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtils }).ErrorUtils;
  if (!errorUtils) return;
  installed = true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      captureFatalSync(error);
      previous?.(error, isFatal);
      // Still alive (a dev build): deliver now.
      void flushQueue();
      return;
    }
    previous?.(error, isFatal);
    void captureError(error, "crash");
  });
}

/** The shape of RN's `ErrorUtils` global. */
interface ErrorUtils {
  setGlobalHandler: (callback: (error: unknown, isFatal?: boolean) => void) => void;
  getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
}
