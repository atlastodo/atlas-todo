/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
// Force the web platform so the inline-highlight overlay + Backspace-unlink branch is active;
// jest-expo defaults to a native OS. Done before any render, which is when the branch is read.
(Platform as { OS: string }).OS = "web";

import { render, screen, fireEvent } from "@testing-library/react-native";
import { QuickAdd } from "./QuickAdd";

// A fixed "now" so the parser is deterministic (a Wednesday; "tomorrow" resolves cleanly).
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

/** Focus first: the chips only exist while quick-add is in use, as they do for a real user typing. */
async function compose(text: string) {
  await render(<QuickAdd onAdd={jest.fn()} now={NOW} />);
  const input = screen.getByLabelText("Add a task");
  await fireEvent(input, "focus");
  await fireEvent.changeText(input, text);
  return input;
}

describe("QuickAdd web date highlight/unlink", () => {
  it("shows a parsed due chip for a recognised trailing date phrase", async () => {
    await compose("pay rent tomorrow");
    // The date chip carries what the phrase meant, rather than its own field name.
    expect(screen.getByText(/Tomorrow/)).toBeTruthy();
  });

  it("unlinks the date on Backspace with the caret right after the phrase", async () => {
    const text = "pay rent tomorrow";
    const input = await compose(text);
    // Caret collapsed at the end of the boxed phrase (which is the end of the string here).
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });
    // The date is gone from the chip: the phrase is now literal title text.
    expect(screen.queryByText(/Tomorrow/)).toBeNull();
    expect(screen.getByText("Due date")).toBeTruthy();
  });

  it("does not unlink when the caret is not at the end of the phrase", async () => {
    const input = await compose("pay rent tomorrow");
    await fireEvent(input, "selectionChange", { nativeEvent: { selection: { start: 3, end: 3 } } });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });
    expect(screen.getByText(/Tomorrow/)).toBeTruthy();
  });

  it("re-links the date once the unlinked phrase is edited away and retyped", async () => {
    const text = "pay rent tomorrow";
    const input = await compose(text);
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });
    expect(screen.queryByText(/Tomorrow/)).toBeNull(); // unlinked

    // Edit the phrase out ("tomorrow" -> "torrow"): the stale ignore must be forgotten, so typing
    // the phrase back re-links it instead of staying unlinked forever.
    await fireEvent.changeText(input, "pay rent torrow");
    await fireEvent.changeText(input, "pay rent tomorrow");
    expect(screen.getByText(/Tomorrow/)).toBeTruthy();
  });

  it("keeps the unlink while the phrase is still in the text", async () => {
    // The reverse case: unlinking "call fri" (the person) must survive later edits that do not
    // remove the phrase itself.
    const text = "call fri";
    const input = await compose(text);
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });
    expect(screen.queryByText(/Friday/)).toBeNull();

    await fireEvent.changeText(input, "call fri about the boiler");
    expect(screen.queryByText(/Friday/)).toBeNull();
  });

  it("unlinks #project on Backspace with the caret right after the token, keeping it in the title", async () => {
    const onAdd = jest.fn();
    await render(<QuickAdd onAdd={onAdd} now={NOW} projects={[{ id: "p1", name: "work" }]} />);
    const input = screen.getByLabelText("Add a task");
    await fireEvent(input, "focus");
    const text = "buy milk #work";
    await fireEvent.changeText(input, text);

    // Initial state: #work chip is present
    expect(screen.getByText("#work")).toBeTruthy();

    // Position caret directly after #work
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });

    // Project chip is removed
    expect(screen.queryByText("#work")).toBeNull();

    // Submit and assert the title keeps "#work" and project_id is not set
    await fireEvent(input, "submitEditing");
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "buy milk #work",
      }),
    );
    expect(onAdd.mock.calls[0][0].project_id).toBeUndefined();
  });

  it("re-links #project after dismissing when deleting 't' and re-adding 't' or rewriting", async () => {
    const onAdd = jest.fn();
    await render(<QuickAdd onAdd={onAdd} now={NOW} projects={[{ id: "p1", name: "project" }]} />);
    const input = screen.getByLabelText("Add a task");
    await fireEvent(input, "focus");
    await fireEvent.changeText(input, "buy milk #project");

    expect(screen.getByText("#project")).toBeTruthy();

    // Position caret directly after #project and press Backspace to unlink
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: 17, end: 17 } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });

    expect(screen.queryByText("#project")).toBeNull();

    // Delete 't'
    await fireEvent.changeText(input, "buy milk #projec");
    expect(screen.queryByText("#project")).toBeNull();

    // Re-add 't'
    await fireEvent.changeText(input, "buy milk #project");
    expect(screen.getByText("#project")).toBeTruthy();
  });

  it("unlinks @label on Backspace with the caret right after the token, keeping it in the title", async () => {
    const onAdd = jest.fn();
    await render(<QuickAdd onAdd={onAdd} now={NOW} labels={[{ id: "l1", name: "urgent" }]} />);
    const input = screen.getByLabelText("Add a task");
    await fireEvent(input, "focus");
    const text = "call client @urgent";
    await fireEvent.changeText(input, text);

    // Initial state: @urgent chip is present
    expect(screen.getByText("@urgent")).toBeTruthy();

    // Position caret directly after @urgent
    await fireEvent(input, "selectionChange", {
      nativeEvent: { selection: { start: text.length, end: text.length } },
    });
    await fireEvent(input, "keyPress", {
      nativeEvent: { key: "Backspace" },
      preventDefault: jest.fn(),
    });

    // Label chip is removed
    expect(screen.queryByText("@urgent")).toBeNull();

    // Submit and assert the title keeps "@urgent" and label is not tagged
    await fireEvent(input, "submitEditing");
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "call client @urgent",
      }),
    );
    expect(onAdd.mock.calls[0][0].label_ids).toBeUndefined();
  });
});

describe("QuickAdd description field on web", () => {
  it("renders a description input below the title on web and saves notes upon submission", async () => {
    const onAdd = jest.fn();
    await render(<QuickAdd onAdd={onAdd} now={NOW} />);
    const titleInput = screen.getByLabelText("Add a task");
    await fireEvent(titleInput, "focus");
    await fireEvent.changeText(titleInput, "Submit expenses");

    const descInput = screen.getByPlaceholderText("Description...");
    expect(descInput).toBeTruthy();
    await fireEvent.changeText(descInput, "Include hotel and flight receipts");
    await fireEvent(titleInput, "submitEditing");

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Submit expenses",
        notes: "Include hotel and flight receipts",
      }),
    );
  });

  it("keeps description field hidden until task creation is engaged", async () => {
    await render(<QuickAdd onAdd={jest.fn()} now={NOW} />);
    expect(screen.queryByPlaceholderText("Description...")).toBeNull();

    const titleInput = screen.getByLabelText("Add a task");
    await fireEvent(titleInput, "focus");
    expect(screen.getByPlaceholderText("Description...")).toBeTruthy();
  });

  it("submits with Cmd+Enter from the description field", async () => {
    const onAdd = jest.fn();
    await render(<QuickAdd onAdd={onAdd} now={NOW} />);
    const titleInput = screen.getByLabelText("Add a task");
    await fireEvent(titleInput, "focus");
    await fireEvent.changeText(titleInput, "Deploy release");

    const descInput = screen.getByPlaceholderText("Description...");
    await fireEvent(descInput, "focus");
    await fireEvent.changeText(descInput, "Tag v1.2.0");
    await fireEvent(descInput, "keyPress", {
      nativeEvent: { key: "Enter", metaKey: true, preventDefault: jest.fn() },
    });

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Deploy release",
        notes: "Tag v1.2.0",
      }),
    );
  });

  describe("suggestion keyboard navigation", () => {
    async function composeWithLabels(text: string, onAdd: (input: unknown) => void) {
      await render(
        <QuickAdd
          onAdd={onAdd}
          now={NOW}
          labels={[
            { id: "l1", name: "home" },
            { id: "l2", name: "hobby" },
          ]}
        />,
      );
      const input = screen.getByLabelText("Add a task");
      await fireEvent(input, "focus");
      await fireEvent.changeText(input, text);
      return input;
    }

    it("Enter accepts the highlighted suggestion instead of committing the raw text", async () => {
      const onAdd = jest.fn();
      const input = await composeWithLabels("water plants @ho", onAdd);

      // The first row is highlighted on open, so plain Enter picks that match...
      await fireEvent(input, "submitEditing");
      expect(input.props.value).toBe("water plants @home ");
      // ...rather than creating a task whose title still carries the partial mention.
      expect(onAdd).not.toHaveBeenCalled();

      // The popover closes with the mention completed, so the next Enter submits.
      await fireEvent(input, "submitEditing");
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: "water plants", label_ids: ["l1"] }),
      );
    });

    it("arrowing down to the Create row and pressing Enter creates the typed mention", async () => {
      const onCreateLabel = jest.fn((name: string) => `lbl_${name}`);
      const onAdd = jest.fn();
      await render(
        <QuickAdd
          onAdd={onAdd}
          now={NOW}
          labels={[{ id: "l1", name: "home" }]}
          onCreateLabel={onCreateLabel}
        />,
      );
      const input = screen.getByLabelText("Add a task");
      await fireEvent(input, "focus");
      await fireEvent.changeText(input, "water plants @hosepipe");

      // Down once lands on the only other row: Create @hosepipe.
      await fireEvent(input, "keyPress", {
        nativeEvent: { key: "ArrowDown" },
        preventDefault: jest.fn(),
      });
      await fireEvent(input, "submitEditing");

      expect(onCreateLabel).toHaveBeenCalledWith("hosepipe");
      expect(input.props.value).toBe("water plants @hosepipe ");
      expect(onAdd).not.toHaveBeenCalled();
    });
  });
});
