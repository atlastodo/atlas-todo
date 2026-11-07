// Writes the Lucide icons the GPUI app draws (assets/icons/<name>.svg) from the lucide-react-native
// package the mobile app ships, so both draw the same icons (ISC, see assets/icons/LICENSE).
// Run from the repository root: node crates/atlas-todo-gpui/scripts/icons.mjs
import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ICONS = [
  "activity",
  "archive",
  "bell",
  "calendar",
  "calendar-clock",
  "calendar-days",
  "chart-column",
  "check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "circle-check",
  "circle-check-big",
  "clock",
  "ellipsis",
  "ellipsis-vertical",
  "flag",
  "flame",
  "folder-input",
  "folder-plus",
  "globe",
  "hash",
  "inbox",
  "list-checks",
  "list-filter",
  "list-todo",
  "log-out",
  "message-square",
  "panel-left-close",
  "paperclip",
  "pencil",
  "plus",
  "repeat",
  "search",
  "sliders-horizontal",
  "star",
  "sun",
  "tag",
  "timer",
  "trash",
  "user-plus",
  "user-round",
  "x",
  "calendar-range",
  "monitor",
  "palette",
  "settings",
];

// The version apps/mobile resolves (the store may hold others).
const link = join(process.cwd(), "apps/mobile/node_modules/lucide-react-native");
if (!existsSync(link)) throw new Error("lucide-react-native is not installed (bun install)");
const dir = join(realpathSync(link), "dist/esm/icons");
const out = join(process.cwd(), "crates/atlas-todo-gpui/assets/icons");
mkdirSync(out, { recursive: true });

const attrs = (o) =>
  Object.entries(o)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

for (const name of ICONS) {
  // The module imports react-native; read its `__iconData` literal (`node: [[tag, {attrs}], ...]`).
  const src = readFileSync(join(dir, `${name}.mjs`), "utf8");
  const literal = /const __iconData = (\{[\s\S]*?\n\});/.exec(src)?.[1];
  if (!literal) throw new Error(`no icon data in ${name}.mjs`);
  const parsed = new Function(`return ${literal}`)().node;
  const body = parsed.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  writeFileSync(
    join(out, `${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`,
  );
}
console.log(`wrote ${ICONS.length} icons to ${out}`);
