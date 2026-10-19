import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdir, writeFile, mkdtemp, rm, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";
import { readDesktopAssetPlan, desktopAssetKey } from "../scripts/desktop-assets.mjs";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
async function fixture(run) {
  const temporary = join(root, ".tmp"); await mkdir(temporary, { recursive: true });
  const container = await mkdtemp(join(temporary, "desktop-assets-")), source = join(container, "source");
  await mkdir(source); await mkdir(join(source, "src", "vendor"), { recursive: true });
  await writeFile(join(source, "src", "vendor", "vexflow-bravura.js"), "// local dynamic drawing asset");
  const html = assets => `<title>original</title><main id="launch-root"><div id="startup-root"></div></main><div id="app"></div>${assets}`;
  const entry = assets => writeFile(join(source, "startup-center.html"), html(assets));
  try { return await run({ container, source, entry }); }
  finally {
    const resolved = await realpath(container), allowed = await realpath(temporary);
    assert.equal(resolved.startsWith(allowed + sep), true, "only remove this test's workspace temporary directory");
    await rm(container, { recursive: true, force: true });
  }
}

test("desktop asset closure preserves the accepted UI/CSS and includes dynamically loaded VexFlow", async () => {
  const { assets } = await readDesktopAssetPlan();
  const html = assets.get("index.html").toString("utf8");
  const original = await readFile(new URL("../startup-center.html", import.meta.url), "utf8");
  assert.equal(html.replace(/<title>[^<]*<\/title>/, original.match(/<title>[^<]*<\/title>/)[0]), original);
  assert.ok(assets.has("styles/scrollbars.css"), "CSS @import is part of the closure");
  assert.ok(assets.has("styles/workspace-layout.css")); assert.ok(assets.has("styles/score-view.css"));
  assert.ok(assets.has("src/vendor/vexflow-bravura.js"), "dynamic font/drawing script is bundled locally");
  assert.ok(assets.has("vendor/startup-center-product.js"));
  assert.doesNotMatch(assets.get("vendor/startup-center-product.js").toString("utf8"), /import\.meta|\bimport\s*\(/);
  assert.equal([...assets.keys()].some(path => /^(evidence|research|tests)\//.test(path)), false);
  assert.equal(assets.has("src/plugin-startup-preview.js"), false, "ship the single generated entry rather than a source/module tree");
  for (const [path, bytes] of assets) if (path.endsWith(".css")) assert.deepEqual(bytes, await readFile(new URL("../" + path, import.meta.url)));
});

test("desktop assets follow relative CSS imports and URL assets once, including import cycles", () => fixture(async ({ source, entry }) => {
  await mkdir(join(source, "styles")); await mkdir(join(source, "images"));
  await writeFile(join(source, "styles", "main.css"), '@import "./child.css"; .a{background:url("../images/local.svg")}');
  await writeFile(join(source, "styles", "child.css"), '@import url("./main.css"); .b{background:url(data:image/png;base64,AA==)}');
  await writeFile(join(source, "images", "local.svg"), "<svg></svg>");
  await entry('<link href="styles/main.css?v=2" rel="stylesheet"><link href="data:," rel="icon">');
  const { assets } = await readDesktopAssetPlan({ sourceRoot: source });
  assert.deepEqual([...assets.keys()].sort(), ["images/local.svg", "index.html", "src/vendor/vexflow-bravura.js", "styles/child.css", "styles/main.css"]);
}));

test("desktop asset plan fails on missing dependencies, remote assets or source-root traversal", () => fixture(async ({ source, container, entry }) => {
  await entry('<link href="missing.css" rel="stylesheet">');
  await assert.rejects(readDesktopAssetPlan({ sourceRoot: source }), /ENOENT/);
  await entry('<script src="https://example.invalid/bootstrap.js"></script>');
  await assert.rejects(readDesktopAssetPlan({ sourceRoot: source }), /must be local/);
  await writeFile(join(container, "outside.js"), "// must not be packaged");
  await entry('<script src="../outside.js"></script>');
  await assert.rejects(readDesktopAssetPlan({ sourceRoot: source }), /escapes source root/);
  await writeFile(join(source, "startup-center.html"), '<div id="app"></div>');
  await assert.rejects(readDesktopAssetPlan({ sourceRoot: source }), /accepted manager\/workspace shell/);
}));

test("desktop asset guard rejects external canonical targets and sibling prefixes", () => fixture(async ({ source, container }) => {
  assert.equal(desktopAssetKey(source, join(source, "styles", "main.css")), "styles/main.css");
  for (const target of [source, container, join(container, "outside", "main.css"), source + "-other" + sep + "main.css"]) {
    assert.throws(() => desktopAssetKey(source, target), /escapes source root/);
  }
}));

test("backup Tauri flavor selects static assets, isolates app/output and reuses the existing host/security", async () => {
  const load = async path => JSON.parse(await readFile(join(root, path), "utf8"));
  const base = await load("apps/desktop/src-tauri/tauri.conf.json"), backup = await load("apps/desktop/src-tauri/tauri.backup.conf.json");
  const scripts = (await load("apps/desktop/package.json")).scripts;
  assert.equal(backup.identifier, "com.brilliantguitar.backup"); assert.notEqual(backup.identifier, base.identifier);
  assert.equal(backup.build.devUrl, null);
  assert.equal(resolve(root, "apps/desktop/src-tauri", backup.build.frontendDist), resolve(root, "design/frame-visual/dist/desktop"));
  for (const hook of [backup.build.beforeDevCommand, backup.build.beforeBuildCommand]) {
    assert.equal(hook.script, "node scripts/build-backup-ui.mjs"); assert.equal(hook.wait, true);
    assert.equal(resolve(root, "apps/desktop/src-tauri", hook.cwd), resolve(root, "apps/desktop"));
  }
  assert.deepEqual(backup.app.windows.map(({ label, width, height, minWidth, minHeight }) => ({ label, width, height, minWidth, minHeight })),
    [{ label: "main", width: 1040, height: 700, minWidth: 760, minHeight: 520 }]);
  assert.deepEqual(backup.app.security.capabilities, ["default", { identifier: "backup-startup-window", windows: ["main"], permissions:
    ["core:window:allow-set-size", "core:window:allow-set-min-size", "core:window:allow-maximize", "core:window:allow-unmaximize"] }]);
  assert.equal(backup.app.security.csp, undefined, "backup does not override CSP");
  assert.equal(base.app.windows[0].width, 1440); assert.equal(base.app.windows[0].height, 900);
  assert.equal(backup.bundle.active, false);
  assert.match(scripts["backup:dev"], /--no-dev-server --no-watch/);
  for (const name of ["backup:dev", "backup:build", "backup:build:debug"]) {
    assert.match(scripts[name], /--config src-tauri\/tauri.backup.conf.json/);
    assert.match(scripts[name], /--target-dir target\/backup-ui --locked --offline/);
  }
  assert.equal(scripts.dev, "node scripts/run-tauri.mjs dev");
  const host = await readFile(join(root, "apps/desktop/src-tauri/src/lib.rs"), "utf8");
  assert.match(host, /commands::workbench_read_plugin_settings_v1/); assert.match(host, /commands::workbench_write_plugin_settings_v1/);
  assert.equal((await load("apps/desktop/src-tauri/capabilities/default.json")).permissions.includes("core:default"), true);
  assert.equal((await load("apps/desktop/src-tauri/capabilities/default.json")).permissions.some(value => backup.app.security.capabilities[1].permissions.includes(value)), false,
    "new geometry writes are granted only in the backup flavor");
});

test("official React manifests/packages fail before document reads, subscriptions or UI acquisition", () => withTestDocument(({ document }) => {
  const root = document.createElement("main"), sentinel = document.createElement("span"); root.append(sentinel); document.body.append(root);
  let reads = 0, subscriptions = 0;
  const documentSession = { read() { reads++; }, subscribe() { subscriptions++; } };
  for (const plugin of [{ id: "official.test", apiVersion: "3.0" }, { manifest: { id: "official.test", apiVersion: "3.0" }, views: [] },
    { namespace: "mixed.test", apiVersion: "3.0", components: [] }, { apiVersion: "4.0" },
    { namespace: "mixed.null", apiVersion: null }, { manifest: { apiVersion: undefined } }]) {
    assert.throws(() => createBackupUiRuntime({ root, documentSession, plugins: [plugin] }), /apiVersion 4\.0.*显式/);
    assert.deepEqual(root.children, [sentinel]);
  }
  assert.equal(reads, 0); assert.equal(subscriptions, 0);
}));

test("supported backup contributions still share one fixed runtime with core score and layout", () => withTestDocument(({ document }) => {
  const root = document.createElement("main"); document.body.append(root); let calls = 0;
  const plugin = defineUiPlugin({ namespace: "native.trial", ui: [], commands: [{ id: "native.trial.read", label: "trial", run() { calls++; return { ok: true }; } }] });
  const runtime = createBackupUiRuntime({ root, plugins: [plugin], legacyPluginMetadata: {
    "native.trial": { id: "native.trial", name: "Native trial", version: "0.1.0", activation: "user", tier: "product" },
  }, enablePluginDiagnostics: true });
  try {
    assert.equal(runtime.execute("native.trial.read").ok, true); assert.equal(calls, 1);
    assert.ok(root.querySelector(".core-score-view"));
    assert.equal(runtime.execute("frame.workspace.page.select", { id: "frame.plugins.diagnostics", toggle: false }).ok, true);
    const statuses = root.querySelectorAll(".plugin-status-row").map(row => row.textContent);
    for (const id of ["frame.builtin", "frame.layout", "notation.core", "native.trial"]) assert.equal(statuses.filter(text => text.includes(id)).length, 1, id);
  } finally { runtime.dispose(); }
  assert.equal(root.children.length, 0); assert.equal(runtime.execute("native.trial.read").ok, false);
}));
