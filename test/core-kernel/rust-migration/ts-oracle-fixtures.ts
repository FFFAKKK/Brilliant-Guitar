import {
  CommandBus,
  createKernelRegistry,
  migrateKernelExtension,
  replayCoreCommands,
  replayKernelCommands,
  type ScoreDocument,
} from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { cloneCoreScoreFixture } from "../fixtures/core-score";
import {
  cloneCvn3MeasureFixture,
  createCvn3InsertedVoices,
  createCvn3ShuffledMeasureFixture,
} from "../fixtures/cvn-3-score";
import {
  insertMeasureCommand,
  moveMeasureCommand,
  removeMeasureCommand,
  setMeasureDefinitionCommand,
} from "../fixtures/cvn-3-command-helpers";
import {
  cloneCvn4ScoreFixture,
  createCvn4InsertedPart,
  createCvn4InsertedVoice,
} from "../fixtures/cvn-4-score";
import {
  insertPartCommand,
  insertStaffCommand,
  insertVoiceCommand,
  movePartCommand,
  moveStaffCommand,
  moveVoiceCommand,
  removePartCommand,
  removeStaffCommand,
  removeVoiceCommand,
  setEventStaffAssignmentCommand,
  setPartInstrumentCommand,
  setPartNameCommand,
  setStaffDefinitionCommand,
  setVoiceDefaultStaffCommand,
  setVoiceSequenceStartCommand,
} from "../fixtures/cvn-4-command-helpers";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
} from "../fixtures/cvn-6-synthetic-official-modules";
import {
  canonicalJson,
  sha256,
  toJsonData,
  type JsonData,
  type OracleObservationV1,
  type OracleOperationV1,
  type OracleStateProjectionV1,
  type RustMigrationOracleScenarioV1,
} from "./oracle-schema";

export const BASELINE_COMMIT = "b21540fa3636e6c8e827ff24c2099f4ff331285d";

export const COMMAND_IDS = [
  "core.document.set-metadata", "core.note.set-written-pitch", "core.event.set-note-value",
  "core.voice.insert-notes-event", "core.voice.insert-rest-event", "core.event.remove",
  "core.measure.insert", "core.measure.remove", "core.measure.move", "core.measure.set-definition",
  "core.part.insert", "core.part.remove", "core.part.move", "core.part.set-name", "core.part.set-instrument",
  "core.staff.insert", "core.staff.remove", "core.staff.move", "core.staff.set-definition",
  "core.voice.insert", "core.voice.remove", "core.voice.move", "core.voice.set-default-staff",
  "core.voice.set-sequence-start", "core.event.set-staff-assignment", "core.range.delete",
  "core.range.transpose-written-pitch", "core.transaction.batch",
] as const;

export const APPLICATION_RUNTIME_EXPORTS = [
  "CORE_KERNEL_STARTUP_MANIFEST", "CommandBus", "K1_SCORE_FEATURE_PROFILE", "KernelModuleGateway",
  "KernelRegistry", "PURE_CORE_KERNEL_V1_SCOPE", "SCORE_DOCUMENT_SCHEMA_VERSION", "addFractions",
  "compareFractions", "createDiagnostic", "createFraction", "createKernelRegistry",
  "createKernelValidationReport", "createModuleInternalIssue", "createScoreDocument", "decodeScoreDocument",
  "deriveSequenceEventStarts", "encodeScoreDocumentJson", "getEffectiveMeasureDuration", "getNoteValueDuration",
  "isCanonicalFraction", "isJsonValue", "isNoteValueBase", "isNoteValueDots", "isScoreDocumentSchemaVersion",
  "isTransposition", "isWrittenPitch", "mapCheckpointFailureToKernelIssues", "mapCommandBusCreationFailureToKernelIssues",
  "mapCommandFailureToKernelIssues", "mapDiagnosticToKernelIssue", "mapEventSubscriptionFailureToKernelIssues",
  "mapReadFailureToKernelIssues", "mapRegistryAccessFailureToKernelIssues", "mapRegistryStartupFailureToKernelIssues",
  "migrateKernelExtension", "migrateScoreDocument", "multiplyFractions", "parseScoreDocumentJson", "replayCoreCommands",
  "replayKernelCommands", "selectDirtyState", "selectHistoryState", "selectScoreEntity", "selectScoreEntityOwnership",
  "selectScoreMetadata", "selectScoreRange", "subtractFractions", "transposeWrittenPitch",
  "validateScoreDocumentSemantics", "validateScoreFeatureProfile",
] as const;

export const MODULE_SDK_RUNTIME_EXPORTS = [
  "ModuleKernelErrorBase", "OFFICIAL_MODULE_SDK_V1_LIMITS", "compileOfficialModuleCatalogV1",
  "createModuleKernelIssueV1", "defineDomainCommandContributionV1", "defineDomainCommandRegistrationEntryV1",
  "defineDomainCommandV1", "defineModuleEffectV1",
] as const;

export const MODULE_SDK_TYPE_EXPORTS = [
  "CompiledDomainCommandContributionV1", "CompiledDomainCommandDefinitionV1",
  "CompiledDomainCommandRegistrationEntryV1", "CompiledModuleEffectDefinitionV1",
  "CoreWrittenPitchEffectRequestV1", "DomainCommandDecodeInputV1", "DomainCommandDecodeResultV1",
  "DomainCommandDecoderV1", "DomainCommandDefinitionInputV1", "DomainCommandDescriptorV1",
  "DomainCommandPreparationResultV1", "DomainCommandPreparerV1", "DomainContributionReadViewV1",
  "DomainEffectRequestV1", "DomainSemanticValidatorV1", "DomainSupportClassificationV1",
  "DomainSupportClassifierV1", "ExtensionRuntimeRequirementV1", "KernelIntegratedCatalog",
  "ModuleEffectApplyInputV1", "ModuleEffectApplyResultV1", "ModuleEffectDefinitionInputV1",
  "ModuleEffectDescriptorV1", "ModuleEffectPayloadDecodeResultV1", "ModuleEffectPayloadDecoderV1",
  "ModuleEffectTransformerV1", "ModuleIssueCode", "ModuleIssueCreationResultV1", "ModuleIssueInputV1",
  "ModuleKernelIssue", "ModuleOwnedEffectRequestV1", "OfficialModuleCatalogCompilationResultV1",
  "OfficialModuleDefinitionResultV1", "OfficialModuleSdkV1Limits",
] as const;

export const CONTRIBUTION_ABI_FIELDS = [
  "apiVersion", "moduleId", "contributionId", "extensionNamespaces", "extensionRequirements",
  "commands", "validate", "classify", "effects",
] as const;

export const FIXTURE_CONTRACTS = [
  {
    fixtureKind: "representative", sourceFile: "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
    generatorExport: "createRepresentativeCvn7Score", generatorVersion: 1, seed: "cvn7-representative-v1",
    counts: { measures: 200, parts: 8, staves: 8, measureContents: 1600, voices: 3200, events: 25600, notes: 12800, knownExtensionBlocks: 9, unknownExtensionBlocks: 1 },
    workload: { historySubmitCount: 2000, batchChildCount: 100, replayEnvelopeCount: 100, stressEnvelopeCount: 0 },
    rssLimitBytes: 1073741824,
  },
  {
    fixtureKind: "stress", sourceFile: "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
    generatorExport: "createStressCvn7Score", generatorVersion: 1, seed: "cvn7-stress-v1",
    counts: { measures: 400, parts: 16, staves: 16, measureContents: 6400, voices: 12800, events: 102400, notes: 51200, knownExtensionBlocks: 17, unknownExtensionBlocks: 1 },
    workload: { historySubmitCount: 0, batchChildCount: 0, replayEnvelopeCount: 0, stressEnvelopeCount: 10000 },
    rssLimitBytes: 2147483648,
  },
] as const;

export const QUALIFICATION_V2_CONTRACT = {
  schemaVersion: 2,
  evidenceMethodVersion: 2,
  referenceEnvironmentFingerprint: "node24_15_0_win32_x64_nt10_0_26200_i9_13900hx_32cpu_39_7gib",
  fixtureContracts: FIXTURE_CONTRACTS,
  sampling: {
    warmupCount: 5, measuredCount: 20, isolation: "fresh-process-and-fresh-session-per-sample",
    timedRegion: "immediately-before-public-call-to-synchronous-result-return",
    excluded: ["process-spawn", "module-import", "fixture-generation", "session-construction", "evidence-serialization"],
    sort: "ascending-numeric-copy", percentile: "nearest-rank-ceil-p-times-n-minus-one",
    p95IndexFor20: 18, p99IndexFor20: 19,
    invalidDuration: "non-finite-or-non-positive-invalidates-evidence",
  },
  latencyGates: [
    { operation: "representative-submit", p95Ms: 8, p99Ms: 16 },
    { operation: "representative-undo", p95Ms: 8, p99Ms: 16 },
    { operation: "representative-redo", p95Ms: 8, p99Ms: 16 },
    { operation: "stress-fixture-local-edit", p95Ms: 16, p99Ms: 33 },
    { operation: "cached-selector-read", p95Ms: 1, p99Ms: null },
    { operation: "batch-100", p95Ms: 100, p99Ms: null },
    { operation: "replay-100", p95Ms: 500, p99Ms: null },
  ],
  stressGates: [
    { operation: "stress-submit-10000", completeSequenceMaxMs: 180000 },
    { operation: "stress-replay-10000", completeSequenceMaxMs: 180000 },
  ],
  memory: {
    sampling: "separate-worker-fieldwise-max",
    checkpoints: ["setup-before", "operation-before", "operation-after", "result-encode-after", "process-max-rss"],
    maxRssKiBNormalization: "raw-times-1024", representativeLimitBytes: 1073741824, stressLimitBytes: 2147483648,
  },
  complexity: {
    fullDocumentScans: 0, fullDocumentClones: 0, fullSemanticValidations: 0,
    fullSnapshotMaterializations: 0, indexedEntityLookupsMinimum: 1, affectedEntityCount: "exact-transaction-closure",
  },
  liveness: {
    policy: "calibrated-evidence-validity-guard", timeoutMs: null, calibrationOwner: "RKP-7",
    timeoutClassification: "EVIDENCE_INVALID", terminateProcessTree: true, publishPartialEvidence: false,
    precedence: "evidence-validity-before-performance-verdict",
  },
  officialRunAuthorized: false,
} as const;

interface OracleBus {
  submit(input: unknown): unknown;
  undo(): unknown;
  redo(): unknown;
  read(): unknown;
  markPersisted(input: unknown): unknown;
  subscribe(handler: unknown): unknown;
}

interface OracleRuntime {
  readonly bus: OracleBus;
  readonly catalog?: unknown;
  readonly inventory?: unknown;
}

interface SourceAuthority { readonly file: string; readonly testTitle: string }
interface CommandRecipe {
  readonly fixture: () => ScoreDocument;
  readonly input: () => Record<string, unknown>;
  readonly source: SourceAuthority;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a record`);
  return value as Record<string, unknown>;
}

function requireCreated(value: unknown, label: string): OracleBus {
  const result = record(value, label);
  if (result.ok !== true || result.value === undefined) throw new Error(`${label} creation failed`);
  return result.value as OracleBus;
}

function cloneIncompleteCoreFixture(): ScoreDocument {
  const document = cloneCoreScoreFixture();
  const events = document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events;
  if (events === undefined) throw new Error("missing core fixture events");
  (events as unknown[]).splice(3, 1);
  return document;
}

function cloneCvn4StaffA2UnreferencedFixture(): ScoreDocument {
  const document = cloneCvn4ScoreFixture();
  const event = document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0];
  if (event === undefined || event.id !== "cvn4-event-a-1-notes") throw new Error("missing CVN-4 staff fixture event");
  delete (event as { staffId?: string }).staffId;
  return document;
}

function envelope(commandId: string, target: unknown, payload: unknown): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

function metadata(title: string): Record<string, unknown> {
  return { title, authors: ["Brilliant Guitar"], tempo: { bpm: 120 } };
}

function commandRecipeSource(file: string, testTitle: string): SourceAuthority { return { file, testTitle }; }

const COMMAND_RECIPES: Readonly<Record<(typeof COMMAND_IDS)[number], CommandRecipe>> = {
  "core.document.set-metadata": {
    fixture: cloneCoreScoreFixture,
    input: () => envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("Changed") }),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "document, note, and note-value replacement distinguish commit, no-op, unsupported, and semantic rejection"),
  },
  "core.note.set-written-pitch": {
    fixture: cloneCoreScoreFixture,
    input: () => envelope("core.note.set-written-pitch", { kind: "note", noteId: "note-1" }, { writtenPitch: { step: "D", alter: 0, octave: 4 } }),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "document, note, and note-value replacement distinguish commit, no-op, unsupported, and semantic rejection"),
  },
  "core.event.set-note-value": {
    fixture: cloneCoreScoreFixture,
    input: () => envelope("core.event.set-note-value", { kind: "event", eventId: "event-1" }, { noteValue: { base: 8, dots: 0 } }),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "document, note, and note-value replacement distinguish commit, no-op, unsupported, and semantic rejection"),
  },
  "core.voice.insert-notes-event": {
    fixture: cloneIncompleteCoreFixture,
    input: () => envelope("core.voice.insert-notes-event", { kind: "voice", voiceId: "voice-1" }, { anchor: { kind: "after-event", eventId: "event-3" }, event: { id: "event-chord", duration: { base: 4, dots: 0 }, content: { kind: "notes", notes: [{ id: "note-chord-c", writtenPitch: { step: "C", alter: 0, octave: 4 } }, { id: "note-chord-e", writtenPitch: { step: "E", alter: 0, octave: 4 } }] } } }),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "insert notes/rest and remove event use stable Voice/Event targets and anchors"),
  },
  "core.voice.insert-rest-event": {
    fixture: cloneIncompleteCoreFixture,
    input: () => envelope("core.voice.insert-rest-event", { kind: "voice", voiceId: "voice-1" }, { anchor: { kind: "after-event", eventId: "event-3" }, event: { id: "event-new", duration: { base: 4, dots: 0 }, content: { kind: "rest" } } }),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "insert notes/rest and remove event use stable Voice/Event targets and anchors"),
  },
  "core.event.remove": {
    fixture: cloneCoreScoreFixture,
    input: () => envelope("core.event.remove", { kind: "event", eventId: "event-4" }, {}),
    source: commandRecipeSource("test/core-kernel/command-system.test.ts", "insert notes/rest and remove event use stable Voice/Event targets and anchors"),
  },
  "core.measure.insert": {
    fixture: createCvn3ShuffledMeasureFixture,
    input: () => insertMeasureCommand({ anchor: { kind: "after-measure", measureId: "cvn3-measure-1" }, definition: { id: "cvn3-measure-oracle", meter: { numerator: 4, denominator: 4 } }, contents: [{ partId: "cvn3-part-b", voices: createCvn3InsertedVoices("cvn3-part-b", "cvn3-measure-oracle") }, { partId: "cvn3-part-a", voices: createCvn3InsertedVoices("cvn3-part-a", "cvn3-measure-oracle") }] }),
    source: commandRecipeSource("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert canonicalizes shuffled Part payloads, freezes capture, and emits canonical affected facts"),
  },
  "core.measure.remove": {
    fixture: createCvn3ShuffledMeasureFixture,
    input: () => removeMeasureCommand("cvn3-measure-1"),
    source: commandRecipeSource("test/core-kernel/cvn-3-measure-insert-remove.test.ts", "remove deletes and restores the complete Measure aggregate while final-Measure removal is atomic"),
  },
  "core.measure.move": {
    fixture: createCvn3ShuffledMeasureFixture,
    input: () => moveMeasureCommand("cvn3-measure-3", { kind: "start" }),
    source: commandRecipeSource("test/core-kernel/cvn-3-measure-move-definition.test.ts", "move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority"),
  },
  "core.measure.set-definition": {
    fixture: cloneCvn3MeasureFixture,
    input: () => setMeasureDefinitionCommand("cvn3-measure-1", { numerator: 2, denominator: 2 }, { kind: "none" }),
    source: commandRecipeSource("test/core-kernel/cvn-3-measure-move-definition.test.ts", "set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history"),
  },
  "core.part.insert": {
    fixture: cloneCvn4ScoreFixture,
    input: () => insertPartCommand({ kind: "after-part", partId: "cvn4-part-a" }, createCvn4InsertedPart("cvn4-part-inserted")),
    source: commandRecipeSource("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part insert canonicalizes complete coverage in global Measure order and detaches input"),
  },
  "core.part.remove": {
    fixture: cloneCvn4ScoreFixture,
    input: () => removePartCommand("cvn4-part-a"),
    source: commandRecipeSource("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part removal owns only its aggregate and extensions and undo restores mixed extension order"),
  },
  "core.part.move": {
    fixture: cloneCvn4ScoreFixture,
    input: () => movePartCommand("cvn4-part-c", { kind: "start" }),
    source: commandRecipeSource("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"),
  },
  "core.part.set-name": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setPartNameCommand("cvn4-part-a", "  Part A  "),
    source: commandRecipeSource("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"),
  },
  "core.part.set-instrument": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setPartInstrumentCommand("cvn4-part-a", { name: "Violin", writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 } }),
    source: commandRecipeSource("test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part move changes only the Part owner list and property replacements honor exact no-op rules"),
  },
  "core.staff.insert": {
    fixture: cloneCvn4ScoreFixture,
    input: () => insertStaffCommand("cvn4-part-a", { kind: "after-staff", staffId: "cvn4-staff-a-1" }, { id: "cvn4-staff-a-inserted", lineCount: 1, defaultClef: { sign: "C", line: 3 } }),
    source: commandRecipeSource("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff insert adds only the requested Staff and leaves Voices and assignments untouched"),
  },
  "core.staff.remove": {
    fixture: cloneCvn4StaffA2UnreferencedFixture,
    input: () => removeStaffCommand("cvn4-staff-a-2"),
    source: commandRecipeSource("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Explicit reassignment unlocks Staff removal and undo restores each command independently"),
  },
  "core.staff.move": {
    fixture: cloneCvn4ScoreFixture,
    input: () => moveStaffCommand("cvn4-staff-a-2", { kind: "start" }),
    source: commandRecipeSource("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic"),
  },
  "core.staff.set-definition": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setStaffDefinitionCommand("cvn4-staff-a-1", 1, { sign: "C", line: 3 }),
    source: commandRecipeSource("test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff move distinguishes owner-local anchors and definition replacement remains atomic"),
  },
  "core.voice.insert": {
    fixture: cloneCvn4ScoreFixture,
    input: () => insertVoiceCommand("cvn4-part-a", "cvn4-measure-1", { kind: "after-voice", voiceId: "cvn4-voice-a-1-primary" }, createCvn4InsertedVoice("cvn4-voice-inserted", "cvn4-staff-a-1")),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice insert resolves Part plus Measure content and preserves unrelated contents"),
  },
  "core.voice.remove": {
    fixture: cloneCvn4ScoreFixture,
    input: () => removeVoiceCommand("cvn4-voice-a-1-primary"),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice removal owns Event and Note descendants, exact undo, and final-Voice rejection"),
  },
  "core.voice.move": {
    fixture: cloneCvn4ScoreFixture,
    input: () => moveVoiceCommand("cvn4-voice-a-1-secondary", { kind: "start" }),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice move enforces content ownership and has an exact no-op"),
  },
  "core.voice.set-default-staff": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"),
  },
  "core.voice.set-sequence-start": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", { numerator: 1, denominator: 4 }),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"),
  },
  "core.event.set-staff-assignment": {
    fixture: cloneCvn4ScoreFixture,
    input: () => setEventStaffAssignmentCommand("cvn4-event-a-1-notes", { kind: "inherit-default" }),
    source: commandRecipeSource("test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"),
  },
  "core.range.delete": {
    fixture: cloneCvn4ScoreFixture,
    input: () => envelope("core.range.delete", { kind: "document", documentId: "cvn4-score" }, { range: { kind: "measure-range", start: { kind: "measure", measureId: "cvn4-measure-3" }, end: { kind: "measure", measureId: "cvn4-measure-2" } } }),
    source: commandRecipeSource("test/core-kernel/range-delete.test.ts", "range delete normalizes reverse global measure endpoints and undo restores exactly"),
  },
  "core.range.transpose-written-pitch": {
    fixture: cloneCvn4ScoreFixture,
    input: () => envelope("core.range.transpose-written-pitch", { kind: "document", documentId: "cvn4-score" }, { range: { kind: "voice-event-range", start: { kind: "voice-event", voiceId: "cvn4-voice-a-1-primary", eventId: "cvn4-event-a-1-rest" }, end: { kind: "voice-event", voiceId: "cvn4-voice-a-1-primary", eventId: "cvn4-event-a-1-notes" } }, transposition: { diatonicSteps: 1, chromaticSemitones: 2 } }),
    source: commandRecipeSource("test/core-kernel/range-transpose-written-pitch.test.ts", "range transpose skips rests, transforms notes, and reports the first invalid note"),
  },
  "core.transaction.batch": {
    fixture: cloneCoreScoreFixture,
    input: () => envelope("core.transaction.batch", { kind: "document", documentId: "score-1" }, { commands: [envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("First") }), envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("Second") })] }),
    source: commandRecipeSource("test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  },
};

function requiredInventory(extra: readonly JsonData[] = []): JsonData {
  return {
    inventoryVersion: 1,
    requirements: [
      { requirementVersion: 1, namespace: "fixture.score", moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1", supportedSchemaVersions: [1, 2], requiredForWrite: true },
      { requirementVersion: 1, namespace: "fixture.part", moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1", supportedSchemaVersions: [1, 2], requiredForWrite: true },
      ...extra,
    ],
  };
}

function createCoreRuntime(document: ScoreDocument): OracleRuntime {
  return { bus: requireCreated(CommandBus.create(document), "core") };
}

function createIntegratedRuntime(document: ScoreDocument, inventory: JsonData = requiredInventory()): OracleRuntime {
  const compiled = record(compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES), "catalog");
  if (compiled.ok !== true || compiled.catalog === undefined) throw new Error("expected authentic CVN-6 catalog");
  return { bus: requireCreated(CommandBus.createIntegrated(document, compiled.catalog as never, inventory), "integrated"), catalog: compiled.catalog, inventory };
}

function readState(bus: OracleBus): { readonly document: JsonData; readonly state: OracleStateProjectionV1; readonly result: JsonData } {
  const result = record(bus.read(), "read");
  if (result.ok !== true || result.value === undefined) throw new Error("oracle read failed");
  const value = record(result.value, "read value");
  const snapshot = record(value.snapshot, "snapshot");
  const history = record(value.history, "history");
  const document = toJsonData(snapshot.document);
  const eventSequence = typeof snapshot.eventSequence === "number" ? snapshot.eventSequence : 0;
  return {
    document,
    state: {
      documentSha256: sha256(canonicalJson(document)),
      documentVersion: numberField(snapshot.documentVersion, "snapshot.documentVersion"),
      history: { undoDepth: numberField(history.undoDepth, "history.undoDepth"), redoDepth: numberField(history.redoDepth, "history.redoDepth") },
      dirty: booleanField(value.dirty, "read.dirty"),
      eventSequence,
    },
    result: toJsonData(result),
  };
}

function numberField(value: unknown, label: string): number { if (typeof value !== "number") throw new Error(`${label} missing`); return value; }
function booleanField(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} missing`); return value; }

function missingTarget(input: Record<string, unknown>): Record<string, unknown> {
  const target = record(input.target, "command target");
  const key = ({ document: "documentId", note: "noteId", event: "eventId", voice: "voiceId", measure: "measureId", part: "partId", staff: "staffId" } as const)[String(target.kind) as "document"];
  if (key === undefined) throw new Error(`unsupported target kind ${String(target.kind)}`);
  return { ...input, target: { ...target, [key]: `missing-${String(target.kind)}` } };
}

class ScenarioCapture {
  readonly operations: OracleOperationV1[] = [];
  readonly observations: OracleObservationV1[] = [];
  readonly events: JsonData[] = [];
  readonly callbackTrace: string[] = [];
  readonly subscriptions = new Map<string, () => void>();
  private eventCursor = 0;
  private traceCursor = 0;

  constructor(readonly runtime: OracleRuntime) {}

  async execute(kind: string, fields: Record<string, JsonData>, invoke: () => unknown | Promise<unknown>): Promise<JsonData> {
    const operationIndex = this.operations.length;
    const operation = { operationVersion: 1 as const, operationIndex, kind, ...fields } as OracleOperationV1;
    this.operations.push(operation);
    if (kind === "read") await Promise.resolve();
    const result = toJsonData(await invoke());
    const snapshot = readState(this.runtime.bus);
    this.observations.push({
      observationVersion: 1,
      operationIndex,
      result,
      state: snapshot.state,
      publishedEvents: this.events.slice(this.eventCursor),
      callbackTrace: this.callbackTrace.slice(this.traceCursor),
    });
    this.eventCursor = this.events.length;
    this.traceCursor = this.callbackTrace.length;
    return result;
  }

  async subscribe(subscriptionId: string, behavior: "collect" | "throw-sync" | "reject-async"): Promise<void> {
    await this.execute("subscribe", { subscriptionId, behavior }, () => {
      const result = record(this.runtime.bus.subscribe((event: unknown) => {
        const eventData = toJsonData(event);
        this.events.push(eventData);
        this.callbackTrace.push(`${subscriptionId}:${String(record(eventData, "event").eventType)}`);
        if (behavior === "throw-sync") throw new Error("oracle subscriber isolation");
        if (behavior === "reject-async") return Promise.reject(new Error("oracle async subscriber isolation"));
        return undefined;
      }), "subscribe result");
      if (result.status !== "subscribed" || typeof result.unsubscribe !== "function") throw new Error("oracle subscription failed");
      this.subscriptions.set(subscriptionId, result.unsubscribe as () => void);
      return { status: "subscribed", subscriptionId };
    });
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.execute("unsubscribe", { subscriptionId }, () => {
      const unsubscribe = this.subscriptions.get(subscriptionId);
      if (unsubscribe === undefined) throw new Error(`missing subscription ${subscriptionId}`);
      unsubscribe();
      this.subscriptions.delete(subscriptionId);
      return { status: "completed", subscriptionId };
    });
  }

  async submit(input: unknown): Promise<JsonData> { return this.execute("submit", { input: toJsonData(input) }, () => this.runtime.bus.submit(input)); }
  async undo(): Promise<JsonData> { return this.execute("undo", {}, () => this.runtime.bus.undo()); }
  async redo(): Promise<JsonData> { return this.execute("redo", {}, () => this.runtime.bus.redo()); }
  async markPersisted(input: unknown): Promise<JsonData> { return this.execute("mark-persisted", { input: toJsonData(input) }, () => this.runtime.bus.markPersisted(input)); }
  async read(): Promise<JsonData> { return this.execute("read", { projection: "snapshot+history+dirty" }, () => this.runtime.bus.read()); }
}

async function captureAccepted(commandId: (typeof COMMAND_IDS)[number]): Promise<RustMigrationOracleScenarioV1> {
  const recipe = COMMAND_RECIPES[commandId];
  const initialDocument = recipe.fixture();
  const capture = new ScenarioCapture(createCoreRuntime(initialDocument));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.submit(recipe.input());
  const afterSubmit = readState(capture.runtime.bus);
  await capture.read();
  await capture.undo();
  const afterUndo = readState(capture.runtime.bus);
  await capture.read();
  await capture.redo();
  const afterRedo = readState(capture.runtime.bus);
  await capture.read();
  await capture.unsubscribe("main");
  const final = readState(capture.runtime.bus);
  return {
    schemaVersion: 1, scenarioId: `command.accepted.${commandId}`, scenarioClass: "accepted-command",
    coveredCommandIds: [commandId], assemblyKind: "core-only", sourceAuthority: recipe.source,
    initialDocument: initial.document, initialState: initial.state, operations: capture.operations, observations: capture.observations,
    finalDocument: final.document, finalState: final.state,
    inverseProof: { kind: "undo-redo", initialDocumentSha256: initial.state.documentSha256, afterSubmitDocumentSha256: afterSubmit.state.documentSha256, afterUndoDocumentSha256: afterUndo.state.documentSha256, afterRedoDocumentSha256: afterRedo.state.documentSha256 },
  };
}

async function captureRejected(commandId: (typeof COMMAND_IDS)[number]): Promise<RustMigrationOracleScenarioV1> {
  const recipe = COMMAND_RECIPES[commandId];
  const capture = new ScenarioCapture(createCoreRuntime(recipe.fixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.submit(missingTarget(recipe.input()));
  await capture.read();
  await capture.unsubscribe("main");
  const final = readState(capture.runtime.bus);
  return {
    schemaVersion: 1, scenarioId: `command.rejected.${commandId}`, scenarioClass: "rejected-command",
    coveredCommandIds: [commandId], assemblyKind: "core-only", sourceAuthority: recipe.source,
    initialDocument: initial.document, initialState: initial.state, operations: capture.operations, observations: capture.observations,
    finalDocument: final.document, finalState: final.state, inverseProof: { kind: "not-applicable" },
  };
}

function coreSource(title: string): SourceAuthority { return { file: "test/core-kernel/event-system.test.ts", testTitle: title }; }

async function captureCrossNoopPersisted(): Promise<RustMigrationOracleScenarioV1> {
  const capture = new ScenarioCapture(createCoreRuntime(cloneCoreScoreFixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  const changed = COMMAND_RECIPES["core.document.set-metadata"].input();
  await capture.submit(changed);
  await capture.submit(changed);
  await capture.read();
  await capture.markPersisted({ documentId: "score-1", documentVersion: 1 });
  await capture.read();
  await capture.markPersisted({ documentId: "score-1", documentVersion: 1 });
  await capture.unsubscribe("main");
  const final = readState(capture.runtime.bus);
  return basicCross("cross.submit-noop-persisted-dirty", ["core.document.set-metadata"], initial, capture, final, coreSource("events use deterministic count, order, versions, and support behavior"));
}

async function captureCrossTailTruncation(): Promise<RustMigrationOracleScenarioV1> {
  const capture = new ScenarioCapture(createCoreRuntime(cloneCoreScoreFixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.submit(envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("A") }));
  await capture.submit(envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("B") }));
  await capture.undo();
  await capture.submit(envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("C") }));
  await capture.redo();
  await capture.read();
  await capture.unsubscribe("main");
  return basicCross("cross.undo-redo-tail-truncation", ["core.document.set-metadata"], initial, capture, readState(capture.runtime.bus), coreSource("events use deterministic count, order, versions, and support behavior"));
}

async function captureCrossAtomicBatch(): Promise<RustMigrationOracleScenarioV1> {
  const commandId = "core.transaction.batch" as const;
  const recipe = COMMAND_RECIPES[commandId];
  const capture = new ScenarioCapture(createCoreRuntime(recipe.fixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.submit(recipe.input());
  await capture.read();
  await capture.undo();
  await capture.read();
  await capture.redo();
  await capture.read();
  await capture.unsubscribe("main");
  return basicCross("cross.atomic-batch-commit", [commandId], initial, capture, readState(capture.runtime.bus), recipe.source);
}

async function captureCrossBatchRejection(): Promise<RustMigrationOracleScenarioV1> {
  const capture = new ScenarioCapture(createCoreRuntime(cloneCoreScoreFixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.submit(envelope("core.transaction.batch", { kind: "document", documentId: "score-1" }, { commands: [envelope("core.document.set-metadata", { kind: "document", documentId: "score-1" }, { metadata: metadata("Must not leak") }), envelope("core.unknown", { kind: "document", documentId: "score-1" }, {})] }));
  await capture.read();
  await capture.unsubscribe("main");
  return basicCross("cross.batch-child-rejection-zero-delta", ["core.transaction.batch", "core.document.set-metadata"], initial, capture, readState(capture.runtime.bus), { file: "test/core-kernel/batch-core-atomicity.test.ts", testTitle: "child rejection is attributed once and preserves all observable state" });
}

async function captureCrossReplay(): Promise<RustMigrationOracleScenarioV1> {
  const fixture = cloneCoreScoreFixture();
  const capture = new ScenarioCapture(createCoreRuntime(fixture));
  const initial = readState(capture.runtime.bus);
  const commands = [COMMAND_RECIPES["core.document.set-metadata"].input(), COMMAND_RECIPES["core.note.set-written-pitch"].input()];
  await capture.subscribe("main", "collect");
  await capture.submit(commands[0]);
  await capture.submit(commands[1]);
  await capture.read();
  await capture.execute("replay", { replayKind: "core", initialDocument: toJsonData(cloneCoreScoreFixture()), commands: toJsonData(commands), assemblyRef: "none" }, () => replayCoreCommands(cloneCoreScoreFixture(), commands));
  await capture.unsubscribe("main");
  return basicCross("cross.semantic-replay-equality", ["core.document.set-metadata", "core.note.set-written-pitch"], initial, capture, readState(capture.runtime.bus), { file: "test/core-kernel/command-system.test.ts", testTitle: "deterministic replay uses submit semantics and returns detached documents" });
}

function moduleCommand(commandId: "fixture.score.apply" | "fixture.part.apply", marker: string, pitch: "C" | "D"): Record<string, unknown> {
  return envelope(commandId, commandId === "fixture.score.apply" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" }, { noteId: "note-1", pitch: { step: pitch, alter: 0, octave: 4 }, schemaVersion: 1, marker });
}

async function captureCrossIntegrated(): Promise<RustMigrationOracleScenarioV1> {
  const capture = new ScenarioCapture(createIntegratedRuntime(cloneCoreScoreFixture()));
  const initial = readState(capture.runtime.bus);
  await capture.subscribe("main", "collect");
  await capture.read();
  await capture.submit(moduleCommand("fixture.score.apply", "score-oracle", "D"));
  await capture.submit(moduleCommand("fixture.part.apply", "part-oracle", "C"));
  await capture.read();
  await capture.unsubscribe("main");
  return basicCross("cross.integrated-two-module-order-availability", ["fixture.score.apply", "fixture.part.apply"], initial, capture, readState(capture.runtime.bus), { file: "test/core-kernel/module-validation-classification.test.ts", testTitle: "validators complete before classifiers in frozen catalog order" }, "integrated");
}

function migrationInput(version: number): JsonData {
  return toJsonData({ ...cloneCoreScoreFixture(), extensions: [{ namespace: "fixture.score", schemaVersion: version, owner: { kind: "score" }, payload: { marker: "before" } }] });
}

const MIGRATION_REQUEST = {
  migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
  effectKind: "fixture.score.replace", namespace: "fixture.score", owner: { kind: "score" }, sourceSchemaVersion: 1,
  targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "after" },
} as const;

async function captureCrossMigration(): Promise<RustMigrationOracleScenarioV1> {
  const capture = new ScenarioCapture(createIntegratedRuntime(cloneCoreScoreFixture()));
  const initial = readState(capture.runtime.bus);
  const catalog = capture.runtime.catalog;
  if (catalog === undefined) throw new Error("integrated catalog missing");
  await capture.read();
  await capture.execute("migrate-kernel-extension", { inputDocument: migrationInput(1), request: toJsonData(MIGRATION_REQUEST), assemblyRef: "cvn6-a" }, () => migrateKernelExtension(migrationInput(1), MIGRATION_REQUEST, catalog as never));
  await capture.execute("migrate-kernel-extension", { inputDocument: migrationInput(2), request: toJsonData(MIGRATION_REQUEST), assemblyRef: "cvn6-a" }, () => migrateKernelExtension(migrationInput(2), MIGRATION_REQUEST, catalog as never));
  await capture.execute("migrate-kernel-extension", { inputDocument: toJsonData({ ...cloneCoreScoreFixture(), extensions: [] }), request: toJsonData(MIGRATION_REQUEST), assemblyRef: "cvn6-a" }, () => migrateKernelExtension({ ...cloneCoreScoreFixture(), extensions: [] }, MIGRATION_REQUEST, catalog as never));
  await capture.read();
  return basicCross("cross.detached-extension-migration", ["migrateKernelExtension"], initial, capture, readState(capture.runtime.bus), { file: "test/core-kernel/extension-migration.test.ts", testTitle: "detached extension migration replaces only the selected block" }, "integrated");
}

async function captureCrossAssemblyIsolation(): Promise<RustMigrationOracleScenarioV1> {
  const runtimeA = createIntegratedRuntime(cloneCoreScoreFixture());
  const extra = [{ requirementVersion: 1, namespace: "fixture.absent", moduleId: "fixture.absent.module", contributionId: "fixture.absent.contribution.v1", supportedSchemaVersions: [1], requiredForWrite: true }] as const;
  const runtimeB = createIntegratedRuntime(cloneCoreScoreFixture(), requiredInventory(extra));
  const capture = new ScenarioCapture(runtimeA);
  const initial = readState(capture.runtime.bus);
  const catalogA = runtimeA.catalog;
  if (catalogA === undefined) throw new Error("catalog A missing");
  await capture.execute("create-gateway", { registryAssemblyRef: "cvn6-a", busAssemblyRef: "cvn6-b", moduleId: "fixture.score.module" }, () => {
    const registry = record(createKernelRegistry(catalogA as never, runtimeA.inventory), "registry A");
    if (registry.ok !== true || registry.registry === undefined) throw new Error("registry A failed");
    return (registry.registry as { createGateway(moduleId: string, bus: unknown): unknown }).createGateway("fixture.score.module", runtimeB.bus);
  });
  await capture.subscribe("throwing", "throw-sync");
  await capture.subscribe("collector", "collect");
  await capture.submit(moduleCommand("fixture.score.apply", "score-oracle", "D"));
  await capture.read();
  await capture.unsubscribe("throwing");
  await capture.unsubscribe("collector");
  return basicCross("cross.assembly-mismatch-subscriber-isolation", ["fixture.score.apply"], initial, capture, readState(capture.runtime.bus), { file: "test/core-kernel/integrated-assembly-identity.test.ts", testTitle: "different inventory and Core/integrated pairings reject before gateway exposure" }, "integrated");
}

function basicCross(
  scenarioId: string,
  coveredCommandIds: readonly string[],
  initial: ReturnType<typeof readState>,
  capture: ScenarioCapture,
  final: ReturnType<typeof readState>,
  sourceAuthority: SourceAuthority,
  assemblyKind: "core-only" | "integrated" = "core-only",
): RustMigrationOracleScenarioV1 {
  return {
    schemaVersion: 1, scenarioId, scenarioClass: "cross-cutting", coveredCommandIds, assemblyKind, sourceAuthority,
    initialDocument: initial.document, initialState: initial.state, operations: capture.operations, observations: capture.observations,
    finalDocument: final.document, finalState: final.state, inverseProof: { kind: "not-applicable" },
  };
}

export const CROSS_SCENARIO_IDS = [
  "cross.submit-noop-persisted-dirty", "cross.undo-redo-tail-truncation", "cross.atomic-batch-commit",
  "cross.batch-child-rejection-zero-delta", "cross.semantic-replay-equality", "cross.integrated-two-module-order-availability",
  "cross.detached-extension-migration", "cross.assembly-mismatch-subscriber-isolation",
] as const;

export const EXPECTED_SCENARIO_IDS = [
  ...COMMAND_IDS.map((commandId) => `command.accepted.${commandId}`),
  ...COMMAND_IDS.map((commandId) => `command.rejected.${commandId}`),
  ...CROSS_SCENARIO_IDS,
] as const;

export async function buildOracleScenarios(): Promise<readonly RustMigrationOracleScenarioV1[]> {
  const accepted = await Promise.all(COMMAND_IDS.map(captureAccepted));
  const rejected = await Promise.all(COMMAND_IDS.map(captureRejected));
  const cross = [
    await captureCrossNoopPersisted(), await captureCrossTailTruncation(), await captureCrossAtomicBatch(),
    await captureCrossBatchRejection(), await captureCrossReplay(), await captureCrossIntegrated(),
    await captureCrossMigration(), await captureCrossAssemblyIsolation(),
  ];
  return [...accepted, ...rejected, ...cross];
}
