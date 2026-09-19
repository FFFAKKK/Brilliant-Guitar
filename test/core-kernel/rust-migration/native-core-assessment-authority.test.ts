import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, replayKernelCommands, type ScoreDocument } from "../../../src/core-kernel/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { crossCatalog, crossCommand } from "../fixtures/cross-plugin-relationship";

const addon = require(resolve(
  process.env.BRILLIANT_INTEGRATED_ADDON_PATH
    ?? "target/integrated-v2/brilliant_kernel_node.node",
)) as IntegratedNativeAddonV2;
const catalog = crossCatalog();
const metadata = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
  payload: { metadata: { ...createCoreScoreFixture().metadata, title: "Native Core authority" } } };
function create(native: boolean, document: ScoreDocument, transport = addon) {
  const restore = native ? installNativeIntegratedBackendV2(transport) : () => {};
  try { return CommandBus.createIntegrated(document, catalog); } finally { restore(); }
}

test("Native create/edit/module/history keep Core validation in Rust when TS Core validators are unavailable", () => {
  const initial = createCoreScoreFixture();
  const oracle = create(false, initial);
  assert.ok(oracle.ok);
  const inputs = [metadata, crossCommand(false), metadata,
    { commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId: "note-1" },
      payload: { writtenPitch: { step: "E", alter: 0, octave: 4 } } }];
  const expected = inputs.map(input => oracle.value.submit(input));
  assert.deepEqual(expected.map(result => result.status), ["committed", "committed", "no-op", "rejected"]);
  const expectedUndo = oracle.value.undo(), expectedRedo = oracle.value.redo(), expectedRead = oracle.value.read();
  const expectedReplay = replayKernelCommands(initial, inputs, catalog);
  const semantics = require("../../../src/core-kernel/validation/validate-score-semantics") as Record<string, unknown>;
  const profile = require("../../../src/core-kernel/profiles/score-feature-profile") as Record<string, unknown>;
  const originalSemantic = semantics.validateScoreDocumentSemantics, originalProfile = profile.validateScoreFeatureProfile;
  let calls = 0;
  const unavailable = () => { calls++; throw new Error("TS Core validator must not run on Native assessment"); };
  semantics.validateScoreDocumentSemantics = unavailable;
  profile.validateScoreFeatureProfile = unavailable;
  try {
    const native = create(true, initial);
    assert.ok(native.ok, JSON.stringify(native));
    inputs.forEach((input, index) => assert.deepEqual(native.value.submit(input), expected[index]));
    assert.deepEqual(native.value.undo(), expectedUndo);
    assert.deepEqual(native.value.redo(), expectedRedo);
    assert.deepEqual(native.value.read(), expectedRead);
    const restore = installNativeIntegratedBackendV2(addon);
    try { assert.deepEqual(replayKernelCommands(initial, inputs, catalog), expectedReplay); } finally { restore(); }
    assert.equal(calls, 0);
  } finally {
    semantics.validateScoreDocumentSemantics = originalSemantic;
    profile.validateScoreFeatureProfile = originalProfile;
  }
});

test("Host callback cannot replace the Rust Core support result with a forged assessment", () => {
  for (const unsupported of [false, true]) {
    const initial: ScoreDocument = { ...createCoreScoreFixture(), parts: createCoreScoreFixture().parts.map(part => ({
      ...part, measureContents: part.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({ ...voice,
        sequence: { ...voice.sequence, events: unsupported ? voice.sequence.events.slice(0, 3) : voice.sequence.events },
      })) })),
    })) };
    const expected = create(false, initial);
    assert.ok(expected.ok);
    let forged = 0;
    const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(bytes, executor) {
      return addon.createIntegratedKernelSessionV2(bytes, request => {
        const reply = JSON.parse(executor(request).toString("utf8"));
        if (JSON.parse(request.toString("utf8")).operation === "assess" && reply.ok) {
          forged++;
          reply.assessment.core = { status: unsupported ? "supported" : "unsupported", diagnostics: [] };
        }
        return Buffer.from(JSON.stringify(reply));
      });
    } };
    const native = create(true, initial, transport);
    assert.ok(native.ok);
    assert.deepEqual(native.value.submit(metadata), expected.value.submit(metadata));
    assert.deepEqual(native.value.undo(), expected.value.undo());
    assert.deepEqual(native.value.redo(), expected.value.redo());
    assert.deepEqual(native.value.read(), expected.value.read());
    assert.ok(forged >= 4);
  }
});

test("A stale Native assessment protocol fails closed instead of restoring TS Core validation", () => {
  const stale: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(bytes, executor) {
    return addon.createIntegratedKernelSessionV2(bytes, request => {
      const decoded = JSON.parse(request.toString("utf8"));
      if (decoded.operation === "assess") delete decoded.coreAssessment;
      return executor(Buffer.from(JSON.stringify(decoded)));
    });
  } };
  const result = create(true, createCoreScoreFixture(), stale);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "command.assembly-mismatch");
});
