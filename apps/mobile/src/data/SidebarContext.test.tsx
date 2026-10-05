import { Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { SidebarProvider, useSidebar } from "./SidebarContext";

function setWidth(width: number) {
  // On the module object itself (not an import namespace copy), so `useIsTablet` sees it.
  jest
    .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions")
    .mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
}

function Probe() {
  const { collapsed, toggle } = useSidebar();
  return (
    <Text accessibilityRole="button" onPress={toggle}>
      {collapsed ? "rail" : "full"}
    </Text>
  );
}

/** A tablet starts as the icon rail, a desktop expanded. */
describe("SidebarProvider", () => {
  afterEach(() => jest.restoreAllMocks());

  it("starts a tablet as the rail and lets it expand", async () => {
    setWidth(820);
    await render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByText("rail")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));
    expect(screen.getByText("full")).toBeTruthy();
  });

  it("starts a desktop expanded", async () => {
    setWidth(1280);
    await render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByText("full")).toBeTruthy();
  });
});
