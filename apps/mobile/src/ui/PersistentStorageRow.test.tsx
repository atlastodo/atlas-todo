/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
// The row is browser-only, so force the web platform before any render -- jest-expo defaults to a
// native OS. The original is kept for the test that proves the native build renders nothing.
const NATIVE_OS = Platform.OS;
(Platform as { OS: string }).OS = "web";

import { IDBFactory } from "fake-indexeddb";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PersistentStorageRow } from "./PersistentStorageRow";

/**
 * The row reports what `data/persistence.web.ts` asked the browser for. jsdom exposes `window` for the Electron gate, and a
 * fake-indexeddb global opens the "durable backend" gate. The navigator and window mocks follow `data/persistence.web.test.ts`.
 */

/** Distinctive fragments of the two descriptions, so the tests read what a user would. */
const PROTECTED = /has promised not to delete/;
const AT_RISK = /may delete it to free up space/;

/** The durable IndexedDB the web build actually runs on (fake-indexeddb, as the seam tests use). */
const realIdb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;

describe("PersistentStorageRow", () => {
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
    (globalThis.navigator as { storage?: unknown }).storage = undefined;
  });

  afterEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = realIdb;
    delete (window as unknown as { atlasDesktop?: unknown }).atlasDesktop;
  });

  it("reports the browser's promise, with no action to take", async () => {
    (globalThis.navigator as { storage?: unknown }).storage = { persisted: async () => true };

    await render(<PersistentStorageRow />);

    expect(await screen.findByText(PROTECTED)).toBeTruthy();
    expect(screen.getByText("Data on this device")).toBeTruthy();
    expect(screen.queryByLabelText("Ask again")).toBeNull();
  });

  it("explains the risk and asks again on demand", async () => {
    const persist = jest.fn(async () => true);
    (globalThis.navigator as { storage?: unknown }).storage = {
      persisted: async () => false,
      persist,
    };

    await render(<PersistentStorageRow />);

    expect(await screen.findByText(AT_RISK)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Ask again"));

    // Firefox answers its door-hanger only when the user does, so the promise settles late.
    expect(await screen.findByText(PROTECTED)).toBeTruthy();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Ask again")).toBeNull();
  });

  it("holds one request at a time, and settles when the browser answers", async () => {
    let answer: ((granted: boolean) => void) | undefined;
    const persist = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    (globalThis.navigator as { storage?: unknown }).storage = {
      persisted: async () => false,
      persist,
    };

    await render(<PersistentStorageRow />);
    await screen.findByText(AT_RISK);

    await fireEvent.press(screen.getByLabelText("Ask again"));
    expect(persist).toHaveBeenCalledTimes(1);
    // In flight (Firefox's door-hanger is up): the button yields no second request. The state
    // surfaces as accessibilityState.disabled (RNW folds its `disabled` prop into that).
    expect(screen.getByLabelText("Ask again").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText("Ask again"));
    expect(persist).toHaveBeenCalledTimes(1);

    await act(() => answer?.(true));
    expect(await screen.findByText(PROTECTED)).toBeTruthy();
  });

  it("gives the guidance without an action where the API is missing", async () => {
    // Safari's navigator.storage has no persist()/persisted(): advice only, no status to read.
    (globalThis.navigator as { storage?: unknown }).storage = {};

    await render(<PersistentStorageRow />);

    expect(await screen.findByText(AT_RISK)).toBeTruthy();
    expect(screen.queryByLabelText("Ask again")).toBeNull();
  });

  it("renders nothing on the native build", async () => {
    // The storage mock says "protected": without the platform gate the row would appear here.
    (globalThis.navigator as { storage?: unknown }).storage = { persisted: async () => true };
    (Platform as { OS: string }).OS = NATIVE_OS;
    try {
      const tree = await render(<PersistentStorageRow />);
      // Flush the microtasks a wrongly-started persisted() query would settle on.
      await act(async () => {});
      expect(tree.toJSON()).toBeNull();
    } finally {
      (Platform as { OS: string }).OS = "web";
    }
  });

  it("renders nothing in Electron, whose storage lives on disk", async () => {
    (globalThis.navigator as { storage?: unknown }).storage = { persisted: async () => false };
    (window as unknown as { atlasDesktop?: { isElectron?: boolean } }).atlasDesktop = {
      isElectron: true,
    };

    const tree = await render(<PersistentStorageRow />);
    await act(async () => {});
    expect(tree.toJSON()).toBeNull();
  });
});
