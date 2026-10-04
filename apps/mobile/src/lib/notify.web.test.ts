/**
 * @jest-environment jsdom
 */
import {
  cancelAllAppNotifications,
  ensureNotifyPermission,
  notify,
  onNotificationsReset,
  onNotifyPermissionChange,
  readNotifyPermission,
} from "./notify.web";

/**
 * The RN-web browser-Notification seam. Metro resolves `notify.web.ts` for the browser; jest
 * resolves the base `.ts`, so this names the web file directly. A fake `Notification` global makes the
 * routing behaviour assertable without a real OS banner (that is the maintainer's needs-verification).
 */
type Perm = "default" | "granted" | "denied";

class FakeNotification {
  static permission: Perm = "default";
  static requested: Perm = "granted";
  static posts: { title: string; body?: string; tag?: string }[] = [];
  static requestPermission(): Promise<Perm> {
    // A browser records the answer, so a later read of `permission` sees it.
    FakeNotification.permission = FakeNotification.requested;
    return Promise.resolve(FakeNotification.requested);
  }
  constructor(title: string, options?: { body?: string; tag?: string }) {
    FakeNotification.posts.push({ title, body: options?.body, tag: options?.tag });
  }
}

type WithNotification = { Notification?: unknown };

describe("web notifications seam", () => {
  const real = (globalThis as WithNotification).Notification;
  beforeEach(() => {
    FakeNotification.permission = "default";
    FakeNotification.requested = "granted";
    FakeNotification.posts = [];
    (globalThis as WithNotification).Notification = FakeNotification;
  });
  afterEach(() => {
    (globalThis as WithNotification).Notification = real;
  });

  it("requests permission when undecided and reflects the answer", async () => {
    FakeNotification.permission = "default";
    FakeNotification.requested = "granted";
    expect(await ensureNotifyPermission()).toBe(true);

    FakeNotification.permission = "default";
    FakeNotification.requested = "denied";
    expect(await ensureNotifyPermission()).toBe(false);
  });

  it("treats a permanent denial as not allowed", async () => {
    FakeNotification.permission = "denied";
    expect(await ensureNotifyPermission()).toBe(false);
    expect(await readNotifyPermission()).toBe("denied");
  });

  it("posts a browser notification only when permission is granted", async () => {
    FakeNotification.permission = "granted";
    await notify("Water the plants", "Reminder from Atlas Todo", "rem-1");
    expect(FakeNotification.posts).toEqual([
      { title: "Water the plants", body: "Reminder from Atlas Todo", tag: "rem-1" },
    ]);

    FakeNotification.permission = "default";
    await notify("Ignored", "nope", "rem-2");
    expect(FakeNotification.posts).toHaveLength(1); // unchanged -- not granted, nothing posted
  });

  it("degrades quietly when the Notification API is absent", async () => {
    (globalThis as WithNotification).Notification = undefined;
    expect(await ensureNotifyPermission()).toBe(false);
    expect(await readNotifyPermission()).toBe("unsupported");
    await expect(notify("x")).resolves.toBeUndefined();
  });

  it("tells reset subscribers when the session ends, with nothing booked to cancel", async () => {
    const listener = jest.fn();
    const off = onNotificationsReset(listener);
    await cancelAllAppNotifications();
    off();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("permission changes", () => {
  type Status = { state: string; onchange: (() => void) | null };
  const realPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
  const realNotification = (globalThis as WithNotification).Notification;

  function stubPermissions(value: unknown) {
    Object.defineProperty(navigator, "permissions", { configurable: true, value });
  }

  beforeEach(() => {
    FakeNotification.permission = "default";
    FakeNotification.requested = "granted";
    (globalThis as WithNotification).Notification = FakeNotification;
  });
  afterEach(() => {
    (globalThis as WithNotification).Notification = realNotification;
    if (realPermissions) Object.defineProperty(navigator, "permissions", realPermissions);
    else delete (navigator as { permissions?: unknown }).permissions;
  });

  it("follows the Permissions API, so a change in the site settings is picked up live", async () => {
    const status: Status = { state: "prompt", onchange: null };
    stubPermissions({ query: jest.fn(async () => status) });
    const listener = jest.fn();
    const off = onNotifyPermissionChange(listener);
    await Promise.resolve();
    await Promise.resolve();

    status.onchange?.();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    expect(status.onchange).toBeNull();
  });

  it("falls back to re-reading on focus where the Permissions API cannot answer", async () => {
    stubPermissions({ query: jest.fn(async () => Promise.reject(new TypeError("unsupported"))) });
    const listener = jest.fn();
    const off = onNotifyPermissionChange(listener);
    await new Promise((resolve) => setTimeout(resolve, 0));

    window.dispatchEvent(new Event("focus"));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new Event("focus"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("announces the answer to its own prompt", async () => {
    stubPermissions(undefined);
    const listener = jest.fn();
    const off = onNotifyPermissionChange(listener);
    await ensureNotifyPermission();
    expect(listener).toHaveBeenCalled();
    off();
  });
});
