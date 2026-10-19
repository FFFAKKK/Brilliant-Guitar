import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthorKitFiles, hash, projectRoot, validateAuthorDirectory } from "./author-validation-kit.mjs";
import { captureFoundationSnapshot, changedFiles } from "./foundation-boundary-check.mjs";
import { createEvidenceDirectory, runVerificationProcess } from "./verification-process.mjs";

/** The CLI uses the real snapshot. An injected snapshot supports isolated tooling regression only. */
export async function runAuthorSubmissionChecks({ directory, output, timeoutMs = 30000, snapshot = captureFoundationSnapshot }) {
  const destination = await createEvidenceDirectory(output), input = resolve(projectRoot, directory);
  const report = { at: new Date().toISOString(), phase: "submission-semantic-check", status: "failed",
    independentAuthorQualification: "pending-separate-author-and-process-record",
    scope: "4.0 A/B/C with existing formal platform and DOM double; no production activation, pixels or capacity qualification",
    steps: [], changedFiles: [] };
  let before, expected;
  try {
    before = await snapshot();
    await writeFile(join(destination, "start.json"), JSON.stringify(before, null, 2) + "\n");
    expected = await createAuthorKitFiles();
    report.expectedKitManifestSha256 = hash(expected.get("kit-manifest.json"));
    report.submission = await validateAuthorDirectory(input, expected);
    const env = { ...process.env }; delete env.BRILLIANT_AUTHOR_TRIAL_DIRECTORY;
    const steps = [
      { id: "startup-assets", args: [fileURLToPath(new URL("./build-plugin-startup.mjs", import.meta.url)), "--check"], timeoutMs: 30000 },
      { id: "author-trials", test: true, timeoutMs, args: ["--unhandled-rejections=strict", "--test", "--test-isolation=none", "--test-reporter=tap",
        fileURLToPath(new URL("../tests/infrastructure-author-trials.test.js", import.meta.url))],
        env: { ...env, BRILLIANT_AUTHOR_TRIAL_DIRECTORY: report.submission.directory } },
    ];
    for (const step of steps) {
      const { stdout, stderr, ...result } = await runVerificationProcess({ ...step, env: step.env ?? env });
      const log = step.test ? "tests.log" : "startup-assets.log";
      await writeFile(join(destination, log), stdout + stderr);
      report.steps.push({ id: step.id, ...result, log });
      if (step.test) Object.assign(report, { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, counts: result.counts });
      if (result.status !== "passed") break;
    }
    report.notRun = steps.slice(report.steps.length).map(step => step.id);
    report.status = report.steps.length === steps.length && report.steps.every(step => step.status === "passed") ? "passed" : "failed";
  } catch (error) { report.error = error.message; }
  if (report.submission) {
    try {
      const after = await validateAuthorDirectory(input, expected);
      report.submissionUnchanged = JSON.stringify(report.submission) === JSON.stringify(after);
    } catch (error) { report.submissionUnchanged = false; report.submissionFingerprintError = error.message; }
    try { report.expectedKitUnchanged = report.expectedKitManifestSha256 === hash((await createAuthorKitFiles()).get("kit-manifest.json")); }
    catch (error) { report.expectedKitUnchanged = false; report.expectedKitFingerprintError = error.message; }
    if (!report.submissionUnchanged || !report.expectedKitUnchanged) report.status = "stale";
  }
  if (before) {
    try {
      const after = await snapshot();
      await writeFile(join(destination, "end.json"), JSON.stringify(after, null, 2) + "\n");
      report.changedFiles = changedFiles(before, after);
      if (report.changedFiles.length) report.status = "stale";
    } catch (error) { report.status = "stale"; report.fingerprintError = error.message; }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(destination, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return { ...report, directory: destination };
}
