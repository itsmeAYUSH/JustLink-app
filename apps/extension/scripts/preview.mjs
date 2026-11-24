// Shows the popup in a normal browser tab, in each of its states, with sample data:
// handy for design work without reloading the extension. Build first, then:
//   pnpm --filter extension preview   →   http://localhost:4599/preview/
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const previewDir = join(root, "preview");
const port = Number(process.env.PORT) || 4599;

if (!existsSync(join(dist, "popup.js"))) {
  console.error("Build the extension first: pnpm --filter extension build");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
  const [base, rest] = path.startsWith("/preview/") ? [previewDir, path.slice("/preview/".length)] : [dist, path.slice(1)];
  let file = normalize(join(base, rest || "index.html"));
  if (!file.startsWith(base + sep) && file !== base) return void response.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return void response.writeHead(404).end("Not found");
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Popup preview: http://localhost:${port}/preview/`));
