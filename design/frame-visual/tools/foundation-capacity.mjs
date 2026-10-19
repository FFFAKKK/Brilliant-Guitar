import { performance } from "node:perf_hooks";
import { cpus, platform, release, totalmem } from "node:os";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { normalizeStaffSnapshot } from "../src/score/notation-model.js";
import { layoutScorePages } from "../src/vendor/shared-notation/score-page-layout.js";
export { timingStats } from "./capacity-statistics.js";
import { timingStats } from "./capacity-statistics.js";

const frameRoot = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const capacitySizes = Object.freeze([16, 128, 512]);

export function capacityInput(measureCount) {
  if (!Number.isSafeInteger(measureCount) || measureCount < 1 || measureCount > 2048) throw new RangeError("Invalid capacity measure count");
  return { ...structuredClone(STAFF_FIXTURE), title: `Capacity ${measureCount}`, measures: Array.from({ length: measureCount }, (_, index) => {
    const measure = structuredClone(STAFF_FIXTURE.measures[index % STAFF_FIXTURE.measures.length]);
    measure.id = `capacity-measure-${index + 1}`; measure.voiceId = `capacity-voice-${index + 1}`;
    measure.events.forEach((event, eventIndex) => { event.id = `capacity-event-${index + 1}-${eventIndex + 1}`; });
    return measure;
  }) };
}

async function fingerprints() {
  const paths = ["design/frame-visual/src/score/notation-model.js", "design/frame-visual/src/fixtures/staff-snapshot.js",
    "design/frame-visual/tools/foundation-capacity.mjs"];
  for (const name of (await readdir(join(frameRoot, "src", "vendor", "shared-notation"))).filter(name => name.endsWith(".js")).sort()) {
    paths.push(`design/frame-visual/src/vendor/shared-notation/${name}`);
  }
  for (const name of (await readdir(join(root, "shared", "notation"))).filter(name => name.endsWith(".ts")).sort()) {
    paths.push(`shared/notation/${name}`);
  }
  return Promise.all(paths.map(async path => ({ path, sha256: digest(await readFile(join(root, path))) })));
}

/** Measures actual normalization/layout only. No DOM, drawing, native IO or release qualification. */
export async function measureCapacityBaseline() {
  const sourceBefore = await fingerprints(), cases = [];
  for (const size of capacitySizes) {
    const input = capacityInput(size);
    const inputSha256 = digest(JSON.stringify(input));
    const warmups = 3, iterations = 25, samples = [];
    let pages = 0;
    const memoryBefore = process.memoryUsage();
    for (let iteration = -warmups; iteration < iterations; iteration++) {
      const start = performance.now(), accepted = normalizeStaffSnapshot(input), normalized = performance.now();
      const layout = layoutScorePages(accepted), end = performance.now();
      const measureCount = layout.reduce((count, page) => count + page.measures.length, 0);
      if (measureCount !== size) throw new Error("Capacity layout lost input measures");
      if (pages && pages !== layout.length) throw new Error("Capacity page count changed for identical input");
      pages = layout.length;
      if (iteration >= 0) samples.push({ normalizeMs: normalized - start, layoutMs: end - normalized, totalMs: end - start });
    }
    cases.push({ measures: size, events: size * 4, pages, inputSha256, warmups, iterations,
      normalizeMs: timingStats(samples.map(sample => sample.normalizeMs)), layoutMs: timingStats(samples.map(sample => sample.layoutMs)),
      totalMs: timingStats(samples.map(sample => sample.totalMs)), samples,
      memory: { before: memoryBefore, after: process.memoryUsage(), interpretation: "Process snapshots; GC not forced; not a leak or long-term trend verdict" } });
  }
  const sourceAfter = await fingerprints();
  if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter)) throw new Error("Capacity source changed during measurement; candidate is stale");
  return { at: new Date().toISOString(), status: "baseline-only", qualificationG6: "pending", thresholds: null,
    path: "Actual normalizeStaffSnapshot + shared layoutScorePages; no VexFlow/SVG/WebView/native file measurement",
    percentileMethod: "nearest-rank", fixture: "Generated from the checked preview fixture, not a real desktop document",
    environment: { platform: platform(), release: release(), node: process.version, cpuModel: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem() }, sourceFiles: sourceBefore, cases };
}
