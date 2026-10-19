import { build } from "esbuild";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { frameRoot, projectRoot, hash, isWithin } from "./author-validation-kit.mjs";
import { classicNotationAssetPlugin } from "./classic-notation-asset.mjs";
import { validateNotationCapacityInputs } from "../tools/notation-capacity.js";
import { normalizeStaffSnapshot } from "../src/score/notation-model.js";

export const notationCapacityFixtureFolder = "design/frame-visual/evidence/document-capacity-20261008/run-02";
const fixtureFolder = notationCapacityFixtureFolder;
const policyPath = "design/frame-visual/notation-capacity-policy-v0.1.json";
const templatePath = "design/frame-visual/tools/notation-capacity-page.html";
export async function createNotationCapacityFiles() {
  const policyBytes = await readFile(join(projectRoot, policyPath)), policy = JSON.parse(policyBytes);
  if (policy.warmups !== 3 || policy.iterations !== 25 || policy.minimumTarget?.cpuPhysicalCores !== 4
    || policy.minimumTarget.ramGiB !== 8 || policy.minimumTarget.referenceDeviceId !== null) throw new Error("Unexpected frozen drawing policy");
  const reportPath = `${fixtureFolder}/report.json`, reportBytes = await readFile(join(projectRoot, reportPath));
  const report = JSON.parse(reportBytes), cases = [];
  if (report.status !== "baseline-only" || report.cases.length !== 4 || report.changedInputs.length || report.changedFiles.length) {
    throw new Error("Drawing fixtures require an accepted real-file baseline");
  }
  const sources = new Map();
  async function source(path) {
    const absolute = resolve(projectRoot, path);
    if (!isWithin(projectRoot, absolute) || !isWithin(await realpath(projectRoot), await realpath(absolute))) throw new Error("Capacity source must stay in the workspace");
    const bytes = await readFile(absolute); sources.set(path, { path, bytes: bytes.length, sha256: hash(bytes) }); return bytes;
  }
  await source(policyPath); await source(reportPath);
  for (const [index, item] of report.cases.entries()) {
    const expected = policy.cases[index];
    if (item.name !== expected.name || item.filename !== `${expected.name}.bgp.json`
      || item.projectionFile !== `${expected.name}.projection.json`) throw new Error("Unexpected real-file fixture names");
    const projection = await source(`${fixtureFolder}/${item.projectionFile}`), document = await source(`${fixtureFolder}/${item.filename}`);
    if (hash(projection) !== item.projectionSha256 || hash(document) !== item.sha256) throw new Error("Real-file fixture fingerprint changed");
    const snapshot = normalizeStaffSnapshot(JSON.parse(projection));
    cases.push({ name: item.name, snapshot, documentSha256: item.sha256, projectionSha256: item.projectionSha256 });
  }
  validateNotationCapacityInputs(cases, policy);
  const bundle = await build({ absWorkingDir: frameRoot, entryPoints: [join(frameRoot, "tools/notation-capacity-page.js")],
    bundle: true, format: "iife", target: "es2022", write: false, metafile: true, legalComments: "inline",
    banner: { js: "// Generated readonly notation capacity tool; edit tools, not this bundle." }, plugins: [classicNotationAssetPlugin()] });
  for (const input of Object.keys(bundle.metafile.inputs)) {
    const absolute = resolve(frameRoot, input);
    if (!isWithin(projectRoot, absolute)) throw new Error("Capacity bundle source must stay in the workspace");
    await source(relative(projectRoot, absolute).replaceAll("\\", "/"));
  }
  for (const path of [templatePath, "design/frame-visual/scripts/notation-capacity-assets.mjs",
    "design/frame-visual/scripts/build-notation-capacity.mjs", "design/frame-visual/scripts/classic-notation-asset.mjs",
    "design/frame-visual/src/vendor/vexflow-bravura.js", "design/frame-visual/src/vendor/shared-notation/source-manifest.json", "package-lock.json"]) await source(path);
  const sharedManifest = JSON.parse(await readFile(join(frameRoot, "src/vendor/shared-notation/source-manifest.json"), "utf8"));
  for (const name of Object.keys(sharedManifest.files)) await source(`shared/notation/${name}`);
  const sourceFiles = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  const candidate = { buildId: hash(JSON.stringify(sourceFiles)), sources: sourceFiles, fixtureFolder,
    qualificationG6: "pending", runtimeSourceVerification: "requires before-and-after generator check" };
  const template = (await source(templatePath)).toString();
  if (template.split("<!-- CAPACITY_DATA -->").length !== 2) throw new Error("Capacity template needs one data slot");
  const data = JSON.stringify({ policy, cases, candidate }).replaceAll("<", "\\u003c");
  const html = template.replace("<!-- CAPACITY_DATA -->", `<script id="capacity-inputs" type="application/json">${data}</script>`);
  const files = new Map([["notation-capacity-preview.html", Buffer.from(html)], ["vendor/notation-capacity-preview.js", bundle.outputFiles[0].contents]]);
  const manifest = { format: 1, buildId: candidate.buildId, policyId: policy.id, sources: sourceFiles,
    artifacts: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })) };
  files.set("vendor/notation-capacity-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  return { files, manifest };
}
