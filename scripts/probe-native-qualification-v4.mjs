// One bounded fresh-process preflight on the unchanged Qualification V2 fixture.
// This does NOT run 5 warmups + 20 measured samples or produce qualification.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const script = fileURLToPath(import.meta.url);
const worker = process.argv[2] === "--worker";
const kind = worker ? process.argv[3] : process.argv[2] ?? "representative";
if (!["representative", "stress"].includes(kind) || process.argv.length !== (worker ? 4 : process.argv[2] ? 3 : 2)) {
  throw new Error("usage: node scripts/probe-native-qualification-v4.mjs [representative|stress]");
}
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const contractPath = "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json";
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
if (!worker) {
  const result = spawnSync(process.execPath, ["--expose-gc", script, "--worker", kind],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  let evidence;
  try { evidence = JSON.parse(result.stdout); }
  catch { evidence = { preflightPassed: false, failure: { stage: "worker", error: String(result.error ?? result.stderr) } }; }
  console.log(JSON.stringify({
    evidenceVersion: 1, qualification: false, fixtureKind: kind,
    commit: execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    hashes: Object.fromEntries([
      contractPath, "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
      "test/core-kernel/fixtures/cvn-7-qualification-modules.ts",
      "dist/test/core-kernel/fixtures/cvn-7-qualification-score.js",
      "dist/test/core-kernel/fixtures/cvn-7-qualification-modules.js",
      "test/core-kernel/fixtures/wasm-guest/guest-cvn7.wasm",
      "target/wasm-v1/brilliant_kernel_node.node", script,
    ].map(path => [path, hash(readFileSync(path))])),
    workerExitCode: result.status, workerSignal: result.signal,
    ...evidence,
    limitations: ["One fresh process and one sample per operation; no qualification verdict or percentiles",
      "Synthetic frozen CVN-7 plugins, not real product plugins",
      "Peak RSS includes fixture generation and untimed correctness checks",
      "60-second diagnostic timeout is not the calibrated qualification liveness gate",
      "Full qualification still requires frozen sampling, Batch/replay/stress and complexity evidence"],
  }, null, 2));
  if (result.status !== 0 || evidence.preflightPassed !== true) process.exitCode = 1;
} else {
  const core = require("../dist/src/core-kernel/index.js");
  const fixtures = require("../dist/test/core-kernel/fixtures/cvn-7-qualification-score.js");
  const { createCvn7NativeWasmFixture } = require("../dist/test/core-kernel/fixtures/cvn-7-native-wasm.js");
  const evidence = { preflightPassed: false, operations: [], memory: [] };
  let stage = "fixture", restore;
  const memory = name => evidence.memory.push({ stage: name, ...process.memoryUsage() });
  function measured(name, action) {
    stage = name;
    memory(`${name}-before`);
    const start = performance.now();
    const result = action();
    const durationMs = performance.now() - start;
    const status = result.status ?? (result.ok ? "ok" : "rejected");
    evidence.operations.push({ operation: name, durationMs, status,
      ...(status === "rejected" ? { failure: result.failure } : {}) });
    memory(`${name}-after`);
    assert.notEqual(status, "rejected", `${name} rejected: ${JSON.stringify(result.failure)}`);
    return result;
  }
  const documentHash = document => {
    const encoded = core.encodeScoreDocumentJson(document);
    assert.ok(encoded.ok);
    return hash(Buffer.from(encoded.value));
  };
  try {
    const fixture = kind === "representative" ? fixtures.createRepresentativeCvn7Score() : fixtures.createStressCvn7Score();
    const parts = fixture.document.parts;
    const contents = parts.flatMap(part => part.measureContents);
    const voices = contents.flatMap(content => content.voices);
    const events = voices.flatMap(voice => voice.sequence.events);
    const counts = {
      measures: fixture.document.measureDefinitions.length, parts: parts.length,
      staves: parts.reduce((sum, part) => sum + part.staves.length, 0), measureContents: contents.length,
      voices: voices.length, events: events.length,
      notes: events.reduce((sum, event) => sum + (event.content.kind === "notes" ? event.content.notes.length : 0), 0),
      knownExtensionBlocks: fixture.document.extensions.filter(block => ["fixture.cvn7.score", "fixture.cvn7.part"].includes(block.namespace)).length,
      unknownExtensionBlocks: fixture.document.extensions.filter(block => !["fixture.cvn7.score", "fixture.cvn7.part"].includes(block.namespace)).length,
    };
    assert.deepEqual(counts, contract.fixtureContracts.find(row => row.fixtureKind === kind).counts);
    evidence.fixtureCounts = counts;
    evidence.initialDocumentSha256 = documentHash(fixture.document);
    // Frozen TS behavior is an oracle only; actual measured operations use V4.
    const support = core.validateScoreFeatureProfile(fixture.document, core.K1_SCORE_FEATURE_PROFILE);
    evidence.oracleCoreProfile = { status: support.status, diagnosticCount: support.diagnostics.length,
      codes: support.diagnostics.reduce((counts, diagnostic) => {
        counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1; return counts;
      }, {}) };
    const installed = createCvn7NativeWasmFixture();
    restore = installed.install();
    installed.modules.resetTrace();
    const created = measured("construct-integrated", () => core.CommandBus.createIntegrated(fixture.document, installed.catalog, installed.modules.knownRequirementInventory));
    assert.ok(created.ok);
    const bus = created.value;
    const first = bus.read(); assert.ok(first.ok);
    assert.deepEqual(first.value.snapshot.document, fixture.document);
    evidence.initialNativeSnapshotSha256 = documentHash(first.value.snapshot.document);
    evidence.inputEncodingPreserved = evidence.initialNativeSnapshotSha256 === evidence.initialDocumentSha256;
    evidence.firstExtensionPayloadKeyOrder = {
      fixture: Object.keys(fixture.document.extensions[0].payload),
      native: Object.keys(first.value.snapshot.document.extensions[0].payload),
    };
    const single = installed.modules.createScoreCommand(fixture.document.id, fixture.firstNote.noteId, fixtures.CVN7_D4, "cvn7-worker-single");
    const submitted = measured("submit-single", () => bus.submit(single));
    assert.equal(submitted.documentVersion, 1);
    assert.equal(submitted.undoDepth, 1);
    const changed = bus.read(); assert.ok(changed.ok);
    const changedHash = documentHash(changed.value.snapshot.document);
    assert.notEqual(changedHash, evidence.initialDocumentSha256);
    assert.equal(measured("undo-single", () => bus.undo()).documentVersion, 2);
    const undone = bus.read(); assert.ok(undone.ok);
    assert.deepEqual(undone.value.snapshot.document, fixture.document);
    evidence.undoDataEqual = true;
    evidence.undoDocumentSha256 = documentHash(undone.value.snapshot.document);
    assert.equal(evidence.undoDocumentSha256, evidence.initialNativeSnapshotSha256);
    assert.equal(measured("redo-single", () => bus.redo()).documentVersion, 3);
    const redone = bus.read(); assert.ok(redone.ok);
    assert.equal(documentHash(redone.value.snapshot.document), changedHash);
    const cached = measured("read-cached", () => bus.read()); assert.ok(cached.ok);
    assert.equal(cached.value.snapshot, redone.value.snapshot);
    assert.deepEqual(installed.modules.readTrace(), []);
    evidence.jsCallbackCount = installed.modules.readTrace().length;
    evidence.finalDocumentSha256 = changedHash;
    evidence.operationChecksPassed = true;
    // Continue diagnostics after an input encoding mismatch, but keep the
    // original fixture-byte comparison visible and fail the overall preflight.
    evidence.preflightPassed = evidence.inputEncodingPreserved;
    if (!evidence.inputEncodingPreserved) {
      evidence.failure = { stage: "input-encoding-parity",
        error: "Native input and undo are data-equal to the frozen fixture, but encodeScoreDocumentJson bytes differ; original fixture hash gate remains unmet" };
      process.exitCode = 1;
    }
  } catch (error) {
    evidence.failure = { stage, error: String(error) };
    process.exitCode = 1;
  } finally {
    restore?.();
    evidence.maxRssBytes = process.resourceUsage().maxRSS * 1024;
    console.log(JSON.stringify(evidence));
  }
}
