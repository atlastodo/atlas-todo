/**
 * @jest-environment jsdom
 */
import { SCHEME_STORAGE_KEY } from "./schemeCache";

const mockSet = jest.fn();
jest.mock("nativewind", () => ({ colorScheme: { set: (v: string) => mockSet(v) } }));

function boot(prefersDark: boolean, saved: string | null) {
  window.matchMedia = ((q: string) => ({ matches: prefersDark && q.includes("dark") })) as never;
  if (saved === null) window.localStorage.clear();
  else window.localStorage.setItem(SCHEME_STORAGE_KEY, saved);
  // Re-run the module for each case: it applies the scheme as an import side effect.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  jest.isolateModules(() => require("./bootScheme.web"));
}

describe("bootScheme.web", () => {
  beforeEach(() => mockSet.mockClear());

  it("puts .dark on <html> and tells NativeWind the same on a dark OS", () => {
    boot(true, null);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(mockSet).toHaveBeenCalledWith("dark");
  });

  it("follows a cached Light choice over a dark OS, in the class and in NativeWind", () => {
    boot(true, "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(mockSet).toHaveBeenCalledWith("light");
  });
});
