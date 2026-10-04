import type { ContextMenuItem } from "../ui/ContextMenu";
import {
  Archive,
  CopyPlus,
  FolderInput,
  LogOut,
  Plus,
  SquareArrowOutUpRight,
  Star,
  StarOff,
  Trash2,
} from "../ui/icons";

/**
 * The sidebar's project/folder action menus (the web right-click `ContextMenu` and the phone's
 * `MobileMenuModal`) as pure item lists over injected actions, so their one real rule is testable.
 *
 * That rule: only an owner may delete or archive a shared project. `atlas-server` refuses a
 * member's op, and one held back for a missing project key never leaves the device, so a Delete
 * offered to a member would remove the project on that device only. A member's way out is Leave:
 * the REST membership removal, which the server turns into a project tombstone every device of the
 * account receives. `ProjectScreen` and `ProjectsScreen` gate their sheets the same way.
 */

/** The project or folder a menu acts on. */
export interface ProjectMenuTarget {
  id: string;
  name: string;
  /** A folder is a project that holds projects; the delete toast differs by it. */
  kind: "project" | "folder";
}

/** Translate one key to a label; i18next's `t` satisfies this. */
export type MenuT = (key: string) => string;

/** Everything the builders need; the caller owns the effects (router, toasts, writes). */
export interface ProjectMenuDeps {
  t: MenuT;
  /**
   * Whether the current user may act as owner of the project (`useProjectMembers`'s
   * `isProjectOwner`: an unshared project's creator is the implicit owner).
   */
  isOwner: (projectId: string) => boolean;
  isFavorite: (key: string) => boolean;
  /** Toggle `key`; `wasFavorite` is the state the menu read (for the undoing toast). */
  onToggleFavorite: (key: string, wasFavorite: boolean) => void;
  onOpen: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  /** Create a project inside the folder (the folder menu only). */
  onNewProjectHere: (folderId: string) => void;
  onMoveToFolder: (projectId: string) => void;
  /** Archive -- owner only. */
  onArchive: (target: ProjectMenuTarget) => void;
  /** Delete -- owner only. */
  onDelete: (target: ProjectMenuTarget) => void;
  /** Leave the shared project: opens the confirm; not locally reversible. */
  onLeave: (target: ProjectMenuTarget) => void;
}

/** The favorite toggle shared by both menus. */
function favoriteItem(deps: ProjectMenuDeps, id: string): ContextMenuItem {
  const key = `project:${id}`;
  const fav = deps.isFavorite(key);
  return {
    key: "favorite",
    label: fav ? deps.t("context.removeFromFav") : deps.t("context.addToFav"),
    icon: fav ? StarOff : Star,
    onPress: () => deps.onToggleFavorite(key, fav),
  };
}

/**
 * The ownership-gated tail of both menus: an owner gets `archive` (when `archive`) and `delete`;
 * everyone else gets Leave (see the module docs).
 */
function destructiveItems(
  deps: ProjectMenuDeps,
  target: ProjectMenuTarget,
  archive: boolean,
): ContextMenuItem[] {
  if (!deps.isOwner(target.id)) {
    return [
      {
        key: "leave",
        label: deps.t("workspace.leaveProject"),
        icon: LogOut,
        separatorBefore: true,
        danger: true,
        onPress: () => deps.onLeave(target),
      },
    ];
  }
  return [
    ...(archive
      ? [
          {
            key: "archive",
            label: deps.t("context.archive"),
            icon: Archive,
            onPress: () => deps.onArchive(target),
          },
        ]
      : []),
    {
      key: "delete",
      label: deps.t("common.delete"),
      icon: Trash2,
      separatorBefore: true,
      danger: true,
      onPress: () => deps.onDelete(target),
    },
  ];
}

/** A project row's menu: open, favorite, duplicate, move, then the gated tail. */
export function projectMenuItems(
  deps: ProjectMenuDeps,
  id: string,
  name: string,
): ContextMenuItem[] {
  return [
    {
      key: "open",
      label: deps.t("context.open"),
      icon: SquareArrowOutUpRight,
      onPress: () => deps.onOpen(id),
    },
    favoriteItem(deps, id),
    {
      key: "duplicate",
      label: deps.t("common.duplicate"),
      icon: CopyPlus,
      onPress: () => deps.onDuplicate(id),
    },
    {
      key: "move",
      label: deps.t("projects.moveToFolder"),
      icon: FolderInput,
      onPress: () => deps.onMoveToFolder(id),
    },
    ...destructiveItems(deps, { id, name, kind: "project" }, true),
  ];
}

/**
 * A folder's menu: open it (the Projects screen scoped to its subtree), add a project inside it,
 * move it, then the same gated tail (a folder is a project entity).
 */
export function folderMenuItems(
  deps: ProjectMenuDeps,
  id: string,
  name: string,
): ContextMenuItem[] {
  return [
    {
      key: "open",
      label: deps.t("context.open"),
      icon: SquareArrowOutUpRight,
      onPress: () => deps.onOpen(id),
    },
    favoriteItem(deps, id),
    {
      key: "new-project",
      label: deps.t("projects.newProjectHere"),
      icon: Plus,
      onPress: () => deps.onNewProjectHere(id),
    },
    {
      key: "move",
      label: deps.t("projects.moveToFolder"),
      icon: FolderInput,
      onPress: () => deps.onMoveToFolder(id),
    },
    ...destructiveItems(deps, { id, name, kind: "folder" }, false),
  ];
}
