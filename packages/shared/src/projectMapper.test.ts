import { describe, expect, it } from "vitest";
import { projectCreateFields, toProject } from "./projectMapper";

describe("toProject", () => {
  it("reads a folder's kind and parent", () => {
    const f = toProject("f1", { name: "Clients", kind: "folder", parent_id: "f0" });
    expect(f.kind).toBe("folder");
    expect(f.parent_id).toBe("f0");
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
});
