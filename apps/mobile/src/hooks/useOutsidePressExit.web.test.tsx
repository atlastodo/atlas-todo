/**
 * @jest-environment jsdom
 */
import { render, act } from "@testing-library/react-native";
import { SelectionProvider, useSelection, type SelectionApi } from "../data/SelectionProvider";
import { useOutsidePressExit } from "./useOutsidePressExit.web";

let api: SelectionApi | null = null;
function Harness() {
  api = useSelection();
  useOutsidePressExit();
  return null;
}

async function mount() {
  await render(
    <SelectionProvider>
      <Harness />
    </SelectionProvider>,
  );
  return () => api as SelectionApi;
}

/** A pointerdown on a fresh element, optionally inside a wrapper carrying `attr`. */
async function pressOn(attr?: string) {
  const target = document.createElement("div");
  if (attr) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute(attr, "x");
    wrapper.appendChild(target);
    document.body.appendChild(wrapper);
  } else {
    document.body.appendChild(target);
  }
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
}

describe("useOutsidePressExit.web", () => {
  it("leaves select mode on a press outside the tasks, even with tasks selected", async () => {
    const get = await mount();
    await act(() => get().beginWith("a"));
    await pressOn();
    expect(get().mode).toBe(false);
    expect(get().count).toBe(0);
  });

  it("leaves an empty select mode too", async () => {
    const get = await mount();
    await act(() => get().enter());
    await pressOn();
    expect(get().mode).toBe(false);
  });

  it.each(["data-atlas-row", "data-selection-keep", "aria-modal"])(
    "keeps select mode on a press inside [%s]",
    async (attr) => {
      const get = await mount();
      await act(() => get().beginWith("a"));
      await pressOn(attr);
      expect(get().mode).toBe(true);
      expect(get().count).toBe(1);
    },
  );
});
