// Bounded fresh-process diagnostic of mixed Core/Wasm Batch replay.
// No qualification verdict: one sample, synthetic plugins, no percentiles.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
const script = fileURLToPath(import.meta.url);
const worker = process.argv[2] === "--worker";
const args = process.argv.slice(worker ? 3 : 2);
if (args.length !== 2 || !["representative", "stress"].includes(args[0])) {
  throw new Error("usage: node scripts/profile-native-paged-batch.mjs representative|stress addon-path");
}
const [kind, inputPath] = args;
const addonPath = resolve(inputPath);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
if (!worker) {
  const result = spawnSync(process.execPath, [script, "--worker", kind, addonPath],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  let evidence;
  try { evidence = JSON.parse(result.stdout); }
  catch { evidence = { passed: false, error: String(result.error ?? result.stderr) }; }
  const progress = String(result.stderr ?? "").split("\n")
    .filter(line => line.startsWith("batch-stage "))
    .map(line => {
      try { return JSON.parse(line.slice("batch-stage ".length)); }
      catch { return { event: "incomplete-progress", raw: line }; }
    });
  console.log(JSON.stringify({
    qualification: false, node: process.version, platform: process.platform,
    arch: process.arch, fixtureKind: kind, addonPath,
    addonSha256: sha(readFileSync(addonPath)), scriptSha256: sha(readFileSync(script)),
    workerExitCode: result.status, workerSignal: result.signal, ...evidence, progress,
    limitations: ["One fresh process, one sample per operation; no percentiles",
      "Synthetic frozen plugins, no product qualification",
      "Peak RSS includes fixture generation and correctness checks",
      "60-second diagnostic timeout is not a formal liveness gate"],
  }, null, 2));
  if (result.status !== 0 || evidence.passed !== true) process.exitCode = 1;
} else {
  const scores = require("../dist/test/core-kernel/fixtures/cvn-7-qualification-score.js");
  const { createCvn7NativeWasmFixture } = require("../dist/test/core-kernel/fixtures/cvn-7-native-wasm.js");
  const { encodeIntegratedValueV2: encode } = require("../dist/src/core-kernel/native/integrated-wire.js");
  const evidence = { passed: false, operations: [] };
  let stage = "fixture";
  const measured = (name, action) => {
    stage = name;
    process.stderr.write(`batch-stage ${JSON.stringify({ stage: name, event: "start", atMs: performance.now() })}\n`);
    const beforeRss = process.memoryUsage().rss;
    const start = performance.now();
    const result = action();
    process.stderr.write(`batch-stage ${JSON.stringify({ stage: name, event: "end", atMs: performance.now() })}\n`);
    evidence.operations.push({ operation: name, durationMs: performance.now() - start,
      beforeRss, afterRss: process.memoryUsage().rss,
      ...(typeof result === "object" ? { status: result.result?.status ?? result.ok,
        metrics: result.result?.value?.metrics, stage4Metrics: result.result?.value?.stage4Metrics } : {}) });
    return result;
  };
  try {
    const fixture = kind === "stress" ? scores.createStressCvn7Score() : scores.createRepresentativeCvn7Score();
    const plugins = createCvn7NativeWasmFixture(require(addonPath));
    evidence.fixtureCounts = fixture.counts;
    const contract = JSON.parse(readFileSync("test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json", "utf8"));
    assert.deepEqual(fixture.counts, contract.fixtureContracts.find(row => row.fixtureKind === kind).counts);
    evidence.guestSha256 = plugins.guestSha256;
    const originalHash = sha(encode(fixture.document));
    evidence.originalHash = originalHash;
    const operate = measured("construct", () => plugins.createPaged(fixture.document));
    plugins.modules.resetTrace();
    const invoke = request => JSON.parse(operate(encode(request)).toString("utf8"));
    const batch = { commandVersion: 1, commandId: "core.transaction.batch",
      target: { kind: "document", documentId: fixture.document.id },
      payload: { commands: [
        plugins.modules.createScoreCommand(fixture.document.id, fixture.firstNote.noteId, scores.CVN7_D4, "batch-profile"),
        plugins.modules.createPartCommand(fixture.lastPartId, fixture.lastNote.noteId, scores.CVN7_D4, "part-profile"),
        { commandVersion: 1, commandId: "core.document.set-metadata",
          target: { kind: "document", documentId: fixture.document.id },
          payload: { metadata: { ...fixture.document.metadata, title: "batch-profile" } } },
      ] } };
    for (const [name, request, version] of [
      ["submit-batch", { operation: "submit", command: batch }, 1],
      ["undo-batch", { operation: "undo" }, 2],
      ["redo-batch", { operation: "redo" }, 3],
    ]) {
      const result = measured(name, () => invoke(request));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.result.status, "committed");
      assert.equal(result.result.value.documentVersion, version);
      const read = invoke({ operation: "read", knownSnapshotVersion: null });
      assert.equal(read.ok, true);
      const currentHash = sha(encode(read.state.snapshot.document));
      if (name === "submit-batch") evidence.changedHash = currentHash;
      else if (name === "undo-batch") {
        evidence.undoHash = currentHash;
        assert.equal(currentHash, originalHash);
      } else assert.equal(currentHash, evidence.changedHash);
    }
    assert.deepEqual(plugins.modules.readTrace(), []);
    evidence.passed = true;
  } catch (error) {
    evidence.failure = { stage, error: String(error) };
    process.exitCode = 1;
  } finally {
    evidence.maxRssBytes = process.resourceUsage().maxRSS * 1024;
    console.log(JSON.stringify(evidence));
  }
}
