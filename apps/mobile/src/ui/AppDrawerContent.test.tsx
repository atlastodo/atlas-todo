import { render, screen, fireEvent } from "@testing-library/react-native";
import { AppDrawerContent, type SidebarSection } from "./AppDrawerContent";
import { Bell, Hash, Sun, Settings } from "./icons";

/** The sidebar / drawer nav list. Routing is an injected `onNavigate`, so no expo-router is needed. */
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
    key: "settings",
    items: [{ key: "settings", label: "Settings", icon: Settings, href: "/settings" }],
  },
];

describe("AppDrawerContent", () => {
  it("renders every nav row and navigates on press", async () => {
    const onNavigate = jest.fn();
    await render(
      <AppDrawerContent
        sections={SECTIONS}
        activeHref="/today"
        brand="Atlas Todo"
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Atlas Todo")).toBeTruthy();
    for (const label of ["Today", "Notifications", "Settings"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    await fireEvent.press(screen.getByLabelText("Settings"));
    expect(onNavigate).toHaveBeenCalledWith("/settings");
  });

  it("marks the active row as selected and others as not", async () => {
    await render(
      <AppDrawerContent
        sections={SECTIONS}
        activeHref="/today"
        brand="Atlas Todo"
        onNavigate={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Today").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Settings").props.accessibilityState.selected).toBe(false);
  });

  it("toggles a folder row instead of navigating, and reports whether it is open", async () => {
    const onNavigate = jest.fn();
    const onToggle = jest.fn();
    const sections: SidebarSection[] = [
      {
        key: "projects",
        items: [
          { key: "f1", label: "Work", icon: Hash, href: null, expanded: true, onToggle },
          { key: "p1", label: "Acme", icon: Hash, href: "/project/p1", depth: 1 },
        ],
      },
    ];
    await render(
      <AppDrawerContent
        sections={sections}
        activeHref={null}
        brand="Atlas Todo"
        onNavigate={onNavigate}
      />,
    );

    // A folder is a container, not a destination: pressing it opens/closes it and goes nowhere.
    expect(screen.getByLabelText("Work").props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(screen.getByLabelText("Work"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();

    // The project nested under it still navigates.
    await fireEvent.press(screen.getByLabelText("Acme"));
    expect(onNavigate).toHaveBeenCalledWith("/project/p1");
  });

  it("shows a count badge only where one is set and positive", async () => {
    await render(
      <AppDrawerContent
        sections={SECTIONS}
        activeHref={null}
        brand="Atlas Todo"
        onNavigate={jest.fn()}
      />,
    );
    // The badge count renders next to Notifications; no other row has one.
    expect(screen.getByText("3")).toBeTruthy();
  });

  describe("collapsed rail", () => {
    /** The rect the hover tooltip anchors to; react-native-web would measure the real row node. */
    const RECT = { right: 72, top: 10, height: 40 };

    const renderRail = () =>
      render(
        <AppDrawerContent
          sections={SECTIONS}
          activeHref="/today"
          brand="Atlas Todo"
          onBrandPress={jest.fn()}
          onNavigate={jest.fn()}
          collapsed
        />,
      );

    it("renders icon-only rows: no label text, and a badge collapses to a dot", async () => {
      await renderRail();
      for (const label of ["Today", "Notifications", "Settings"]) {
        expect(screen.getByLabelText(label)).toBeTruthy();
        expect(screen.queryByText(label)).toBeNull();
      }
      // The count pill becomes a bare dot -- no readable count text anywhere.
      expect(screen.queryByText("3")).toBeNull();
    });

    it("spells out a row's label in a hover tooltip, and takes it back on hover-out", async () => {
      await renderRail();
      const row = screen.getByLabelText("Today");
      expect(screen.queryByText("Today")).toBeNull();

      // On web the hover event's `currentTarget` is the row's DOM node; the stub plays that part.
      await fireEvent(row, "hoverIn", { currentTarget: { getBoundingClientRect: () => RECT } });
      expect(screen.getByText("Today")).toBeTruthy();

      await fireEvent(row, "hoverOut");
      expect(screen.queryByText("Today")).toBeNull();
    });

    it("spells out the rail logo's brand on hover", async () => {
      await renderRail();
      const logo = screen.getByLabelText("Atlas Todo");
      expect(screen.queryByText("Atlas Todo")).toBeNull();

      await fireEvent(logo, "hoverIn", { currentTarget: { getBoundingClientRect: () => RECT } });
      expect(screen.getByText("Atlas Todo")).toBeTruthy();
    });
  });
});
