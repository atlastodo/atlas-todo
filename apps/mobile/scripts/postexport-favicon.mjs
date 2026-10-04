// Inject the atlas-globe SVG favicon link into the exported web `index.html`.
//
// `web.output: "single"` makes expo-router ignore `app/+html.tsx`, so the generated <head> has only
// app.json's `/favicon.ico` link. An older deploy without a favicon let `/favicon.ico` fall through
// the SPA nginx `try_files` to index.html, and that HTML response was cached upstream (Cloudflare)
// against the URL, leaving the tab blank.
//
// A distinct `/favicon.svg` path (copied from `public/favicon.svg`) sidesteps that poisoned cache
// entry and is what modern browsers prefer; the .ico stays as the legacy fallback. Idempotent.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const file = new URL("../dist/index.html", import.meta.url);
if (!existsSync(file)) {
  console.error(
    "postexport-favicon: dist/index.html not found (run `expo export --platform web` first)",
  );
  process.exit(1);
}

let html = readFileSync(file, "utf8");
if (html.includes('href="/favicon.svg"')) {
  console.log("postexport-favicon: svg favicon link already present, nothing to do");
} else {
  const inject =
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />' +
    '<meta name="theme-color" content="#4f46e5" />';
  html = html.replace("</head>", `${inject}</head>`);
  writeFileSync(file, html);
  console.log("postexport-favicon: injected svg favicon link");
}
