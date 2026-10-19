import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { hash, projectRoot } from "./author-validation-kit.mjs";
import { createEvidenceDirectory, runVerificationProcess } from "./verification-process.mjs";
import { readDesktopAssetPlan } from "./desktop-assets.mjs";
import { notationCapacityFixtureFolder } from "./notation-capacity-assets.mjs";

const require = createRequire(import.meta.url);
const frame = "design/frame-visual";
const formalTests = ["desktop-startup-window", "plugin-foundation", "plugin-mount", "notation-interaction-registry", "tablature-domain-integration", "fretted-range", "tablature-layout", "score-dual-notation-read", "readonly-score-document-session", "readonly-score-input", "readonly-score-range-clipboard", "readonly-score-measure", "readonly-score-key-signature", "readonly-score-staff-clef", "readonly-score-fretted-position", "readonly-score-metadata", "readonly-score-history-save", "recent-documents"];
const backupTests = ["startup-appearance", "startup-center-product", "startup-center-session", "infrastructure-foundation", "infrastructure-author-trials", "author-validation-kit", "author-submission-verifier", "foundation-boundary-check",
  "formal-plugin-convergence", "notation-interaction-boundary", "tablature-rendering", "plugin-startup-desktop", "configurable-plugin-assembly", "document-capacity", "notation-capacity", "dom-event-lifecycle", "real-document-readonly", "document-staff-projection", "score-selection", "score-note-input"];

// Selection only: the original platforms, assertions and generators remain authoritative.
export function foundationCheckSteps() {
  const script = (id, path) => ({ id, args: [path, "--check"] });
  return [
    script("notation-assets", `${frame}/scripts/build-notation.mjs`),
    script("motion-assets", `${frame}/scripts/build-motion.mjs`),
    script("startup-assets", `${frame}/scripts/build-plugin-startup.mjs`),
    script("startup-center-product-assets", `${frame}/scripts/build-startup-center-product.mjs`),
    script("desktop-assets", `${frame}/scripts/build-desktop.mjs`),
    script("author-kit", `${frame}/scripts/build-author-validation-kit.mjs`),
    script("notation-capacity-assets", `${frame}/scripts/build-notation-capacity.mjs`),
    ...["tsconfig.json", "tsconfig.test.json"].map((config, index) => ({ id: index ? "test-types" : "production-types",
      args: [require.resolve("typescript/bin/tsc"), "--noEmit", "-p", `apps/workbench/${config}`] })),
    { id: "formal-boundaries", test: true, args: ["--experimental-strip-types", "--unhandled-rejections=strict",
      "--test", "--test-reporter=tap", ...formalTests.map(name => `apps/workbench/test/${name}.test.ts`)] },
    { id: "backup-boundaries", test: true, args: ["--unhandled-rejections=strict", "--test", "--test-isolation=none",
      "--test-reporter=tap", ...backupTests.map(name => `${frame}/tests/${name}.test.js`)] },
  ];
}

export async function captureFoundationSnapshot() {
  const files = new Map(), absent = [];
  async function include(path) {
    const bytes = await readFile(join(projectRoot, path));
    files.set(path, { path, bytes: bytes.length, sha256: hash(bytes) });
  }
  async function walk(path) {
    let entries;
    try { entries = await readdir(join(projectRoot, path), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") { absent.push(path); return; } throw error; }
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Snapshot does not follow linked directories: ${child}`);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) await include(child);
    }
  }
  for (const path of ["apps/workbench/src", "apps/workbench/host", "apps/workbench/test", "shared",
    `${frame}/src`, `${frame}/scripts`, `${frame}/tools`, `${frame}/tests`, `${frame}/examples/foundation`,
    `${frame}/dist/author-validation`, `${frame}/dist/desktop`, notationCapacityFixtureFolder, "apps/agent/dist", "apps/kernel/dist"]) await walk(path);
  for (const path of ["package.json", "package-lock.json", "apps/workbench/package.json", "apps/workbench/package-lock.json",
    "apps/workbench/tsconfig.json", "apps/workbench/tsconfig.test.json", `${frame}/package.json`, `${frame}/package-lock.json`,
    `${frame}/author-validation-guide-v4.md`, `${frame}/plugin-startup-config-static-preview.html`,
    `${frame}/notation-capacity-policy-v0.1.json`, `${frame}/notation-capacity-preview.html`,
    `${frame}/vendor/notation-capacity-preview.js`, `${frame}/vendor/notation-capacity-manifest.json`]) {
    try { await include(path); } catch (error) { if (error.code === "ENOENT") absent.push(path); else throw error; }
  }
  const assets = await readDesktopAssetPlan();
  for (const path of assets.assets.keys()) if (path !== "index.html") await include(`${frame}/${path}`);
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), absent: absent.sort() };
}

export function changedFiles(before, after) {
  const first = new Map(before.files.map(file => [file.path, file.sha256]));
  const last = new Map(after.files.map(file => [file.path, file.sha256]));
  return [...new Set([...first.keys(), ...last.keys(), ...(before.absent ?? []), ...(after.absent ?? [])])].sort()
    .filter(path => first.get(path) !== last.get(path)
      || (before.absent ?? []).includes(path) !== (after.absent ?? []).includes(path));
}

async function runStep(step, output, timeoutMs) {
  const env = { ...process.env }; delete env.BRILLIANT_AUTHOR_TRIAL_DIRECTORY;
  const result = await runVerificationProcess({ ...step, timeoutMs, env });
  await writeFile(join(output, `${step.id}.log`), result.stdout + result.stderr);
  const { stdout, stderr, ...details } = result;
  return { id: step.id, ...details, log: `${step.id}.log` };
}

/** Options support isolated tooling tests; the CLI always uses the fixed real check selection. */
export async function runFoundationChecks({ output, steps = foundationCheckSteps(), snapshot = captureFoundationSnapshot,
  timeoutMs = 60000, onProgress = () => {} }) {
  if (!steps.length || new Set(steps.map(step => step.id)).size !== steps.length
    || steps.some(step => !/^[a-z][a-z0-9-]*$/.test(step.id))) throw new Error("Provide a nonempty check selection with unique log IDs");
  const destination = await createEvidenceDirectory(output);
  const report = { startedAt: new Date().toISOString(), status: "failed", kind: "foundation-boundary-regression",
    scope: "Selected public SDK/platform, settings, readonly/lifecycle and generated assets; not all repository dependencies or native qualification.",
    overallFoundationQualification: "pending", independentAuthorQualification: "pending", capacityQualification: "pending",
    nativeQualification: "pending", steps: [], changedFiles: [] };
  let before;
  try {
    before = await snapshot();
    await writeFile(join(destination, "start.json"), JSON.stringify(before, null, 2) + "\n");
    for (const step of steps) {
      onProgress(`Checking ${step.id}`);
      const result = await runStep(step, destination, timeoutMs); report.steps.push(result);
      onProgress(`${step.id}: ${result.status}`);
      if (result.status !== "passed") break;
    }
    report.status = report.steps.length === steps.length && report.steps.every(step => step.status === "passed") ? "passed" : "failed";
  } catch (error) { report.error = error.message; }
  if (before) {
    try {
      const after = await snapshot();
      await writeFile(join(destination, "end.json"), JSON.stringify(after, null, 2) + "\n");
      report.changedFiles = changedFiles(before, after);
      if (report.changedFiles.length) report.status = "stale";
    } catch (error) { report.status = "stale"; report.fingerprintError = error.message; }
  }
  report.notRun = steps.slice(report.steps.length).map(step => step.id);
  report.finishedAt = new Date().toISOString();
  await writeFile(join(destination, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return { ...report, directory: destination };
}
