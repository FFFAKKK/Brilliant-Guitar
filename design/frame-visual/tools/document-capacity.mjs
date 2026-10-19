import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { cpus, platform, release, totalmem } from "node:os";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { ScoreSessionService } from "../../../apps/workbench/host/score-session.ts";
import { isScoreSessionRead } from "../../../apps/workbench/src/contracts/score-session.ts";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";
import { layoutScorePages } from "../src/vendor/shared-notation/score-page-layout.js";
import { capacityInput, capacitySizes, timingStats } from "./foundation-capacity.mjs";
import { captureFoundationSnapshot } from "../scripts/foundation-boundary-check.mjs";
import { projectRoot, isWithin, hash } from "../scripts/author-validation-kit.mjs";

const require = createRequire(import.meta.url);
const { createScoreDocument, CommandBus } = require("../../../apps/workbench/.kernel/src/core-kernel/index.js");
export const documentCases = Object.freeze([Object.freeze({ name: "empty", measures: 1, events: 0 }),
  ...capacitySizes.map(measures => Object.freeze({ name: `staff-${measures}`, measures, events: measures * 4 }))]);

/** Test-only deterministic initialization through the existing factory and public command bus. */
export function createCapacityDocument({ name, measures, events }) {
  if (!documentCases.some(item => item.name === name && item.measures === measures && item.events === events)) throw new Error("Unknown document capacity case");
  const input = capacityInput(measures);
  if (!events) input.measures[0].events = [];
  const voice = measure => ({ id: measure.voiceId, defaultStaffId: input.staffId,
    sequence: { start: { numerator: 0, denominator: 1 }, events: measure.events.map(event => ({
      id: event.id, duration: event.duration, content: event.content.kind === "rest" ? { kind: "rest" }
        : { kind: "notes", notes: [{ id: `${event.id}-note`, writtenPitch: event.content.pitch }] },
    })) } });
  const created = createScoreDocument({ factoryVersion: 1, documentId: `capacity-${name}`,
    metadata: { title: `Capacity ${name}`, authors: [], tempo: { bpm: input.tempoBpm } },
    initialMeasure: { id: input.measures[0].id, meter: input.measures[0].meter }, extensions: [],
    initialParts: [{ id: input.partId, name: "Capacity staff", instrument: { name: "Generic",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 } },
      staves: [{ id: input.staffId, lineCount: 5, defaultClef: { sign: "G", line: 2 } }], voices: [voice(input.measures[0])] }],
  });
  assert.equal(created.status, "created", JSON.stringify(created));
  const opened = CommandBus.create(created.document); assert.equal(opened.ok, true, JSON.stringify(opened));
  const commands = input.measures.slice(1).map((measure, index) => ({ commandVersion: 1, commandId: "core.measure.insert",
    target: { kind: "document", documentId: created.document.id }, payload: {
      anchor: { kind: "after-measure", measureId: input.measures[index].id }, definition: { id: measure.id, meter: measure.meter },
      contents: [{ partId: input.partId, voices: [voice(measure)] }],
    } }));
  for (let offset = 0; offset < commands.length; offset += 64) {
    const result = opened.value.submit({ commandVersion: 1, commandId: "core.transaction.batch",
      target: { kind: "document", documentId: created.document.id }, payload: { commands: commands.slice(offset, offset + 64) } });
    assert.equal(result.status, "committed", JSON.stringify(result));
  }
  const read = opened.value.read(); assert.equal(read.ok, true);
  // Export through the same host codec as the desktop, after actual Native import acceptance.
  const service = new ScoreSessionService();
  const session = service.importDocument("capacity-fixture", read.value.snapshot.document);
  assertSessionCase(session, { name, measures, events });
  const text = service.exportDocument("capacity-fixture");
  const roundtrip = service.importDocument("capacity-roundtrip", JSON.parse(text));
  assert.deepEqual(roundtrip.notation, session.notation);
  assert.equal(service.exportDocument("capacity-roundtrip"), text);
  return { text, session };
}

export function assertSessionCase(session, expected) {
  assert.ok(isScoreSessionRead(session)); assert.equal(session.notation.kind, "staff");
  assert.equal(session.documentId, `capacity-${expected.name}`); assert.equal(session.measureCount, expected.measures);
  assert.equal(session.title, `Capacity ${expected.name}`);
  assert.equal(session.undoDepth, 0); assert.equal(session.redoDepth, 0);
  assert.equal(session.notation.measures.reduce((sum, measure) => sum + measure.events.length, 0), expected.events);
  const input = capacityInput(expected.measures);
  if (!expected.events) input.measures[0].events = [];
  assert.deepEqual(session.notation.measures.map(measure => ({ id: measure.id, voiceId: measure.voiceId, meter: measure.meter, events: measure.events })),
    input.measures.map(measure => ({ id: measure.id, voiceId: measure.voiceId, meter: measure.meter, events: measure.events })));
}

async function captureCapacitySources() {
  const snapshot = await captureFoundationSnapshot();
  async function walk(path) {
    for (const entry of await readdir(join(projectRoot, path), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Capacity snapshot must not follow symlinks: ${path}/${entry.name}`);
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith(".js")) {
        const bytes = await readFile(join(projectRoot, child));
        snapshot.files.push({ path: child, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk("apps/workbench/.kernel/src");
  const path = "apps/workbench/.kernel/package.json", bytes = await readFile(join(projectRoot, path));
  snapshot.files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  snapshot.files.sort((a, b) => a.path.localeCompare(b.path));
  return snapshot;
}

/** Warm filesystem read + actual host import/Native read + backup projection + shared pagination. */
export async function sampleDocument(path, expected, service = new ScoreSessionService()) {
  const started = performance.now(), bytes = await readFile(path), read = performance.now();
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), parsed = performance.now();
  const session = service.importDocument("capacity-measurement", value), imported = performance.now();
  const projection = createDocumentStaffProjection({ readSession: async () => session });
  let snapshot, pages, projected, laidOut;
  try {
    const result = await projection.refresh(); assert.equal(result.ok, true); assert.equal(projection.snapshot().status, "ready");
    snapshot = projection.read.snapshot(); projected = performance.now();
    pages = layoutScorePages(snapshot); laidOut = performance.now();
  } finally { projection.dispose(); }
  // Semantic assertions are outside the recorded segments; no missing or substituted music passes.
  assertSessionCase(session, expected); assert.deepEqual(snapshot, session.notation);
  assert.equal(pages.reduce((sum, page) => sum + page.measures.length, 0), expected.measures);
  return { session, snapshot, pages: pages.length, bytes: bytes.length,
    timings: { fileReadMs: read - started, parseMs: parsed - read, hostImportReadMs: imported - parsed,
      backupProjectionMs: projected - imported, pageLayoutMs: laidOut - projected, totalToLayoutMs: laidOut - started } };
}

export async function measureDocumentCapacity({ output, warmups = 3, iterations = 25 } = {}) {
  if (!Number.isSafeInteger(warmups) || warmups < 0 || !Number.isSafeInteger(iterations) || iterations < 1) throw new Error("Invalid measurement counts");
  const root = await realpath(projectRoot), requested = resolve(root, output), parent = await realpath(dirname(requested));
  if (!isWithin(root, requested) || !isWithin(root, parent)) throw new Error("Capacity evidence must stay in the workspace");
  const directory = join(parent, basename(requested)); await mkdir(directory); // new candidate only, never overwrite
  const before = await captureCapacitySources();
  await writeFile(join(directory, "source-start.json"), JSON.stringify(before, null, 2) + "\n");
  const nativePath = join(root, "target/integrated-v2/brilliant_kernel_node.node");
  const nativeBefore = hash(await readFile(nativePath));
  const report = { at: new Date().toISOString(), status: "failed", qualificationG6: "pending", thresholds: null,
    scope: "Warm Node filesystem + existing ScoreSessionService Native import/read + actual backup document projection + pagination; no Rust file dialog/IO, IPC, SVG, WebView or cold startup",
    warmups, iterations, percentileMethod: "nearest-rank", nativeAddon: { path: "target/integrated-v2/brilliant_kernel_node.node", sha256: nativeBefore },
    environment: { platform: platform(), release: release(), node: process.version, cpuModel: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem() }, cases: [] };
  try {
    for (const expected of documentCases) {
      const { text } = createCapacityDocument(expected), filename = `${expected.name}.bgp.json`, path = join(directory, filename);
      await writeFile(path, text, { flag: "wx" });
      const service = new ScoreSessionService(), samples = []; let result;
      for (let index = -warmups; index < iterations; index++) {
        result = await sampleDocument(path, expected, service);
        if (index >= 0) samples.push(result.timings);
      }
      const stats = Object.fromEntries(Object.keys(samples[0]).map(key => [key, timingStats(samples.map(sample => sample[key]))]));
      const projectionFile = `${expected.name}.projection.json`, projectionText = JSON.stringify(result.snapshot);
      await writeFile(join(directory, projectionFile), projectionText, { flag: "wx" });
      report.cases.push({ ...expected, filename, bytes: result.bytes, sha256: hash(text), pages: result.pages,
        projectionFile, projectionSha256: hash(projectionText), stats, samples });
    }
    const future = JSON.parse(await readFile(join(directory, "staff-16.bgp.json"), "utf8")); future.schemaVersion = "future-score-version";
    await writeFile(join(directory, "invalid-future.bgp.json"), JSON.stringify(future), { flag: "wx" });
    const service = new ScoreSessionService();
    const good = service.importDocument("capacity-guard", JSON.parse(await readFile(join(directory, "staff-16.bgp.json"), "utf8")));
    assert.throws(() => service.importDocument("capacity-guard", future)); assert.deepEqual(service.read("capacity-guard"), good);
    report.invalidReplacement = { rejected: true, acceptedSessionPreserved: true, sha256: hash(JSON.stringify(future)) };
    report.status = "baseline-only";
  } catch (error) { report.error = error.message; }
  const after = await captureCapacitySources(), nativeAfter = hash(await readFile(nativePath));
  await writeFile(join(directory, "source-end.json"), JSON.stringify(after, null, 2) + "\n");
  const first = new Map(before.files.map(file => [file.path, file.sha256])), last = new Map(after.files.map(file => [file.path, file.sha256]));
  report.changedFiles = [...new Set([...first.keys(), ...last.keys()])].filter(path => first.get(path) !== last.get(path));
  report.changedInputs = [];
  for (const item of report.cases) {
    for (const [filename, expectedHash] of [[item.filename, item.sha256], [item.projectionFile, item.projectionSha256]]) {
      if (hash(await readFile(join(directory, filename))) !== expectedHash) report.changedInputs.push(filename);
    }
  }
  if (report.changedFiles.length || report.changedInputs.length || nativeAfter !== nativeBefore || JSON.stringify(before.absent) !== JSON.stringify(after.absent)) report.status = "stale";
  report.nativeAddon.sha256After = nativeAfter;
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return { ...report, directory };
}
