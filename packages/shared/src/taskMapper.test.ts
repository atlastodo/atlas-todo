import { describe, it, expect } from "vitest";
import { taskCreateFields, toTask } from "./taskMapper";

describe("toTask", () => {
  it("fills defaults for absent fields", () => {
    const t = toTask("t1", { title: "Buy milk" });
    expect(t).toMatchObject({
      id: "t1",
      title: "Buy milk",
      notes: "",
      priority: 4,
      is_completed: false,
      due_at: null,
      project_id: null,
    });
  });

  it("maps typed fields through", () => {
    const t = toTask("t2", {
      title: "Report",
      priority: 1,
      due_at: 1800000000000,
      is_completed: true,
      completed_at: 1700000000000,
      project_id: "p1",
    });
    expect(t.priority).toBe(1);
    expect(t.due_at).toBe(1800000000000);
    expect(t.is_completed).toBe(true);
    expect(t.project_id).toBe("p1");
  });

  it("coerces an out-of-range priority to P4", () => {
    expect(toTask("t3", { title: "x", priority: 9 }).priority).toBe(4);
  });
});

describe("toTask timestamps", () => {
  it("drops a timestamp outside the Date range, so no list renders an invalid date", () => {
    const t = toTask("t", {
      title: "x",
      due_at: 8.64e15 + 1,
      start_at: -1e20,
      completed_at: Infinity,
      deleted_at: NaN,
    });
    expect(t.due_at).toBeNull();
    expect(t.start_at).toBeNull();
    expect(t.completed_at).toBeNull();
    expect(t.deleted_at).toBeNull();
  });

  it("keeps the extremes of the range", () => {
    expect(toTask("t", { due_at: 8.64e15 }).due_at).toBe(8.64e15);
    expect(toTask("t", { due_at: -8.64e15 }).due_at).toBe(-8.64e15);
  });
});

describe("taskCreateFields", () => {
  it("includes required defaults and omits nullish optionals", () => {
    const fields = taskCreateFields({ title: "Water plants" });
    expect(fields.title).toBe("Water plants");
    expect(fields.priority).toBe(4);
    expect(fields.is_completed).toBe(false);
    expect("due_at" in fields).toBe(false);
    expect("project_id" in fields).toBe(false);
  });

  it("includes due_at and project_id when provided", () => {
    const fields = taskCreateFields({ title: "x", due_at: 123, project_id: "p1" });
    expect(fields.due_at).toBe(123);
    expect(fields.project_id).toBe("p1");
  });
});

describe("toTask on a task this device cannot decrypt", () => {
  // What a sensitive field stays as when no key here opens it (client-core `fromEncryptedWire`).
  const envelope = { __enc: 1, iv: "aXY=", ct: "Y3Q=" };

  it("marks the task locked when its title is still an encrypted envelope", () => {
    const t = toTask("t4", { title: envelope, priority: 2, created_at: 5 });
    expect(t.locked).toBe(true);
    // The typed shape still holds, so every list can render the row without special-casing types.
    expect(t.title).toBe("");
    expect(t.priority).toBe(2);
    expect(t.created_at).toBe(5);
  });

  it("marks it locked when any other field is an envelope, even with a readable title", () => {
    expect(toTask("t5", { title: "Visible", notes: envelope }).locked).toBe(true);
    const labelled = toTask("t6", { title: "Visible", label_ids: envelope });
    expect(labelled.locked).toBe(true);
    expect(labelled.label_ids).toEqual([]);
  });

  it("does not mark a plain task locked", () => {
    expect(toTask("t7", { title: "Buy milk", notes: "2L", label_ids: ["l1"] }).locked).toBeFalsy();
    // A blank title alone is just a blank task, not an unreadable one.
    expect(toTask("t8", { title: "" }).locked).toBeFalsy();
  });
});
