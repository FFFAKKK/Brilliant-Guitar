import * as coreKernel from "../../../src/core-kernel/index";
import type {
  CommandBus,
  KernelEvent,
  KernelGatewayResult,
  RegistrySummary,
  ScoreDocument,
} from "../../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import { cloneCoreScoreFixture } from "./core-score";

const CVN1_BASELINE_COMMIT = "a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5" as const;

/**
 * The original root runtime surface. This is deliberately test-only: CVN-3
 * grows the public API, while this characterization fixture continues to
 * protect the frozen V1 contract.
 */
export const CVN1_RUNTIME_EXPORT_NAMES = [
  "CORE_KERNEL_STARTUP_MANIFEST",
  "CommandBus",
  "K1_SCORE_FEATURE_PROFILE",
  "KernelModuleGateway",
  "KernelRegistry",
  "PURE_CORE_KERNEL_V1_SCOPE",
  "SCORE_DOCUMENT_SCHEMA_VERSION",
  "addFractions",
  "compareFractions",
  "createDiagnostic",
  "createFraction",
  "createKernelRegistry",
  "createKernelValidationReport",
  "createModuleInternalIssue",
  "decodeScoreDocument",
  "deriveSequenceEventStarts",
  "encodeScoreDocumentJson",
  "getEffectiveMeasureDuration",
  "getNoteValueDuration",
  "isCanonicalFraction",
  "isJsonValue",
  "isNoteValueBase",
  "isNoteValueDots",
  "isScoreDocumentSchemaVersion",
  "isTransposition",
  "isWrittenPitch",
  "mapCheckpointFailureToKernelIssues",
  "mapCommandBusCreationFailureToKernelIssues",
  "mapCommandFailureToKernelIssues",
  "mapDiagnosticToKernelIssue",
  "mapEventSubscriptionFailureToKernelIssues",
  "mapReadFailureToKernelIssues",
  "mapRegistryAccessFailureToKernelIssues",
  "mapRegistryStartupFailureToKernelIssues",
  "migrateScoreDocument",
  "multiplyFractions",
  "parseScoreDocumentJson",
  "replayCoreCommands",
  "selectDirtyState",
  "selectHistoryState",
  "selectScoreEntity",
  "selectScoreEntityOwnership",
  "selectScoreMetadata",
  "selectScoreRange",
  "subtractFractions",
  "transposeWrittenPitch",
  "validateScoreDocumentSemantics",
  "validateScoreFeatureProfile",
] as const;

/** The six V1 command IDs retained by the frozen characterization trace. */
export const CVN1_COMMAND_IDS = [
  "core.document.set-metadata",
  "core.note.set-written-pitch",
  "core.event.set-note-value",
  "core.voice.insert-notes-event",
  "core.voice.insert-rest-event",
  "core.event.remove",
] as const;

/** The CVN-3 descriptors removed from the frozen V1 projection. */
export const CVN3_PROJECTED_COMMAND_IDS = [
  "core.measure.insert",
  "core.measure.remove",
  "core.measure.move",
  "core.measure.set-definition",
] as const;

/**
 * CVN-4 is additive to the command spine. Its fixed descriptors are removed
 * only from this historical V1 projection; unrelated descriptors remain
 * visible so the characterization continues to detect unplanned drift.
 */
export const CVN4_PROJECTED_COMMAND_IDS = [
  "core.part.insert",
  "core.part.remove",
  "core.part.move",
  "core.part.set-name",
  "core.part.set-instrument",
  "core.staff.insert",
  "core.staff.remove",
  "core.staff.move",
  "core.staff.set-definition",
  "core.voice.insert",
  "core.voice.remove",
  "core.voice.move",
  "core.voice.set-default-staff",
  "core.voice.set-sequence-start",
  "core.event.set-staff-assignment",
] as const;

/** The CVN-5 descriptors removed only from the historical V1 projection. */
export const CVN5_PROJECTED_COMMAND_IDS = [
  "core.range.delete",
  "core.range.transpose-written-pitch",
  "core.transaction.batch",
] as const;

const CVN1_RUNTIME_EXPORT_NAME_SET: ReadonlySet<string> = new Set(
  CVN1_RUNTIME_EXPORT_NAMES,
);
const CVN1_COMMAND_ID_SET: ReadonlySet<string> = new Set(CVN1_COMMAND_IDS);
const POST_CVN1_PROJECTED_COMMAND_ID_SET: ReadonlySet<string> = new Set(
  [
    ...CVN3_PROJECTED_COMMAND_IDS,
    ...CVN4_PROJECTED_COMMAND_IDS,
    ...CVN5_PROJECTED_COMMAND_IDS,
  ],
);

const REQUIRED_CASE_IDS = [
  "metadata-change-noop-reject",
  "pitch-change-noop-missing",
  "note-value-supported-unsupported-semantic-reject",
  "insert-notes-valid-invalid-anchor",
  "insert-rest-valid-wrong-owner-anchor",
  "remove-event-valid-missing",
  "multi-step-undo-redo-redo-preservation-invalidation",
] as const;

export const CVN1_CHARACTERIZATION_CASE_IDS = [
  ...REQUIRED_CASE_IDS,
  "replay-success-noop-first-rejection",
  "unknown-extension-roundtrip",
  "registry-summary-gateway-parity-denial",
] as const;

type Cvn1CharacterizationCaseId =
  (typeof CVN1_CHARACTERIZATION_CASE_IDS)[number];

type TraceOperationKind = "submit" | "undo" | "redo" | "mark-persisted";

export interface Cvn1OperationTrace {
  readonly label: string;
  readonly operation: TraceOperationKind;
  readonly result: unknown;
  readonly read: unknown;
  readonly events: readonly KernelEvent[];
}

export interface Cvn1CommandCaseTrace {
  readonly caseId: (typeof REQUIRED_CASE_IDS)[number];
  readonly initialRead: unknown;
  readonly operations: readonly Cvn1OperationTrace[];
}

export interface Cvn1RegistryCaseTrace {
  readonly caseId: "registry-summary-gateway-parity-denial";
  readonly defaultRegistry: unknown;
  readonly summary: KernelGatewayResult<RegistrySummary>;
  readonly direct: unknown;
  readonly gateway: unknown;
  readonly denied: unknown;
}

export interface Cvn1CharacterizationTraceV1 {
  readonly traceVersion: 1;
  readonly baselineCommit: typeof CVN1_BASELINE_COMMIT;
  readonly runtimeExports: readonly string[];
  readonly catalog: readonly {
    readonly commandId: string;
    readonly targetKind: string;
  }[];
  readonly commandCases: readonly Cvn1CommandCaseTrace[];
  readonly historyReplayCase: unknown;
  readonly unknownExtensionCase: unknown;
  readonly registryCase: Cvn1RegistryCaseTrace;
}

interface TrackedBus {
  readonly bus: CommandBus;
  readonly events: KernelEvent[];
  readonly initialRead: unknown;
}

function cloneTraceValue<T>(value: T): T {
  return structuredClone(value);
}

function requireBus(document: ScoreDocument = cloneCoreScoreFixture()): CommandBus {
  const created = coreKernel.CommandBus.create(document);
  if (!created.ok) {
    throw new Error(`expected valid CVN-1 fixture: ${created.failure.code}`);
  }
  return created.value;
}

function createTrackedBus(document?: ScoreDocument): TrackedBus {
  const bus = requireBus(document);
  const events: KernelEvent[] = [];
  const subscription = bus.subscribe((event: KernelEvent) => {
    events.push(cloneTraceValue(event));
  });
  if (subscription.status !== "subscribed") {
    throw new Error(`expected event subscription: ${subscription.failure.code}`);
  }
  return {
    bus,
    events,
    initialRead: cloneTraceValue(bus.read()),
  };
}

function captureOperation<T>(
  tracked: TrackedBus,
  label: string,
  operation: TraceOperationKind,
  invoke: () => T,
): Cvn1OperationTrace {
  const eventStart = tracked.events.length;
  const result = invoke();
  return {
    label,
    operation,
    result: cloneTraceValue(result),
    read: cloneTraceValue(tracked.bus.read()),
    events: cloneTraceValue(tracked.events.slice(eventStart)),
  };
}

function envelope(
  commandId: string,
  target: unknown,
  payload: unknown,
): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

function setMetadata(
  title: string,
  documentId: string = "score-1",
): Record<string, unknown> {
  return envelope(
    "core.document.set-metadata",
    { kind: "document", documentId },
    {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  );
}

function setPitch(
  step: "C" | "D" | "E",
  noteId: string = "note-1",
): Record<string, unknown> {
  return envelope(
    "core.note.set-written-pitch",
    { kind: "note", noteId },
    { writtenPitch: { step, alter: 0, octave: 4 } },
  );
}

function setNoteValue(base: 2 | 4 | 8): Record<string, unknown> {
  return envelope(
    "core.event.set-note-value",
    { kind: "event", eventId: "event-1" },
    { noteValue: { base, dots: 0 } },
  );
}

function insertNotesEvent(
  eventId: string,
  anchor: unknown,
): Record<string, unknown> {
  return envelope(
    "core.voice.insert-notes-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor,
      event: {
        id: eventId,
        duration: { base: 4, dots: 0 },
        content: {
          kind: "notes",
          notes: [
            {
              id: `${eventId}-note-1`,
              writtenPitch: { step: "E", alter: 0, octave: 4 },
            },
          ],
        },
      },
    },
  );
}

function insertRestEvent(
  eventId: string,
  anchor: unknown,
): Record<string, unknown> {
  return envelope(
    "core.voice.insert-rest-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor,
      event: {
        id: eventId,
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    },
  );
}

function removeEvent(eventId: string): Record<string, unknown> {
  return envelope(
    "core.event.remove",
    { kind: "event", eventId },
    {},
  );
}

function unknownCommand(): Record<string, unknown> {
  return envelope(
    "core.unknown",
    { kind: "document", documentId: "score-1" },
    {},
  );
}

function withFirstVoiceEvents(
  document: ScoreDocument,
  events: ScoreDocument["parts"][number]["measureContents"][number]["voices"][number]["sequence"]["events"],
): ScoreDocument {
  const part = document.parts[0]!;
  const content = part.measureContents[0]!;
  const voice = content.voices[0]!;
  return {
    ...document,
    parts: [
      {
        ...part,
        measureContents: [
          {
            ...content,
            voices: [
              {
                ...voice,
                sequence: { ...voice.sequence, events },
              },
            ],
          },
        ],
      },
    ],
  };
}

function createIncompleteFixture(): ScoreDocument {
  const document = cloneCoreScoreFixture();
  const events = document.parts[0]!.measureContents[0]!.voices[0]!.sequence
    .events;
  return withFirstVoiceEvents(document, events.slice(0, 3));
}

function createTwoVoiceFixture(): ScoreDocument {
  const document = createIncompleteFixture();
  const part = document.parts[0]!;
  const content = part.measureContents[0]!;
  const firstVoice = content.voices[0]!;
  const secondVoice = {
    ...firstVoice,
    id: "voice-2",
    sequence: {
      ...firstVoice.sequence,
      events: firstVoice.sequence.events.map((event, index) => ({
        ...event,
        id: `event-${index + 5}`,
        content:
          event.content.kind === "notes"
            ? {
                ...event.content,
                notes: event.content.notes.map((note, noteIndex) => ({
                  ...note,
                  id: `note-${noteIndex + 2}`,
                })),
              }
            : event.content,
      })),
    },
  };
  return {
    ...document,
    parts: [
      {
        ...part,
        measureContents: [
          { ...content, voices: [firstVoice, secondVoice] },
        ],
      },
    ],
  };
}

function metadataCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus();
  return {
    caseId: "metadata-change-noop-reject",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "metadata-change", "submit", () =>
        tracked.bus.submit(setMetadata("CVN-1 metadata")),
      ),
      captureOperation(tracked, "metadata-no-op", "submit", () =>
        tracked.bus.submit(setMetadata("CVN-1 metadata")),
      ),
      captureOperation(tracked, "metadata-missing-document", "submit", () =>
        tracked.bus.submit(setMetadata("CVN-1 metadata", "score-missing")),
      ),
    ],
  };
}

function pitchCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus();
  return {
    caseId: "pitch-change-noop-missing",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "pitch-change", "submit", () =>
        tracked.bus.submit(setPitch("D")),
      ),
      captureOperation(tracked, "pitch-no-op", "submit", () =>
        tracked.bus.submit(setPitch("D")),
      ),
      captureOperation(tracked, "pitch-missing-note", "submit", () =>
        tracked.bus.submit(setPitch("D", "note-missing")),
      ),
    ],
  };
}

function noteValueCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus();
  return {
    caseId: "note-value-supported-unsupported-semantic-reject",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "note-value-supported", "submit", () =>
        tracked.bus.submit(setNoteValue(4)),
      ),
      captureOperation(tracked, "note-value-unsupported", "submit", () =>
        tracked.bus.submit(setNoteValue(8)),
      ),
      captureOperation(tracked, "note-value-semantic-reject", "submit", () =>
        tracked.bus.submit(setNoteValue(2)),
      ),
    ],
  };
}

function insertNotesCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus(createIncompleteFixture());
  return {
    caseId: "insert-notes-valid-invalid-anchor",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "insert-notes-valid", "submit", () =>
        tracked.bus.submit(
          insertNotesEvent("event-cvn1-notes", {
            kind: "after-event",
            eventId: "event-3",
          }),
        ),
      ),
      captureOperation(tracked, "insert-notes-invalid-anchor", "submit", () =>
        tracked.bus.submit(
          insertNotesEvent("event-cvn1-notes-missing", {
            kind: "after-event",
            eventId: "event-missing",
          }),
        ),
      ),
    ],
  };
}

function insertRestCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus(createTwoVoiceFixture());
  return {
    caseId: "insert-rest-valid-wrong-owner-anchor",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "insert-rest-valid", "submit", () =>
        tracked.bus.submit(
          insertRestEvent("event-cvn1-rest", {
            kind: "after-event",
            eventId: "event-3",
          }),
        ),
      ),
      captureOperation(tracked, "insert-rest-wrong-owner-anchor", "submit", () =>
        tracked.bus.submit(
          insertRestEvent("event-cvn1-rest-wrong-owner", {
            kind: "after-event",
            eventId: "event-5",
          }),
        ),
      ),
    ],
  };
}

function removeEventCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus();
  return {
    caseId: "remove-event-valid-missing",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "remove-event-valid", "submit", () =>
        tracked.bus.submit(removeEvent("event-4")),
      ),
      captureOperation(tracked, "remove-event-missing", "submit", () =>
        tracked.bus.submit(removeEvent("event-missing")),
      ),
    ],
  };
}

function historyCase(): Cvn1CommandCaseTrace {
  const tracked = createTrackedBus();
  return {
    caseId: "multi-step-undo-redo-redo-preservation-invalidation",
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "history-metadata-commit", "submit", () =>
        tracked.bus.submit(setMetadata("CVN-1 persisted checkpoint")),
      ),
      captureOperation(tracked, "history-mark-persisted", "mark-persisted", () =>
        tracked.bus.markPersisted({ documentId: "score-1", documentVersion: 1 }),
      ),
      captureOperation(tracked, "history-pitch-commit", "submit", () =>
        tracked.bus.submit(setPitch("D")),
      ),
      captureOperation(tracked, "history-undo-pitch", "undo", () =>
        tracked.bus.undo(),
      ),
      captureOperation(tracked, "history-no-op-preserves-redo", "submit", () =>
        tracked.bus.submit(setPitch("C")),
      ),
      captureOperation(tracked, "history-reject-preserves-redo", "submit", () =>
        tracked.bus.submit(unknownCommand()),
      ),
      captureOperation(tracked, "history-redo-pitch", "redo", () =>
        tracked.bus.redo(),
      ),
      captureOperation(tracked, "history-undo-before-branch", "undo", () =>
        tracked.bus.undo(),
      ),
      captureOperation(tracked, "history-new-branch", "submit", () =>
        tracked.bus.submit(setMetadata("CVN-1 replacement branch")),
      ),
      captureOperation(tracked, "history-redo-invalidated", "redo", () =>
        tracked.bus.redo(),
      ),
    ],
  };
}

function replayCase(): unknown {
  return {
    caseId: "replay-success-noop-first-rejection" as const,
    success: cloneTraceValue(
      coreKernel.replayCoreCommands(cloneCoreScoreFixture(), [
        setMetadata("CVN-1 replay"),
        setPitch("D"),
      ]),
    ),
    noOp: cloneTraceValue(
      coreKernel.replayCoreCommands(cloneCoreScoreFixture(), [setPitch("C")]),
    ),
    firstRejection: cloneTraceValue(
      coreKernel.replayCoreCommands(cloneCoreScoreFixture(), [
        setPitch("D"),
        unknownCommand(),
        setMetadata("not-reached"),
      ]),
    ),
  };
}

function unknownExtensionFixture(): ScoreDocument {
  const document = cloneCoreScoreFixture();
  return {
    ...document,
    extensions: [
      {
        namespace: "com.example.cvn1-opaque",
        schemaVersion: 1,
        owner: { kind: "score" },
        payload: {
          nested: { retained: true, numbers: [1, 2, 3] },
          ordered: ["first", null, false],
        },
      },
    ],
  };
}

function unknownExtensionCase(): unknown {
  const initial = unknownExtensionFixture();
  const tracked = createTrackedBus(initial);
  return {
    caseId: "unknown-extension-roundtrip" as const,
    initialExtension: cloneTraceValue(initial.extensions[0]),
    initialRead: tracked.initialRead,
    operations: [
      captureOperation(tracked, "extension-pitch-commit", "submit", () =>
        tracked.bus.submit(setPitch("D")),
      ),
      captureOperation(tracked, "extension-reject", "submit", () =>
        tracked.bus.submit(unknownCommand()),
      ),
      captureOperation(tracked, "extension-undo", "undo", () => tracked.bus.undo()),
      captureOperation(tracked, "extension-redo", "redo", () => tracked.bus.redo()),
    ],
    replay: cloneTraceValue(
      coreKernel.replayCoreCommands(initial, [setPitch("D"), unknownCommand()]),
    ),
  };
}

function registryManifest(): Record<string, unknown> {
  const manifest = structuredClone(coreKernel.CORE_KERNEL_STARTUP_MANIFEST) as unknown as {
    startupManifestVersion: number;
    modules: Array<Record<string, unknown>>;
  };
  manifest.modules.push(
    {
      moduleId: "internal.cvn1.full",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [
        "command:execute",
        "registry:read",
        "score:read",
        "selector:execute",
        "event:subscribe",
      ],
      registrationEntryIds: [],
    },
    {
      moduleId: "internal.cvn1.none",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [],
      registrationEntryIds: [],
    },
  );
  return manifest;
}

function registryCase(): Cvn1RegistryCaseTrace {
  const defaultRegistry = coreKernel.createKernelRegistry(
    coreKernel.CORE_KERNEL_STARTUP_MANIFEST,
  );
  const created = coreKernel.createKernelRegistry(registryManifest());
  if (!created.ok) {
    throw new Error(`expected CVN-1 Registry: ${created.failure.code}`);
  }
  const direct = createTrackedBus();
  const gatewayTracked = createTrackedBus();
  const deniedTracked = createTrackedBus();
  const fullGateway = created.registry.createGateway(
    "internal.cvn1.full",
    gatewayTracked.bus,
  );
  const deniedGateway = created.registry.createGateway(
    "internal.cvn1.none",
    deniedTracked.bus,
  );
  if (!fullGateway.ok || !deniedGateway.ok) {
    throw new Error("expected CVN-1 Registry gateways");
  }

  const gatewayEventStart = gatewayTracked.events.length;
  const gatewaySubmit = fullGateway.gateway.submit(setPitch("D"));
  const deniedEventStart = deniedTracked.events.length;
  const deniedSubmit = deniedGateway.gateway.submit(setPitch("D"));

  return {
    caseId: "registry-summary-gateway-parity-denial" as const,
    defaultRegistry: cloneTraceValue(
      defaultRegistry.ok
        ? { ok: true }
        : { ok: false, failure: defaultRegistry.failure },
    ),
    summary: cloneTraceValue(fullGateway.gateway.summary()),
    direct: {
      operation: captureOperation(direct, "direct-pitch", "submit", () =>
        direct.bus.submit(setPitch("D")),
      ),
    },
    gateway: {
      result: cloneTraceValue(gatewaySubmit),
      read: cloneTraceValue(gatewayTracked.bus.read()),
      events: cloneTraceValue(gatewayTracked.events.slice(gatewayEventStart)),
      selectMetadata: cloneTraceValue(
        fullGateway.gateway.select({ selectorId: "core.selector.score-metadata" }),
      ),
    },
    denied: {
      summary: cloneTraceValue(deniedGateway.gateway.summary()),
      submit: cloneTraceValue(deniedSubmit),
      read: cloneTraceValue(deniedTracked.bus.read()),
      events: cloneTraceValue(deniedTracked.events.slice(deniedEventStart)),
    },
  };
}

function projectCvn1RegistrySummary(
  summary: KernelGatewayResult<RegistrySummary>,
): KernelGatewayResult<RegistrySummary> {
  if (summary.status !== "authorized") {
    return summary;
  }
  return {
    status: "authorized",
    value: {
      ...summary.value,
      contributions: summary.value.contributions.filter(
        (contribution) =>
          contribution.kind !== "command" ||
          !POST_CVN1_PROJECTED_COMMAND_ID_SET.has(contribution.id),
      ),
    },
  };
}

/**
 * Projects only the declared additive CVN-3/CVN-4/CVN-5 public surfaces out of the historical V1
 * trace. Command behavior, document snapshots, results, history, replay and
 * events intentionally pass through unchanged.
 */
export function projectCvn1CharacterizationTrace(
  trace: Cvn1CharacterizationTraceV1,
): Cvn1CharacterizationTraceV1 {
  return {
    ...trace,
    runtimeExports: trace.runtimeExports.filter((name) =>
      CVN1_RUNTIME_EXPORT_NAME_SET.has(name),
    ),
    catalog: trace.catalog.filter(({ commandId }) =>
      CVN1_COMMAND_ID_SET.has(commandId),
    ),
    registryCase: {
      ...trace.registryCase,
      summary: projectCvn1RegistrySummary(trace.registryCase.summary),
    },
  };
}

export function collectCvn1CharacterizationTrace(): Cvn1CharacterizationTraceV1 {
  const captured: Cvn1CharacterizationTraceV1 = {
    traceVersion: 1,
    baselineCommit: CVN1_BASELINE_COMMIT,
    runtimeExports: Object.keys(coreKernel).sort(),
    catalog: CORE_COMMAND_DEFINITIONS.map(({ commandId, targetKind }) => ({
      commandId,
      targetKind,
    })),
    commandCases: [
      metadataCase(),
      pitchCase(),
      noteValueCase(),
      insertNotesCase(),
      insertRestCase(),
      removeEventCase(),
      historyCase(),
    ],
    historyReplayCase: replayCase(),
    unknownExtensionCase: unknownExtensionCase(),
    registryCase: registryCase(),
  };
  return projectCvn1CharacterizationTrace(captured);
}

export function serializeCvn1CharacterizationTrace(
  trace: Cvn1CharacterizationTraceV1,
): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}

export function assertCvn1CharacterizationShape(
  trace: Cvn1CharacterizationTraceV1,
): void {
  if (trace.runtimeExports.length !== 48) {
    throw new Error(`expected 48 runtime exports, got ${trace.runtimeExports.length}`);
  }
  if (trace.catalog.length !== 6) {
    throw new Error(`expected six catalog commands, got ${trace.catalog.length}`);
  }
  const caseIds = [
    ...trace.commandCases.map(({ caseId }) => caseId),
    (trace.historyReplayCase as { readonly caseId: Cvn1CharacterizationCaseId })
      .caseId,
    (trace.unknownExtensionCase as {
      readonly caseId: Cvn1CharacterizationCaseId;
    }).caseId,
    (trace.registryCase as { readonly caseId: Cvn1CharacterizationCaseId })
      .caseId,
  ];
  if (
    caseIds.length !== CVN1_CHARACTERIZATION_CASE_IDS.length ||
    caseIds.some((caseId, index) => caseId !== CVN1_CHARACTERIZATION_CASE_IDS[index])
  ) {
    throw new Error("CVN-1 characterization case IDs changed");
  }
}
