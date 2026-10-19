import { DRAWER_EXTRA, FEATURE_VIEWS, NAV, PRIMARY_TABS } from "./navModel";

/**
 * Every route under app/(drawer) must have a <Drawer.Screen>. expo-router 58's drawer renders
 * nothing at all for a focused route it was not told about, with no error: an undeclared
 * `index.tsx` once left `/` (every cold start, web and desktop) a blank page.
 */

// The app's tsconfig has no Node types (it targets React Native), so fs comes typed from jest.
const { readFileSync, readdirSync, statSync } = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
}>("fs");
declare const __dirname: string;
const join = (...parts: string[]) => parts.join("/");
const drawerDir = join(__dirname, "../../app/(drawer)");

function routeFiles(): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(drawerDir)) {
    const path = join(drawerDir, entry);
    if (statSync(path).isDirectory()) {
      // A group is one screen; a folder of dynamic routes is a screen per file.
      if (entry.startsWith("(")) routes.push(entry);
      else
        for (const file of readdirSync(path)) routes.push(`${entry}/${file.replace(/\.tsx$/, "")}`);
    } else if (entry.endsWith(".tsx") && entry !== "_layout.tsx" && !entry.includes(".test.")) {
      routes.push(entry.replace(/\.tsx$/, ""));
    }
  }
  return routes;
}

function declaredScreens(): Set<string> {
  const layout = readFileSync(join(drawerDir, "_layout.tsx"), "utf8");
  const literal = [...layout.matchAll(/<Drawer\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]!);
  return new Set([
    ...literal,
    ...NAV.filter((item) => !PRIMARY_TABS.includes(item.view)).map((item) => item.view),
    ...DRAWER_EXTRA.map((item) => item.name),
    ...FEATURE_VIEWS.map((item) => item.name),
  ]);
}

describe("drawer screens", () => {
  it("declares every route under app/(drawer), the landing index included", () => {
    const declared = declaredScreens();
    const routes = routeFiles();
    expect(routes).toContain("index");
    expect(routes.filter((route) => !declared.has(route))).toEqual([]);
  });
});
