import { readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

// Apply the same boundary to a lexical path and its canonical filesystem target.
export function desktopAssetKey(root, path) {
  const key = relative(root, path).split(sep).join("/");
  if (!key || key === ".." || key.startsWith("../") || resolve(root, key) !== path) throw new Error(`Desktop asset escapes source root: ${path}`);
  return key;
}

/** Collect the accepted shell and its local assets; never package research/tests/source trees. */
export async function readDesktopAssetPlan({ sourceRoot = defaultRoot } = {}) {
  const root = await realpath(sourceRoot), rootUrl = pathToFileURL(root + sep), assets = new Map();
  async function include(reference, from = rootUrl) {
    if (reference.startsWith("data:")) return;
    const url = new URL(reference, from); url.search = ""; url.hash = "";
    if (url.protocol !== "file:") throw new Error(`Desktop asset must be local: ${reference}`);
    const path = fileURLToPath(url), key = desktopAssetKey(root, path);
    if (assets.has(key)) return;
    const actual = await realpath(path);
    desktopAssetKey(root, actual);
    const contents = await readFile(actual); assets.set(key, contents);
    if (key.endsWith(".css")) {
      const dependencies = /@import\s+["']([^"']+)["']|url\(\s*(?:(["'])(.*?)\2|([^\s)]+))\s*\)/g;
      for (const match of contents.toString("utf8").matchAll(dependencies)) await include(match[1] ?? match[3] ?? match[4], url);
    }
  }
  const entryPath = await realpath(resolve(root, "startup-center.html"));
  desktopAssetKey(root, entryPath);
  const entry = await readFile(entryPath, "utf8");
  if (!entry.includes('id="launch-root"') || !entry.includes('id="startup-root"') || !entry.includes('id="app"')) throw new Error("Desktop entry requires the accepted manager/workspace shell and startup center");
  for (const match of entry.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/g)) await include(match[1]);
  // VexFlow is loaded on demand by the shared classic entry, not an HTML script tag.
  await include("src/vendor/vexflow-bravura.js");
  assets.set("index.html", Buffer.from(entry.replace(/<title>[^<]*<\/title>/, "<title>Brilliant Guitar · 备份工作区</title>")));
  return { sourceRoot: root, assets };
}
