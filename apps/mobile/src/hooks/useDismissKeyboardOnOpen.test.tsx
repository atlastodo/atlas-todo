/**
 * @jest-environment jsdom
 */
import { useRef } from "react";
import { Keyboard, Platform } from "react-native";
import { act, render } from "@testing-library/react-native";
import { useDismissKeyboardOnOpen } from "./useDismissKeyboardOnOpen";

/**
 * Opening the task detail must not blur whatever the user focused right after it opened (its own Title or Notes).
 * Driven with a real `div` standing in for the detail's root, as in `useCardDnd.web.test.tsx`.
 */

function Harness({ root }: { root?: HTMLElement }) {
  const ref = useRef<HTMLElement | null>(root ?? null);
  useDismissKeyboardOnOpen(root ? ref : undefined);
  return null;
}

function field(parent: HTMLElement): HTMLInputElement {
  const input = document.createElement("input");
  parent.appendChild(input);
  return input;
}

/**
 * Open (mount the hook), run `meanwhile` right after, then let the retries run out. Fake timers only
 * for the duration, so the library's own cleanup after the test runs on real ones.
 */
async function openAndSettle(root?: HTMLElement, meanwhile?: () => void) {
  jest.useFakeTimers();
  try {
    await render(<Harness root={root} />);
    meanwhile?.();
    await act(() => jest.advanceTimersByTime(200));
  } finally {
    jest.useRealTimers();
  }
}

const OS = Platform.OS;
let dismiss: jest.SpyInstance;

beforeEach(() => {
  dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
});

afterEach(() => {
  (Platform as { OS: string }).OS = OS;
  dismiss.mockRestore();
  document.body.innerHTML = "";
});

describe("useDismissKeyboardOnOpen", () => {
  describe("on the web", () => {
    beforeEach(() => {
      (Platform as { OS: string }).OS = "web";
    });

    it("never blurs a field inside the opened screen, even one focused during the retries", async () => {
      const detail = document.createElement("div");
      document.body.appendChild(detail);
      const title = field(detail);

      // The user clicks Title between the mount dismiss and the retries.
      await openAndSettle(detail, () => title.focus());

      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(title);
    });

    it("still puts away a field outside the opened screen", async () => {
      const detail = document.createElement("div");
      document.body.appendChild(detail);
      field(document.body).focus();
      await openAndSettle(detail);

      expect(dismiss).toHaveBeenCalledTimes(3);
    });

    it("leaves focus alone without a screen root to check against", async () => {
      field(document.body).focus();
      await openAndSettle();

      expect(dismiss).not.toHaveBeenCalled();
    });
  });

  it("dismisses on mount and twice more as the transition settles on a phone", async () => {
    (Platform as { OS: string }).OS = "ios";
    let onMount = 0;
    await openAndSettle(undefined, () => {
      onMount = dismiss.mock.calls.length;
    });
    expect(onMount).toBe(1);
    expect(dismiss).toHaveBeenCalledTimes(3);
  });
});
