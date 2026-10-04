import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { lastCopiedText } from "../testutil";
import { RecoveryPhraseModal } from "./RecoveryPhraseModal";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

describe("RecoveryPhraseModal", () => {
  it("copies the phrase and closes once the user has saved it", async () => {
    // Copying a secret arms a one-minute clipboard clear; fake timers keep it from outliving the test.
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      await render(<RecoveryPhraseModal phrase={PHRASE} onClose={onClose} />);

      await fireEvent.press(screen.getByText("Copy phrase"));
      await waitFor(() => expect(lastCopiedText()).toBe(PHRASE));
      expect(await screen.findByText("Copied to clipboard")).toBeTruthy();

      await fireEvent.press(screen.getByText("I have saved my recovery phrase"));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("clears the copied phrase from the clipboard after a minute", async () => {
    jest.useFakeTimers();
    try {
      await render(<RecoveryPhraseModal phrase={PHRASE} onClose={() => {}} />);
      await fireEvent.press(screen.getByText("Copy phrase"));
      await waitFor(() => expect(lastCopiedText()).toBe(PHRASE));

      await act(async () => {
        jest.advanceTimersByTime(59_000);
      });
      expect(lastCopiedText()).toBe(PHRASE);
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      await waitFor(() => expect(lastCopiedText()).toBe(""));
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("renders nothing without a phrase", async () => {
    await render(<RecoveryPhraseModal phrase={null} onClose={() => {}} />);
    expect(screen.queryByText("Emergency recovery phrase")).toBeNull();
  });
});
