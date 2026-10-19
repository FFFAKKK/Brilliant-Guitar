import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAuthorKitFiles, hash, isWithin, projectRoot, validateAuthorDirectory } from "../scripts/author-validation-kit.mjs";
import { capacityInput, capacitySizes, timingStats } from "../tools/foundation-capacity.mjs";
import { normalizeStaffSnapshot } from "../src/score/notation-model.js";
import { layoutScorePages } from "../src/vendor/shared-notation/score-page-layout.js";
import { createBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";

const exec = promisify(execFile), expected = createAuthorKitFiles();
async function workspace(t) {
  const parent = join(projectRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const path = await mkdtemp(join(parent, "author-kit-test-"));
  t.after(async () => {
    assert.ok(isWithin(await realpath(parent), await realpath(path)));
    await rm(path, { recursive: true, force: true });
  });
  const submission = join(path, "submission"); await mkdir(submission);
  for (const [name, bytes] of await expected) await writeFile(join(submission, name), bytes);
  return { path, submission };
}

test("author distribution exposes only the real public definePlugin SDK and records no host/platform sources", async t => {
  const { submission } = await workspace(t), files = await expected;
  const sdk = await import(pathToFileURL(join(submission, "sdk.mjs")));
  assert.deepEqual(Object.keys(sdk), ["definePlugin"]);
  const pkg = sdk.definePlugin({ id: "author.sample", name: "Sample", version: "0.1.0", apiVersion: "4.0" });
  assert.equal(pkg.apiVersion, "4.0");
  const manifest = JSON.parse(files.get("kit-manifest.json"));
  assert.equal(manifest.qualification, "reference-self-check-only");
  assert.ok(manifest.sources.some(source => source.path === "apps/workbench/src/plugins/plugin-sdk.ts"));
  assert.ok(manifest.sources.every(source => !source.path.includes("/src/host/") && !source.path.endsWith("plugin-platform.ts")));
  assert.equal((await validateAuthorDirectory(submission, files)).files.length, 3);
});

test("a package from an independently bundled public SDK is recognized by the existing formal platform", async t => {
  const { submission } = await workspace(t);
  const sdk = await import(pathToFileURL(join(submission, "sdk.mjs")));
  const platform = createBackupFormalPlatform({ components: createComponentRegistry(), router: createCommandRouter(),
    menus: createMenuRegistry([{ id: "view", label: "View" }]) });
  try {
    platform.register(sdk.definePlugin({ id: "author.separate", name: "Separate SDK", version: "0.1.0", apiVersion: "4.0" }));
    platform.start();
    assert.equal(platform.list()[0].manifest.id, "author.separate");
    assert.equal(platform.list()[0].status, "active");
  } finally { platform.dispose(); }
});

test("cross-bundle recognition still rejects an invalid future API and out-of-namespace UI contribution", async t => {
  const { submission } = await workspace(t);
  const sdk = await import(pathToFileURL(join(submission, "sdk.mjs")));
  const platform = createBackupFormalPlatform({ components: createComponentRegistry(), router: createCommandRouter(),
    menus: createMenuRegistry([{ id: "view", label: "View" }]) });
  const valid = sdk.definePlugin({ id: "author.invalid", name: "Invalid probe", version: "0.1.0", apiVersion: "4.0" });
  try {
    assert.throws(() => platform.register({ ...valid, apiVersion: "9.0" }), /Invalid UI plugin manifest/);
    assert.throws(() => platform.register({ ...valid, ui: { contractVersion: 1, components: [], menuItems: [], shortcuts: [],
      commands: [{ id: "other.namespace.run", run() {} }] } }), /Invalid UI plugin manifest/);
    assert.deepEqual(platform.list(), []);
  } finally { platform.dispose(); }
});

test("SDK distribution is byte-identical when built from another working directory", async t => {
  const { path } = await workspace(t);
  const moduleUrl = new URL("../scripts/author-validation-kit.mjs", import.meta.url).href;
  const code = `import {createAuthorKitFiles,hash} from ${JSON.stringify(moduleUrl)}; console.log(hash((await createAuthorKitFiles()).get('sdk.mjs')));`;
  const result = await exec(process.execPath, ["--input-type=module", "-e", code], { cwd: path, windowsHide: true });
  assert.equal(result.stdout.trim(), hash((await expected).get("sdk.mjs")));
});

test("tampered SDK is rejected before loading submitted plugins", async t => {
  const { submission } = await workspace(t);
  await writeFile(join(submission, "sdk.mjs"), "export function definePlugin(value){return value}\n");
  await assert.rejects(validateAuthorDirectory(submission, await expected), /SDK does not match/);
});

test("author import graph rejects outside modules and Node imports before execution", async t => {
  const { path, submission } = await workspace(t);
  await writeFile(join(path, "outside.mjs"), "globalThis.authorOutsideExecuted=true;\n");
  await writeFile(join(submission, "panel-plugin.js"), 'import "../outside.mjs";\n');
  await assert.rejects(validateAuthorDirectory(submission, await expected), /escapes the submission/);
  assert.equal(globalThis.authorOutsideExecuted, undefined);
  await writeFile(join(submission, "panel-plugin.js"), 'import "node:fs";\n');
  await assert.rejects(validateAuthorDirectory(submission, await expected), /must be relative/);
});

test("own static modules are allowed; dynamic import and require are explicitly outside the trial", async t => {
  const { submission } = await workspace(t), files = await expected;
  await writeFile(join(submission, "own.mjs"), 'export const label="own";\n');
  const source = files.get("panel-plugin.js").toString();
  await writeFile(join(submission, "panel-plugin.js"), 'import {label} from "./own.mjs";\n' + source);
  assert.equal((await validateAuthorDirectory(submission, files)).files.length, 4);
  for (const extra of ['import("./own.mjs");', 'require("./own.mjs");']) {
    await writeFile(join(submission, "panel-plugin.js"), source + extra);
    await assert.rejects(validateAuthorDirectory(submission, files), /static ESM imports only/);
  }
});

test("submission runner rejects a semantically broken cleanup and keeps independent author qualification pending", async t => {
  const { path, submission } = await workspace(t), files = await expected;
  const source = files.get("panel-plugin.js").toString();
  await writeFile(join(submission, "panel-plugin.js"), source.replace("ctx.onDispose(source.subscribe(render));", "source.subscribe(render);"));
  const output = join(path, "result");
  await assert.rejects(exec(process.execPath, [fileURLToPath(new URL("../tools/verify-author-submission.mjs", import.meta.url)),
    "--directory", submission, "--output", output], { cwd: projectRoot, windowsHide: true }), error => error.code === 1);
  const report = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
  assert.equal(report.status, "failed"); assert.equal(report.exitCode, 1);
  assert.equal(report.independentAuthorQualification, "pending-separate-author-and-process-record");
  assert.match(await readFile(join(output, "tests.log"), "utf8"), /subscriptions|1 !== 0|actual/);
});

test("capacity inputs remain valid, unique and complete through the actual normalization/layout path", () => {
  for (const size of capacitySizes) {
    const input = normalizeStaffSnapshot(capacityInput(size));
    assert.equal(new Set(input.measures.map(measure => measure.id)).size, size);
    assert.equal(new Set(input.measures.flatMap(measure => measure.events.map(event => event.id))).size, size * 4);
    const pages = layoutScorePages(input);
    assert.equal(pages.reduce((sum, page) => sum + page.measures.length, 0), size);
    assert.ok(pages.every(page => page.measures.every(measure => Number.isFinite(measure.x) && Number.isFinite(measure.y))));
  }
  assert.throws(() => capacityInput(0), RangeError);
});

test("timing summary uses nearest-rank percentiles without discarding slow samples", () => {
  const values = Array.from({ length: 25 }, (_, index) => index + 1).reverse();
  assert.deepEqual(timingStats(values), { count: 25, median: 13, p95: 24, max: 25, mean: 13 });
  assert.equal(values[0], 25);
  assert.throws(() => timingStats([Number.NaN]), TypeError);
});
