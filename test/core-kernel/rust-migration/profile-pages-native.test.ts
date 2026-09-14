import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { K1_SCORE_FEATURE_PROFILE, validateScoreFeatureProfile } from "../../../src/core-kernel/index";
import { createStressCvn7Score } from "../fixtures/cvn-7-qualification-score";

// This private read tests Rust/Node report delivery, not Wasm callbacks or
// transaction qualification. The frozen stress document is used unchanged.
test("Native report V2 pages reproduce all 6401 frozen stress diagnostics from the TS oracle", () => {
  const fixture = createStressCvn7Score();
  const expected = validateScoreFeatureProfile(fixture.document, K1_SCORE_FEATURE_PROFILE);
  assert.equal(expected.status, "unsupported");
  assert.equal(expected.diagnostics.length, 6401);
  const recorded = JSON.parse(readFileSync("crates/brilliant-kernel-session/src/wasm/fixtures/session.json", "utf8"));
  const input = { ...JSON.parse(recorded.initial), document: fixture.document };
  const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as {
    createIntegratedKernelSessionV2(input: Buffer, callback: (bytes: Buffer) => Buffer, version: number): (bytes: Buffer) => Buffer;
  };
  let callbacks = 0;
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(JSON.stringify(input)), bytes => {
    const request = JSON.parse(bytes.toString("utf8"));
    assert.equal(request.operation, "assessmentStart");
    callbacks++;
    return Buffer.from('{"ok":true,"scheduleVersion":4}');
  }, 4);
  const invoke = (request: unknown) => JSON.parse(operate(Buffer.from(JSON.stringify(request))).toString("utf8"));
  const before = invoke({ operation: "read", knownSnapshotVersion: null });
  assert.equal(before.ok, true);
  const admissionCallbacks = callbacks;
  const diagnostics: unknown[] = [];
  for (const offset of [0, 4096]) {
    const request = {
      operation: "readCoreReportPage", reportVersion: 2,
      documentId: fixture.document.id, documentVersion: 0,
      profileId: K1_SCORE_FEATURE_PROFILE.id, offset, limit: 4096,
    };
    const output = invoke(request);
    assert.equal(output.ok, true, JSON.stringify(output));
    assert.deepEqual(output.report, {
      reportVersion: 2, documentId: fixture.document.id, documentVersion: 0,
      profileId: K1_SCORE_FEATURE_PROFILE.id, status: "unsupported", offset, total: 6401,
      diagnostics: expected.diagnostics.slice(offset, offset + 4096),
      nextOffset: offset === 0 ? 4096 : null,
    });
    assert.deepEqual(invoke(request), output);
    diagnostics.push(...output.report.diagnostics);
  }
  assert.deepEqual(diagnostics, expected.diagnostics);
  assert.deepEqual(invoke({ operation: "read", knownSnapshotVersion: null }), before);
  assert.equal(callbacks, admissionCallbacks, "report reads invoke no plugin");
});
