import type { ContextMenuItem } from "../ui/ContextMenu";
import { folderMenuItems, projectMenuItems, type ProjectMenuDeps } from "./projectMenus";

/**
 * The sidebar menus' one real rule: only an owner may delete/archive a shared project; a member
 * gets Leave instead (the REST removal the server turns into a tombstone every device of the
 * account receives -- see the module docs). The builders are pure over injected actions, so the
 * rule is tested without the router/toast/store providers.
 */

/** A `t` that returns its key: assertions read keys, not English copy. */
const t = (key: string) => key;

/** Deps with `jest.fn` actions; an owner by default (the common, unshared case). */
function deps(overrides: Partial<ProjectMenuDeps> = {}): ProjectMenuDeps {
  return {
    t,
    isOwner: () => true,
    isFavorite: () => false,
    onToggleFavorite: jest.fn(),
    onOpen: jest.fn(),
    onDuplicate: jest.fn(),
    onNewProjectHere: jest.fn(),
    onMoveToFolder: jest.fn(),
    onArchive: jest.fn(),
    onDelete: jest.fn(),
    onLeave: jest.fn(),
    ...overrides,
  };
}

const keys = (items: ContextMenuItem[]) => items.map((i) => i.key);

function item(items: ContextMenuItem[], key: string): ContextMenuItem {
  const found = items.find((i) => i.key === key);
  if (!found) throw new Error(`no "${key}" item`);
  return found;
}

describe("projectMenuItems", () => {
  it("offers an owner archive and delete", () => {
    const d = deps();
    const items = projectMenuItems(d, "p1", "Signal");
    expect(keys(items)).toEqual(["open", "favorite", "duplicate", "move", "archive", "delete"]);
    expect(item(items, "delete").danger).toBe(true);
    item(items, "delete").onPress();
    expect(d.onDelete).toHaveBeenCalledWith({ id: "p1", name: "Signal", kind: "project" });
    expect(d.onLeave).not.toHaveBeenCalled();
  });

  it("offers a member leave instead of archive/delete", () => {
    const d = deps({ isOwner: () => false });
    const items = projectMenuItems(d, "p1", "Signal");
    expect(keys(items)).toEqual(["open", "favorite", "duplicate", "move", "leave"]);
    const leave = item(items, "leave");
    expect(leave.label).toBe("workspace.leaveProject");
    expect(leave.danger).toBe(true);
    expect(leave.separatorBefore).toBe(true);
    leave.onPress();
    expect(d.onLeave).toHaveBeenCalledWith({ id: "p1", name: "Signal", kind: "project" });
    expect(d.onArchive).not.toHaveBeenCalled();
    expect(d.onDelete).not.toHaveBeenCalled();
  });
});

describe("folderMenuItems", () => {
  it("offers an owner new-project and delete", () => {
    const d = deps();
    const items = folderMenuItems(d, "f1", "Semester");
    expect(keys(items)).toEqual(["open", "favorite", "new-project", "move", "delete"]);
    item(items, "new-project").onPress();
    expect(d.onNewProjectHere).toHaveBeenCalledWith("f1");
    item(items, "delete").onPress();
    expect(d.onDelete).toHaveBeenCalledWith({ id: "f1", name: "Semester", kind: "folder" });
  });

  it("offers a member leave instead of delete", () => {
    const d = deps({ isOwner: () => false });
    const items = folderMenuItems(d, "f1", "Semester");
    expect(keys(items)).toEqual(["open", "favorite", "new-project", "move", "leave"]);
    item(items, "leave").onPress();
    expect(d.onLeave).toHaveBeenCalledWith({ id: "f1", name: "Semester", kind: "folder" });
    expect(d.onDelete).not.toHaveBeenCalled();
  });
});
