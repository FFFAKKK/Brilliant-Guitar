import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { isAbsolute, resolve } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";

import type * as CoreRuntime from "../../../src/core-kernel/index";
import type * as SdkRuntime from "../../../src/core-kernel/module-sdk/index";
import {
  CVN7_C4,
  CVN7_D4,
  createCvn7QualificationScore,
  createCvn7RepresentativeHistoryWorkload,
  type Cvn7QualificationScoreFixture,
} from "../fixtures/cvn-7-qualification-score";
import { createCvn7QualificationModules } from "../fixtures/cvn-7-qualification-modules";
import {
  CVN7_OPERATIONS,
  CVN7_WORKER_ACTIONS,
  type QualificationOperation,
  type QualificationWorkerRequestV1,
  type QualificationWorkerResultV1,
} from "./cvn-7-qualification-contracts";

interface LoadedRuntime {
  readonly core: typeof CoreRuntime;
  readonly sdk: typeof SdkRuntime;
}

interface RuntimeSetup extends LoadedRuntime {
  readonly fixture: Cvn7QualificationScoreFixture;
  readonly modules: ReturnType<typeof createCvn7QualificationModules>;
  readonly catalog: Extract<
    ReturnType<typeof SdkRuntime.compileOfficialModuleCatalogV1>,
    { readonly ok: true }
  >["catalog"];
}

const REQUEST_KEYS = [
  "schemaVersion", "action", "buildRoot", "fixture", "phase",
] as const;
const OPTIONAL_REQUEST_KEYS = ["operation", "sampleIndex"] as const;
let unhandledRejectionObserved = false;

process.on("unhandledRejection", () => {
  unhandledRejectionObserved = true;
});

function exactRequest(value: unknown): QualificationWorkerRequestV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("worker request must be an exact object");
  }
  const keys = Reflect.ownKeys(value);
  const allowed = [...REQUEST_KEYS, ...OPTIONAL_REQUEST_KEYS];
  if (
    keys.some((key) => typeof key !== "string" || !allowed.includes(key as never)) ||
    REQUEST_KEYS.some((key) => !keys.includes(key))
  ) {
    throw new TypeError("worker request keys are invalid");
  }
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError("symbol request key");
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("worker request fields must be data properties");
    }
    record[key] = descriptor.value;
  }
  if (
    record.schemaVersion !== 1 ||
    !CVN7_WORKER_ACTIONS.includes(record.action as never) ||
    typeof record.buildRoot !== "string" ||
    !isAbsolute(record.buildRoot) ||
    (record.fixture !== "representative" && record.fixture !== "stress") ||
    (record.phase !== "warmup" &&
      record.phase !== "measured" &&
      record.phase !== "memory" &&
      record.phase !== "functional") ||
    (record.operation !== undefined && !CVN7_OPERATIONS.includes(record.operation as never)) ||
    (record.sampleIndex !== undefined &&
      (!Number.isSafeInteger(record.sampleIndex) || (record.sampleIndex as number) < 0))
  ) {
    throw new TypeError("worker request values are invalid");
  }
  return record as unknown as QualificationWorkerRequestV1;
}

function loadRuntime(
  buildRoot: string,
  allowedBuildRoots: readonly string[],
): LoadedRuntime {
  const root = resolve(buildRoot);
  if (
    allowedBuildRoots.length !== 2 ||
    !allowedBuildRoots.some((allowedRoot) => resolve(allowedRoot) === root)
  ) {
    throw new TypeError("buildRoot is not an exact registered worktree");
  }
  if (!statSync(root).isDirectory()) throw new TypeError("buildRoot must be a directory");
  const localRequire = createRequire(resolve(root, "package.json"));
  const coreEntry = resolve(root, "dist", "src", "core-kernel", "index.js");
  const sdkEntry = resolve(root, "dist", "src", "core-kernel", "module-sdk", "index.js");
  return {
    core: localRequire(coreEntry) as typeof CoreRuntime,
    sdk: localRequire(sdkEntry) as typeof SdkRuntime,
  };
}

function fixtureFor(kind: "representative" | "stress"): Cvn7QualificationScoreFixture {
  return createCvn7QualificationScore({
    fixtureKind: kind,
    generatorVersion: 1,
    seed: `cvn7-${kind}-v1`,
  });
}

function setupRuntime(runtime: LoadedRuntime, kind: "representative" | "stress"): RuntimeSetup {
  const fixture = fixtureFor(kind);
  const modules = createCvn7QualificationModules(runtime.sdk);
  const compiled = runtime.sdk.compileOfficialModuleCatalogV1(
    modules.manifest,
    modules.registrationEntries,
  );
  if (!compiled.ok) throw new Error("catalog-compilation-failed");
  return { ...runtime, fixture, modules, catalog: compiled.catalog };
}

function requireBus(setup: RuntimeSetup) {
  const created = setup.core.CommandBus.createIntegrated(
    setup.fixture.document,
    setup.catalog,
    setup.modules.knownRequirementInventory,
  );
  if (!created.ok) throw new Error(`bus-create-${created.failure.code}`);
  return created.value;
}

function mixedBatch(setup: RuntimeSetup): unknown {
  const children: unknown[] = [
    setup.modules.createScoreCommand(
      setup.fixture.document.id,
      setup.fixture.firstNote.noteId,
      CVN7_D4,
      "cvn7-worker-score",
    ),
  ];
  for (let index = 1; index < 99; index += 1) {
    children.push({
      commandVersion: 1,
      commandId: "core.document.set-metadata",
      target: { kind: "document", documentId: setup.fixture.document.id },
      payload: {
        metadata: {
          title: index % 2 === 0 ? "CVN-7 Worker Even" : "CVN-7 Worker Odd",
          authors: ["Brilliant Guitar Qualification"],
          tempo: { bpm: 120 },
        },
      },
    });
  }
  children.push(setup.modules.createPartCommand(
    setup.fixture.lastPartId,
    setup.fixture.lastNote.noteId,
    CVN7_D4,
    "cvn7-worker-part",
  ));
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: setup.fixture.document.id },
    payload: { commands: children },
  };
}

function pitchCommand(noteId: string, step: "C" | "D"): unknown {
  return {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId },
    payload: { writtenPitch: step === "C" ? CVN7_C4 : CVN7_D4 },
  };
}

function replay100Commands(setup: RuntimeSetup): readonly unknown[] {
  return Object.freeze(setup.fixture.canonicalNotes.slice(0, 100).map(({ noteId }) =>
    pitchCommand(noteId, "D"),
  ));
}

function timed<T>(operation: () => T): { readonly durationMs: number; readonly result: T } {
  const start = performance.now();
  const result = operation();
  const durationMs = performance.now() - start;
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("invalid-duration");
  return { durationMs, result };
}

function ownDataValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function hasExactCoreSource(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === 1 && keys[0] === "kind" && ownDataValue(value, "kind") === "core";
}

export function assertBatchBenchmarkPostcondition(
  result: unknown,
  emitted: readonly unknown[],
  childCount: number,
): void {
  const committedEvents = emitted.filter(
    (event) => ownDataValue(event, "eventType") === "core.document.committed",
  );
  const dirtyEvents = emitted.filter(
    (event) => ownDataValue(event, "eventType") === "core.session.dirty-state-changed",
  );
  const committedEvent = committedEvents[0];
  const dirtyEvent = dirtyEvents[0];
  if (
    childCount !== 100 ||
    ownDataValue(result, "status") !== "committed" ||
    ownDataValue(result, "documentVersion") !== 1 ||
    ownDataValue(result, "undoDepth") !== 1 ||
    ownDataValue(result, "redoDepth") !== 0 ||
    emitted.length !== 2 ||
    committedEvents.length !== 1 ||
    dirtyEvents.length !== 1 ||
    emitted[0] !== committedEvent ||
    emitted[1] !== dirtyEvent ||
    ownDataValue(committedEvent, "commandId") !== "core.transaction.batch" ||
    !hasExactCoreSource(ownDataValue(committedEvent, "source")) ||
    ownDataValue(committedEvent, "cause") !== "submit" ||
    ownDataValue(committedEvent, "documentVersion") !== 1 ||
    ownDataValue(dirtyEvent, "cause") !== "submit" ||
    ownDataValue(dirtyEvent, "documentVersion") !== 1 ||
    ownDataValue(dirtyEvent, "dirty") !== true
  ) {
    throw new Error("batch-result-mismatch");
  }
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !deeplyFrozen(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

function freezeEnvelope<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("batch envelope must contain only own data properties");
    }
    freezeEnvelope(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function executeOperation(setup: RuntimeSetup, operation: QualificationOperation): unknown {
  if (operation === "construct-integrated") {
    const source = setup.fixture.document;
    const firstMeasure = source.measureDefinitions[0];
    if (firstMeasure === undefined) throw new Error("construct-measure-missing");
    const factoryInput = JSON.parse(JSON.stringify({
      factoryVersion: 1,
      documentId: source.id,
      metadata: source.metadata,
      initialMeasure: firstMeasure,
      initialParts: source.parts.map((part) => {
        const firstContent = part.measureContents[0];
        if (firstContent === undefined) throw new Error("construct-content-missing");
        return {
          id: part.id,
          name: part.name,
          instrument: part.instrument,
          staves: part.staves,
          voices: firstContent.voices,
        };
      }),
      extensions: source.extensions,
    })) as unknown;
    const start = performance.now();
    const factory = setup.core.createScoreDocument(factoryInput);
    const created = factory.status === "created"
      ? setup.core.CommandBus.createIntegrated(
          factory.document,
          setup.catalog,
          setup.modules.knownRequirementInventory,
        )
      : undefined;
    const durationMs = performance.now() - start;
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("invalid-duration");
    if (factory.status !== "created") throw new Error("construct-factory-rejected");
    if (created === undefined) throw new Error("construct-bus-missing");
    if (!created.ok) throw new Error(`construct-${created.failure.code}`);
    const read = created.value.read();
    if (!read.ok) throw new Error("construct-read-failed");
    if (
      read.value.writeAvailability.status !== "writable" ||
      read.value.validationAvailability.status !== "complete"
    ) {
      throw new Error("construct-availability-incomplete");
    }
    return {
      durationMs,
      result: {
        status: "created",
        factorySupport: factory.support,
        writeAvailability: read.value.writeAvailability,
        validationAvailability: read.value.validationAvailability,
      },
    };
  }
  if (operation === "replay-100") {
    const commands = replay100Commands(setup);
    const expectedBus = requireBus(setup);
    const expectedStatuses = commands.map((command) => expectedBus.submit(command).status);
    const expectedRead = expectedBus.read();
    if (!expectedRead.ok) throw new Error("replay-expected-read-failed");
    const expectedHash = documentHash(setup.core, expectedRead.value.snapshot.document);
    const measured = timed(() =>
      setup.core.replayKernelCommands(
        setup.fixture.document,
        commands,
        setup.catalog,
        setup.modules.knownRequirementInventory,
      ),
    );
    const replay = measured.result;
    if (replay.status !== "replayed") throw new Error(`replay-${replay.status}`);
    if (
      replay.documentVersion !== 100 ||
      JSON.stringify(replay.results.map(({ status }) => status)) !== JSON.stringify(expectedStatuses) ||
      documentHash(setup.core, replay.finalDocument) !== expectedHash
    ) {
      throw new Error("replay-result-mismatch");
    }
    return {
      durationMs: measured.durationMs,
      result: { status: replay.status, documentVersion: replay.documentVersion },
    };
  }
  const bus = requireBus(setup);
  const single = setup.modules.createScoreCommand(
    setup.fixture.document.id,
    setup.fixture.firstNote.noteId,
    CVN7_D4,
    "cvn7-worker-single",
  );
  let changedDocumentHash: string | undefined;
  if (operation === "undo-single" || operation === "redo-single") {
    if (bus.submit(single).status !== "committed") throw new Error("single-setup-failed");
    const changed = bus.read();
    if (!changed.ok) throw new Error("single-setup-read-failed");
    changedDocumentHash = documentHash(setup.core, changed.value.snapshot.document);
    if (operation === "redo-single" && bus.undo().status !== "committed") {
      throw new Error("redo-setup-failed");
    }
  }
  let cachedSnapshot: object | undefined;
  if (operation === "read-cached") {
    const first = bus.read();
    if (!first.ok) throw new Error("read-setup-failed");
    cachedSnapshot = first.value.snapshot;
  }
  const emitted: unknown[] = [];
  const preparedBatch = operation === "batch-100"
    ? freezeEnvelope(mixedBatch(setup))
    : undefined;
  let batchChildCount = 0;
  if (operation === "batch-100") {
    if (preparedBatch === undefined || !deeplyFrozen(preparedBatch)) {
      throw new Error("batch-envelope-not-frozen");
    }
    const commands = ownDataValue(ownDataValue(preparedBatch, "payload"), "commands");
    batchChildCount = Array.isArray(commands) ? commands.length : 0;
    const subscribed = bus.subscribe((event: unknown) => emitted.push(event));
    if (subscribed.status !== "subscribed") throw new Error("batch-subscribe-failed");
  }
  const measured = timed(() => operation === "submit-single"
      ? bus.submit(single)
      : operation === "undo-single"
        ? bus.undo()
        : operation === "redo-single"
          ? bus.redo()
          : operation === "batch-100"
            ? bus.submit(preparedBatch)
            : bus.read(),
  );
  const result = measured.result;
  const status = "status" in result ? result.status : result.ok ? "read" : "read-failed";
  if (status === "rejected" || status === "read-failed") throw new Error(`operation-${status}`);
  if (operation === "submit-single") {
    if (!("documentVersion" in result) || result.status !== "committed" || result.documentVersion !== 1 || result.undoDepth !== 1) {
        throw new Error("submit-result-mismatch");
    }
  } else if (operation === "undo-single") {
    const read = bus.read();
    if (
      !("documentVersion" in result) || result.status !== "committed" || result.documentVersion !== 2 ||
      !read.ok || documentHash(setup.core, read.value.snapshot.document) !== documentHash(setup.core, setup.fixture.document)
    ) {
      throw new Error("undo-result-mismatch");
    }
  } else if (operation === "redo-single") {
    const read = bus.read();
    if (
      !("documentVersion" in result) || result.status !== "committed" || result.documentVersion !== 3 ||
      !read.ok || documentHash(setup.core, read.value.snapshot.document) !== changedDocumentHash
    ) {
      throw new Error("redo-result-mismatch");
    }
  } else if (operation === "read-cached") {
    if (!("ok" in result) || !result.ok || result.value.snapshot !== cachedSnapshot) {
      throw new Error("cached-read-result-mismatch");
    }
  } else if (operation === "snapshot-first") {
    if (
      !("ok" in result) || !result.ok ||
      result.value.snapshot.document === setup.fixture.document ||
      !deeplyFrozen(result.value.snapshot)
    ) {
      throw new Error("snapshot-first-result-mismatch");
    }
  } else if (operation === "batch-100") {
    assertBatchBenchmarkPostcondition(result, emitted, batchChildCount);
  }
  return { durationMs: measured.durationMs, result: { status } };
}

export function maxRssKilobytesToBytes(maxRssRaw: number): number {
  const bytes = maxRssRaw * 1_024;
  if (!Number.isSafeInteger(maxRssRaw) || maxRssRaw < 0 || !Number.isSafeInteger(bytes)) {
    throw new TypeError("maxRSS must be a nonnegative safe KiB count");
  }
  return bytes;
}

function memoryObservation<T>(operation: () => T): { readonly observation: unknown; readonly result: T } {
  global.gc?.();
  const setupBeforeHeapUsedBytes = process.memoryUsage().heapUsed;
  global.gc?.();
  const operationBeforeHeapUsedBytes = process.memoryUsage().heapUsed;
  const result = operation();
  const operationAfterHeapUsedBytes = process.memoryUsage().heapUsed;
  JSON.stringify(result);
  const resultEncodeAfterHeapUsedBytes = process.memoryUsage().heapUsed;
  const maxRssRaw = process.resourceUsage().maxRSS;
  const maxRssPlatformUnit = "kilobytes" as const;
  const maxRssBytes = maxRssKilobytesToBytes(maxRssRaw);
  return {
    result,
    observation: {
      setupBeforeHeapUsedBytes,
      operationBeforeHeapUsedBytes,
      operationAfterHeapUsedBytes,
      resultEncodeAfterHeapUsedBytes,
      observedPeakHeapUsedBytes: Math.max(
        setupBeforeHeapUsedBytes,
        operationBeforeHeapUsedBytes,
        operationAfterHeapUsedBytes,
        resultEncodeAfterHeapUsedBytes,
      ),
      maxRssRaw,
      maxRssPlatformUnit,
      maxRssBytes,
    },
  };
}

function fixtureVerification(setup: RuntimeSetup): unknown {
  const semantic = setup.core.validateScoreDocumentSemantics(setup.fixture.document);
  const encoded = setup.core.encodeScoreDocumentJson(setup.fixture.document);
  if (!encoded.ok) throw new Error("fixture-encode-failed");
  const parsed = setup.core.parseScoreDocumentJson(encoded.value);
  if (!parsed.ok) throw new Error("fixture-parse-failed");
  const repeated = fixtureFor(setup.fixture.provenance.fixtureKind);
  return {
    provenance: setup.fixture.provenance,
    counts: setup.fixture.counts,
    idsUnique: new Set(setup.fixture.canonicalNotes.map(({ noteId }) => noteId)).size === setup.fixture.counts.notes,
    coverageComplete: setup.fixture.document.parts.every(
      (part) => part.measureContents.length === setup.fixture.counts.measures,
    ),
    semanticValid: semantic.ok,
    codecRoundTripEqual: JSON.stringify(parsed.value) === JSON.stringify(setup.fixture.document),
    repeatedGenerationEqual: JSON.stringify(repeated) === JSON.stringify(setup.fixture),
  };
}

function functionalQualification(setup: RuntimeSetup): unknown {
  if (setup.fixture.provenance.fixtureKind !== "representative") {
    throw new TypeError("functional qualification requires representative fixture");
  }
  const created = setup.core.CommandBus.create(setup.fixture.document);
  if (!created.ok) throw new Error("history-bus-create-failed");
  const workload = createCvn7RepresentativeHistoryWorkload(setup.fixture);
  for (let index = 0; index < workload.length; index += 1) {
    const result = created.value.submit(workload[index]);
    if (result.status !== "committed") throw new Error(`history-submit-${index}-${result.status}`);
  }
  const read = created.value.read();
  if (!read.ok) throw new Error("history-read-failed");
  if (
    read.value.snapshot.documentVersion !== 2_000 ||
    read.value.history.undoDepth !== 2_000 ||
    read.value.history.redoDepth !== 0
  ) {
    throw new Error("history-count-mismatch");
  }
  return {
    fixture: fixtureVerification(setup),
    history: {
      envelopeCount: workload.length,
      documentVersion: read.value.snapshot.documentVersion,
      undoDepth: read.value.history.undoDepth,
      redoDepth: read.value.history.redoDepth,
    },
  };
}

function stressCommands(setup: RuntimeSetup): readonly unknown[] {
  return Object.freeze(Array.from({ length: 10_000 }, (_, index) => {
    const note = setup.fixture.canonicalNotes[index % setup.fixture.canonicalNotes.length];
    if (note === undefined) throw new Error("stress-note-missing");
    const visit = Math.floor(index / setup.fixture.canonicalNotes.length) + 1;
    return pitchCommand(note.noteId, visit % 2 === 0 ? "C" : "D");
  }));
}

function documentHash(core: typeof CoreRuntime, document: CoreRuntime.ScoreDocument): string {
  const encoded = core.encodeScoreDocumentJson(document);
  if (!encoded.ok) throw new Error("stress-encode-failed");
  return createHash("sha256").update(encoded.value, "utf8").digest("hex");
}

function historyStorageEvidence(buildRoot: string): unknown {
  const relativeArtifactPath = "src/core-kernel/commands/runtime.js";
  const path = resolve(buildRoot, "dist", ...relativeArtifactPath.split("/"));
  const bytes = readFileSync(path);
  const source = bytes.toString("utf8");
  const start = source.indexOf("function historyEntry(");
  const end = source.indexOf("function committed(", start);
  const body = start >= 0 && end > start ? source.slice(start, end) : "";
  return {
    relativeArtifactPath,
    artifactSha256: createHash("sha256").update(bytes).digest("hex"),
    historyEntryLocated: body.length > 0,
    effectFieldsPresent:
      /\bforward\b/u.test(body) && /\binverse\b/u.test(body) && /\baffected\b/u.test(body),
    wholeDocumentFieldsAbsent: !/\b(?:document|snapshot)\b/u.test(body),
  };
}

export function collectStressSubmitOutcomes(
  commands: readonly unknown[],
  submit: (command: unknown) => { readonly status: string; readonly assessment?: unknown },
): { readonly statuses: readonly string[]; readonly finalAssessment: unknown } {
  const statuses: string[] = [];
  let finalAssessment: unknown = null;
  for (const command of commands) {
    const result = submit(command);
    statuses.push(result.status);
    if (result.status !== "rejected") finalAssessment = result.assessment;
  }
  return { statuses, finalAssessment };
}

function stressSubmit(setup: RuntimeSetup, buildRoot: string): unknown {
  const created = setup.core.CommandBus.createIntegrated(
    setup.fixture.document,
    setup.catalog,
    setup.modules.knownRequirementInventory,
  );
  if (!created.ok) throw new Error("stress-bus-create-failed");
  const commands = stressCommands(setup);
  const { statuses, finalAssessment } = collectStressSubmitOutcomes(
    commands,
    (command) => created.value.submit(command),
  );
  const read = created.value.read();
  if (!read.ok) throw new Error("stress-read-failed");
  return {
    envelopeCount: commands.length,
    committedCount: statuses.filter((status) => status === "committed").length,
    statuses,
    documentVersion: read.value.snapshot.documentVersion,
    finalDocumentSha256: documentHash(setup.core, read.value.snapshot.document),
    support: finalAssessment,
    writeAvailability: read.value.writeAvailability,
    validationAvailability: read.value.validationAvailability,
    historyStorageEvidence: historyStorageEvidence(buildRoot),
    unhandledRejectionObserved,
  };
}

function stressReplay(setup: RuntimeSetup, buildRoot: string): unknown {
  const commands = stressCommands(setup);
  const replayed = setup.core.replayKernelCommands(
    setup.fixture.document,
    commands,
    setup.catalog,
    setup.modules.knownRequirementInventory,
  );
  if (replayed.status !== "replayed") {
    return {
      envelopeCount: commands.length,
      committedCount:
        "results" in replayed
          ? replayed.results.filter(({ status }) => status === "committed").length
          : 0,
      statuses: "results" in replayed
        ? replayed.results.map(({ status }) => status)
        : [],
      documentVersion: "documentVersion" in replayed ? replayed.documentVersion : 0,
      finalDocumentSha256:
        "finalDocument" in replayed
          ? documentHash(setup.core, replayed.finalDocument)
          : documentHash(setup.core, setup.fixture.document),
      support: null,
      writeAvailability:
        "writeAvailability" in replayed ? replayed.writeAvailability : {},
      validationAvailability:
        "validationAvailability" in replayed ? replayed.validationAvailability : {},
      historyStorageEvidence: historyStorageEvidence(buildRoot),
      unhandledRejectionObserved,
    };
  }
  const finalResult = replayed.results[replayed.results.length - 1];
  if (finalResult === undefined || finalResult.status === "rejected") {
    throw new Error("stress-replay-final-result-missing");
  }
  return {
    envelopeCount: commands.length,
    committedCount: replayed.results.filter(({ status }) => status === "committed").length,
    statuses: replayed.results.map(({ status }) => status),
    documentVersion: replayed.documentVersion,
    finalDocumentSha256: documentHash(setup.core, replayed.finalDocument),
    support: finalResult.assessment,
    writeAvailability: replayed.writeAvailability,
    validationAvailability: replayed.validationAvailability,
    historyStorageEvidence: historyStorageEvidence(buildRoot),
    unhandledRejectionObserved,
  };
}

function execute(
  request: QualificationWorkerRequestV1,
  allowedBuildRoots: readonly string[],
): unknown {
  const runtime = loadRuntime(request.buildRoot, allowedBuildRoots);
  if (request.action === "build-probe") {
    return { coreRuntimeKeys: Object.keys(runtime.core).sort(), sdkRuntimeKeys: Object.keys(runtime.sdk).sort() };
  }
  const setup = setupRuntime(runtime, request.fixture);
  if (request.action === "fixture-verify") return fixtureVerification(setup);
  if (request.action === "functional-case") return functionalQualification(setup);
  if (request.action === "latency-sample") {
    if (request.operation === undefined) throw new TypeError("latency operation required");
    return executeOperation(setup, request.operation);
  }
  if (request.action === "memory-sample") {
    if (request.operation === undefined) throw new TypeError("memory operation required");
    const operation = request.operation;
    return memoryObservation(() => executeOperation(setup, operation));
  }
  if (request.action === "stress-submit") {
    return memoryObservation(() => stressSubmit(setup, request.buildRoot));
  }
  return memoryObservation(() => stressReplay(setup, request.buildRoot));
}

function failureKind(error: unknown): string {
  return error instanceof Error && /^[a-z0-9-]+$/u.test(error.message)
    ? error.message
    : "worker-internal-failure";
}

export function runQualificationWorker(
  requestInput: unknown,
  allowedBuildRoots: readonly string[],
): QualificationWorkerResultV1 {
  let request: QualificationWorkerRequestV1;
  try {
    request = exactRequest(requestInput);
  } catch {
    return {
      schemaVersion: 1,
      status: "failed",
      action: "build-probe",
      failureKind: "invalid-worker-request",
      phase: "functional",
    };
  }
  try {
    return {
      schemaVersion: 1,
      status: "passed",
      action: request.action,
      result: execute(request, allowedBuildRoots),
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      status: "failed",
      action: request.action,
      failureKind: failureKind(error),
      phase: request.phase,
    };
  }
}

function main(): void {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 4) {
    process.exitCode = 2;
    return;
  }
  const requestPath = resolve(arguments_[0]!);
  const outputPath = resolve(arguments_[1]!);
  const allowedBuildRoots = arguments_.slice(2).map((value) => resolve(value));
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(requestPath, "utf8")) as unknown;
  } catch {
    input = undefined;
  }
  writeFileSync(outputPath, `${JSON.stringify(runQualificationWorker(input, allowedBuildRoots))}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

if (require.main === module) main();
