/**
 * Firefox makes every scrollable element a Tab stop, so Tab lands on each ScrollView/FlatList
 * container and its focus ring shows as a stray line (e.g. along the sidebar edge). Rather than
 * marking every scroll view, a Tab that lands on a bare scroll container moves straight on to the
 * next control in the same direction, and the container drops out of the Tab order for good.
 * A click never triggers this: only keyboard focus (`:focus-visible`) after a Tab press counts.
 */

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable]:not([contenteditable=false])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** A scroll container that is focusable only because it scrolls (no tabindex of its own). */
export function isBareScroller(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.hasAttribute("tabindex") || el.isContentEditable) {
    return false;
  }
  if (el.matches(TABBABLE)) return false;
  const style = getComputedStyle(el);
  return /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`);
}

/** The next (or previous) Tab stop after `from` in document order; forward includes its own descendants. */
export function adjacentTabbable(from: HTMLElement, backwards: boolean): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest("[aria-hidden=true], [inert]"),
  );
  if (backwards) {
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i]!;
      if (from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) return el;
    }
    return null;
  }
  for (const el of all) {
    const pos = from.compareDocumentPosition(el);
    if (pos & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) return el;
  }
  return null;
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  let tabbing: { backwards: boolean } | null = null;
  document.addEventListener(
    "keydown",
    (e) => {
      tabbing = e.key === "Tab" ? { backwards: e.shiftKey } : null;
    },
    true,
  );
  document.addEventListener("pointerdown", () => (tabbing = null), true);
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (!tabbing || !(el instanceof Element) || !isBareScroller(el)) return;
      if (!el.matches(":focus-visible")) return;
      el.setAttribute("tabindex", "-1");
      const next = adjacentTabbable(el, tabbing.backwards);
      if (next) next.focus();
      else el.blur();
    },
    true,
  );
}
