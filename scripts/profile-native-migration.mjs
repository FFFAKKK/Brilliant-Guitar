// Bounded reference diagnostic, not release qualification. Build TS and the
// wasm-bridge-v1 addon first; run separately from builds/tests/profile jobs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
const require = createRequire(import.meta.url);
const { migrateKernelExtension } = require("../dist/src/core-kernel/index.js");
const { compileOfficialModuleCatalogV1 } = require("../dist/src/core-kernel/module-sdk/index.js");
const { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES } = require("../dist/test/core-kernel/fixtures/cvn-6-synthetic-official-modules.js");
const { createNativeWorkloadScore } = require("../dist/test/core-kernel/fixtures/native-workload.js");
const { installNativeWasmCoreReadsBackendV2, installNativeWasmScheduledEditingV4 } = require("../dist/src/native-host/wasm-core-reads.js");
const addonPath = "target/wasm-v1/brilliant_kernel_node.node";
const addon = require(`../${addonPath}`);
const guest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest-v2.wasm");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const bindings = ["score", "part"].map(module => ({
  moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`,
  abiVersion: 1, sha256: hash(guest), bytes: guest,
}));
const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
assert.ok(compiled.ok);
const rows = [];
for (const bars of [16, 64, 256]) {
  const document = { ...createNativeWorkloadScore(bars), extensions: [
    { namespace: "fixture.score", owner: { kind: "score" }, schemaVersion: 1, payload: { marker: "old" } },
    { namespace: "fixture.part", owner: { kind: "part", partId: "part-1" }, schemaVersion: 1, payload: { marker: "part" } },
  ] };
  const request = { migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
    namespace: "fixture.score", effectKind: "fixture.score.replace", owner: { kind: "score" },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "migrated" } };
  const expected = migrateKernelExtension(document, request, compiled.catalog);
  assert.equal(expected.status, "migrated");
  for (const [mode, install] of [[2, installNativeWasmCoreReadsBackendV2], [4, installNativeWasmScheduledEditingV4]]) {
    const stats = { hostCalls: 0, hostRequestBytes: 0, hostResponseBytes: 0, initialInputBytes: 0, resultBytes: 0 };
    const transport = { ...addon, migrateKernelExtensionV2(input, callback, version) {
      assert.equal(version, mode);
      stats.initialInputBytes += input.length;
      const result = addon.migrateKernelExtensionV2(input, bytes => {
        stats.hostCalls++; stats.hostRequestBytes += bytes.length;
        const response = callback(bytes);
        stats.hostResponseBytes += response.length;
        return response;
      }, version);
      stats.resultBytes += result.length;
      return result;
    } };
    const restore = install(transport, compiled.catalog, bindings);
    const times = [];
    try {
      for (let i = 0; i < 6; i++) {
        const start = performance.now();
        const result = migrateKernelExtension(document, request, compiled.catalog);
        times.push(performance.now() - start);
        assert.deepEqual(result, expected);
        assert.equal(document.extensions[0].schemaVersion, 1);
      }
    } finally { restore(); }
    times.sort((a, b) => a - b);
    rows.push({ bars, mode, samples: times.length, medianMs: (times[2] + times[3]) / 2, maxMs: times.at(-1), ...stats });
  }
}
console.log(JSON.stringify({ profileVersion: 1, workload: "detached-reference-migration",
  node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
  addonPath, addonSha256: hash(readFileSync(addonPath)), guestSha256: hash(guest), rows }, null, 2));
