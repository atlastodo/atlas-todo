import type { RefObject } from "react";

/**
 * HTML5 drag-and-drop for the board: a native no-op. No RN library does cross-container drag and
 * dragging to an off-screen column is a poor phone gesture, so a phone moves a card by tap and
 * section picker. Metro resolves `useCardDnd.web.ts` for the browser. All return a constant `false`,
 * so the caller's drag-feedback styling is inert on native.
 */
export function useDragSource<T>(
  _ref: RefObject<T | null>,
  _payload: () => string,
  _options?: {
    enabled?: boolean;
    onDragStart?: () => void;
    onDragEnd?: () => void;
  },
): boolean {
  return false;
}

export function useDragLift(_dragging: boolean): boolean {
  return false;
}

export function useDropTarget<T>(
  _ref: RefObject<T | null>,
  _onDrop: (payload: string) => void,
): boolean {
  return false;
}
