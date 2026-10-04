import { render, act } from "@testing-library/react-native";
import { SelectionProvider, useSelection, type SelectionApi } from "./SelectionProvider";

/** The click-drag "paint" range maths over the registered visible order (the pointer wiring is `usePaintHandlers.web.test`). */
async function capture(): Promise<{ get: () => SelectionApi }> {
  let api: SelectionApi | null = null;
  function Capture() {
    api = useSelection();
    return null;
  }
  await render(
    <SelectionProvider>
      <Capture />
    </SelectionProvider>,
  );
  return { get: () => api as SelectionApi };
}

describe("SelectionProvider paint", () => {
  it("selects the anchor->row range in visible order", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c", "d", "e"]));
    await act(() => get().paintBegin("b"));
    await act(() => get().paintOver("d"));
    expect([...get().selected].sort()).toEqual(["b", "c", "d"]);
  });

  it("reverts rows when the drag shrinks back toward the anchor", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c", "d", "e"]));
    await act(() => get().paintBegin("a"));
    await act(() => get().paintOver("d")); // a,b,c,d
    await act(() => get().paintOver("b")); // shrink to a,b
    expect([...get().selected].sort()).toEqual(["a", "b"]);
  });

  it("deselects the swath when the anchor was already selected", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c", "d"]));
    await act(() => get().add(["a", "b", "c", "d"]));
    await act(() => get().paintBegin("b")); // b is selected -> direction is deselect
    await act(() => get().paintOver("c"));
    expect([...get().selected].sort()).toEqual(["a", "d"]);
  });

  it("ignores paintOver for a row outside the registered list", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c"]));
    await act(() => get().paintBegin("a"));
    await act(() => get().paintOver("zzz"));
    expect([...get().selected]).toEqual([]);
  });

  it("does not consume a click when no paint armed it", async () => {
    const { get } = await capture();
    expect(get().paintConsumeClick("a")).toBe(false);
  });

  it("selects rows via paintMove with registered row heights and reverts when moving back", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c", "d"]));
    await act(() => {
      get().registerRowHeight("a", 50);
      get().registerRowHeight("b", 50);
      get().registerRowHeight("c", 50);
      get().registerRowHeight("d", 50);
    });
    await act(() => get().paintBegin("a"));
    // deltaY = 30 crosses into b (threshold = 25)
    await act(() => get().paintMove(30));
    expect([...get().selected].sort()).toEqual(["a", "b"]);

    // deltaY = 80 crosses into c (threshold = 25 + 50 = 75)
    await act(() => get().paintMove(80));
    expect([...get().selected].sort()).toEqual(["a", "b", "c"]);

    // moving back up to deltaY = 30 shrinks back to a, b
    await act(() => get().paintMove(30));
    expect([...get().selected].sort()).toEqual(["a", "b"]);

    // releasing ends paint and suppresses trailing click on anchor
    await act(() => get().paintEnd());
    expect(get().paintConsumeClick("a")).toBe(true);
  });

  it("selects rows upwards via negative paintMove", async () => {
    const { get } = await capture();
    await act(() => get().setVisibleIds(["a", "b", "c", "d"]));
    await act(() => {
      get().registerRowHeight("a", 50);
      get().registerRowHeight("b", 50);
      get().registerRowHeight("c", 50);
      get().registerRowHeight("d", 50);
    });
    await act(() => get().paintBegin("c"));
    // deltaY = -35 crosses into b
    await act(() => get().paintMove(-35));
    expect([...get().selected].sort()).toEqual(["b", "c"]);

    // deltaY = -85 crosses into a
    await act(() => get().paintMove(-85));
    expect([...get().selected].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("SelectionProvider retain", () => {
  it("keeps only the given ids and stays in select mode", async () => {
    const { get } = await capture();
    await act(() => get().beginWith("a"));
    await act(() => get().add(["b", "c"]));
    expect(get().mode).toBe(true);

    await act(() => get().retain(["a", "c"]));
    expect([...get().selected].sort()).toEqual(["a", "c"]);
    // Unlike clear(), retain never leaves select mode -- even if it empties the selection.
    expect(get().mode).toBe(true);

    await act(() => get().retain(["x"]));
    expect([...get().selected]).toEqual([]);
    expect(get().mode).toBe(true);
  });
});
