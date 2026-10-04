/**
 * What releasing a lifted row means.
 *
 * `react-native-reorderable-list` reports every release through `onDragEnd({from, to})`, including
 * one where the row never moved, and lifts on its own hold timer, so the release is the only place
 * a drag and a plain hold can be told apart.
 *
 * A release that moved is just the reorder, already persisted by `onReorder`. One that did not move
 * is a hold that went nowhere:
 *
 * - Phone: open the row's action menu (there is no right-click).
 * - Browser: nothing. Menus there come from right-click only, so routing a hold to one made an
 *   unhurried left-click pop up an unwanted menu. It must not open the task either: having picked a
 *   row up, releasing it must not navigate.
 */
export type DragReleaseAction = "menu" | "none";

export interface DragRelease {
  /** Index the row was lifted from. */
  from: number;
  /** Index it was dropped at; equal to `from` when it never moved. */
  to: number;
  /** Multi-select is on: a release belongs to the selection, not to a menu or a navigation. */
  selectMode: boolean;
  /** The browser build (`Platform.OS === "web"`). */
  isWeb: boolean;
}

export function dragReleaseAction({ from, to, selectMode, isWeb }: DragRelease): DragReleaseAction {
  if (selectMode || isWeb || from !== to) return "none";
  return "menu";
}
