import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, isAbsolute } from "node:path";

const base = fileURLToPath(new URL("../", import.meta.url));
const serverScript = fileURLToPath(new URL("../scripts/serve-preview.py", import.meta.url));

async function start(t, root) {
  const child = spawn("python", ["-u", serverScript, "--port", "0", ...(root ? ["--root", root] : [])],
    { cwd: join(base, "scripts"), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, "exit"); } });
  let output = "", errors = "";
  child.stderr.on("data", bytes => { errors += bytes; });
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Preview server startup timed out: " + errors)), 10000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", code => { clearTimeout(timeout); reject(new Error("Preview server exited: " + code + " " + errors)); });
    child.stdout.on("data", bytes => {
      output += bytes;
      if (!output.includes("\n")) return;
      clearTimeout(timeout); resolve(JSON.parse(output.split("\n")[0]));
    });
  });
}

test("a page revision changes the complete relative module and stylesheet tree, not only its HTML URL", async t => {
  const parent = join(base, ".tmp"); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "preview-serving-"));
  t.after(async () => {
    const key = relative(await realpath(base), await realpath(root));
    assert.ok(key && key !== ".." && !key.startsWith("..") && !isAbsolute(key), "delete only this workspace fixture");
    await rm(root, { recursive: true, force: true });
  });
  for (const folder of ["src/host", "src/shell", "styles"]) await mkdir(join(root, folder), { recursive: true });
  const sources = { "runtime-preview.html": '<link href="styles/base.css"><script type="module" src="src/entry.js"></script>',
    "src/entry.js": 'import "./host/runtime.js";', "src/host/runtime.js": 'import "../shell/bar.js";',
    "src/shell/bar.js": 'export const revision = "old";', "styles/base.css": '@import "./controls.css";',
    "styles/controls.css": ".label { color: gray; }" };
  for (const [path, source] of Object.entries(sources)) await writeFile(join(root, path), source);
  const server = await start(t, root);
  const request = server.origin + "/runtime-preview.html?rev=changed-html-only";
  const before = await fetch(request, { redirect: "manual" });
  assert.equal(before.status, 302); assert.equal(before.headers.get("cache-control"), "no-store");
  const pageUrl = new URL(before.headers.get("location"), server.origin);
  assert.equal(pageUrl.search, "?rev=changed-html-only");
  const entryUrl = new URL("src/entry.js", pageUrl), hostUrl = new URL("./host/runtime.js", entryUrl);
  const barUrl = new URL("../shell/bar.js", hostUrl), cssUrl = new URL("./controls.css", new URL("styles/base.css", pageUrl));
  for (const [url, expected] of [[barUrl, sources["src/shell/bar.js"]], [cssUrl, sources["styles/controls.css"]]]) {
    assert.ok(url.pathname.startsWith("/__preview/" + server.revision + "/"));
    const response = await fetch(url, { headers: { "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT", "If-None-Match": '"old"' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), expected);
  }
  await writeFile(join(root, "src/shell/bar.js"), 'export const revision = "new";');
  const after = await fetch(request, { redirect: "manual" }), afterLocation = after.headers.get("location");
  assert.notEqual(afterLocation, before.headers.get("location"), "a dependency change revises the page and all descendants");
  const currentBar = new URL("src/shell/bar.js", new URL(afterLocation, server.origin));
  assert.equal(await (await fetch(currentBar)).text(), 'export const revision = "new";');
  assert.equal((await fetch(barUrl)).status, 410, "stale dependency addresses cannot silently mix two revisions");
  const oldPage = await fetch(pageUrl, { redirect: "manual" });
  assert.equal(oldPage.headers.get("location"), afterLocation, "reopening the old page resolves the current tree");
});

test("the default preview root serves the current real command bar bytes regardless of working directory", async t => {
  const server = await start(t);
  assert.equal(server.root.replaceAll("\\", "/").toLowerCase(), base.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase());
  const response = await fetch(server.origin + "/runtime-preview.html?rev=command-chrome-cleanup-20261008");
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const shellUrl = new URL("src/shell/visual-workbench.js", response.url);
  const shell = await (await fetch(shellUrl)).text();
  assert.equal(shell, await readFile(join(base, "src/shell/visual-workbench.js"), "utf8"));
  assert.match(shell, /frame-command-bar\.js/); assert.doesNotMatch(shell, /谱面尺寸验证|v-window-buttons|v-region-switches/);
  const barUrl = new URL("./frame-command-bar.js", shellUrl);
  assert.equal(await (await fetch(barUrl)).text(), await readFile(join(base, "src/shell/frame-command-bar.js"), "utf8"));
});
