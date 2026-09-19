import { captureStrictInput } from "../codec/strict-input-capture";
import { decodeScoreDocument } from "../codec/decode-score-document";
import type { IntegratedKernelEvent } from "../events/contracts";
import type { KernelReadState, MarkPersistedResult, DocumentSnapshot } from "../read/contracts";
import { resolveKernelIntegratedRuntimeAssembly } from "../registry/domain-availability";
import type { IntegratedCommandBus, IntegratedCommandBusCreationResult, KernelCommandResult, KernelIntegratedCatalog, IntegratedKernelReadState } from "../registry/integrated-contracts";
import type { ScoreDocument } from "../domain/score-document";
import { captureHostInstalledContributionsV1 } from "./integrated-catalog-capture";
import { createNativeContributionExecutorV2 } from "./integrated-executor";
import { encodeIntegratedValueV2 as encode } from "./integrated-wire";
import { bindNativeIntegratedAssemblyV2, selectNativeIntegratedFactoryV2 } from "./integrated-backend-selection";
import { selectNativeExtensionMigrationFactoryV2 } from "./integrated-backend-selection";
import { createNativeExtensionMigrationV2, type NativeExtensionMigrationFunctionV2 } from "./integrated-migration";
import type { ScopedExecutionPolicyV1 } from "../module-sdk/scoped-invocation";
import { contributionReads } from "../registry/contribution-reads";
import { recordKernelPluginDiagnostic } from "../errors/plugin-diagnostics";

export interface IntegratedNativeAddonV2 {
  createIntegratedKernelSessionV2(bytes: Buffer, executor: (bytes: Buffer) => Buffer): (bytes: Buffer) => Buffer;
  migrateKernelExtensionV2?: NativeExtensionMigrationFunctionV2;
}
type Failure = Extract<KernelCommandResult, { status: "rejected" }>["failure"];
type NativeReadState = Omit<KernelReadState, "snapshot"> & {
  snapshot: Omit<DocumentSnapshot, "document"> & { document: ScoreDocument | null };
};
interface WireResult {
  ok: boolean;
  failure?: Failure;
  report?: unknown;
  documentVersion?: number;
  history?: KernelReadState["history"];
  state?: NativeReadState;
  availability?: { ok: true; value: Pick<IntegratedKernelReadState, "writeAvailability" | "validationAvailability"> };
  pipeline?: { assessment: Extract<KernelCommandResult, { status: "committed" | "no-op" }>["assessment"] };
  result?: { status: "committed" | "no-op" | "command-rejected"; failure?: Failure;
    value: { documentVersion: number; history: KernelReadState["history"]; dirty: boolean }; events: readonly IntegratedKernelEvent[] };
  checkpoint?: { status: "updated" | "no-op" | "checkpoint-rejected"; value: { documentVersion: number; dirty: boolean };
    failure?: Extract<MarkPersistedResult, { status: "rejected" }>["failure"]; events: readonly IntegratedKernelEvent[] };
}
const parse = JSON.parse;
const apply = Reflect.apply;
const freezeObject = Object.freeze;
const objectKeys = Object.keys;
const bufferToString = Buffer.prototype.toString;
const promiseResolve = Promise.resolve;
const promiseCatch = Promise.prototype.catch;

function pluginFailureRecord(value: unknown): {
  code: string;
  moduleId?: string;
  contributionId?: string;
  effectIndex?: number;
  effectKind?: string;
  failureCode?: string;
} | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string") return undefined;
  return {
    code: record.code,
    ...(typeof record.moduleId === "string" ? { moduleId: record.moduleId } : {}),
    ...(typeof record.contributionId === "string" ? { contributionId: record.contributionId } : {}),
    ...(isSafeNonNegativeInteger(record.effectIndex) ? { effectIndex: record.effectIndex } : {}),
    ...(typeof record.effectKind === "string" ? { effectKind: record.effectKind } : {}),
    ...(typeof record.failureCode === "string" ? { failureCode: record.failureCode } : {}),
  };
}

export interface KernelRuleWarningFractionV1 {
  readonly numerator: number;
  readonly denominator: number;
}

export interface KernelRuleWarningV1 {
  readonly warningVersion: 1;
  readonly code: "rule.sequence-exceeds-measure" | "rule.sequence-start-after-measure";
  readonly messageKey: string;
  readonly partId: string;
  readonly measureId: string;
  readonly voiceId: string;
  readonly nominalDuration: KernelRuleWarningFractionV1;
  readonly actualDuration: KernelRuleWarningFractionV1;
  readonly overflow: KernelRuleWarningFractionV1;
}

export interface KernelRuleWarningPageV1 {
  readonly reportVersion: 1;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly offset: number;
  readonly total: number;
  readonly warnings: readonly KernelRuleWarningV1[];
  readonly nextOffset: number | null;
}

export type KernelRuleWarningPageReadResultV1 =
  | { readonly ok: true; readonly value: KernelRuleWarningPageV1 }
  | { readonly ok: false; readonly failure: { readonly code: string } };

export type KernelRuleWarningCodeV2 =
  | "rule.sequence-exceeds-measure"
  | "rule.sequence-start-after-measure"
  | "rule.sounding-pitch-out-of-playback-range"
  | "rule.sounding-pitch-spelling-unrepresentable";

export interface KernelVoiceRuleWarningLocationV2 {
  readonly kind: "voice";
  readonly partId: string;
  readonly measureId: string;
  readonly voiceId: string;
}

export interface KernelNoteRuleWarningLocationV2 {
  readonly kind: "note";
  readonly partId: string;
  readonly measureId: string;
  readonly voiceId: string;
  readonly eventId: string;
  readonly noteId: string;
}

export interface KernelTimingRuleWarningDetailsV2 {
  readonly kind: "timing";
  readonly nominalDuration: KernelRuleWarningFractionV1;
  readonly actualDuration: KernelRuleWarningFractionV1;
  readonly overflow: KernelRuleWarningFractionV1;
}

export interface KernelSoundingPitchRuleWarningDetailsV2 {
  readonly kind: "soundingPitch";
  readonly reason: "playback-range" | "derived-pitch-octave-out-of-range" | "derived-pitch-alter-out-of-range";
  readonly soundingSemitone?: string;
}

export type KernelRuleWarningLocationV2 = KernelVoiceRuleWarningLocationV2 | KernelNoteRuleWarningLocationV2;
export type KernelRuleWarningDetailsV2 = KernelTimingRuleWarningDetailsV2 | KernelSoundingPitchRuleWarningDetailsV2;

interface KernelRuleWarningCommonV2 {
  readonly warningVersion: 2;
  readonly messageKey: string;
}

export type KernelRuleWarningV2 =
  | (KernelRuleWarningCommonV2 & {
      readonly code: "rule.sequence-exceeds-measure" | "rule.sequence-start-after-measure";
      readonly location: KernelVoiceRuleWarningLocationV2;
      readonly details: KernelTimingRuleWarningDetailsV2;
    })
  | (KernelRuleWarningCommonV2 & {
      readonly code: "rule.sounding-pitch-out-of-playback-range";
      readonly location: KernelNoteRuleWarningLocationV2;
      readonly details: KernelSoundingPitchRuleWarningDetailsV2 & { readonly reason: "playback-range" };
    })
  | (KernelRuleWarningCommonV2 & {
      readonly code: "rule.sounding-pitch-spelling-unrepresentable";
      readonly location: KernelNoteRuleWarningLocationV2;
      readonly details: KernelSoundingPitchRuleWarningDetailsV2 & {
        readonly reason: "derived-pitch-octave-out-of-range" | "derived-pitch-alter-out-of-range";
      };
    });

export interface KernelRuleWarningPageV2 {
  readonly reportVersion: 2;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly offset: number;
  readonly total: number;
  readonly warnings: readonly KernelRuleWarningV2[];
  readonly nextOffset: number | null;
}

export type KernelRuleWarningPageReadResultV2 =
  | { readonly ok: true; readonly value: KernelRuleWarningPageV2 }
  | { readonly ok: false; readonly failure: { readonly code: string } };

type RuleWarningReaderV1 = (
  documentId: string,
  documentVersion: number,
  offset: number,
  limit: number,
) => KernelRuleWarningPageReadResultV1;
type RuleWarningReaderV2 = (
  documentId: string,
  documentVersion: number,
  offset: number,
  limit: number,
) => KernelRuleWarningPageReadResultV2;

// The workbench host can load the generated CommonJS kernel through both its
// ESM bridge and `require()`. Keep this private capability registry on the
// process global so those two module instances still see the same reader.
const ruleWarningReaderRegistryKey = "__brilliant_rule_warning_readers_v1__";
const globalRegistry = globalThis as typeof globalThis & { [key: string]: unknown };
const ruleWarningReadersV1 = (globalRegistry[ruleWarningReaderRegistryKey] as WeakMap<IntegratedCommandBus, RuleWarningReaderV1> | undefined)
  ?? (() => {
    const registry = new WeakMap<IntegratedCommandBus, RuleWarningReaderV1>();
    globalRegistry[ruleWarningReaderRegistryKey] = registry;
    return registry;
  })();
const ruleWarningReaderRegistryKeyV2 = "__brilliant_rule_warning_readers_v2__";
const ruleWarningReadersV2 = (globalRegistry[ruleWarningReaderRegistryKeyV2] as WeakMap<IntegratedCommandBus, RuleWarningReaderV2> | undefined)
  ?? (() => {
    const registry = new WeakMap<IntegratedCommandBus, RuleWarningReaderV2>();
    globalRegistry[ruleWarningReaderRegistryKeyV2] = registry;
    return registry;
  })();

function recordPluginFailure(value: unknown, operation: "create" | "prepare" | "transform" | "assess" | "read"): void {
  const failure = pluginFailureRecord(value);
  if (failure === undefined || !(
    failure.code === "command.assembly-mismatch"
    || failure.code === "command.invalid-requirement-inventory"
    || failure.code === "command.required-contribution-unavailable"
    || failure.code === "command.required-contribution-incompatible"
    || failure.code === "command.contribution-semantic-invalid"
    || failure.code === "command.contribution-contract-violation"
    || failure.code === "command.contribution-effect-rejected"
    || failure.code === "command.contribution-internal-error"
  )) return;
  recordKernelPluginDiagnostic(failure.code, {
    stage: failure.code.startsWith("command.contribution-") ? "callback" : "assembly",
    operation,
    ...(failure.moduleId === undefined ? {} : { moduleId: failure.moduleId }),
    ...(failure.contributionId === undefined ? {} : { contributionId: failure.contributionId }),
    ...(failure.effectIndex === undefined ? {} : { effectIndex: failure.effectIndex }),
    ...(failure.effectKind === undefined ? {} : { effectKind: failure.effectKind }),
    ...(failure.failureCode === undefined ? {} : { failureCode: failure.failureCode }),
  });
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of objectKeys(value)) freeze((value as Record<string, unknown>)[key]);
    freezeObject(value);
  }
  return value;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = objectKeys(record);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isCanonicalDecimalInteger(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  let index = value[0] === "-" ? 1 : 0;
  if (index === value.length) return false;
  if (value[index] === "0") return index + 1 === value.length;
  if (value[index]! < "1" || value[index]! > "9") return false;
  for (index += 1; index < value.length; index += 1) {
    if (value[index]! < "0" || value[index]! > "9") return false;
  }
  return true;
}

function decodeRuleWarningFractionV1(value: unknown): KernelRuleWarningFractionV1 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.numerator) || !Number.isSafeInteger(record.denominator)
    || (record.denominator as number) <= 0) return undefined;
  return { numerator: record.numerator as number, denominator: record.denominator as number };
}

function decodeRuleWarningV1(value: unknown): KernelRuleWarningV1 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const nominalDuration = decodeRuleWarningFractionV1(record.nominalDuration);
  const actualDuration = decodeRuleWarningFractionV1(record.actualDuration);
  const overflow = decodeRuleWarningFractionV1(record.overflow);
  if (record.warningVersion !== 1
    || !(record.code === "rule.sequence-exceeds-measure" || record.code === "rule.sequence-start-after-measure")
    || typeof record.messageKey !== "string" || typeof record.partId !== "string"
    || typeof record.measureId !== "string" || typeof record.voiceId !== "string"
    || nominalDuration === undefined || actualDuration === undefined || overflow === undefined) return undefined;
  return { warningVersion: 1, code: record.code, messageKey: record.messageKey,
    partId: record.partId, measureId: record.measureId, voiceId: record.voiceId,
    nominalDuration, actualDuration, overflow };
}

function decodeRuleWarningPageV1(value: unknown): KernelRuleWarningPageV1 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.reportVersion !== 1 || typeof record.documentId !== "string"
    || !isSafeNonNegativeInteger(record.documentVersion) || !isSafeNonNegativeInteger(record.offset)
    || !isSafeNonNegativeInteger(record.total) || !Array.isArray(record.warnings)
    || !(record.nextOffset === null || isSafeNonNegativeInteger(record.nextOffset))) return undefined;
  const warnings = record.warnings.map(decodeRuleWarningV1);
  if (warnings.some((warning) => warning === undefined)) return undefined;
  return { reportVersion: 1, documentId: record.documentId, documentVersion: record.documentVersion,
    offset: record.offset, total: record.total, warnings: warnings as KernelRuleWarningV1[],
    nextOffset: record.nextOffset };
}

function decodeRuleWarningLocationV2(value: unknown): KernelRuleWarningLocationV2 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.partId !== "string" || typeof record.measureId !== "string"
    || typeof record.voiceId !== "string") return undefined;
  if (record.kind === "voice" && hasExactKeys(record, ["kind", "partId", "measureId", "voiceId"])) {
    return { kind: "voice", partId: record.partId, measureId: record.measureId, voiceId: record.voiceId };
  }
  if (record.kind === "note" && hasExactKeys(record, ["kind", "partId", "measureId", "voiceId", "eventId", "noteId"])
    && typeof record.eventId === "string" && typeof record.noteId === "string") {
    return { kind: "note", partId: record.partId, measureId: record.measureId,
      voiceId: record.voiceId, eventId: record.eventId, noteId: record.noteId };
  }
  return undefined;
}

function decodeRuleWarningDetailsV2(value: unknown): KernelRuleWarningDetailsV2 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "timing" && hasExactKeys(record,
    ["kind", "nominalDuration", "actualDuration", "overflow"])) {
    const nominalDuration = decodeRuleWarningFractionV1(record.nominalDuration);
    const actualDuration = decodeRuleWarningFractionV1(record.actualDuration);
    const overflow = decodeRuleWarningFractionV1(record.overflow);
    return nominalDuration === undefined || actualDuration === undefined || overflow === undefined
      ? undefined : { kind: "timing", nominalDuration, actualDuration, overflow };
  }
  const soundingSemitone = record.soundingSemitone;
  if (record.kind === "soundingPitch"
    && (record.reason === "playback-range" || record.reason === "derived-pitch-octave-out-of-range"
      || record.reason === "derived-pitch-alter-out-of-range")
    && (hasExactKeys(record, ["kind", "reason"])
      || (hasExactKeys(record, ["kind", "reason", "soundingSemitone"])
        && isCanonicalDecimalInteger(soundingSemitone)))) {
    return soundingSemitone === undefined
      ? { kind: "soundingPitch", reason: record.reason }
      : { kind: "soundingPitch", reason: record.reason, soundingSemitone: soundingSemitone as string };
  }
  return undefined;
}

function decodeRuleWarningV2(value: unknown): KernelRuleWarningV2 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const location = decodeRuleWarningLocationV2(record.location);
  const details = decodeRuleWarningDetailsV2(record.details);
  if (!hasExactKeys(record, ["warningVersion", "code", "messageKey", "location", "details"])
    || record.warningVersion !== 2 || typeof record.messageKey !== "string"
    || location === undefined || details === undefined) return undefined;
  const code = record.code;
  if ((code === "rule.sequence-exceeds-measure" || code === "rule.sequence-start-after-measure")
    && location.kind === "voice" && details.kind === "timing") {
    return { warningVersion: 2, code, messageKey: record.messageKey, location, details };
  }
  if (code === "rule.sounding-pitch-out-of-playback-range" && location.kind === "note"
    && details.kind === "soundingPitch" && details.reason === "playback-range") {
    return { warningVersion: 2, code, messageKey: record.messageKey, location,
      details: { ...details, reason: "playback-range" } };
  }
  const spellingReason = details.kind === "soundingPitch" ? details.reason : undefined;
  if (code === "rule.sounding-pitch-spelling-unrepresentable" && location.kind === "note"
    && details.kind === "soundingPitch" && (spellingReason === "derived-pitch-octave-out-of-range"
      || spellingReason === "derived-pitch-alter-out-of-range")) {
    return { warningVersion: 2, code, messageKey: record.messageKey, location,
      details: { ...details, reason: spellingReason } };
  }
  return undefined;
}

function decodeRuleWarningPageV2(value: unknown): KernelRuleWarningPageV2 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ["reportVersion", "documentId", "documentVersion", "offset", "total", "warnings", "nextOffset"])
    || record.reportVersion !== 2 || typeof record.documentId !== "string"
    || !isSafeNonNegativeInteger(record.documentVersion) || !isSafeNonNegativeInteger(record.offset)
    || !isSafeNonNegativeInteger(record.total) || !Array.isArray(record.warnings)
    || !(record.nextOffset === null || isSafeNonNegativeInteger(record.nextOffset))) return undefined;
  const warnings = record.warnings.map(decodeRuleWarningV2);
  if (warnings.some((warning) => warning === undefined)) return undefined;
  return { reportVersion: 2, documentId: record.documentId, documentVersion: record.documentVersion,
    offset: record.offset, total: record.total, warnings: warnings as KernelRuleWarningV2[],
    nextOffset: record.nextOffset };
}

/** Private Native report bridge. Rule warnings remain derived kernel facts, not document state. */
export function readNativeRuleWarningPageV1(
  bus: IntegratedCommandBus,
  documentId: string,
  documentVersion: number,
  offset: number,
  limit: number,
): KernelRuleWarningPageReadResultV1 {
  const reader = ruleWarningReadersV1.get(bus);
  return reader === undefined
    ? freeze({ ok: false, failure: { code: "report.native-reader-unavailable" } })
    : reader(documentId, documentVersion, offset, limit);
}

/** V2 exposes the closed warning union while preserving the V1 time-only reader. */
export function readNativeRuleWarningPageV2(
  bus: IntegratedCommandBus,
  documentId: string,
  documentVersion: number,
  offset: number,
  limit: number,
): KernelRuleWarningPageReadResultV2 {
  const reader = ruleWarningReadersV2.get(bus);
  return reader === undefined
    ? freeze({ ok: false, failure: { code: "report.native-reader-unavailable" } })
    : reader(documentId, documentVersion, offset, limit);
}

/** Opt-in embedding only. No public SDK exports or default backend are changed. */
export function installNativeIntegratedBackendV2(addon: IntegratedNativeAddonV2, policy?: ScopedExecutionPolicyV1): () => void {
  const restoreSession = selectNativeIntegratedFactoryV2((document, catalog, inventory, explicit) =>
    createNativeIntegratedCommandBusV2(addon, document, catalog, inventory, explicit, policy));
  const restoreMigration = selectNativeExtensionMigrationFactoryV2(addon.migrateKernelExtensionV2 === undefined
    ? undefined : createNativeExtensionMigrationV2(addon.migrateKernelExtensionV2, policy));
  return () => { restoreMigration(); restoreSession(); };
}

export function createNativeIntegratedCommandBusV2(addon: IntegratedNativeAddonV2, document: ScoreDocument,
  catalog: KernelIntegratedCatalog, inventory: unknown = undefined, explicit = false, policy?: ScopedExecutionPolicyV1): IntegratedCommandBusCreationResult {
  const captured = captureStrictInput(document);
  const decoded = captured.status === "captured" ? decodeScoreDocument(captured.value) : undefined;
  if (decoded === undefined || !decoded.ok) return freeze({ ok: false, failure: { code: "command.invalid-initial-document" } });
  if (policy !== undefined && policy.catalog !== catalog) {
    const failure = { code: "command.assembly-mismatch" } as const;
    recordPluginFailure(failure, "create");
    return freeze({ ok: false, failure });
  }
  const assembly = explicit ? resolveKernelIntegratedRuntimeAssembly(catalog, inventory) : resolveKernelIntegratedRuntimeAssembly(catalog);
  if (!assembly.ok) {
    const failure = { code: assembly.reason === "inventory" ? "command.invalid-requirement-inventory" as const : "command.assembly-mismatch" as const };
    recordPluginFailure(failure, "create");
    return freeze({ ok: false, failure });
  }
  const installed = assembly.state;
  const projection = captureHostInstalledContributionsV1(catalog);
  if (projection === undefined) {
    const failure = { code: "command.assembly-mismatch" } as const;
    recordPluginFailure(failure, "create");
    return freeze({ ok: false, failure });
  }
  const assessmentReads = assembly.state.catalogState.contributions.flatMap(entry => contributionReads(entry) ?? []);
  let operate: (bytes: Buffer) => Buffer;
  try {
    operate = addon.createIntegratedKernelSessionV2(encode({ apiVersion: 2, document: decoded.value,
      catalog: projection.projection,
      commands: assembly.state.catalogState.contributions.flatMap((entry) => entry.commands.map((command) => command.descriptor)),
      effects: assembly.state.catalogState.contributions.flatMap((entry) => entry.effects.map((effect) => effect.descriptor)),
      inventory: explicit ? inventory : null,
      ...(assessmentReads.length === 0 ? {} : { assessmentReads }),
    }), createNativeContributionExecutorV2(assembly.state, policy?.invoke));
  } catch (error) {
    try {
      const failure = parse((error as Error).message) as Extract<IntegratedCommandBusCreationResult, { ok: false }>["failure"];
      recordPluginFailure(failure, "create");
      return freeze({ ok: false, failure });
    } catch {
      const failure = { code: "command.assembly-mismatch" } as const;
      recordPluginFailure(failure, "create");
      return freeze({ ok: false, failure });
    }
  }
  let busy = false;
  let dispatching = false;
  const subscribers: Array<(event: IntegratedKernelEvent) => unknown> = [];
  function raw(request: unknown): WireResult { return parse(apply(bufferToString, operate(encode(request)), ["utf8"]) as string) as WireResult; }
  function current() { const read = raw({ operation: "read" }); if (!read.ok || read.state === undefined) throw new Error("Native integrated read failed"); return read.state; }
  function rejected(code: Failure["code"]): KernelCommandResult {
    const state = current();
    return freeze({ status: "rejected", documentVersion: state.snapshot.documentVersion, ...state.history, failure: { code } as Failure });
  }
  // Scalar observations support rejection during a callback without a reentrant native read.
  let observedVersion = 0;
  let observedHistory = { undoDepth: 0, redoDepth: 0 };
  let observedDirty = false;
  let cachedSnapshot: DocumentSnapshot | undefined;
  let snapshotReuse: boolean | undefined;
  function requireReceiver(receiver: unknown): void {
    if (receiver !== bus) throw new TypeError("Invalid integrated command bus receiver");
  }
  function dispatch(events: readonly IntegratedKernelEvent[]): void {
    dispatching = true;
    const handlers = subscribers.slice();
    try {
      for (const nativeEvent of events) {
        const descriptor = nativeEvent.eventType === "core.document.committed"
          ? installed.catalogState.commandIndex[nativeEvent.commandId]?.descriptor : undefined;
        const event = freeze(nativeEvent.eventType === "core.document.committed" ? {
          ...nativeEvent, source: descriptor === undefined ? { kind: "core" as const }
            : { kind: "module" as const, ...descriptor.source },
        } : nativeEvent);
        for (const handler of handlers) {
          try {
            const returned: unknown = apply(handler, undefined, [event]);
            if (returned !== undefined) {
              const promise = apply(promiseResolve, Promise, [returned]) as Promise<unknown>;
              void apply(promiseCatch, promise, [() => undefined]);
            }
          } catch { /* Subscriber failures cannot undo a committed transaction. */ }
        }
      }
    } finally { dispatching = false; }
  }
  function command(request: unknown): KernelCommandResult {
    if (busy || dispatching) return freeze({ status: "rejected", documentVersion: observedVersion, ...observedHistory, failure: { code: "event.reentrant-write" } });
    busy = true;
    try {
      const capturedRequest = captureStrictInput(request);
      if (capturedRequest.status !== "captured") return rejected("command.invalid-envelope");
      const output = raw(capturedRequest.value);
      if (!output.ok) {
        recordPluginFailure(output.failure, "prepare");
        return freeze({ status: "rejected", documentVersion: output.documentVersion ?? observedVersion,
          ...(output.history ?? observedHistory), failure: output.failure ?? { code: "command.internal-error" } });
      }
      const result = output.result;
      if (result === undefined) return rejected("command.internal-error");
      observedVersion = result.value.documentVersion;
      observedHistory = result.value.history;
      observedDirty = result.value.dirty;
      if (result.status === "command-rejected") {
        recordPluginFailure(result.failure, "prepare");
        return freeze({ status: "rejected", documentVersion: observedVersion,
          ...observedHistory, failure: result.failure ?? { code: "command.internal-error" } });
      }
      if (output.pipeline === undefined) return rejected("command.internal-error");
      const answer = freeze({ status: result.status, documentVersion: observedVersion, ...observedHistory, assessment: output.pipeline.assessment });
      dispatch(result.events);
      return answer;
    } finally { busy = false; }
  }
  const bus: IntegratedCommandBus = freeze({
    submit(input: unknown) { requireReceiver(this); return command({ operation: "submit", command: input }); },
    undo() { requireReceiver(this); return command({ operation: "undo" }); },
    redo() { requireReceiver(this); return command({ operation: "redo" }); },
    read() {
      requireReceiver(this);
      let result = raw(snapshotReuse === false ? { operation: "read" }
        : { operation: "read", knownSnapshotVersion: cachedSnapshot?.documentVersion ?? null });
      // Older private artifacts reject the additive request before entering the
      // read handler. Retry only that recognized unsupported-request path, using
      // the same Rust session; never hide actual read/reentry failures.
      if (snapshotReuse === undefined && !result.ok && result.failure !== undefined
        && ["command.invalid-envelope", "command.required-contribution-incompatible", "command.required-contribution-unavailable"].includes(result.failure.code)) {
        result = raw({ operation: "read" });
        if (result.ok) snapshotReuse = false;
      } else if (result.ok && snapshotReuse === undefined) snapshotReuse = true;
      const failed = () => freeze({ ok: false as const, failure: { code: "read.invariant-violation" as const } });
      if (!result.ok || result.state === undefined || result.availability === undefined) return failed();
      const snapshot = result.state.snapshot;
      if (snapshot.document === null) {
        if (cachedSnapshot === undefined || cachedSnapshot.documentVersion !== snapshot.documentVersion
          || cachedSnapshot.documentId !== snapshot.documentId || cachedSnapshot.schemaVersion !== snapshot.schemaVersion) return failed();
      } else if (cachedSnapshot?.documentVersion !== snapshot.documentVersion) {
        cachedSnapshot = freeze({ ...snapshot, document: snapshot.document });
      }
      if (cachedSnapshot === undefined) return failed();
      // The cached snapshot was deeply frozen on admission. Freeze only the new
      // scalar/availability projection, without traversing the document again.
      return freezeObject({ ok: true as const, value: freezeObject({ snapshot: cachedSnapshot,
        history: freeze(result.state.history), dirty: result.state.dirty,
        writeAvailability: freeze(result.availability.value.writeAvailability),
        validationAvailability: freeze(result.availability.value.validationAvailability) }) });
    },
    markPersisted(input: unknown) {
      requireReceiver(this);
      if (busy || dispatching) return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: observedDirty, failure: { code: "event.reentrant-write" as const } });
      const state = current();
      const capturedCheckpoint = captureStrictInput(input);
      if (capturedCheckpoint.status !== "captured") return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: state.dirty, failure: { code: "checkpoint.invalid" as const } });
      const result = raw({ operation: "markPersisted", checkpoint: capturedCheckpoint.value }).checkpoint;
      if (result === undefined) return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: state.dirty, failure: { code: "checkpoint.invalid" as const } });
      if (result.status === "checkpoint-rejected") return freeze({ status: "rejected" as const, ...result.value, failure: result.failure! });
      observedDirty = result.value.dirty;
      dispatch(result.events);
      return freeze({ status: result.status, ...result.value });
    },
    subscribe(handler: unknown) {
      requireReceiver(this);
      if (typeof handler !== "function") return freeze({ status: "rejected" as const, failure: { code: "event.invalid-handler" as const } });
      const fn = handler as (event: IntegratedKernelEvent) => unknown;
      subscribers.push(fn);
      let active = true;
      return freeze({ status: "subscribed" as const, unsubscribe: () => { if (active) { active = false; const index = subscribers.indexOf(fn); if (index !== -1) subscribers.splice(index, 1); } } });
    },
  });
  ruleWarningReadersV1.set(bus, (documentId, documentVersion, offset, limit) => {
    if (typeof documentId !== "string" || !isSafeNonNegativeInteger(documentVersion)
      || !isSafeNonNegativeInteger(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 4_096) {
      return freeze({ ok: false, failure: { code: "report.invalid-request" } });
    }
    const output = raw({ operation: "readRuleWarningPage", reportVersion: 1,
      documentId, documentVersion, offset, limit });
    if (!output.ok) return freeze({ ok: false, failure: {
      code: typeof output.failure?.code === "string" ? output.failure.code : "report.internal-error",
    } });
    const report = decodeRuleWarningPageV1(output.report);
    return report === undefined
      ? freeze({ ok: false, failure: { code: "report.invalid-response" } })
      : freeze({ ok: true, value: report });
  });
  ruleWarningReadersV2.set(bus, (documentId, documentVersion, offset, limit) => {
    if (typeof documentId !== "string" || !isSafeNonNegativeInteger(documentVersion)
      || !isSafeNonNegativeInteger(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 4_096) {
      return freeze({ ok: false, failure: { code: "report.invalid-request" } });
    }
    const output = raw({ operation: "readRuleWarningPage", reportVersion: 2,
      documentId, documentVersion, offset, limit });
    if (!output.ok) return freeze({ ok: false, failure: {
      code: typeof output.failure?.code === "string" ? output.failure.code : "report.internal-error",
    } });
    const report = decodeRuleWarningPageV2(output.report);
    return report === undefined
      ? freeze({ ok: false, failure: { code: "report.invalid-response" } })
      : freeze({ ok: true, value: report });
  });
  bindNativeIntegratedAssemblyV2(bus, assembly.state);
  return freeze({ ok: true, value: bus });
}
