import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import * as coreKernel from "../../src/core-kernel/index";
import * as moduleSdk from "../../src/core-kernel/module-sdk/index";
import { CORE_COMMAND_DEFINITIONS } from "../../src/core-kernel/commands/catalog";
import { createCvn7QualificationModules } from "./fixtures/cvn-7-qualification-modules";

const CORE_RUNTIME_KEYS = [
  "CORE_KERNEL_STARTUP_MANIFEST", "CommandBus", "K1_SCORE_FEATURE_PROFILE",
  "KernelModuleGateway", "KernelRegistry", "PURE_CORE_KERNEL_V1_SCOPE",
  "SCORE_DOCUMENT_SCHEMA_VERSION", "addFractions", "compareFractions",
  "createDiagnostic", "createFraction", "createKernelRegistry",
  "createKernelValidationReport", "createModuleInternalIssue", "createScoreDocument",
  "decodeScoreDocument", "deriveSequenceEventStarts", "encodeScoreDocumentJson",
  "getEffectiveMeasureDuration", "getNoteValueDuration", "isCanonicalFraction",
  "isJsonValue", "isNoteValueBase", "isNoteValueDots",
  "isScoreDocumentSchemaVersion", "isTransposition", "isWrittenPitch",
  "mapCheckpointFailureToKernelIssues", "mapCommandBusCreationFailureToKernelIssues",
  "mapCommandFailureToKernelIssues", "mapDiagnosticToKernelIssue",
  "mapEventSubscriptionFailureToKernelIssues", "mapReadFailureToKernelIssues",
  "mapRegistryAccessFailureToKernelIssues", "mapRegistryStartupFailureToKernelIssues",
  "migrateKernelExtension", "migrateScoreDocument", "multiplyFractions",
  "parseScoreDocumentJson", "replayCoreCommands", "replayKernelCommands",
  "selectDirtyState", "selectHistoryState", "selectScoreEntity",
  "selectScoreEntityOwnership", "selectScoreMetadata", "selectScoreRange",
  "subtractFractions", "transposeWrittenPitch", "validateScoreDocumentSemantics",
  "validateScoreFeatureProfile",
] as const;

const SDK_RUNTIME_KEYS = [
  "ModuleKernelErrorBase", "OFFICIAL_MODULE_SDK_V1_LIMITS",
  "compileOfficialModuleCatalogV1", "createModuleKernelIssueV1",
  "defineDomainCommandContributionV1", "defineDomainCommandRegistrationEntryV1",
  "defineDomainCommandV1", "defineModuleEffectV1",
] as const;

const SDK_TYPE_KEYS = [
  "CompiledDomainCommandContributionV1", "CompiledDomainCommandDefinitionV1",
  "CompiledDomainCommandRegistrationEntryV1", "CompiledModuleEffectDefinitionV1",
  "CoreWrittenPitchEffectRequestV1", "DomainCommandDecodeInputV1",
  "DomainCommandDecodeResultV1", "DomainCommandDecoderV1",
  "DomainCommandDefinitionInputV1", "DomainCommandDescriptorV1",
  "DomainCommandPreparationResultV1", "DomainCommandPreparerV1",
  "DomainContributionReadViewV1", "DomainEffectRequestV1",
  "DomainSemanticValidatorV1", "DomainSupportClassificationV1",
  "DomainSupportClassifierV1", "ExtensionRuntimeRequirementV1",
  "KernelIntegratedCatalog", "ModuleEffectApplyInputV1", "ModuleEffectApplyResultV1",
  "ModuleEffectDefinitionInputV1", "ModuleEffectDescriptorV1",
  "ModuleEffectPayloadDecodeResultV1", "ModuleEffectPayloadDecoderV1",
  "ModuleEffectTransformerV1", "ModuleIssueCode", "ModuleIssueCreationResultV1",
  "ModuleIssueInputV1", "ModuleKernelIssue", "ModuleOwnedEffectRequestV1",
  "OfficialModuleCatalogCompilationResultV1", "OfficialModuleDefinitionResultV1",
  "OfficialModuleSdkV1Limits",
] as const;

const COMMAND_CATALOG = [
  ["core.document.set-metadata", "document"],
  ["core.note.set-written-pitch", "note"],
  ["core.event.set-note-value", "event"],
  ["core.voice.insert-notes-event", "voice"],
  ["core.voice.insert-rest-event", "voice"],
  ["core.event.remove", "event"],
  ["core.measure.insert", "document"],
  ["core.measure.remove", "measure"],
  ["core.measure.move", "measure"],
  ["core.measure.set-definition", "measure"],
  ["core.part.insert", "document"],
  ["core.part.remove", "part"],
  ["core.part.move", "part"],
  ["core.part.set-name", "part"],
  ["core.part.set-instrument", "part"],
  ["core.staff.insert", "part"],
  ["core.staff.remove", "staff"],
  ["core.staff.move", "staff"],
  ["core.staff.set-definition", "staff"],
  ["core.voice.insert", "part"],
  ["core.voice.remove", "voice"],
  ["core.voice.move", "voice"],
  ["core.voice.set-default-staff", "voice"],
  ["core.voice.set-sequence-start", "voice"],
  ["core.event.set-staff-assignment", "event"],
  ["core.range.delete", "document"],
  ["core.range.transpose-written-pitch", "document"],
  ["core.transaction.batch", "document"],
] as const;

const MINIMUM_CASES = [
  "strict-valid-commit", "defined-no-op", "invalid-envelope-target",
  "target-anchor-owner", "semantic-reference", "encoded-before-after",
  "undo", "redo", "replay", "session-events", "hostile-no-throw",
  "caller-isolation", "unknown-extension", "integrated-callback-order",
] as const;

type MinimumCase = (typeof MINIMUM_CASES)[number];
type CommandId = (typeof COMMAND_CATALOG)[number][0];
interface EvidenceReference {
  readonly kind: "test";
  readonly file: string;
  readonly title: string;
}
interface NoOpNotApplicable {
  readonly kind: "not-applicable";
  readonly reason: "command-has-no-defined-no-op";
}
type EvidenceCell = EvidenceReference | NoOpNotApplicable;
type EvidenceProfile = Readonly<Record<MinimumCase, EvidenceCell>>;

const evidence = (file: string, title: string): EvidenceReference => ({
  kind: "test",
  file,
  title,
});
const NO_DEFINED_NO_OP: NoOpNotApplicable = Object.freeze({
  kind: "not-applicable",
  reason: "command-has-no-defined-no-op",
});
const CALLBACK_ORDER = evidence(
  "test/core-kernel/module-validation-classification.test.ts",
  "validators complete before classifiers in frozen catalog order",
);

const V1 = "test/core-kernel/command-system.test.ts";
const V1_INTERNAL = "test/core-kernel/command-internals.test.ts";
const V1_PROFILE: EvidenceProfile = Object.freeze({
  "strict-valid-commit": evidence(V1, "CommandBus preserves K1-2 writes and adds only K1-3 read/session entry points"),
  "defined-no-op": evidence(V1, "document, note, and note-value replacement distinguish commit, no-op, unsupported, and semantic rejection"),
  "invalid-envelope-target": evidence(V1, "strict submit rejects malformed, unknown, versioned, extra, and target-mismatched envelopes"),
  "target-anchor-owner": evidence(V1, "missing targets and missing or wrong-owner anchors reject without side effects"),
  "semantic-reference": evidence(V1, "semantic-invalid inserts rollback while the original document remains usable"),
  "encoded-before-after": evidence("test/core-kernel/command-spine-characterization.test.ts", "CVN-1 freezes the pre-refactor public command spine trace"),
  undo: evidence(V1, "undo and redo are one-entry atomic transitions with deterministic versions"),
  redo: evidence(V1, "rejected and no-op submissions preserve redo while a new commit invalidates it"),
  replay: evidence(V1, "deterministic replay uses submit semantics and returns detached documents"),
  "session-events": evidence("test/core-kernel/core-kernel-integration.test.ts", "public integration scenario keeps writes reads events history and replay coherent"),
  "hostile-no-throw": evidence(V1_INTERNAL, "strict command decoding rejects sparse arrays, non-finite values, getters, and malformed unions"),
  "caller-isolation": evidence(V1, "initial documents and accepted command payloads are detached from caller mutation"),
  "unknown-extension": evidence(V1, "replay stops at rejection and preserves deep unknown extensions"),
  "integrated-callback-order": CALLBACK_ORDER,
});

const CVN3_TRANSACTION = "test/core-kernel/cvn-3-transaction-integration.test.ts";
const CVN3_PROFILE: EvidenceProfile = Object.freeze({
  "strict-valid-commit": evidence(CVN3_TRANSACTION, "direct bus and authorized gateway are equivalent for ${entry.commandId}"),
  "defined-no-op": NO_DEFINED_NO_OP,
  "invalid-envelope-target": evidence(CVN3_TRANSACTION, "${entry.commandId} rejects exact-input violations and detaches submitted input"),
  "target-anchor-owner": evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert resolves target and anchor before final semantic coverage and preserves rejection state"),
  "semantic-reference": evidence("test/core-kernel/cvn-3-measure-move-definition.test.ts", "set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history"),
  "encoded-before-after": evidence("test/core-kernel/command-internals.test.ts", "Measure effect sets derive reverse multi-effect inverses and restore shuffled documents"),
  undo: evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert undo, redo, replay, and stored affected order exactly restore a shuffled pre-state"),
  redo: evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert undo, redo, replay, and stored affected order exactly restore a shuffled pre-state"),
  replay: evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert undo, redo, replay, and stored affected order exactly restore a shuffled pre-state"),
  "session-events": evidence(CVN3_TRANSACTION, "direct bus and authorized gateway are equivalent for ${entry.commandId}"),
  "hostile-no-throw": evidence(CVN3_TRANSACTION, "new Measure commands enforce bounded descriptor capture and map resource failures"),
  "caller-isolation": evidence(CVN3_TRANSACTION, "${entry.commandId} rejects exact-input violations and detaches submitted input"),
  "unknown-extension": evidence(CVN3_TRANSACTION, "${entry.commandId} rejects exact-input violations and detaches submitted input"),
  "integrated-callback-order": CALLBACK_ORDER,
});

const CVN4_TRANSACTION = "test/core-kernel/cvn-4-transaction-integration.test.ts";
const CVN4_PROFILE: EvidenceProfile = Object.freeze({
  "strict-valid-commit": evidence(CVN4_TRANSACTION, "direct bus and authorized gateway are equivalent for ${lifecycle.commandId}"),
  "defined-no-op": NO_DEFINED_NO_OP,
  "invalid-envelope-target": evidence(CVN4_TRANSACTION, "${lifecycle.commandId} preserves state for exact-input and target failures"),
  "target-anchor-owner": evidence(CVN4_TRANSACTION, "${lifecycle.commandId} preserves state for exact-input and target failures"),
  "semantic-reference": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff removal rejects live default and explicit references without leaking them"),
  "encoded-before-after": evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  undo: evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  redo: evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  replay: evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  "session-events": evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  "hostile-no-throw": evidence("test/core-kernel/cvn-4-strict-input.test.ts", "all fifteen CVN-4 commands reject sparse, cyclic, symbol, and accessor inputs without caller execution"),
  "caller-isolation": evidence(CVN4_TRANSACTION, "${lifecycle.commandId} preserves state for exact-input and target failures"),
  "unknown-extension": evidence(CVN4_TRANSACTION, "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  "integrated-callback-order": CALLBACK_ORDER,
});

function withEvidence(
  profile: EvidenceProfile,
  overrides: Partial<EvidenceProfile>,
): EvidenceProfile {
  return Object.freeze({ ...profile, ...overrides });
}

const RANGE_SHARED = Object.freeze({
  "invalid-envelope-target": evidence("test/core-kernel/address-range.test.ts", "strict address decoders reject obsolete, extra, empty, and mismatched shapes"),
  "target-anchor-owner": evidence("test/core-kernel/address-range.test.ts", "range selection rejects malformed, missing, and owner-mismatched endpoints"),
  "encoded-before-after": evidence(V1_INTERNAL, "ordered private effect sets use the captured clone, derive reverse inverses, and stay atomic"),
  undo: evidence(V1_INTERNAL, "each prepared internal effect set round-trips the document exactly"),
  redo: evidence(V1_INTERNAL, "unexpected undo and redo errors collapse to atomic history failures"),
  replay: evidence("test/core-kernel/batch-history-replay-events.test.ts", "Core replay reroutes a batch as one semantic envelope"),
  "session-events": evidence(V1_INTERNAL, "only committed command transitions expose canonical private operation facts"),
  "hostile-no-throw": evidence("test/core-kernel/address-range.test.ts", "strict address decoding never invokes getters or proxy property reads"),
  "caller-isolation": evidence(V1_INTERNAL, "prepared Core effects and canonical facts are detached and frozen"),
  "unknown-extension": evidence(V1_INTERNAL, "deep unknown extensions survive commit, rejection, undo, and redo"),
  "integrated-callback-order": CALLBACK_ORDER,
});

const RANGE_DELETE_PROFILE = withEvidence(CVN3_PROFILE, {
  ...RANGE_SHARED,
  "strict-valid-commit": evidence("test/core-kernel/range-delete.test.ts", "range delete normalizes reverse global measure endpoints and undo restores exactly"),
  "defined-no-op": evidence("test/core-kernel/range-delete.test.ts", "an event-empty Part-measure selection is a no-op"),
  "semantic-reference": evidence("test/core-kernel/range-delete.test.ts", "deleting every measure is rejected by final semantics without state drift"),
});
const RANGE_TRANSPOSE_PROFILE = withEvidence(CVN3_PROFILE, {
  ...RANGE_SHARED,
  "strict-valid-commit": evidence("test/core-kernel/range-transpose-written-pitch.test.ts", "range transpose skips rests, transforms notes, and reports the first invalid note"),
  "defined-no-op": evidence("test/core-kernel/range-transpose-written-pitch.test.ts", "zero range transposition is a no-op"),
  "semantic-reference": evidence("test/core-kernel/range-transpose-written-pitch.test.ts", "range transpose skips rests, transforms notes, and reports the first invalid note"),
});
const BATCH_PROFILE = withEvidence(CVN3_PROFILE, {
  "strict-valid-commit": evidence("test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  "defined-no-op": evidence("test/core-kernel/batch-core-atomicity.test.ts", "all-no-op Core batch preserves version and redo branch"),
  "invalid-envelope-target": evidence("test/core-kernel/batch-core-atomicity.test.ts", "nested batch, empty batch, and child-count overflow use fixed failures"),
  "target-anchor-owner": evidence("test/core-kernel/batch-core-atomicity.test.ts", "child rejection is attributed once and preserves all observable state"),
  "semantic-reference": evidence("test/core-kernel/batch-input-and-failure-attribution.test.ts", "final semantic failure is top-level rather than child-attributed"),
  "encoded-before-after": evidence("test/core-kernel/batch-history-replay-events.test.ts", "Core history stores frozen detached effective child boundaries"),
  undo: evidence("test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  redo: evidence("test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  replay: evidence("test/core-kernel/batch-history-replay-events.test.ts", "Core replay reroutes a batch as one semantic envelope"),
  "session-events": evidence("test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  "hostile-no-throw": evidence("test/core-kernel/batch-hostile-input-resource.test.ts", "sparse arrays and accessor children reject without invoking getters"),
  "caller-isolation": evidence("test/core-kernel/batch-history-replay-events.test.ts", "Core history stores frozen detached effective child boundaries"),
  "unknown-extension": evidence(V1_INTERNAL, "deep unknown extensions survive commit, rejection, undo, and redo"),
  "integrated-callback-order": evidence("test/core-kernel/batch-integrated-modules.test.ts", "mixed Core/module batch commits once with outer Core identity"),
});

interface CommandEvidenceRow {
  readonly commandId: CommandId;
  readonly cases: EvidenceProfile;
}
const row = (
  commandId: CommandId,
  profile: EvidenceProfile,
  overrides: Partial<EvidenceProfile> = {},
): CommandEvidenceRow => ({ commandId, cases: withEvidence(profile, overrides) });

const CVN7_COMMAND_EVIDENCE_MATRIX = Object.freeze([
  row("core.document.set-metadata", V1_PROFILE),
  row("core.note.set-written-pitch", V1_PROFILE),
  row("core.event.set-note-value", V1_PROFILE),
  row("core.voice.insert-notes-event", V1_PROFILE, { "defined-no-op": NO_DEFINED_NO_OP }),
  row("core.voice.insert-rest-event", V1_PROFILE, { "defined-no-op": NO_DEFINED_NO_OP }),
  row("core.event.remove", V1_PROFILE, { "defined-no-op": NO_DEFINED_NO_OP }),
  row("core.measure.insert", CVN3_PROFILE, {
    "semantic-reference": evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert resolves target and anchor before final semantic coverage and preserves rejection state"),
  }),
  row("core.measure.remove", CVN3_PROFILE, {
    "semantic-reference": evidence("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "remove deletes and restores the complete Measure aggregate while final-Measure removal is atomic"),
  }),
  row("core.measure.move", CVN3_PROFILE, {
    "defined-no-op": evidence("test/core-kernel/cvn-3-measure-move-definition.test.ts", "move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority"),
    "semantic-reference": evidence("test/core-kernel/cvn-3-measure-move-definition.test.ts", "move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority"),
  }),
  row("core.measure.set-definition", CVN3_PROFILE, {
    "defined-no-op": evidence("test/core-kernel/cvn-3-measure-move-definition.test.ts", "set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history"),
  }),
  row("core.part.insert", CVN4_PROFILE, { "semantic-reference": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part insert coverage and ID failures preserve the full document state") }),
  row("core.part.remove", CVN4_PROFILE, { "semantic-reference": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part removal of the final aggregate reaches semantic.part-required atomically") }),
  row("core.part.move", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"), "semantic-reference": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules") }),
  row("core.part.set-name", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"), "semantic-reference": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules") }),
  row("core.part.set-instrument", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"), "semantic-reference": evidence("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules") }),
  row("core.staff.insert", CVN4_PROFILE, { "semantic-reference": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff insert adds only the requested Staff and leaves Voices and assignments untouched") }),
  row("core.staff.remove", CVN4_PROFILE),
  row("core.staff.move", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic"), "semantic-reference": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic") }),
  row("core.staff.set-definition", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic"), "semantic-reference": evidence("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic") }),
  row("core.voice.insert", CVN4_PROFILE, { "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice insert resolves Part plus Measure content and preserves unrelated contents") }),
  row("core.voice.remove", CVN4_PROFILE, { "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice removal owns Event and Note descendants, exact undo, and final-Voice rejection") }),
  row("core.voice.move", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice move enforces content ownership and has an exact no-op"), "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice move enforces content ownership and has an exact no-op") }),
  row("core.voice.set-default-staff", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"), "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation") }),
  row("core.voice.set-sequence-start", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"), "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation") }),
  row("core.event.set-staff-assignment", CVN4_PROFILE, { "defined-no-op": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"), "semantic-reference": evidence("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation") }),
  row("core.range.delete", RANGE_DELETE_PROFILE),
  row("core.range.transpose-written-pitch", RANGE_TRANSPOSE_PROFILE),
  row("core.transaction.batch", BATCH_PROFILE),
] satisfies readonly CommandEvidenceRow[]);

test("CVN7-D-FC001 public Core VNext surface is finite and exact", () => {
  assert.deepEqual(Object.keys(coreKernel).sort(), [...CORE_RUNTIME_KEYS].sort());
  assert.equal(Object.keys(coreKernel).length, 51);
  assert.deepEqual(Object.keys(moduleSdk).sort(), [...SDK_RUNTIME_KEYS].sort());
  assert.equal(Object.keys(moduleSdk).length, 8);
  assert.equal(coreKernel.SCORE_DOCUMENT_SCHEMA_VERSION, "brilliant-score-1");

  const sdkSource = readFileSync(
    resolve("src/core-kernel/module-sdk/index.ts"),
    "utf8",
  );
  assert.equal(sdkSource.includes("export *"), false);
  const typeNames = Array.from(
    sdkSource.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/gmu),
    (match) => match[1] ?? "",
  ).flatMap((group) => group.split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort();
  assert.deepEqual(typeNames, [...SDK_TYPE_KEYS].sort());
  assert.equal(typeNames.length, 34);

  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map(({ commandId, targetKind }) => [commandId, targetKind]),
    COMMAND_CATALOG,
  );
  const modules = createCvn7QualificationModules(moduleSdk);
  for (const entry of modules.registrationEntries) {
    assert.deepEqual(Object.keys(entry), [
      "registrationEntryId", "ownerModuleId", "kind", "contributions",
    ]);
    assert.deepEqual(Object.keys(entry.contributions[0] ?? {}), [
      "apiVersion", "moduleId", "contributionId", "extensionNamespaces",
      "extensionRequirements", "commands", "validate", "classify", "effects",
    ]);
  }
});

test("CVN7-D-FC140 all twenty-eight commands map to the fixed minimum case matrix", () => {
  const commandIds = COMMAND_CATALOG.map(([commandId]) => commandId);
  assert.equal(commandIds.length, 28);
  assert.equal(new Set(commandIds).size, 28);
  assert.deepEqual(
    CVN7_COMMAND_EVIDENCE_MATRIX.map(({ commandId }) => commandId),
    commandIds,
  );
  assert.equal(MINIMUM_CASES.length, 14);
  assert.equal(new Set(MINIMUM_CASES).size, 14);

  for (const row of CVN7_COMMAND_EVIDENCE_MATRIX) {
    assert.deepEqual(Object.keys(row.cases), MINIMUM_CASES, row.commandId);
    for (const family of MINIMUM_CASES) {
      const cell = row.cases[family];
      if (cell.kind === "not-applicable") {
        assert.equal(family, "defined-no-op", row.commandId);
        assert.equal(cell.reason, "command-has-no-defined-no-op");
        continue;
      }
      assert.notEqual(cell.file.length, 0, `${row.commandId}:${family}`);
      assert.notEqual(cell.title.length, 0, `${row.commandId}:${family}`);
      const source = readFileSync(resolve(cell.file), "utf8");
      assert.equal(
        source.includes(cell.title),
        true,
        `${row.commandId}:${family} missing title in ${cell.file}`,
      );
      assert.match(source, /\btest\s*\(/u, `${cell.file} must contain executable tests`);
    }
  }
});
