import { render, screen, fireEvent } from "@testing-library/react-native";
import { MobileBottomNav } from "./MobileBottomNav";

describe("MobileBottomNav", () => {
  it("marks the active destination as selected", async () => {
    await render(
      <MobileBottomNav activePath="/upcoming" onNavigate={jest.fn()} onOpenMenu={jest.fn()} />,
    );

    expect(screen.getByLabelText("Upcoming").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Today").props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText("Inbox").props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText("Menu").props.accessibilityState.selected).toBe(false);
  });

  it("navigates to routes on press", async () => {
    const onNavigate = jest.fn();
    await render(
      <MobileBottomNav activePath="/today" onNavigate={onNavigate} onOpenMenu={jest.fn()} />,
    );

    await fireEvent.press(screen.getByLabelText("Inbox"));
    expect(onNavigate).toHaveBeenCalledWith("/inbox");

    await fireEvent.press(screen.getByLabelText("Upcoming"));
    expect(onNavigate).toHaveBeenCalledWith("/upcoming");
  });

  it("opens the menu modal on Menu press", async () => {
    const onOpenMenu = jest.fn();
    await render(
      <MobileBottomNav activePath="/today" onNavigate={jest.fn()} onOpenMenu={onOpenMenu} />,
    );

    await fireEvent.press(screen.getByLabelText("Menu"));
    expect(onOpenMenu).toHaveBeenCalled();
  });
});
