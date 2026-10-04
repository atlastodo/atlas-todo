import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { MobileMenuModal } from "./MobileMenuModal";
import type { SidebarSection } from "./AppDrawerContent";
import { Bell, Hash, ListFilter, Settings, Sun } from "./icons";

const SECTIONS: SidebarSection[] = [
  {
    key: "smart",
    items: [{ key: "today", label: "Today", icon: Sun, href: "/today" }],
  },
  {
    key: "utility",
    items: [
      {
        key: "notifications",
        label: "Notifications",
        icon: Bell,
        href: "/notifications",
        badge: 3,
      },
    ],
  },
  {
    key: "projects",
    items: [{ key: "p1", label: "Work Project", icon: Hash, href: "/project/p1" }],
  },
  {
    key: "filters",
    items: [{ key: "f1", label: "Urgent Filter", icon: ListFilter, href: "/filter/f1" }],
  },
  {
    key: "settings",
    items: [{ key: "settings", label: "Settings", icon: Settings, href: "/settings" }],
  },
];

describe("MobileMenuModal", () => {
  it("renders menu items and header", async () => {
    await render(
      <MobileMenuModal
        visible={true}
        onClose={jest.fn()}
        sections={SECTIONS}
        activeHref="/today"
        onNavigate={jest.fn()}
        brand="Atlas Todo"
        statusSlot={<Text>Status OK</Text>}
      />,
    );

    expect(screen.getByText("Atlas Todo")).toBeTruthy();
    expect(screen.getByText("Status OK")).toBeTruthy();
    expect(screen.getByText("Smart lists")).toBeTruthy();
    expect(screen.getByText("Views & Tools")).toBeTruthy();
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Today")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.getByLabelText("Work Project")).toBeTruthy();
    expect(screen.getByLabelText("Urgent Filter")).toBeTruthy();
    expect(screen.getByLabelText("Settings")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // badge count
  });

  it("navigates and closes on item press", async () => {
    const onClose = jest.fn();
    const onNavigate = jest.fn();
    await render(
      <MobileMenuModal
        visible={true}
        onClose={onClose}
        sections={SECTIONS}
        activeHref="/today"
        onNavigate={onNavigate}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Settings"));
    expect(onClose).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith("/settings");
  });

  it("closes when tapping the close button", async () => {
    const onClose = jest.fn();
    await render(
      <MobileMenuModal
        visible={true}
        onClose={onClose}
        sections={SECTIONS}
        activeHref="/today"
        onNavigate={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getAllByLabelText("Close")[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});
