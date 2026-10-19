import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthorKitFiles, hash, isWithin, projectRoot, validateAuthorDirectory } from "../scripts/author-validation-kit.mjs";
import { runAuthorSubmissionChecks } from "../scripts/author-submission-check.mjs";
import { runVerificationProcess } from "../scripts/verification-process.mjs";

const expected = createAuthorKitFiles(), cli = fileURLToPath(new URL("../tools/verify-author-submission.mjs", import.meta.url));
async function fixture(t) {
  const parent = join(projectRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "author-verifier-")), submission = join(directory, "submission");
  await mkdir(submission);
  for (const [name, bytes] of await expected) await writeFile(join(submission, name), bytes);
  t.after(async () => {
    const canonical = await realpath(directory); assert.ok(isWithin(await realpath(parent), canonical));
    await rm(canonical, { recursive: true, force: true });
  });
  return { directory, submission, output: join(directory, "result") };
}
const emptySnapshot = async () => ({ files: [], absent: [] });
async function append(input, source) {
  await writeFile(join(input.submission, "panel-plugin.js"), (await expected).get("panel-plugin.js").toString() + "\n" + source + "\n");
}

test("the CLI resolves both paths from the repository and verifies real reference behavior with source fingerprints", async t => {
  const input = await fixture(t);
  const result = await promisify(execFile)(process.execPath, [cli, "--directory", relative(projectRoot, input.submission),
    "--output", relative(projectRoot, input.output)], { cwd: input.directory, windowsHide: true,
    env: { ...process.env, BRILLIANT_AUTHOR_TRIAL_DIRECTORY: "unrelated-invalid-selection" } });
  assert.match(result.stdout, /Author submission passed/);
  const report = JSON.parse(await readFile(join(input.output, "report.json"), "utf8"));
  assert.equal(report.counts.tests, 5); assert.equal(report.counts.pass, 5);
  assert.equal(report.submissionUnchanged, true); assert.equal(report.expectedKitUnchanged, true);
  assert.deepEqual(report.changedFiles, []); assert.equal(report.steps[0].id, "startup-assets");
  assert.match(report.independentAuthorQualification, /^pending/);
  const before = JSON.parse(await readFile(join(input.output, "start.json"), "utf8"));
  assert.ok(before.files.some(file => file.path === "apps/workbench/src/plugins/plugin-platform.ts"));
});

test("an author exiting successfully before any test is rejected and its evidence cannot be overwritten", async t => {
  const input = await fixture(t); await append(input, "process.exit(0);");
  const report = await runAuthorSubmissionChecks({ directory: input.submission, output: input.output, snapshot: emptySnapshot });
  assert.equal(report.exitCode, 0); assert.equal(report.counts.tests, null); assert.equal(report.status, "failed");
  assert.doesNotMatch(await readFile(join(input.output, "tests.log"), "utf8"), /^# tests /m);
  const saved = await readFile(join(input.output, "report.json"));
  await assert.rejects(runAuthorSubmissionChecks({ directory: input.submission, output: input.output }), { code: "EEXIST" });
  assert.deepEqual(await readFile(join(input.output, "report.json")), saved);
});

test("metadata bytes are included in the submission identity", async t => {
  const input = await fixture(t), before = await validateAuthorDirectory(input.submission, await expected);
  await writeFile(join(input.submission, "package.json"), '{"type":"module","name":"changed"}\n');
  const after = await validateAuthorDirectory(input.submission, await expected);
  assert.notEqual(before.metadataSha256, after.metadataSha256); assert.deepEqual(before.files, after.files);
});

test("metadata changed or invalidated during execution makes completed tests stale", async t => {
  for (const [index, contents] of ['{"type":"module","name":"changed"}', '{"broken":'].entries()) {
    const input = await fixture(t);
    // Controlled probe: dependency discipline is expressly not a process sandbox.
    await append(input, `process.getBuiltinModule('node:fs').writeFileSync(new URL('./package.json', import.meta.url), ${JSON.stringify(contents)});`);
    const report = await runAuthorSubmissionChecks({ directory: input.submission, output: input.output, snapshot: emptySnapshot });
    assert.equal(report.status, "stale", String(index)); assert.equal(report.submissionUnchanged, false);
    if (index === 0) assert.equal(report.counts.pass, 5);
    else assert.ok(report.submissionFingerprintError);
  }
});

test("host source drift or a missing final fingerprint invalidates an otherwise successful submission", async t => {
  for (const missing of [false, true]) {
    const input = await fixture(t); let count = 0;
    const snapshot = async () => {
      if (++count === 2 && missing) throw new Error("source unavailable");
      return { files: [{ path: "controlled-host.js", sha256: hash(String(count)) }], absent: [] };
    };
    const report = await runAuthorSubmissionChecks({ directory: input.submission, output: input.output, snapshot });
    assert.equal(report.counts.pass, 5); assert.equal(report.status, "stale");
    if (missing) assert.equal(report.fingerprintError, "source unavailable");
    else assert.deepEqual(report.changedFiles, ["controlled-host.js"]);
  }
});

test("the shared process rule rejects incomplete, skipped or duplicate summaries even with exit zero", async () => {
  const summary = "# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0";
  for (const text of ["", "# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0",
    summary.replace("# skipped 0", "# skipped 1"), summary + "\n# tests 1"]) {
    const result = await runVerificationProcess({ args: ["-e", `console.log(${JSON.stringify(text)})`], test: true });
    assert.equal(result.exitCode, 0); assert.equal(result.status, "failed");
  }
  const complete = await runVerificationProcess({ args: ["-e", `console.log(${JSON.stringify(summary)})`], test: true });
  assert.equal(complete.status, "passed");
});

test("timeout cannot pass and cannot discard the author process log", async t => {
  const input = await fixture(t); await append(input, "console.log('author blocked'); setInterval(() => {}, 1000); await new Promise(() => {});");
  const report = await runAuthorSubmissionChecks({ directory: input.submission, output: input.output, snapshot: emptySnapshot, timeoutMs: 1500 });
  assert.equal(report.status, "failed"); assert.equal(report.timedOut, true);
  assert.match(await readFile(join(input.output, "tests.log"), "utf8"), /author blocked/);
});
