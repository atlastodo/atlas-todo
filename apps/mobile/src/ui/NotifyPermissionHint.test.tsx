import { Linking } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { LocalStore } from "@atlas/client-core";
import { withApp } from "../testutil";
import { OnboardingProvider } from "../data/OnboardingContext";
import { NotifyPermissionHint } from "./NotifyPermissionHint";
import { OnboardingModal } from "./OnboardingModal";

jest.mock("../lib/notify", () => {
  // Created inside the factory (it runs before any outer const exists): read back off the mock.
  const permission = { current: "granted" };
  return {
    __esModule: true,
    permission,
    readNotifyPermission: jest.fn(async () => permission.current),
    onNotifyPermissionChange: jest.fn(() => () => {}),
    ensureNotifyPermission: jest.fn(async () => true),
  };
});

const seam = () =>
  jest.requireMock("../lib/notify") as {
    permission: { current: string };
    ensureNotifyPermission: jest.Mock;
  };

beforeEach(() => {
  seam().permission.current = "granted";
  seam().ensureNotifyPermission.mockClear();
});

/** The permission read is async; let it land. */
const settle = () => act(async () => {});

describe("NotifyPermissionHint (native)", () => {
  it("points a phone that denied notifications to the system settings", async () => {
    seam().permission.current = "denied";
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await render(<NotifyPermissionHint />);
    await settle();

    expect(screen.getByText(/Allow them in your device settings/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open settings" }));
    expect(openSettings).toHaveBeenCalled();
    expect(seam().ensureNotifyPermission).not.toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it("asks again while asking is still possible", async () => {
    seam().permission.current = "default";
    await render(<NotifyPermissionHint />);
    await settle();

    await fireEvent.press(screen.getByRole("button", { name: "Enable notifications" }));
    expect(seam().ensureNotifyPermission).toHaveBeenCalled();
  });

  it("says nothing once notifications are allowed", async () => {
    await render(<NotifyPermissionHint />);
    await settle();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("onboarding's reminders step", () => {
  it("asks for permission even though reminders were already on", async () => {
    seam().permission.current = "default";
    const App = withApp(new LocalStore("test"));
    await render(
      <App>
        <OnboardingProvider>
          <OnboardingModal />
        </OnboardingProvider>
      </App>,
    );
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByLabelText("Continue"));
    expect(screen.getByText("Customize your tools")).toBeTruthy();
    await settle();
    // The hint sits under the (default-on) Reminders toggle.
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
    expect(seam().ensureNotifyPermission).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("Continue"));
    expect(seam().ensureNotifyPermission).toHaveBeenCalledTimes(1);
  });
});
