/**
 * Toast state: a tiny pure reducer for add/dismiss/replace, testable without React or timers. The
 * provider owns the auto-dismiss timeout.
 */

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  message: string;
  action?: ToastAction;
}

export type ToastState = Toast[];

export type ToastEvent = { type: "add"; toast: Toast } | { type: "dismiss"; id: string };

/**
 * Newest toast last; adding an id that already exists replaces it (so re-showing does not stack).
 */
export function toastReducer(state: ToastState, event: ToastEvent): ToastState {
  switch (event.type) {
    case "add":
      return [...state.filter((t) => t.id !== event.toast.id), event.toast];
    case "dismiss":
      return state.filter((t) => t.id !== event.id);
  }
}

export const TOAST_TTL_MS = 6000;
