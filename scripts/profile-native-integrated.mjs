// Bounded diagnostic workload, not the frozen CVN-7 qualification runner.
// Run after scripts/build.mjs; --expose-gc permits comparable idle heap samples.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
const require = createRequire(import.meta.url);
const { CommandBus } = require("../dist/src/core-kernel/index.js");
const { createNativeWorkloadScore: score } = require("../dist/test/core-kernel/fixtures/native-workload.js");
const { compileOfficialModuleCatalogV1 } = require("../dist/src/core-kernel/module-sdk/index.js");
const { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES } = require("../dist/test/core-kernel/fixtures/cvn-6-synthetic-official-modules.js");
const { installNativeWasmOnlyIntegratedBackendV1 } = require("../dist/src/native-host/wasm-bindings.js");
const { installNativeWasmCoreReadsBackendV2, installNativeWasmScheduledAssessmentV3 } = require("../dist/src/native-host/wasm-core-reads.js");
const addon = require("../target/wasm-v1/brilliant_kernel_node.node");
const scheduled = process.argv[2] === "--scheduled-assessment-v3";
const selective = process.argv[2] === "--core-reads-v2" || scheduled;
if (!(process.argv.length === 2 || (process.argv.length === 3 && selective) ||
  (process.argv.length === 4 && process.argv[2] === "--guest"))) {
  throw new Error("usage: node --expose-gc scripts/profile-native-integrated.mjs [--guest path | --core-reads-v2 | --scheduled-assessment-v3]");
}
const guestPath = resolve(selective ? "test/core-kernel/fixtures/wasm-guest/guest-v2.wasm"
  : process.argv[3] ?? "test/core-kernel/fixtures/wasm-guest/guest.wasm");
const guest = readFileSync(guestPath), guestSha256 = createHash("sha256").update(guest).digest("hex");
const stats = {};
let failedGuest;
function clear() { for (const key of ["nativeCalls", "nativeResponseBytes", "hostCalls", "hostMs", "hostRequestBytes", "guestCalls", "guestMs", "guestBytes", "maxGuestInputBytes"]) stats[key] = 0; }
const observed = { ...addon,
  createIntegratedKernelSessionV2(input, callback, readProtocol) {
    const operate = addon.createIntegratedKernelSessionV2(input, request => {
      stats.hostCalls++; stats.hostRequestBytes += request.length;
      const start = performance.now();
      try { return callback(request); } finally { stats.hostMs += performance.now() - start; }
    }, readProtocol);
    return request => {
      stats.nativeCalls++;
      const output = operate(request);
      stats.nativeResponseBytes += output.length;
      return output;
    };
  },
  createWasmModuleExecutorV1(...args) {
    const execute = addon.createWasmModuleExecutorV1(...args);
    return input => {
      const start = performance.now(); stats.guestCalls++; stats.guestBytes += input.length;
      stats.maxGuestInputBytes = Math.max(stats.maxGuestInputBytes, input.length);
      try { const output = execute(input); stats.guestBytes += output.length; return output; }
      catch (error) { failedGuest = { execute, input, message: String(error) }; throw error; }
      finally { stats.guestMs += performance.now() - start; }
    };
  },
};
function command(marker) {
  return { commandVersion: 1, commandId: "fixture.score.apply", target: { kind: "document", documentId: "score-1" },
    payload: { noteId: "note-1", pitch: { step: "E", alter: 0, octave: 4 }, schemaVersion: 1, marker } };
}
function measure(name, samples, action) {
  clear(); const times = [];
  for (let i = 0; i < samples; i++) { const start = performance.now(); action(i); times.push(performance.now() - start); }
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { name, samples, medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    maxMs: sorted.at(-1), ...stats };
}
const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
assert.ok(compiled.ok);
const installer = scheduled ? installNativeWasmScheduledAssessmentV3
  : selective ? installNativeWasmCoreReadsBackendV2 : installNativeWasmOnlyIntegratedBackendV1;
const restore = installer(observed, compiled.catalog, ["score", "part"].map(module => ({
  moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`, abiVersion: 1,
  sha256: guestSha256, bytes: guest,
})));
const rows = [];
try {
  for (const measures of [16, 64, 256]) {
    global.gc?.(); const before = process.memoryUsage();
    const document = score(measures), phases = [], failures = [];
    let bus;
    phases.push(measure("create", 1, () => { const created = CommandBus.createIntegrated(document, compiled.catalog); assert.ok(created.ok); bus = created.value; }));
    phases.push(measure("core-metadata", 6, i => {
      const result = bus.submit({ commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
        payload: { metadata: { ...document.metadata, title: `profile-${i}` } } });
      assert.equal(result.status, "committed", JSON.stringify(result));
    }));
    const first = bus.read(); assert.ok(first.ok);
    phases.push(measure("stable-read", 12, () => { const next = bus.read(); assert.ok(next.ok); assert.equal(next.value.snapshot, first.value.snapshot); }));
    failedGuest = undefined;
    let pluginCommits = 0;
    phases.push(measure("plugin-edit", 6, i => {
      const result = bus.submit(command(`profile-${i}`));
      if (result.status === "committed") pluginCommits++;
      else {
        assert.equal(result.status, "rejected");
        failures.push({ operation: "plugin-edit", sample: i, failure: result.failure });
      }
    }));
    if (failedGuest) {
      const { execute, input, message } = failedGuest;
      const request = JSON.parse(input.toString("utf8"));
      let standalone;
      try { execute(input); standalone = "passed"; } catch { standalone = "rejected"; }
      failures.push({ probe: "same-guest-input-outside-operation-budget", operation: request.operation, inputBytes: input.length,
        standalone, message, interpretation: standalone === "rejected" ? "Per-callback guest constraint; shared operation budget is not required to reproduce" : "Investigate aggregate operation budget" });
    }
    phases.push(measure("undo-redo", 3, () => { assert.equal(bus.undo().status, "committed"); assert.equal(bus.redo().status, "committed"); }));
    const state = bus.read(); assert.ok(state.ok); assert.equal(state.value.history.undoDepth, 6 + pluginCommits);
    assert.equal(state.value.snapshot.document.parts[0].measureContents.length, measures);
    const retained = process.memoryUsage(); global.gc?.(); const afterGc = process.memoryUsage();
    rows.push({ measures, notes: measures * 4, documentBytes: Buffer.byteLength(JSON.stringify(document)), phases, failures,
      memory: { before, retained, afterGc } });
    bus = undefined;
  }
} finally { restore(); }
process.stdout.write(JSON.stringify({ profileVersion: scheduled ? 4 : selective ? 3 : 2,
  mode: scheduled ? "rust-scheduled-assessment-v3" : selective ? "selective-core-reads-v2" : "full-view-v1",
  guestArtifact: { path: relative(process.cwd(), guestPath), sha256: guestSha256 },
  node: process.version, platform: platform(), arch: arch(),
  cpu: cpus()[0]?.model, gcExposed: typeof global.gc === "function", rows,
  limitations: ["Synthetic one-part four-note-per-bar fixture with two installed test plugins; not product qualification",
    "Sequential samples with instrumentation overhead; hostMs includes guestMs, do not add them",
    "RSS snapshots are not peak memory or leak proof; no UI/rendering/audio cost included"] }, null, 2) + "\n");
