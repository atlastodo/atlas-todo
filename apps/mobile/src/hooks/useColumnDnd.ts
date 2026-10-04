import type { RefObject } from "react";

/**
 * HTML5 drag-and-drop for reordering board columns: a native no-op returning `false`. Metro resolves
 * `useColumnDnd.web.ts` for the browser; native reorders columns via the header drag handle
 * (gesture-handler) and the menu's Move left/right.
 */
export interface ColumnDragCallbacks {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useColumnDragSource<T>(
  _ref: RefObject<T | null>,
  _payload: () => string,
  _callbacks?: ColumnDragCallbacks,
): boolean {
  return false;
}

export function useColumnDropTarget<T>(
  _ref: RefObject<T | null>,
  _onDrop: (sectionId: string) => void,
): boolean {
  return false;
}
