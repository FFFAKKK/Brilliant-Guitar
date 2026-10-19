import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, isWithin, projectRoot } from "../scripts/author-validation-kit.mjs";
import { runFoundationChecks } from "../scripts/foundation-boundary-check.mjs";

async function fixture(t) {
  const tempRoot = join(projectRoot, ".tmp"); await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, "foundation-check-"));
  t.after(async () => {
    const canonical = await realpath(directory);
    assert.ok(isWithin(await realpath(tempRoot), canonical));
    await rm(canonical, { recursive: true, force: true });
  });
  const watched = join(directory, "watched.js"); await writeFile(watched, "original\n");
  const snapshot = async () => ({ files: [{ path: "watched.js", sha256: hash(await readFile(watched)) }], absent: [] });
  return { directory, watched, snapshot, output: join(directory, "report") };
}

function step(code, id = "probe") { return { id, args: ["-e", code] }; }

test("relative evidence paths and child working directory are stable across caller directories", async t => {
  const input = await fixture(t), moduleUrl = new URL("../scripts/foundation-boundary-check.mjs", import.meta.url).href;
  const code = `import {runFoundationChecks} from ${JSON.stringify(moduleUrl)};
    const result = await runFoundationChecks({ output: ${JSON.stringify(relative(projectRoot, input.output))},
      steps: [{id:'cwd',args:['-e','console.log(process.cwd())']}], snapshot:async()=>({files:[],absent:[]}) });
    console.log(result.status);`;
  const child = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code],
    { cwd: input.directory, windowsHide: true });
  assert.equal(child.stdout.trim(), "passed");
  assert.equal((await readFile(join(input.output, "cwd.log"), "utf8")).trim(), projectRoot.replace(/[\\/]$/, ""));
});

test("the original startup generator validates identical assets from root and an unrelated caller directory", async t => {
  const input = await fixture(t), generator = fileURLToPath(new URL("../scripts/build-plugin-startup.mjs", import.meta.url));
  for (const cwd of [projectRoot, input.directory]) {
    const result = await promisify(execFile)(process.execPath, [generator, "--check"], { cwd, windowsHide: true });
    assert.match(result.stdout, /Startup preview verified/);
  }
});

test("a failed child cannot be approved by a later success; evidence is not overwritten", async t => {
  const input = await fixture(t), marker = join(input.directory, "unexpected");
  const report = await runFoundationChecks({ ...input, steps: [step("process.exit(1)"),
    step(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`, "later")] });
  assert.equal(report.status, "failed"); assert.deepEqual(report.notRun, ["later"]);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  const original = await readFile(join(input.output, "report.json"));
  await assert.rejects(runFoundationChecks({ ...input, steps: [step("process.exit(0)")] }), { code: "EEXIST" });
  assert.deepEqual(await readFile(join(input.output, "report.json")), original);
});

test("a zero exit with skipped, empty or missing test summaries fails the boundary gate", async t => {
  const input = await fixture(t);
  for (const [index, summary] of ["", "# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0",
    "# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0"].entries()) {
    const result = await runFoundationChecks({ ...input, output: join(input.directory, `summary-${index}`),
      steps: [{ ...step(`console.log(${JSON.stringify(summary)})`), test: true }] });
    assert.equal(result.steps[0].exitCode, 0); assert.equal(result.status, "failed");
  }
});

test("actual file drift makes a successful process stale and leaves broader qualification pending", async t => {
  const input = await fixture(t);
  const report = await runFoundationChecks({ ...input, steps: [step(`require('node:fs').writeFileSync(${JSON.stringify(input.watched)}, 'changed')`)] });
  assert.equal(report.steps[0].status, "passed"); assert.equal(report.status, "stale");
  assert.deepEqual(report.changedFiles, ["watched.js"]);
  assert.equal(report.overallFoundationQualification, "pending"); assert.equal(report.independentAuthorQualification, "pending");
  assert.equal(report.capacityQualification, "pending"); assert.equal(report.nativeQualification, "pending");
});

test("timeout records an incomplete process as failed with no later checks", async t => {
  const input = await fixture(t);
  const report = await runFoundationChecks({ ...input, timeoutMs: 250, steps: [step("setInterval(() => {}, 1000)")] });
  assert.equal(report.status, "failed"); assert.equal(report.steps[0].timedOut, true);
});
