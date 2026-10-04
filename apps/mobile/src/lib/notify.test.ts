/**
 * The native notify seam's interactive-reminder half: the Complete / Snooze category registration,
 * the category + data a task reminder's notification carries, and the response surface (live
 * listener + cold-start read). expo-notifications' deep modules are mocked -- each loads its native
 * module at import, which does not exist off-device -- and the spies are read back off the mocked
 * module, not off outer consts (the factory runs while `./notify` is first imported: TDZ).
 */
import i18n from "../i18n";
import {
  REMINDER_CATEGORY_ID,
  REMINDER_COMPLETE_ACTION,
  REMINDER_SNOOZE_ACTION,
} from "./reminderActions";
import {
  bookedNotificationIds,
  cancelAllAppNotifications,
  ensureNotificationSetup,
  ensureNotifyPermission,
  launchReminderResponse,
  notificationGeneration,
  onNotificationsReset,
  onReminderResponse,
  scheduleIO,
  clearLaunchReminderResponse,
} from "./notify";

jest.mock("expo-notifications/build/NotificationsHandler", () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock("expo-notifications/build/setNotificationChannelAsync", () => ({
  setNotificationChannelAsync: jest.fn(async () => ({})),
}));
jest.mock("expo-notifications/build/setNotificationCategoryAsync", () => ({
  setNotificationCategoryAsync: jest.fn(async () => ({ identifier: "x", actions: [] })),
}));
jest.mock("expo-notifications/build/NotificationPermissions", () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));
jest.mock("expo-notifications/build/scheduleNotificationAsync", () => ({
  scheduleNotificationAsync: jest.fn(async () => {}),
}));
jest.mock("expo-notifications/build/cancelScheduledNotificationAsync", () => ({
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));
jest.mock("expo-notifications/build/cancelAllScheduledNotificationsAsync", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}));
jest.mock("expo-notifications/build/dismissAllNotificationsAsync", () => ({
  dismissAllNotificationsAsync: jest.fn(async () => {}),
}));
jest.mock("expo-notifications/build/getAllScheduledNotificationsAsync", () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));
jest.mock("expo-notifications/build/NotificationsEmitter", () => {
  // Created inside the factory (see the file comment): the spies live on the mocked module.
  let launchResponse: unknown = null;
  return {
    __esModule: true,
    addNotificationResponseReceivedListener: jest.fn((listener: unknown) => ({
      remove: () => {},
      __listener: listener,
    })),
    getLastNotificationResponse: jest.fn(() => launchResponse),
    clearLastNotificationResponse: jest.fn(() => {
      launchResponse = null;
    }),
  };
});

const mocks = () => ({
  channel: jest.requireMock("expo-notifications/build/setNotificationChannelAsync")
    .setNotificationChannelAsync as jest.Mock,
  permissions: jest.requireMock("expo-notifications/build/NotificationPermissions") as {
    getPermissionsAsync: jest.Mock;
    requestPermissionsAsync: jest.Mock;
  },
  getAll: jest.requireMock("expo-notifications/build/getAllScheduledNotificationsAsync")
    .getAllScheduledNotificationsAsync as jest.Mock,
  cancelAll: jest.requireMock("expo-notifications/build/cancelAllScheduledNotificationsAsync")
    .cancelAllScheduledNotificationsAsync as jest.Mock,
  dismissAll: jest.requireMock("expo-notifications/build/dismissAllNotificationsAsync")
    .dismissAllNotificationsAsync as jest.Mock,
  category: jest.requireMock("expo-notifications/build/setNotificationCategoryAsync")
    .setNotificationCategoryAsync as jest.Mock,
  schedule: jest.requireMock("expo-notifications/build/scheduleNotificationAsync")
    .scheduleNotificationAsync as jest.Mock,
  emitter: jest.requireMock("expo-notifications/build/NotificationsEmitter") as {
    addNotificationResponseReceivedListener: jest.Mock;
    getLastNotificationResponse: jest.Mock;
    clearLastNotificationResponse: jest.Mock;
  },
});

/** A response as the emitter hands it over (post `mapNotificationResponse`). */
function rawResponse(overrides: {
  actionIdentifier?: string;
  identifier?: string;
  data?: Record<string, unknown>;
  date?: number;
}) {
  return {
    actionIdentifier: overrides.actionIdentifier ?? "expo.modules.notifications.actions.DEFAULT",
    notification: {
      date: overrides.date ?? 123,
      request: {
        identifier: overrides.identifier ?? "r1",
        content: { title: "Task", body: null, data: overrides.data ?? {} },
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

/** Run `body` with the UI in `language`, restoring English after. */
async function inLanguage(language: string, body: () => Promise<void>) {
  await i18n.changeLanguage(language);
  try {
    await body();
  } finally {
    await i18n.changeLanguage("en");
  }
}

describe("category registration", () => {
  it("registers the Complete / Snooze category when permission is ensured", async () => {
    await ensureNotifyPermission();
    const [identifier, actions] = mocks().category.mock.calls[0];
    expect(identifier).toBe(REMINDER_CATEGORY_ID);
    expect(actions).toHaveLength(2);
    // The button titles are the localized catalogs -- the OS renders them verbatim.
    expect(actions.map((a: { identifier: string }) => a.identifier)).toEqual([
      REMINDER_COMPLETE_ACTION,
      REMINDER_SNOOZE_ACTION,
    ]);
    expect(actions.map((a: { buttonTitle: string }) => a.buttonTitle)).toEqual([
      i18n.t("reminder.actionComplete"),
      i18n.t("reminder.actionSnooze"),
    ]);
  });

  it("keeps going when the native category call is unavailable, and retries next time", async () => {
    // Queued before the switch: the language change itself may be what registers first.
    mocks().category.mockRejectedValueOnce(new Error("unavailable"));
    await inLanguage("da", async () => {
      await expect(ensureNotifyPermission()).resolves.toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await ensureNotificationSetup();
      // The failed registration, then one retry -- and no more once it succeeded.
      expect(mocks().category).toHaveBeenCalledTimes(2);
    });
  });

  it("registers once per language, not on every reconcile", async () => {
    await ensureNotificationSetup();
    mocks().category.mockClear();
    await ensureNotificationSetup();
    await ensureNotificationSetup();
    expect(mocks().category).not.toHaveBeenCalled();

    await inLanguage("da", async () => {
      await ensureNotificationSetup();
      await ensureNotificationSetup();
      expect(mocks().category).toHaveBeenCalledTimes(1);
      const [, actions] = mocks().category.mock.calls[0];
      expect(actions[0].buttonTitle).toBe(i18n.t("reminder.actionComplete", { lng: "da" }));
    });
  });
});

describe("permission", () => {
  it("prompts only while the answer is open", async () => {
    mocks().permissions.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    });
    await ensureNotifyPermission();
    expect(mocks().permissions.requestPermissionsAsync).toHaveBeenCalledTimes(1);

    await ensureNotifyPermission(); // granted now
    expect(mocks().permissions.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe("scheduling", () => {
  it("leaves the plain sink (habit nudges, focus alerts) non-interactive", async () => {
    scheduleIO.schedule("Task", "body", 123, "r1");
    await Promise.resolve();
    const call = mocks().schedule.mock.calls[0][0];
    expect(call.content.categoryIdentifier).toBeUndefined();
    expect(call.content.data).toBeUndefined();
  });
});

describe("response surface", () => {
  it("delivers a pressed action to the live listener, parsed", () => {
    const handler = jest.fn();
    onReminderResponse(handler);
    const listener = mocks().emitter.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(rawResponse({ actionIdentifier: REMINDER_SNOOZE_ACTION, data: { reminderId: "r1" } }));
    expect(handler).toHaveBeenCalledWith({
      reminderId: "r1",
      actionIdentifier: REMINDER_SNOOZE_ACTION,
      notificationDate: 123,
    });
  });

  it("drops a plain tap on the banner -- it is not an action this app handles", () => {
    const handler = jest.fn();
    onReminderResponse(handler);
    const listener = mocks().emitter.addNotificationResponseReceivedListener.mock.calls[0][0];
    // The focus alert (and every other notification) carries no category, so it can only ever
    // answer with the default action: the OS has no buttons to press on it.
    listener(rawResponse({}));
    listener(rawResponse({ identifier: "atlas.focus.phase" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("falls back to the request identifier when the notification carried no data", () => {
    const handler = jest.fn();
    onReminderResponse(handler);
    const listener = mocks().emitter.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(rawResponse({ actionIdentifier: REMINDER_COMPLETE_ACTION }));
    // Older builds scheduled reminders before the data payload existed; the identifier is the same
    // reminder id either way.
    expect(handler).toHaveBeenCalledWith({
      reminderId: "r1",
      actionIdentifier: REMINDER_COMPLETE_ACTION,
      notificationDate: 123,
    });
  });

  it("returns an unsubscribe that works even when the emitter is unavailable", () => {
    mocks().emitter.addNotificationResponseReceivedListener.mockImplementationOnce(() => {
      throw new Error("unavailable");
    });
    expect(() => {
      const unsub = onReminderResponse(jest.fn());
      unsub();
    }).not.toThrow();
  });

  it("reads the cold-start response from the native cache", () => {
    mocks().emitter.getLastNotificationResponse.mockReturnValueOnce(
      rawResponse({ actionIdentifier: REMINDER_COMPLETE_ACTION }),
    );
    expect(launchReminderResponse()).toEqual({
      reminderId: "r1",
      actionIdentifier: REMINDER_COMPLETE_ACTION,
      notificationDate: 123,
    });
    expect(launchReminderResponse()).toBeNull(); // nothing cached again
    clearLaunchReminderResponse();
    expect(mocks().emitter.clearLastNotificationResponse).toHaveBeenCalled();
  });
});

describe("cancel everything", () => {
  it("cancels every booked notification and clears the delivered ones", async () => {
    await cancelAllAppNotifications();
    expect(mocks().cancelAll).toHaveBeenCalledTimes(1);
    // A delivered banner still in the tray shows the same plaintext title.
    expect(mocks().dismissAll).toHaveBeenCalledTimes(1);
  });

  it("tells subscribers and moves the generation on, so an in-flight reconcile stands down", async () => {
    const listener = jest.fn();
    const off = onNotificationsReset(listener);
    const before = notificationGeneration();
    await cancelAllAppNotifications();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(notificationGeneration()).not.toBe(before);
    off();
    await cancelAllAppNotifications();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("never throws when the native calls are unavailable", async () => {
    mocks().cancelAll.mockRejectedValueOnce(new Error("unavailable"));
    mocks().dismissAll.mockRejectedValueOnce(new Error("unavailable"));
    await expect(cancelAllAppNotifications()).resolves.toBeUndefined();
  });
});

describe("what is booked with the OS", () => {
  /** A pending request as `getAllScheduledNotificationsAsync` returns it. */
  const booked = (identifier: string, content: Record<string, unknown> = {}) => ({
    identifier,
    content: { title: "x", body: null, data: {}, ...content },
    trigger: { type: "date", value: 1 },
  });

  beforeEach(() => {
    mocks().getAll.mockResolvedValue([
      booked("r-category", { categoryIdentifier: REMINDER_CATEGORY_ID }),
      booked("r-data", { data: { reminderId: "r-data" } }),
      booked("habit:h1:2026-09-25"),
      booked("atlas.focus.phase"),
      booked("someone-else"),
    ]);
  });

  it("lists task reminders by their category or reminder data", async () => {
    expect((await bookedNotificationIds("reminder")).sort()).toEqual(["r-category", "r-data"]);
  });

  it("answers empty when the OS cannot be asked", async () => {
    mocks().getAll.mockRejectedValueOnce(new Error("unavailable"));
    expect(await bookedNotificationIds("reminder")).toEqual([]);
  });
});
