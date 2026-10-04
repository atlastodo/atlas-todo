/**
 * @jest-environment jsdom
 */
import { copyText } from "./clipboard.web";

/**
 * The browser build's clipboard (imported by name; jest resolves the base file). The write must happen synchronously
 * inside the click, before the caller can unmount, and the reported result must be the real one.
 */

const nav = navigator as unknown as { clipboard?: { writeText: (t: string) => Promise<void> } };

function stubExecCommand(result: boolean | (() => boolean)) {
  const calls: string[] = [];
  (document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => {
    // Record the text staged in the document at the moment of the copy. That staging is what the old
    // implementation could no longer do once the menu it was invoked from had unmounted.
    calls.push(document.body.querySelector("textarea")?.value ?? "");
    return typeof result === "function" ? result() : result;
  });
  return calls;
}

afterEach(() => {
  delete nav.clipboard;
});

describe("copyText on the web", () => {
  it("falls back to a selection copy when navigator.clipboard is absent", async () => {
    // Plain http (a self-hosted instance on a private network) is not a secure context, so this is
    // the only path the app has there.
    const copied = stubExecCommand(true);

    await expect(copyText("- Order tiles (#Home reno)")).resolves.toBe(true);
    expect(copied).toEqual(["- Order tiles (#Home reno)"]);
  });

  it("copies before the caller can unmount, not in a later microtask", () => {
    const copied = stubExecCommand(true);

    // Deliberately not awaited: this is what a click handler does before calling onClose().
    void copyText("- Book the plumber");

    expect(copied).toEqual(["- Book the plumber"]);
  });

  it("reports failure honestly rather than assuming success", async () => {
    stubExecCommand(false);
    await expect(copyText("- Think")).resolves.toBe(false);

    stubExecCommand(() => {
      throw new Error("denied");
    });
    await expect(copyText("- Think")).resolves.toBe(false);
  });

  it("leaves the focus where it was, so copying does not steal the caret", async () => {
    stubExecCommand(true);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await copyText("- Paint the hall");

    expect(document.activeElement).toBe(input);
    // The temporary field is gone, not left in the document.
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});
