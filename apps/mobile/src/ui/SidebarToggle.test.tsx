import { render, screen, fireEvent } from "@testing-library/react-native";
import { SidebarProvider } from "../data/SidebarContext";
import { SidebarToggle } from "./SidebarToggle";

/**
 * The sidebar collapse/expand toggle. The rail's icon-only button spells out its action on hover
 * (web only); the test drives the collapse through the real provider, since `collapsed` decides both
 * the tooltip's presence and its label.
 */
describe("SidebarToggle", () => {
  it("shows a hover tooltip only while collapsed (the rail's icon-only state)", async () => {
    await render(
      <SidebarProvider>
        <SidebarToggle />
      </SidebarProvider>,
    );

    // The expanded sidebar's header has the brand text beside the toggle, so no tooltip: hovering
    // there (if a mouse did) shows nothing.
    await fireEvent(screen.getByLabelText("Hide sidebar"), "hoverIn", {
      currentTarget: { getBoundingClientRect: () => ({ right: 288, top: 10, height: 36 }) },
    });
    expect(screen.queryByText("Hide sidebar")).toBeNull();

    // Collapse: the icon-only rail toggle gains the tooltip.
    await fireEvent.press(screen.getByLabelText("Hide sidebar"));
    expect(screen.getByLabelText("Show sidebar")).toBeTruthy();
    expect(screen.queryByText("Show sidebar")).toBeNull();

    await fireEvent(screen.getByLabelText("Show sidebar"), "hoverIn", {
      currentTarget: { getBoundingClientRect: () => ({ right: 72, top: 10, height: 36 }) },
    });
    expect(screen.getByText("Show sidebar")).toBeTruthy();
  });
});
