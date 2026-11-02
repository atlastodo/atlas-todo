import { describe, expect, it } from "vitest";
import { projectCreateFields, toProject } from "./projectMapper";

describe("toProject", () => {
  it("reads a folder's kind and parent", () => {
    const f = toProject("f1", { name: "Clients", kind: "folder", parent_id: "f0" });
    expect(f.kind).toBe("folder");
    expect(f.parent_id).toBe("f0");
  });

  it("reads the default view, degrading anything but board to list", () => {
    expect(toProject("p1", { name: "Work", default_view: "board" }).default_view).toBe("board");
    expect(toProject("p1", { name: "Work", default_view: 3 }).default_view).toBe("list");
    expect(toProject("p1", { name: "Work" }).default_view).toBe("list");
  });

  it("degrades an unknown kind or a non-string parent to a root project", () => {
    // These arrive over sync from another client and can be any shape.
    const p = toProject("p1", { name: "Work", kind: 42, parent_id: 7 });
    expect(p.kind).toBe("project");
    expect(p.parent_id).toBeNull();
  });
});

describe("projectCreateFields", () => {
  it("creates a top-level project by default", () => {
    const fields = projectCreateFields({ name: "Work" });
    expect(fields.kind).toBe("project");
    expect(fields.parent_id).toBeNull();
  });

  it("creates a folder inside another folder", () => {
    const fields = projectCreateFields({ name: "Clients", kind: "folder", parent_id: "f0" });
    expect(fields.kind).toBe("folder");
    expect(fields.parent_id).toBe("f0");
  });

  it("writes the default view only when one is chosen", () => {
    expect(projectCreateFields({ name: "Work" })).not.toHaveProperty("default_view");
    expect(projectCreateFields({ name: "Work", default_view: "board" }).default_view).toBe("board");
  });
});
