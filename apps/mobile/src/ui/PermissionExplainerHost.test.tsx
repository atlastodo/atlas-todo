import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  DISMISSED_KEY,
  explainExactAlarms,
  explainNotifications,
  explainStorage,
} from "../lib/permissionExplainer";
import { PermissionExplainerHost } from "./PermissionExplainerHost";

jest.mock("../lib/notify", () => {
  const permission = { current: "default" };
  const exactAlarms = { current: "unsupported" };
  return {
    __esModule: true,
    permission,
    exactAlarms,
    readExactAlarms: jest.fn(() => exactAlarms.current),
    openExactAlarmSettings: jest.fn(async () => true),
    readNotifyPermission: jest.fn(async () => permission.current),
    ensureNotifyPermission: jest.fn(async () => true),
  };
});

const seam = () =>
  jest.requireMock("../lib/notify") as {
    permission: { current: string };
    exactAlarms: { current: string };
    ensureNotifyPermission: jest.Mock;
    openExactAlarmSettings: jest.Mock;
  };

/** Let the async reads (permission, dismissal flag) land and the dialog render. */
const settle = () => act(async () => {});

function fakeStorage(persisted: boolean, grants = true) {
  return {
    persisted: jest.fn(async () => persisted),
    persist: jest.fn(async () => grants),
  } as unknown as StorageManager & { persist: jest.Mock };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  seam().permission.current = "default";
  seam().ensureNotifyPermission.mockReset().mockResolvedValue(true);
  seam().exactAlarms.current = "unsupported";
  seam().openExactAlarmSettings.mockReset().mockResolvedValue(true);
});

describe("storage explainer", () => {
  it("explains before persist(), which runs only from Keep my data", async () => {
    await render(<PermissionExplainerHost />);
    const storage = fakeStorage(false);
    let done!: Promise<void>;
    await act(async () => {
      done = explainStorage(storage);
    });
    await settle();

    expect(screen.getByText("Keep your data on this device")).toBeTruthy();
    expect(storage.persist).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Keep my data"));
    await act(() => done);

    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keep your data on this device")).toBeNull();
  });

  it("shows nothing when already persisted or persist() is unsupported", async () => {
    await render(<PermissionExplainerHost />);
    await act(() => explainStorage(fakeStorage(true)));
    await act(() => explainStorage({} as StorageManager));
    await act(() => explainStorage(undefined));
    expect(screen.queryByText("Keep your data on this device")).toBeNull();
  });

  it("remembers Not now and does not ask again", async () => {
    await render(<PermissionExplainerHost />);
    const storage = fakeStorage(false);
    let done!: Promise<void>;
    await act(async () => {
      done = explainStorage(storage);
    });
    await settle();
    await fireEvent.press(screen.getByLabelText("Not now"));
    await act(() => done);
    expect(await AsyncStorage.getItem(DISMISSED_KEY.storage)).toBe("1");

    await act(() => explainStorage(storage));
    expect(screen.queryByText("Keep your data on this device")).toBeNull();
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("turns into guidance when the browser refuses", async () => {
    await render(<PermissionExplainerHost />);
    const storage = fakeStorage(false, false);
    let done!: Promise<void>;
    await act(async () => {
      done = explainStorage(storage);
    });
    await settle();
    await fireEvent.press(screen.getByLabelText("Keep my data"));
    await settle();

    expect(screen.getByText("The browser didn't agree")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Got it"));
    await act(() => done);
    expect(screen.queryByText("The browser didn't agree")).toBeNull();
  });
});

describe("notifications explainer", () => {
  it("explains, then asks from Turn on notifications", async () => {
    await render(<PermissionExplainerHost />);
    let granted!: Promise<boolean>;
    await act(async () => {
      granted = explainNotifications();
    });
    await settle();

    expect(screen.getByText("Get reminders on time")).toBeTruthy();
    expect(seam().ensureNotifyPermission).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Turn on notifications"));
    expect(await granted).toBe(true);
    expect(seam().ensureNotifyPermission).toHaveBeenCalledTimes(1);
  });

  it("says nothing once permission is decided", async () => {
    await render(<PermissionExplainerHost />);
    seam().permission.current = "granted";
    expect(await explainNotifications()).toBe(true);
    seam().permission.current = "denied";
    expect(await explainNotifications()).toBe(false);
    seam().permission.current = "unsupported";
    expect(await explainNotifications()).toBe(false);
    await settle();
    expect(screen.queryByText("Get reminders on time")).toBeNull();
  });

  it("keeps implicit asks quiet after Not now, but explains again when asked directly", async () => {
    await render(<PermissionExplainerHost />);
    let granted!: Promise<boolean>;
    await act(async () => {
      granted = explainNotifications({ implicit: true });
    });
    await settle();
    await fireEvent.press(screen.getByLabelText("Not now"));
    expect(await granted).toBe(false);

    expect(await explainNotifications({ implicit: true })).toBe(false);
    await settle();
    expect(screen.queryByText("Get reminders on time")).toBeNull();

    // Turning reminders on by hand is a direct request: it explains again.
    await act(async () => {
      void explainNotifications();
    });
    await settle();
    expect(screen.getByText("Get reminders on time")).toBeTruthy();
  });

  it("shows how to fix it when the prompt is refused", async () => {
    seam().ensureNotifyPermission.mockResolvedValue(false);
    await render(<PermissionExplainerHost />);
    let granted!: Promise<boolean>;
    await act(async () => {
      granted = explainNotifications();
    });
    await settle();
    await fireEvent.press(screen.getByLabelText("Turn on notifications"));
    await settle();

    expect(screen.getByText("Notifications are off")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Got it"));
    expect(await granted).toBe(false);
  });
});

describe("exact alarms explainer", () => {
  it("explains, then opens Alarms & reminders from Open settings", async () => {
    seam().exactAlarms.current = "denied";
    await render(<PermissionExplainerHost />);
    let opened!: Promise<boolean>;
    await act(async () => {
      opened = explainExactAlarms();
    });
    await settle();

    expect(screen.getByText("Deliver reminders on the minute")).toBeTruthy();
    expect(seam().openExactAlarmSettings).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Open settings"));
    expect(await opened).toBe(true);
    expect(seam().openExactAlarmSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deliver reminders on the minute")).toBeNull();
  });

  it("says nothing where reminders already fire on time", async () => {
    await render(<PermissionExplainerHost />);
    seam().exactAlarms.current = "granted";
    expect(await explainExactAlarms()).toBe(false);
    seam().exactAlarms.current = "unsupported";
    expect(await explainExactAlarms()).toBe(false);
    await settle();
    expect(screen.queryByText("Deliver reminders on the minute")).toBeNull();
  });

  it("says where to go when settings can't be opened", async () => {
    seam().exactAlarms.current = "denied";
    seam().openExactAlarmSettings.mockResolvedValue(false);
    await render(<PermissionExplainerHost />);
    await act(async () => {
      void explainExactAlarms();
    });
    await settle();

    await fireEvent.press(screen.getByLabelText("Open settings"));
    await settle();
    expect(screen.getByText(/Apps → Atlas Todo → Alarms & reminders/)).toBeTruthy();
  });

  it("keeps an implicit ask quiet after Not now", async () => {
    seam().exactAlarms.current = "denied";
    await render(<PermissionExplainerHost />);
    let opened!: Promise<boolean>;
    await act(async () => {
      opened = explainExactAlarms({ implicit: true });
    });
    await settle();
    await fireEvent.press(screen.getByLabelText("Not now"));
    expect(await opened).toBe(false);
    expect(await AsyncStorage.getItem(DISMISSED_KEY.exactAlarms)).toBe("1");

    expect(await explainExactAlarms({ implicit: true })).toBe(false);
    await settle();
    expect(screen.queryByText("Deliver reminders on the minute")).toBeNull();
  });
});
