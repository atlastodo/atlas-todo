import { resolveSectionReorder, type SectionRow } from "./sectionReorder";

/**
 * The cross-section drag maths for the flattened project list. Pure index -> {section, rank}: the
 * landing section is the nearest preceding header, the rank is between the neighbouring task rows in
 * that section, and `changedSection` tells the caller whether to show the "moved to section" undo.
 */

/** A top-level task row (depth 0, no parent) -- the common case in these tests. */
function taskRow(sectionId: string | null, id: string, sortOrder: number): SectionRow {
  return { kind: "task", sectionId, id, sortOrder, depth: 0, parentId: null };
}

// A two-section project: [No section header], header A + 2 tasks + add, header B + 1 task + add.
function rows(): SectionRow[] {
  return [
    { kind: "header", sectionId: null },
    { kind: "header", sectionId: "A" },
    taskRow("A", "a1", 10),
    taskRow("A", "a2", 20),
    { kind: "add", sectionId: "A" },
    { kind: "header", sectionId: "B" },
    taskRow("B", "b1", 30),
    { kind: "add", sectionId: "B" },
  ];
}

describe("resolveSectionReorder", () => {
  it("moves a task into another section, ranked after that section's last task", () => {
    // Drag a1 (index 2) down into B's region (index 6).
    const drop = resolveSectionReorder(rows(), 2, 6);
    expect(drop).not.toBeNull();
    expect(drop!.id).toBe("a1");
    expect(drop!.section_id).toBe("B");
    expect(drop!.changedSection).toBe(true);
    expect(drop!.sort_order).toBeGreaterThan(30); // after b1
  });

  it("moves a task into the no-section group", () => {
    // Drag a1 (index 2) up to just under the No-section header (index 1).
    const drop = resolveSectionReorder(rows(), 2, 1);
    expect(drop!.id).toBe("a1");
    expect(drop!.section_id).toBeNull();
    expect(drop!.changedSection).toBe(true);
  });

  it("reorders within a section without flagging a section change", () => {
    // Drag a1 (index 2) down past a2 (index 3), staying in A.
    const drop = resolveSectionReorder(rows(), 2, 3);
    expect(drop!.id).toBe("a1");
    expect(drop!.section_id).toBe("A");
    expect(drop!.changedSection).toBe(false);
    expect(drop!.sort_order).toBeGreaterThan(20); // after a2
  });

  it("ignores a no-op and non-task rows", () => {
    expect(resolveSectionReorder(rows(), 3, 3)).toBeNull();
    expect(resolveSectionReorder(rows(), 1, 4)).toBeNull(); // dragging a header
  });

  // With "No section" rendered last, the first row is a real section header, so a task can be dropped
  // *above* every header -- it must land at the top of that first section, never orphaned to null.
  it("drops above the first header into the top of the first section", () => {
    // [header A, a1, a2, add, header B, b1, add, No-section header, n1]
    const noneLast: SectionRow[] = [
      { kind: "header", sectionId: "A" },
      taskRow("A", "a1", 10),
      taskRow("A", "a2", 20),
      { kind: "add", sectionId: "A" },
      { kind: "header", sectionId: "B" },
      taskRow("B", "b1", 30),
      { kind: "add", sectionId: "B" },
      { kind: "header", sectionId: null },
      taskRow(null, "n1", 40),
    ];
    // Drag b1 (index 5) to the very top (index 0), above header A.
    const drop = resolveSectionReorder(noneLast, 5, 0);
    expect(drop!.id).toBe("b1");
    expect(drop!.section_id).toBe("A");
    expect(drop!.changedSection).toBe(true);
    expect(drop!.sort_order).toBeLessThan(10); // ranked before a1, the top of section A
  });

  it("nests a task dropped between a parent and its child within a section", () => {
    // Section A: parent a1 (depth 0) with child c1 (depth 1); a2 is another top-level task.
    const nested: SectionRow[] = [
      { kind: "header", sectionId: "A" },
      { kind: "task", sectionId: "A", id: "a1", sortOrder: 10, depth: 0, parentId: null },
      { kind: "task", sectionId: "A", id: "c1", sortOrder: 10, depth: 1, parentId: "a1" },
      { kind: "task", sectionId: "A", id: "a2", sortOrder: 20, depth: 0, parentId: null },
      { kind: "add", sectionId: "A" },
    ];
    // Drag a2 (index 3) up to between a1 and c1 (index 2) -> becomes a1's child.
    const drop = resolveSectionReorder(nested, 3, 2);
    expect(drop!.id).toBe("a2");
    expect(drop!.parent_id).toBe("a1");
    expect(drop!.changedSection).toBe(false);
  });

  it("clears the parent when a subtask is dragged out to the section's top level", () => {
    const nested: SectionRow[] = [
      { kind: "header", sectionId: "A" },
      { kind: "task", sectionId: "A", id: "a1", sortOrder: 10, depth: 0, parentId: null },
      { kind: "task", sectionId: "A", id: "c1", sortOrder: 10, depth: 1, parentId: "a1" },
      { kind: "task", sectionId: "A", id: "a2", sortOrder: 20, depth: 0, parentId: null },
      { kind: "add", sectionId: "A" },
    ];
    // Drag c1 (index 2) down between a2 and the add row (index 3) -> top-level, parent cleared.
    const drop = resolveSectionReorder(nested, 2, 3);
    expect(drop!.id).toBe("c1");
    expect(drop!.parent_id).toBeNull();
  });

  it("renumbers tied siblings so a drop between them sticks", () => {
    // Tasks made without a rank all sit at 0: the rank "between" two of them was 0 again, so the
    // dropped task snapped back to where it was.
    const tied: SectionRow[] = [
      { kind: "header", sectionId: "A" },
      taskRow("A", "a1", 0),
      taskRow("A", "a2", 0),
      taskRow("A", "a3", 0),
      { kind: "add", sectionId: "A" },
    ];
    // Drag a3 (index 3) up between a1 and a2 (index 2).
    const drop = resolveSectionReorder(tied, 3, 2)!;
    expect(drop.sort_order).toBe(drop.writes.find((w) => w.id === "a3")!.sort_order);

    const rank = new Map([
      ["a1", 0],
      ["a2", 0],
      ["a3", 0],
    ]);
    for (const w of drop.writes) rank.set(w.id, w.sort_order);
    const order = [...rank.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(order).toEqual(["a1", "a3", "a2"]);
    expect(new Set(rank.values()).size).toBe(3);
  });

  it("writes only the moved task when its neighbours leave room", () => {
    const drop = resolveSectionReorder(rows(), 2, 3)!;
    expect(drop.writes).toEqual([{ id: "a1", sort_order: drop.sort_order }]);
  });
});
