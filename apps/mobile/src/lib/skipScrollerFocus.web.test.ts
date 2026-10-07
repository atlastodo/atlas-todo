/**
 * @jest-environment jsdom
 */
import "./skipScrollerFocus.web";

beforeAll(() => {
  // jsdom lays nothing out; every element counts as rendered.
  Element.prototype.getClientRects = () => [{}] as unknown as DOMRectList;
});

function page() {
  document.body.innerHTML = `
    <button id="before">before</button>
    <div id="scroller" style="overflow-y: auto"><button id="inside">inside</button></div>
    <button id="after">after</button>`;
  const $ = (id: string) => document.getElementById(id)!;
  return { before: $("before"), scroller: $("scroller"), inside: $("inside") };
}

function tabOnto(el: HTMLElement, shiftKey = false) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }));
  // jsdom has no keyboard modality, so `:focus-visible` is stubbed to match.
  const matches = el.matches.bind(el);
  el.matches = ((sel: string) => sel === ":focus-visible" || matches(sel)) as typeof el.matches;
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

describe("skipScrollerFocus.web", () => {
  it("moves Tab off a bare scroll container to its first control and drops it from the Tab order", () => {
    const { scroller, inside } = page();
    tabOnto(scroller);
    expect(document.activeElement).toBe(inside);
    expect(scroller.getAttribute("tabindex")).toBe("-1");
  });

  it("goes back to the previous control on Shift+Tab", () => {
    const { before, scroller } = page();
    tabOnto(scroller, true);
    expect(document.activeElement).toBe(before);
  });

  it("leaves focus alone after a click", () => {
    const { scroller } = page();
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    scroller.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(scroller.hasAttribute("tabindex")).toBe(false);
  });
});
