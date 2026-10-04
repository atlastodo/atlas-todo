import { Component, type ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { CrashScreen } from "./CrashScreen";
import { lastCopiedText } from "../testutil";

describe("CrashScreen", () => {
  it("says the report is only saved when it could not be sent", async () => {
    // Claiming "sent" while a report sits in the offline queue would be a lie the user could catch.
    await render(<CrashScreen error={new Error("x")} report="queued" />);
    expect(
      screen.getByText("A report was saved and will be sent when you are back online."),
    ).toBeTruthy();

    await screen.rerender(<CrashScreen error={new Error("x")} report="failed" />);
    expect(screen.getByText("The report could not be sent.")).toBeTruthy();
  });

  it("retries only when a retry is offered", async () => {
    const onRetry = jest.fn();
    await render(<CrashScreen error={new Error("x")} report="sent" onRetry={onRetry} />);

    await fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the escape action when the boundary cannot offer one", async () => {
    // The root boundary has no router to navigate with, so it passes no handler.
    await render(<CrashScreen error={new Error("x")} report="sent" onRetry={jest.fn()} />);
    expect(screen.queryByText("Go home")).toBeNull();
  });

  it("labels the escape action for what it actually does", async () => {
    // The drawer boundary goes home; the task detail pops back. One shared screen, honest labels.
    const onGoHome = jest.fn();
    await render(
      <CrashScreen error={new Error("x")} report="sent" onGoHome={onGoHome} homeLabel="Back" />,
    );

    await fireEvent.press(screen.getByText("Back"));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it("copies the error for pasting into a bug report", async () => {
    await render(<CrashScreen error={new Error("kaboom")} report="failed" />);

    await fireEvent.press(screen.getByText("Copy details"));

    await screen.findByText("Copy details");
    expect(lastCopiedText()).toContain("kaboom");
  });

  it("renders after a real React throw", async () => {
    // The rest of this file drives the fallback directly. This proves it survives being mounted the
    // way it actually is -- by a boundary, replacing a subtree that just threw during render --
    // without pulling expo-router's module graph into the test.
    // React reports the throw it hands to the boundary; that report is part of the scenario.
    const reported = jest.spyOn(console, "error").mockImplementation(() => {});
    await render(
      <TestBoundary>
        <Exploding />
      </TestBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("render exploded")).toBeTruthy();
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });
});

function Exploding(): ReactNode {
  throw new Error("render exploded");
}

/** A six-line stand-in for expo-router's `Try`, so no router is needed to exercise the fallback. */
class TestBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    return error ? <CrashScreen error={error} report="sent" /> : this.props.children;
  }
}
