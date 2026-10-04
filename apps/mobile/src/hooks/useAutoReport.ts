import { useEffect, useRef, useState } from "react";
import { captureError, type CaptureResult } from "../lib/crashReporter";

/**
 * Files a crash report exactly once for the error an `ErrorBoundary` caught, and reports back what
 * happened so the crash screen can say "sent" or "saved for later" honestly.
 *
 * The ref guard matters: a boundary re-renders whenever the user taps something on the fallback
 * screen, and without it every tap would file another copy of the same crash.
 */
export function useAutoReport(error: unknown): CaptureResult | "pending" {
  const [result, setResult] = useState<CaptureResult | "pending">("pending");
  const filed = useRef(false);

  useEffect(() => {
    if (filed.current) return;
    filed.current = true;
    void captureError(error, "crash").then(setResult);
  }, [error]);

  return result;
}
