import assert = require("node:assert/strict");
import { test } from "node:test";
import { CommandBus, K1_SCORE_FEATURE_PROFILE, validateScoreFeatureProfile } from "../../../src/core-kernel/index";
import { encodeIntegratedValueV2 as encode } from "../../../src/core-kernel/native/integrated-wire";
import type { KernelCommandResult } from "../../../src/core-kernel/registry/integrated-contracts";
import { createCvn7NativeWasmFixture } from "../fixtures/cvn-7-native-wasm";
import { createStressCvn7Score, CVN7_D4 } from "../fixtures/cvn-7-qualification-score";

test("Paged Wasm editing completes frozen stress transactions and delivers all version-bound diagnostics", () => {
  const stage = (name: string) => {
    if (process.env.BG_PAGED_TRACE === "1") console.error(`paged-stage ${name} ${Date.now()}`);
  };
  const fixture = createStressCvn7Score(), plugins = createCvn7NativeWasmFixture();
  stage("fixture-created");
  const original = encode(fixture.document);
  const oracle = CommandBus.createIntegrated(fixture.document, plugins.catalog, plugins.modules.knownRequirementInventory);
  assert.ok(oracle.ok);
  stage("oracle-created");
  const operate = plugins.createPaged(fixture.document);
  stage("native-created");
  const invoke = (request: unknown) => JSON.parse(operate(encode(request)).toString("utf8"));
  const read = () => {
    const result = invoke({ operation: "read", knownSnapshotVersion: null });
    assert.equal(result.ok, true);
    return result.state;
  };
  assert.deepEqual(encode(read().snapshot.document), original);
  const single = plugins.modules.createScoreCommand(fixture.document.id, fixture.firstNote.noteId, CVN7_D4, "paged-single");
  const batch = {
    commandVersion: 1, commandId: "core.transaction.batch",
    target: { kind: "document", documentId: fixture.document.id },
    payload: { commands: [
      plugins.modules.createScoreCommand(fixture.document.id, fixture.firstNote.noteId, { step: "E", alter: 0, octave: 4 }, "paged-batch"),
      plugins.modules.createPartCommand(fixture.lastPartId, fixture.lastNote.noteId, { step: "F", alter: 0, octave: 4 }, "paged-part"),
      { commandVersion: 1, commandId: "core.document.set-metadata",
        target: { kind: "document", documentId: fixture.document.id },
        payload: { metadata: { ...fixture.document.metadata, title: "mixed paged batch" } } },
    ] },
  };
  const oracleEvents: unknown[] = [];
  oracle.value.subscribe((event: unknown) => oracleEvents.push(event));
  let reportReference: Record<string, unknown> | undefined;
  let step = 0;
  for (const request of [
    { operation: "submit", command: single },
    { operation: "submit", command: single },
    { operation: "undo" }, { operation: "redo" },
    { operation: "submit", command: batch },
    { operation: "undo" },
  ]) {
    oracleEvents.length = 0;
    stage(`oracle-${step}-start`);
    const expected: KernelCommandResult = request.operation === "submit" ? oracle.value.submit(request.command)
      : request.operation === "undo" ? oracle.value.undo() : oracle.value.redo();
    assert.ok(expected.status === "committed" || expected.status === "no-op");
    stage(`oracle-${step}-done`);
    plugins.modules.resetTrace();
    const result = invoke(request);
    stage(`native-${step}-done`);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.result.status, expected.status);
    assert.equal(result.result.value.documentVersion, expected.documentVersion);
    assert.deepEqual(result.result.value.history, { undoDepth: expected.undoDepth, redoDepth: expected.redoDepth });
    // The legacy JS facade adds descriptor-derived `source` to committed
    // events. Compare the exact underlying native event contract here.
    assert.deepEqual(result.result.events ?? [], oracleEvents.map(event => {
      const { source: _source, ...wireEvent } = event as Record<string, unknown>;
      return wireEvent;
    }));
    assert.deepEqual(plugins.modules.readTrace(), [], "actual Wasm, no JS module callbacks");
    const expectedRead = oracle.value.read(); assert.ok(expectedRead.ok);
    const nativeState = read();
    assert.deepEqual(encode(nativeState.snapshot.document), encode(expectedRead.value.snapshot.document));
    const support = validateScoreFeatureProfile(expectedRead.value.snapshot.document, K1_SCORE_FEATURE_PROFILE);
    assert.equal(support.diagnostics.length, 6401);
    assert.deepEqual(result.pipeline.assessment.core, {
      reportVersion: 2, profileId: K1_SCORE_FEATURE_PROFILE.id,
      status: support.status, diagnosticCount: support.diagnostics.length,
    });
    assert.deepEqual(result.pipeline.assessment.modules, expected.assessment.modules);
    assert.deepEqual(result.coreReport, {
      reportVersion: 2, profileId: K1_SCORE_FEATURE_PROFILE.id,
      documentId: fixture.document.id, documentVersion: expected.documentVersion,
    });
    reportReference = result.coreReport;
    if (expected.documentVersion === 1 && expected.status === "committed") {
      const actual: unknown[] = [];
      for (const offset of [0, 4096]) {
        const page = invoke({ ...reportReference, operation: "readCoreReportPage", offset, limit: 4096 });
        assert.equal(page.ok, true);
        assert.equal(page.report.total, 6401);
        actual.push(...page.report.diagnostics);
      }
      assert.deepEqual(actual, support.diagnostics);
    }
    if (expected.documentVersion === 2) assert.deepEqual(encode(nativeState.snapshot.document), original);
    stage(`checks-${step++}-done`);
  }
  const before = read();
  const rejected = invoke({ operation: "submit", command: plugins.modules.createScoreCommand(
    fixture.document.id, "missing-note", CVN7_D4, "rejected") });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.coreReport, undefined);
  assert.equal(rejected.pipeline, undefined);
  assert.deepEqual(read(), before);
  assert.equal(invoke({ ...reportReference, documentVersion: 1, operation: "readCoreReportPage", offset: 0, limit: 1 })
    .failure.code, "report.stale-version");
  assert.equal(invoke({ ...reportReference, operation: "readCoreReportPage", offset: 6400, limit: 1 }).ok, true);
  assert.deepEqual(encode(fixture.document), original);
});
