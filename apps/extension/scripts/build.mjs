// Builds the extension into dist/, ready for chrome://extensions → "Load unpacked".
//   pnpm --filter extension build                                     (for http://localhost:3000)
//   JUSTLINK_APP_URL=https://your-domain.com pnpm --filter extension build   (for your live site)
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const appUrl = new URL(process.env.JUSTLINK_APP_URL || "http://localhost:3000");
if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
  throw new Error(`JUSTLINK_APP_URL must be an http(s) address, got ${appUrl.href}`);
}
// Match patterns take a host without its port, so this also covers other ports on localhost.
const sitePattern = `${appUrl.protocol}//${appUrl.hostname}/*`;

rmSync(dist, { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "-p", join(root, "tsconfig.json")], { stdio: "inherit" });
cpSync(join(root, "static"), dist, { recursive: true });
writeFileSync(join(dist, "config.js"), `export const APP_URL = ${JSON.stringify(appUrl.origin)};\n`);

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
const manifest = {
  manifest_version: 3,
  name: "JustLink",
  description: "Save the page you're on to your JustLink library in one click, and file it into a folder.",
  version,
  icons,
  action: { default_title: "Save to JustLink", default_popup: "popup.html", default_icon: icons },
  background: { service_worker: "background.js", type: "module" },
  // activeTab + scripting: read the page you choose to save, and only that page.
  // contextMenus: "Save page / Save link to JustLink" on right-click.
  permissions: ["activeTab", "scripting", "contextMenus"],
  // Your JustLink site only: to call its API with your session, and to let it open tabs for you.
  host_permissions: [sitePattern],
  content_scripts: [{ matches: [sitePattern], js: ["bridge.js"], run_at: "document_start" }],
  commands: {
    _execute_action: { suggested_key: { default: "Alt+Shift+S" }, description: "Save this page to JustLink" },
  },
};
writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nBuilt the JustLink extension for ${appUrl.origin} in ${dist}`);
console.log("Load it in Chrome or Edge: open chrome://extensions, turn on Developer mode, click Load unpacked, pick that folder.");
