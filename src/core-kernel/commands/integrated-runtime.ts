import { captureStrictInput } from "../codec/strict-input-capture";
import { contributionReads, hasIncompatibleContributionReads, hasUnavailableContributionReads, type ContributionDependencyViewV1 } from "../registry/contribution-reads";
import { invokeScopedCallbackV1, type ScopedCallbackInvokerV1 } from "../module-sdk/scoped-invocation";
import { nativeIntegratedFactoryV2, nativeIntegratedAssemblyV2 } from "../native/integrated-backend-selection";
import { decodeScoreDocument } from "../codec/decode-score-document";
import type { ScoreAddress } from "../domain/address";
import {
  isJsonValue,
  type ExtensionBlock,
  type ExtensionOwner,
  type JsonObject,
} from "../domain/extensions";
import type { ScoreDocument } from "../domain/score-document";
import type {
  EventSubscriptionResult,
  IntegratedKernelEvent,
  KernelCommandIdentity,
} from "../events/contracts";
import { buildCheckpointEvents } from "../events/runtime";
import { deriveAffectedEntities } from "../events/facts";
import {
  getDomainCommandDefinitionBinding,
  getModuleEffectDefinitionBinding,
} from "../module-sdk/definitions";
import {
  OFFICIAL_MODULE_SDK_V1_LIMITS,
  type CompiledDomainCommandContributionV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledModuleEffectDefinitionV1,
  type DomainContributionReadViewV1,
} from "../module-sdk/contracts";
import {
  validateScoreFeatureProfile,
  type ScoreSupportResult,
} from "../profiles/score-feature-profile";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type { MarkPersistedResult, ReadResult } from "../read/contracts";
import {
  contentStateIdentity,
  createReadSessionState,
  markPersistedCheckpoint,
  recordCommittedVersion,
  type ReadSessionState,
} from "../read/session-state";
import { readKernelState } from "../read/snapshot";
import {
  computeKernelDomainAvailability,
  resolveKernelIntegratedRuntimeAssembly,
  type KernelDomainAvailabilityState,
  type KernelIntegratedRuntimeAssemblyState,
} from "../registry/domain-availability";
import type {
  IntegratedCommandBus,
  IntegratedCommandBusCreationResult,
  IntegratedKernelReadState,
  KernelCommandAssessment,
  KernelCommandBusCreationFailure,
  KernelCommandFailure,
  KernelBatchChildFailure,
  KernelCommandResult,
  KernelContributionFailure,
  KernelIntegratedCatalog,
  ModuleCommandAssessment,
  ModuleKernelIssue,
} from "../registry/integrated-contracts";
import {
  isSafeRegistryId,
  readDenseArray,
  readExactDataRecord,
} from "../registry/strict-codec";
import type {
  BatchCommand,
  CommandFailure,
  CommandFailureLeaf,
  CommandResult,
  CoreCommandEnvelope,
  ScoreEntityTarget,
} from "./contracts";
import {
  applyCoreEffectSet,
  applyCoreEffectSetToCandidate,
  cloneCoreEffectCandidate,
  freezeCoreEffectSet,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
} from "./effects";
import {
  findCoreExecutionDefinition,
  type CoreExecutionAssembly,
} from "./execution-assembly";
import { decodeCoreCommand } from "./strict-codec";
import {
  appendBatchAffectedWithinBudget,
  BATCH_EFFECT_LIMIT,
  checkBatchEffectBudget,
  type BatchChildSource,
  type EffectiveBatchSegment,
} from "./batch-runtime";
import {
  commitPreparedCommand,
  createCommandRuntime,
  redoCommand,
  submitCommand,
  undoCommand,
  type CommandRuntimeState,
  type CommandTransition,
  type HistoryEntry,
} from "./runtime";

const MAX_EFFECTS = 131_072;
const MAX_AFFECTED_ADDRESSES = 131_072;
const MAX_CALLBACK_ISSUES = OFFICIAL_MODULE_SDK_V1_LIMITS.moduleIssuesPerCallback;
const MAX_TRANSACTION_ISSUES = OFFICIAL_MODULE_SDK_V1_LIMITS.moduleIssuesPerTransaction;

interface IntegratedSessionState {
  readonly commandState: CommandRuntimeState;
  readonly readState: ReadSessionState;
  readonly lastEventSequence: number;
}

interface IntegratedCommandBusPrivateState {
  session: IntegratedSessionState;
  readonly assembly: KernelIntegratedRuntimeAssemblyState;
  availability: KernelDomainAvailabilityState;
  readonly subscribers: SubscriberRecord[];
  dispatching: boolean;
}

interface SubscriberRecord {
  readonly handler: (event: IntegratedKernelEvent) => unknown;
}

type ModuleFailure = Extract<
  KernelContributionFailure,
  {
    readonly code:
      | "command.contribution-semantic-invalid"
      | "command.contribution-contract-violation"
      | "command.contribution-internal-error";
  }
> | Extract<
  KernelCommandFailure,
  { readonly code: "command.resource-limit-exceeded" }
>;

type ModulePipelineResult =
  | {
      readonly ok: true;
      readonly availability: KernelDomainAvailabilityState;
      readonly assessment: KernelCommandAssessment;
    }
  | {
      readonly ok: false;
      readonly failure:
        | Exclude<ModuleFailure, { readonly code: "command.resource-limit-exceeded" }>
        | Extract<KernelCommandFailure, { readonly code: "command.semantic-invalid" }>
        | {
            readonly code: "command.resource-limit-exceeded";
            readonly limitKind: "compatibility-facts" | "module-issues";
            readonly limit: number;
            readonly actual: number;
          };
    };

interface CapturedEnvelope {
  readonly commandVersion: 1;
  readonly commandId: string;
  readonly target: unknown;
  readonly payload: unknown;
  readonly captured: unknown;
}

interface PreparedModuleOperation {
  readonly status: "changed" | "no-op";
  readonly command: CoreCommandEnvelope;
  readonly source: {
    readonly kind: "module";
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly document: ScoreDocument;
  readonly forward?: NonEmptyCoreEffectSet;
  readonly inverse?: NonEmptyCoreEffectSet;
  readonly affected: readonly ScoreAddress[];
}

type PrepareModuleOperationResult =
  | { readonly ok: true; readonly value: PreparedModuleOperation }
  | { readonly ok: false; readonly failure: KernelCommandFailure };

interface ModuleRequestApplicationOptions {
  /** The caller already owns a detached candidate that may be mutated in place. */
  readonly candidateIsIsolated: boolean;
  /** Retain a non-empty effect sequence even when it restores the starting value. */
  readonly preserveEffectiveSequence: boolean;
}

const DEFAULT_MODULE_REQUEST_APPLICATION_OPTIONS: ModuleRequestApplicationOptions =
  Object.freeze({
    candidateIsIsolated: false,
    preserveEffectiveSequence: false,
  });

const BATCH_MODULE_REQUEST_APPLICATION_OPTIONS: ModuleRequestApplicationOptions =
  Object.freeze({
    candidateIsIsolated: true,
    preserveEffectiveSequence: true,
  });

type PrepareIntegratedBatchResult =
  | {
      readonly ok: true;
      readonly changed: false;
      readonly document: ScoreDocument;
    }
  | {
      readonly ok: true;
      readonly changed: true;
      readonly document: ScoreDocument;
      readonly forward: NonEmptyCoreEffectSet;
      readonly inverse: NonEmptyCoreEffectSet;
      readonly affected: readonly ScoreAddress[];
      readonly segments: readonly EffectiveBatchSegment[];
    }
  | { readonly ok: false; readonly failure: KernelCommandFailure };

const INTEGRATED_BUS_TOKEN = Symbol("IntegratedCommandBus construction");
const reflectApply = Reflect.apply;
const reflectConstruct = Reflect.construct;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const promiseResolve = Promise.resolve;
const promiseCatch = Promise.prototype.catch;
const structuredCloneValue = structuredClone;
const arrayConstructor = Array;
const arrayIsArray = Array.isArray;
const arrayPush = Array.prototype.push;
const arraySplice = Array.prototype.splice;
const arraySort = Array.prototype.sort;
const arrayUnshift = Array.prototype.unshift;
const arrayFilter = Array.prototype.filter;
const arrayFind = Array.prototype.find;
const arrayForEach = Array.prototype.forEach;
const arrayIncludes = Array.prototype.includes;
const arrayMap = Array.prototype.map;
const arrayPop = Array.prototype.pop;
const arrayReverse = Array.prototype.reverse;
const arraySlice = Array.prototype.slice;
const arraySome = Array.prototype.some;
const arrayEvery = Array.prototype.every;
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectConstructor = Object;
const objectIs = Object.is;
const stringCharCodeAt = String.prototype.charCodeAt;
const stringSlice = String.prototype.slice;
const setAdd = Set.prototype.add;
const setDelete = Set.prototype.delete;
const setHas = Set.prototype.has;
const mapGet = Map.prototype.get;
const mapSet = Map.prototype.set;
const mapHas = Map.prototype.has;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetHas = WeakSet.prototype.has;
const weakSetAdd = WeakSet.prototype.add;

const integratedBusStates = new WeakMap<
  IntegratedCommandBus,
  IntegratedCommandBusPrivateState
>();

const CORE_CLASSIFICATION_PLACEHOLDER: ScoreSupportResult = Object.freeze({
  status: "supported",
  diagnostics: Object.freeze([]) as readonly [],
});

function clone<T>(value: T): T {
  return reflectApply(structuredCloneValue, undefined, [value]) as T;
}

function freeze<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  const pending: unknown[] = [value];
  const objects: object[] = [];
  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    pending.length -= 1;
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) {
      continue;
    }
    reflectApply(weakSetAdd, seen, [current]);
    objects[objects.length] = current;
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) {
        continue;
      }
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending[pending.length] = descriptor.value;
      }
    }
  }
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const current = objects[index];
    if (current !== undefined) {
      reflectApply(objectFreeze, Object, [current]);
    }
  }
  return value;
}

function hasDataValue(owner: object, key: PropertyKey, expected: unknown): boolean {
  const descriptor = reflectGetOwnPropertyDescriptor(owner, key);
  return descriptor !== undefined && "value" in descriptor && descriptor.value === expected;
}

function hasIntactExecutionPrimordials(): boolean {
  return hasDataValue(arrayConstructor, "isArray", arrayIsArray) &&
    hasDataValue(arrayConstructor.prototype, "push", arrayPush) &&
    hasDataValue(arrayConstructor.prototype, "splice", arraySplice) &&
    hasDataValue(arrayConstructor.prototype, "sort", arraySort) &&
    hasDataValue(arrayConstructor.prototype, "unshift", arrayUnshift) &&
    hasDataValue(arrayConstructor.prototype, "filter", arrayFilter) &&
    hasDataValue(arrayConstructor.prototype, "find", arrayFind) &&
    hasDataValue(arrayConstructor.prototype, "forEach", arrayForEach) &&
    hasDataValue(arrayConstructor.prototype, "includes", arrayIncludes) &&
    hasDataValue(arrayConstructor.prototype, "map", arrayMap) &&
    hasDataValue(arrayConstructor.prototype, "pop", arrayPop) &&
    hasDataValue(arrayConstructor.prototype, "reverse", arrayReverse) &&
    hasDataValue(arrayConstructor.prototype, "slice", arraySlice) &&
    hasDataValue(arrayConstructor.prototype, "some", arraySome) &&
    hasDataValue(arrayConstructor.prototype, "every", arrayEvery) &&
    hasDataValue(numberConstructor, "isSafeInteger", numberIsSafeInteger) &&
    hasDataValue(numberConstructor, "MAX_SAFE_INTEGER", numberMaxSafeInteger) &&
    hasDataValue(objectConstructor, "create", objectCreate) &&
    hasDataValue(objectConstructor, "freeze", objectFreeze) &&
    hasDataValue(objectConstructor, "is", objectIs) &&
    hasDataValue(Set.prototype, "add", setAdd) &&
    hasDataValue(Set.prototype, "delete", setDelete) &&
    hasDataValue(Set.prototype, "has", setHas) &&
    hasDataValue(Map.prototype, "get", mapGet) &&
    hasDataValue(Map.prototype, "set", mapSet) &&
    hasDataValue(Map.prototype, "has", mapHas) &&
    hasDataValue(WeakMap.prototype, "get", weakMapGet) &&
    hasDataValue(WeakMap.prototype, "set", weakMapSet) &&
    hasDataValue(WeakSet.prototype, "add", weakSetAdd) &&
    hasDataValue(WeakSet.prototype, "has", weakSetHas);
}

function invoke<Return>(callback: Function, arguments_: readonly unknown[]): Return {
  const returned = reflectApply(callback, undefined, arguments_) as Return;
  if (!hasIntactExecutionPrimordials()) {
    throw new TypeError("integrated callback changed required primordials");
  }
  return returned;
}
export { invoke as invokeIntegratedCallback, hasIntactExecutionPrimordials };

function isArray(value: unknown): value is readonly unknown[] {
  return reflectApply(arrayIsArray, arrayConstructor, [value]) === true;
}

function isSafeInteger(value: unknown): value is number {
  return reflectApply(numberIsSafeInteger, numberConstructor, [value]) === true;
}

function depths(state: CommandRuntimeState): {
  readonly undoDepth: number;
  readonly redoDepth: number;
} {
  return {
    undoDepth: state.undoStack.length,
    redoDepth: state.redoStack.length,
  };
}

function rejected(
  state: IntegratedCommandBusPrivateState,
  failure: KernelCommandFailure,
): KernelCommandResult {
  return freeze({
    status: "rejected" as const,
    documentVersion: state.session.commandState.documentVersion,
    ...depths(state.session.commandState),
    failure: clone(failure),
  });
}

function isSafeId(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    return false;
  }
  let separator = true;
  for (let index = 0; index < value.length; index += 1) {
    const code = reflectApply(stringCharCodeAt, value, [index]) as number;
    const alphanumeric = (code >= 48 && code <= 57) ||
      (code >= 97 && code <= 122);
    if (alphanumeric) {
      separator = false;
      continue;
    }
    if ((code !== 45 && code !== 46) || separator) {
      return false;
    }
    separator = true;
  }
  return !separator;
}

function hasPrefix(value: string, prefix: string): boolean {
  return value.length > prefix.length &&
    (reflectApply(stringSlice, value, [0, prefix.length]) as string) === prefix;
}

function decodeModuleIssue(
  input: unknown,
  contribution: CompiledDomainCommandContributionV1,
): ModuleKernelIssue | undefined {
  const record =
    readExactDataRecord(input, [
      "issueVersion",
      "code",
      "severity",
      "messageKey",
      "source",
    ]) ??
    readExactDataRecord(input, [
      "issueVersion",
      "code",
      "severity",
      "messageKey",
      "source",
      "location",
    ]) ??
    readExactDataRecord(input, [
      "issueVersion",
      "code",
      "severity",
      "messageKey",
      "source",
      "details",
    ]) ??
    readExactDataRecord(input, [
      "issueVersion",
      "code",
      "severity",
      "messageKey",
      "source",
      "location",
      "details",
    ]);
  const source = readExactDataRecord(record?.source, [
    "kind",
    "moduleId",
    "contributionId",
  ]);
  if (
    record?.issueVersion !== 1 ||
    !isSafeId(record.code) ||
    !hasPrefix(record.code, `${contribution.moduleId}.`) ||
    (record.severity !== "warning" &&
      record.severity !== "error" &&
      record.severity !== "fatal") ||
    record.messageKey !== `module.${record.code}` ||
    source?.kind !== "module" ||
    source.moduleId !== contribution.moduleId ||
    source.contributionId !== contribution.contributionId ||
    ("details" in record &&
      (typeof record.details !== "object" ||
        record.details === null ||
        isArray(record.details) ||
        !isJsonValue(record.details))) ||
    ("location" in record && !isModuleIssueLocation(record.location))
  ) {
    return undefined;
  }
  return freeze(clone(record as unknown as ModuleKernelIssue));
}

function isPath(value: unknown): boolean {
  const values = readDenseArray(value);
  if (values === undefined) {
    return false;
  }
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (
      typeof item !== "string" &&
      !(typeof item === "number" && isSafeInteger(item))
    ) {
      return false;
    }
  }
  return true;
}

function isModuleIssueLocation(value: unknown): boolean {
  const diagnostic = readExactDataRecord(value, ["kind", "path"]);
  if (diagnostic?.kind === "diagnostic-path") {
    return isPath(diagnostic.path);
  }
  const address = readExactDataRecord(value, ["kind", "address"]);
  if (address?.kind === "score-address") {
    return decodeScoreAddress(address.address) !== undefined;
  }
  const range = readExactDataRecord(value, ["kind", "range"]);
  if (range?.kind !== "score-range") {
    return false;
  }
  const rangeRecord = readExactDataRecord(range.range, ["kind", "start", "end"]);
  if (rangeRecord === undefined || typeof rangeRecord.kind !== "string") {
    return false;
  }
  const start = rangeRecord.start;
  const end = rangeRecord.end;
  if (rangeRecord.kind === "measure-range") {
    return readPoint(start, "measure") && readPoint(end, "measure");
  }
  if (rangeRecord.kind === "part-measure-range") {
    return readPoint(start, "part-measure") && readPoint(end, "part-measure");
  }
  return rangeRecord.kind === "voice-event-range" &&
    readPoint(start, "voice-event") &&
    readPoint(end, "voice-event");
}

function readPoint(value: unknown, kind: string): boolean {
  const keys = kind === "measure"
    ? ["kind", "measureId"]
    : kind === "part-measure"
      ? ["kind", "partId", "measureId"]
      : ["kind", "voiceId", "eventId"];
  const record = readExactDataRecord(value, keys);
  if (record?.kind !== kind) {
    return false;
  }
  for (let index = 1; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined || typeof record[key] !== "string" || record[key] === "") {
      return false;
    }
  }
  return true;
}

function decodeIssueArray(
  input: unknown,
  contribution: CompiledDomainCommandContributionV1,
): readonly ModuleKernelIssue[] | undefined {
  const captured = captureStrictInput(input);
  if (captured.status !== "captured") {
    return undefined;
  }
  const values = readDenseArray(captured.value);
  if (values === undefined || values.length > MAX_CALLBACK_ISSUES) {
    return undefined;
  }
  const issues: ModuleKernelIssue[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const issue = decodeModuleIssue(values[index], contribution);
    if (issue === undefined) {
      return undefined;
    }
    issues[issues.length] = issue;
  }
  return freeze(issues);
}

/** Internal CVN-6 callback boundary shared by detached migration. */
export function decodeIntegratedModuleIssues(
  input: unknown,
  contribution: CompiledDomainCommandContributionV1,
): readonly ModuleKernelIssue[] | undefined {
  return decodeIssueArray(input, contribution);
}

function contractFailure(
  contribution: CompiledDomainCommandContributionV1,
): Extract<
  ModuleFailure,
  { readonly code: "command.contribution-contract-violation" }
> {
  return freeze({
    code: "command.contribution-contract-violation" as const,
    moduleId: contribution.moduleId,
    contributionId: contribution.contributionId,
  });
}

function ownDataValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || isArray(value)) {
    return undefined;
  }
  const descriptor = reflectGetOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor && descriptor.enumerable
    ? descriptor.value
    : undefined;
}

function effectProvenance(request: unknown): {
  readonly effectKind: string;
  readonly target: ScoreEntityTarget | ExtensionOwner;
} | undefined {
  const requestKind = ownDataValue(request, "requestKind");
  if (!isSafeRegistryId(requestKind)) {
    return undefined;
  }
  if (requestKind === "module.extension") {
    const effectKind = ownDataValue(request, "effectKind");
    const owner = decodeOwner(ownDataValue(request, "owner"));
    return isSafeRegistryId(effectKind) && owner !== undefined
      ? { effectKind, target: owner }
      : undefined;
  }
  const rawTarget = ownDataValue(request, "target");
  const kind = targetKind(rawTarget);
  const target = kind === undefined ? undefined : decodeTarget(rawTarget, kind);
  return target === undefined ? undefined : { effectKind: requestKind, target };
}

function effectFailure(
  contribution: CompiledDomainCommandContributionV1,
  effectIndex: number,
  provenance: {
    readonly effectKind: string;
    readonly target: ScoreEntityTarget | ExtensionOwner;
  },
  failureCode: CommandFailureLeaf["code"],
): Extract<
  KernelContributionFailure,
  { readonly code: "command.contribution-effect-rejected" }
> {
  return freeze({
    code: "command.contribution-effect-rejected" as const,
    moduleId: contribution.moduleId,
    contributionId: contribution.contributionId,
    effectIndex,
    effectKind: provenance.effectKind,
    target: clone(provenance.target),
    failureCode,
  });
}

function attributedEffectFailure(
  contribution: CompiledDomainCommandContributionV1,
  effectIndex: number,
  request: unknown,
  failureCode: CommandFailureLeaf["code"],
): KernelContributionFailure {
  const provenance = effectProvenance(request);
  return provenance === undefined
    ? contractFailure(contribution)
    : effectFailure(contribution, effectIndex, provenance, failureCode);
}

function commandFailureLeafCode(failure: CommandFailure): CommandFailureLeaf["code"] {
  return failure.code === "command.batch-child-rejected"
    ? "command.internal-error"
    : failure.code;
}

function internalFailure(
  contribution: CompiledDomainCommandContributionV1,
): Extract<
  ModuleFailure,
  { readonly code: "command.contribution-internal-error" }
> {
  return freeze({
    code: "command.contribution-internal-error" as const,
    moduleId: contribution.moduleId,
    contributionId: contribution.contributionId,
  });
}

function ownerOrder(owner: ExtensionOwner): string {
  return owner.kind === "score" ? "0" : `1:${owner.partId}`;
}

function compareBlocks(left: ExtensionBlock, right: ExtensionBlock): number {
  if (left.namespace !== right.namespace) {
    return left.namespace < right.namespace ? -1 : 1;
  }
  const leftOwner = ownerOrder(left.owner);
  const rightOwner = ownerOrder(right.owner);
  return leftOwner < rightOwner ? -1 : leftOwner > rightOwner ? 1 : 0;
}

function requirementFor(
  contribution: CompiledDomainCommandContributionV1,
  namespace: string,
) {
  for (let index = 0; index < contribution.extensionRequirements.length; index += 1) {
    const requirement = contribution.extensionRequirements[index];
    if (requirement?.namespace === namespace) {
      return requirement;
    }
  }
  return undefined;
}

function includesVersion(versions: readonly number[], value: number): boolean {
  for (let index = 0; index < versions.length; index += 1) {
    if (versions[index] === value) {
      return true;
    }
  }
  return false;
}

function callbackView(
  document: ScoreDocument,
  documentVersion: number,
  contribution: CompiledDomainCommandContributionV1,
): DomainContributionReadViewV1 {
  const compatibleExtensions: ExtensionBlock[] = [];
  for (let index = 0; index < document.extensions.length; index += 1) {
    const block = document.extensions[index];
    if (block === undefined) {
      continue;
    }
    const requirement = requirementFor(contribution, block.namespace);
    if (
      requirement !== undefined &&
      includesVersion(requirement.supportedSchemaVersions, block.schemaVersion)
    ) {
      compatibleExtensions[compatibleExtensions.length] = clone(block);
    }
  }
  reflectApply(arraySort, compatibleExtensions, [compareBlocks]);
  const coreDocument = clone({
    schemaVersion: document.schemaVersion,
    id: document.id,
    metadata: document.metadata,
    measureDefinitions: document.measureDefinitions,
    parts: document.parts,
  });
  const declarations = contributionReads(contribution);
  const dependencyReads: ContributionDependencyViewV1[] = [];
  if (declarations !== undefined) {
    for (let index = 0; index < declarations.length; index++) {
      const declaration = declarations[index]!;
      const blocks: ExtensionBlock[] = [];
      for (let blockIndex = 0; blockIndex < document.extensions.length; blockIndex++) {
        const block = document.extensions[blockIndex]!;
        if (block.namespace === declaration.namespace && includesVersion(declaration.supportedSchemaVersions, block.schemaVersion)
          && (block.owner.kind === declaration.ownerKinds[0] || block.owner.kind === declaration.ownerKinds[1])) blocks[blocks.length] = clone(block);
      }
      reflectApply(arraySort, blocks, [compareBlocks]);
      dependencyReads[dependencyReads.length] = { readVersion: 1, provider: clone(declaration.provider), namespace: declaration.namespace,
        supportedSchemaVersions: clone(declaration.supportedSchemaVersions), ownerKinds: clone(declaration.ownerKinds), blocks };
    }
  }
  return freeze({
    viewVersion: 1 as const,
    documentId: document.id,
    schemaVersion: document.schemaVersion,
    documentVersion,
    coreDocument,
    compatibleExtensions,
    ...(declarations === undefined ? {} : { dependencyReads }),
  });
}

/** Internal CVN-6 detached-view constructor shared by detached migration. */
export function createIntegratedContributionView(
  document: ScoreDocument,
  documentVersion: number,
  contribution: CompiledDomainCommandContributionV1,
): DomainContributionReadViewV1 {
  return callbackView(document, documentVersion, contribution);
}

export function runModulePipeline(
  document: ScoreDocument,
  documentVersion: number,
  assembly: KernelIntegratedRuntimeAssemblyState,
  invokeScoped: ScopedCallbackInvokerV1 = invokeScopedCallbackV1,
): ModulePipelineResult {
  const semantic = validateScoreDocumentSemantics(document);
  if (!semantic.ok) {
    return {
      ok: false,
      failure: freeze({
        code: "command.semantic-invalid" as const,
        diagnostics: clone(semantic.diagnostics),
      }),
    };
  }
  return runPipelineAfterCoreValidation(document, documentVersion, assembly,
    () => freeze(clone(validateScoreFeatureProfile(document))), invokeScoped);
}

/** Private Native bridge seam. Rust has already validated this candidate and
 * owns the supplied Core assessment. No TS Core semantic/profile pass runs. */
export function runNativeModulePipeline(
  document: ScoreDocument,
  documentVersion: number,
  assembly: KernelIntegratedRuntimeAssemblyState,
  core: ScoreSupportResult,
  invokeScoped: ScopedCallbackInvokerV1 = invokeScopedCallbackV1,
): ModulePipelineResult {
  return runPipelineAfterCoreValidation(document, documentVersion, assembly,
    () => freeze(core), invokeScoped);
}

function runPipelineAfterCoreValidation(
  document: ScoreDocument,
  documentVersion: number,
  assembly: KernelIntegratedRuntimeAssemblyState,
  coreAssessment: () => ScoreSupportResult,
  invokeScoped: ScopedCallbackInvokerV1,
): ModulePipelineResult {
  const availability = computeKernelDomainAvailability(document, assembly);
  if (!availability.ok) {
    return {
      ok: false,
      failure: freeze({
        code: "command.resource-limit-exceeded" as const,
        limitKind: "compatibility-facts" as const,
        limit: availability.limit,
        actual: availability.actual,
      }),
    };
  }

  const views: Array<{
    readonly contribution: CompiledDomainCommandContributionV1;
    readonly view: DomainContributionReadViewV1;
  }> = [];
  const semanticIssues: ModuleKernelIssue[] = [];
  for (let index = 0; index < assembly.catalogState.contributions.length; index += 1) {
    const contribution = assembly.catalogState.contributions[index];
    if (contribution === undefined) {
      continue;
    }
    const view = callbackView(document, documentVersion, contribution);
    if (view.compatibleExtensions.length === 0
      || hasUnavailableContributionReads(assembly.catalogState, contribution)
      || hasIncompatibleContributionReads(document, contribution)) {
      continue;
    }
    views[views.length] = { contribution, view };
    let raw: unknown;
    try {
      raw = invokeScoped(contribution, "validate", null, [view], () => invoke(contribution.validate, [view]));
    } catch {
      return { ok: false, failure: internalFailure(contribution) };
    }
    const issues = decodeIssueArray(raw, contribution);
    if (issues === undefined) {
      return { ok: false, failure: contractFailure(contribution) };
    }
    for (let issueIndex = 0; issueIndex < issues.length; issueIndex += 1) {
      const issue = issues[issueIndex];
      if (issue !== undefined) {
        semanticIssues[semanticIssues.length] = issue;
      }
      if (semanticIssues.length > MAX_TRANSACTION_ISSUES) {
        return {
          ok: false,
          failure: freeze({
            code: "command.resource-limit-exceeded" as const,
            limitKind: "module-issues" as const,
            limit: MAX_TRANSACTION_ISSUES,
            actual: MAX_TRANSACTION_ISSUES + 1,
          }),
        };
      }
    }
  }
  if (semanticIssues.length > 0) {
    return {
      ok: false,
      failure: freeze({
        code: "command.contribution-semantic-invalid" as const,
        issues: semanticIssues,
      }),
    };
  }

  const core = coreAssessment();
  const modules: ModuleCommandAssessment[] = [];
  let classifierIssueCount = 0;
  for (let index = 0; index < views.length; index += 1) {
    const entry = views[index];
    if (entry === undefined) {
      continue;
    }
    let raw: unknown;
    try {
      raw = invokeScoped(entry.contribution, "classify", null, [entry.view], () => invoke(entry.contribution.classify, [entry.view]));
    } catch {
      return { ok: false, failure: internalFailure(entry.contribution) };
    }
    const captured = captureStrictInput(raw);
    const record = captured.status === "captured"
      ? readExactDataRecord(captured.value, ["status", "issues"])
      : undefined;
    const issues = record === undefined
      ? undefined
      : decodeIssueArray(record.issues, entry.contribution);
    if (
      record === undefined ||
      (record.status !== "supported" && record.status !== "unsupported") ||
      issues === undefined
    ) {
      return { ok: false, failure: contractFailure(entry.contribution) };
    }
    classifierIssueCount += issues.length;
    if (classifierIssueCount > MAX_TRANSACTION_ISSUES) {
      return {
        ok: false,
        failure: freeze({
          code: "command.resource-limit-exceeded" as const,
          limitKind: "module-issues" as const,
          limit: MAX_TRANSACTION_ISSUES,
          actual: MAX_TRANSACTION_ISSUES + 1,
        }),
      };
    }
    modules[modules.length] = freeze({
      moduleId: entry.contribution.moduleId,
      contributionId: entry.contribution.contributionId,
      status: record.status,
      issues,
    });
  }
  return {
    ok: true,
    availability: availability.value,
    assessment: freeze({ core, modules }),
  };
}

function availabilityFailure(
  state: IntegratedCommandBusPrivateState,
): KernelContributionFailure | undefined {
  const facts = state.availability.facts;
  for (let index = 0; index < facts.length; index += 1) {
    if (facts[index]?.reason === "required-contribution-incompatible") {
      return freeze({
        code: "command.required-contribution-incompatible" as const,
        facts,
      });
    }
  }
  return facts.length === 0
    ? undefined
    : freeze({
        code: "command.required-contribution-unavailable" as const,
        facts,
      });
}

export function captureEnvelope(input: unknown):
  | { readonly ok: true; readonly value: CapturedEnvelope }
  | { readonly ok: false; readonly failure: KernelCommandFailure } {
  const captured = captureStrictInput(input);
  if (captured.status === "resource-limit-exceeded") {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: captured.limitKind,
        limit: captured.limit,
        actual: captured.actual,
      },
    };
  }
  const record = captured.status === "captured"
    ? readExactDataRecord(captured.value, [
        "commandVersion",
        "commandId",
        "target",
        "payload",
      ])
    : undefined;
  if (record === undefined) {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  if (captured.status !== "captured") {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  if (!isSafeInteger(record.commandVersion)) {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  if (record.commandVersion !== 1) {
    return { ok: false, failure: { code: "command.unsupported-version" } };
  }
  if (typeof record.commandId !== "string") {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  return {
    ok: true,
    value: {
      commandVersion: 1,
      commandId: record.commandId,
      target: record.target,
      payload: record.payload,
      captured: captured.value,
    },
  };
}

function targetKind(value: unknown): ScoreEntityTarget["kind"] | undefined {
  if (typeof value !== "object" || value === null || isArray(value)) {
    return undefined;
  }
  const descriptor = reflectGetOwnPropertyDescriptor(value, "kind");
  const kind = descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
  return kind === "document" || kind === "measure" || kind === "part" ||
    kind === "staff" || kind === "voice" || kind === "event" || kind === "note"
    ? kind
    : undefined;
}

export function decodeTarget(
  value: unknown,
  expectedKind: ScoreEntityTarget["kind"],
): ScoreEntityTarget | undefined {
  const idKey = `${expectedKind}Id`;
  const record = readExactDataRecord(value, ["kind", idKey]);
  const id = record?.[idKey];
  if (record?.kind !== expectedKind || typeof id !== "string" || id === "") {
    return undefined;
  }
  return { kind: expectedKind, [idKey]: id } as ScoreEntityTarget;
}

function decodeScoreAddress(value: unknown): ScoreAddress | undefined {
  const kind = targetKind(value);
  return kind === undefined ? undefined : decodeTarget(value, kind);
}

export function targetExists(document: ScoreDocument, target: ScoreEntityTarget): boolean {
  if (target.kind === "document") {
    return document.id === target.documentId;
  }
  let found = 0;
  for (let partIndex = 0; partIndex < document.parts.length; partIndex += 1) {
    const part = document.parts[partIndex];
    if (part === undefined) {
      continue;
    }
    if (target.kind === "part" && part.id === target.partId) {
      found += 1;
    }
    for (let staffIndex = 0; staffIndex < part.staves.length; staffIndex += 1) {
      const staff = part.staves[staffIndex];
      if (target.kind === "staff" && staff?.id === target.staffId) {
        found += 1;
      }
    }
    for (let contentIndex = 0; contentIndex < part.measureContents.length; contentIndex += 1) {
      const content = part.measureContents[contentIndex];
      if (content === undefined) {
        continue;
      }
      for (let voiceIndex = 0; voiceIndex < content.voices.length; voiceIndex += 1) {
        const voice = content.voices[voiceIndex];
        if (voice === undefined) {
          continue;
        }
        if (target.kind === "voice" && voice.id === target.voiceId) {
          found += 1;
        }
        for (let eventIndex = 0; eventIndex < voice.sequence.events.length; eventIndex += 1) {
          const event = voice.sequence.events[eventIndex];
          if (event === undefined) {
            continue;
          }
          if (target.kind === "event" && event.id === target.eventId) {
            found += 1;
          }
          if (event.content.kind === "notes") {
            for (let noteIndex = 0; noteIndex < event.content.notes.length; noteIndex += 1) {
              const note = event.content.notes[noteIndex];
              if (target.kind === "note" && note?.id === target.noteId) {
                found += 1;
              }
            }
          }
        }
      }
    }
  }
  if (target.kind === "measure") {
    for (let index = 0; index < document.measureDefinitions.length; index += 1) {
      if (document.measureDefinitions[index]?.id === target.measureId) {
        found += 1;
      }
    }
  }
  return found === 1;
}

function contributionForCommand(
  assembly: KernelIntegratedRuntimeAssemblyState,
  command: CompiledDomainCommandDefinitionV1,
): CompiledDomainCommandContributionV1 | undefined {
  for (let index = 0; index < assembly.catalogState.contributions.length; index += 1) {
    const contribution = assembly.catalogState.contributions[index];
    if (
      contribution?.moduleId === command.descriptor.source.moduleId &&
      contribution.contributionId === command.descriptor.source.contributionId
    ) {
      return contribution;
    }
  }
  return undefined;
}

function ownerExists(document: ScoreDocument, owner: ExtensionOwner): boolean {
  if (owner.kind === "score") {
    return true;
  }
  for (let index = 0; index < document.parts.length; index += 1) {
    if (document.parts[index]?.id === owner.partId) {
      return true;
    }
  }
  return false;
}

function sameOwner(left: ExtensionOwner, right: ExtensionOwner): boolean {
  return left.kind === right.kind &&
    (left.kind === "score" ||
      (right.kind === "part" && left.partId === right.partId));
}

function currentBlock(
  document: ScoreDocument,
  namespace: string,
  owner: ExtensionOwner,
): { readonly index: number; readonly block: ExtensionBlock } | undefined {
  let found: { readonly index: number; readonly block: ExtensionBlock } | undefined;
  for (let index = 0; index < document.extensions.length; index += 1) {
    const block = document.extensions[index];
    if (
      block !== undefined &&
      block.namespace === namespace &&
      sameOwner(block.owner, owner)
    ) {
      if (found !== undefined) {
        return undefined;
      }
      found = { index, block };
    }
  }
  return found;
}

function decodeOwner(value: unknown): ExtensionOwner | undefined {
  const score = readExactDataRecord(value, ["kind"]);
  if (score?.kind === "score") {
    return freeze({ kind: "score" as const });
  }
  const part = readExactDataRecord(value, ["kind", "partId"]);
  return part?.kind === "part" && typeof part.partId === "string" && part.partId !== ""
    ? freeze({ kind: "part" as const, partId: part.partId })
    : undefined;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (reflectApply(objectIs, objectConstructor, [left, right]) === true) {
    return true;
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (isArray(left) !== isArray(right)) {
    return false;
  }
  const leftKeys = reflectOwnKeys(left);
  const rightKeys = reflectOwnKeys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key === undefined || key !== rightKeys[index]) {
      return false;
    }
    const leftDescriptor = reflectGetOwnPropertyDescriptor(left, key);
    const rightDescriptor = reflectGetOwnPropertyDescriptor(right, key);
    if (
      leftDescriptor === undefined ||
      rightDescriptor === undefined ||
      !("value" in leftDescriptor) ||
      !("value" in rightDescriptor) ||
      !deepEqual(leftDescriptor.value, rightDescriptor.value)
    ) {
      return false;
    }
  }
  return true;
}

export function decodeIntegratedAffectedAddresses(input: unknown):
  | { readonly ok: true; readonly value: readonly ScoreAddress[] }
  | { readonly ok: false; readonly reason: "invalid" }
  | {
      readonly ok: false;
      readonly reason: "resource";
      readonly limit: typeof MAX_AFFECTED_ADDRESSES;
      readonly actual: 131_073;
    } {
  const values = readDenseArray(input);
  if (values === undefined) {
    return { ok: false, reason: "invalid" };
  }
  const addresses: ScoreAddress[] = [];
  const seen = reflectApply(objectCreate, Object, [null]) as Record<string, true>;
  for (let index = 0; index < values.length; index += 1) {
    const address = decodeScoreAddress(values[index]);
    const key = address === undefined ? undefined : addressKey(address);
    if (address === undefined || key === undefined) {
      return { ok: false, reason: "invalid" };
    }
    if (seen[key] === true) {
      continue;
    }
    seen[key] = true;
    addresses[addresses.length] = freeze(clone(address));
    if (addresses.length > MAX_AFFECTED_ADDRESSES) {
      return {
        ok: false,
        reason: "resource",
        limit: MAX_AFFECTED_ADDRESSES,
        actual: 131_073,
      };
    }
  }
  reflectApply(arraySort, addresses, [
    (left: ScoreAddress, right: ScoreAddress) => {
      const leftKey = addressKey(left);
      const rightKey = addressKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    },
  ]);
  return freeze({ ok: true as const, value: freeze(addresses) });
}

function addressKey(address: ScoreAddress): string {
  switch (address.kind) {
    case "document": return `document:${address.documentId}`;
    case "measure": return `measure:${address.measureId}`;
    case "part": return `part:${address.partId}`;
    case "staff": return `staff:${address.staffId}`;
    case "voice": return `voice:${address.voiceId}`;
    case "event": return `event:${address.eventId}`;
    case "note": return `note:${address.noteId}`;
  }
}

export function moduleEffectForRequest(
  request: unknown,
  contribution: CompiledDomainCommandContributionV1,
): {
  readonly definition: CompiledModuleEffectDefinitionV1;
  readonly owner: ExtensionOwner;
  readonly payload: JsonObject;
} | undefined {
  const record = readExactDataRecord(request, [
    "requestVersion",
    "requestKind",
    "effectKind",
    "namespace",
    "owner",
    "payload",
  ]);
  const owner = decodeOwner(record?.owner);
  if (
    record?.requestVersion !== 1 ||
    record.requestKind !== "module.extension" ||
    typeof record.effectKind !== "string" ||
    typeof record.namespace !== "string" ||
    owner === undefined ||
    typeof record.payload !== "object" ||
    record.payload === null ||
    isArray(record.payload) ||
    !isJsonValue(record.payload)
  ) {
    return undefined;
  }
  for (let index = 0; index < contribution.effects.length; index += 1) {
    const effect = contribution.effects[index];
    if (
      effect?.descriptor.effectKind === record.effectKind &&
      effect.descriptor.namespace === record.namespace &&
      effect.descriptor.source.moduleId === contribution.moduleId &&
      effect.descriptor.source.contributionId === contribution.contributionId
    ) {
      let ownerAllowed = false;
      for (let ownerIndex = 0; ownerIndex < effect.descriptor.ownerKinds.length; ownerIndex += 1) {
        if (effect.descriptor.ownerKinds[ownerIndex] === owner.kind) {
          ownerAllowed = true;
        }
      }
      return ownerAllowed
        ? { definition: effect, owner, payload: record.payload as JsonObject }
        : undefined;
    }
  }
  return undefined;
}

function applyModuleRequests(
  document: ScoreDocument,
  documentVersion: number,
  coreAssembly: CoreExecutionAssembly,
  contribution: CompiledDomainCommandContributionV1,
  requests: readonly unknown[],
  options: ModuleRequestApplicationOptions,
):
  | {
      readonly ok: true;
      readonly document: ScoreDocument;
      readonly forward?: NonEmptyCoreEffectSet;
      readonly inverse?: NonEmptyCoreEffectSet;
      readonly affected: readonly ScoreAddress[];
    }
  | { readonly ok: false; readonly failure: KernelCommandFailure } {
  if (requests.length > MAX_EFFECTS) {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "effects",
        limit: MAX_EFFECTS,
        actual: MAX_EFFECTS + 1,
      },
    };
  }
  let candidate = document;
  const forward: CoreEffect[] = [];
  const inverse: CoreEffect[] = [];
  const affected: ScoreAddress[] = [];
  const affectedSeen = reflectApply(objectCreate, Object, [null]) as Record<string, true>;

  function appendAffected(address: ScoreAddress): boolean {
    const key = addressKey(address);
    if (affectedSeen[key] === true) {
      return true;
    }
    affectedSeen[key] = true;
    affected[affected.length] = clone(address);
    return affected.length <= MAX_AFFECTED_ADDRESSES;
  }

  function applyPreparedEffects(effects: readonly CoreEffect[]): CommandFailure | undefined {
    if (effects.length === 0) {
      return undefined;
    }
    const segment = effects as [CoreEffect, ...CoreEffect[]];
    let segmentInverse: NonEmptyCoreEffectSet;
    if (options.candidateIsIsolated) {
      const applied = applyCoreEffectSetToCandidate(candidate, segment);
      if (!applied.ok) {
        return applied.failure;
      }
      segmentInverse = applied.inverse;
    } else {
      const applied = applyCoreEffectSet(candidate, segment);
      if (!applied.ok) {
        return applied.failure;
      }
      candidate = applied.document;
      segmentInverse = applied.inverse;
    }
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
      const effect = effects[effectIndex];
      if (effect !== undefined) {
        forward[forward.length] = effect;
      }
    }
    for (let inverseIndex = segmentInverse.length - 1; inverseIndex >= 0; inverseIndex -= 1) {
      const inverseEffect = segmentInverse[inverseIndex];
      if (inverseEffect !== undefined) {
        reflectApply(arrayUnshift, inverse, [inverseEffect]);
      }
    }
    return undefined;
  }

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const requestKind = ownDataValue(request, "requestKind");
    const reject = (failureCode: CommandFailureLeaf["code"]): {
      readonly ok: false;
      readonly failure: KernelContributionFailure;
    } => ({
      ok: false,
      failure: attributedEffectFailure(contribution, index, request, failureCode),
    });
    let effectsToApply: readonly CoreEffect[];
    let affectedAddresses: readonly ScoreAddress[];
    if (
      requestKind === "core.note.replace-written-pitch" ||
      requestKind === "core.document.set-metadata" ||
      requestKind === "core.event.set-note-value" ||
      requestKind === "core.voice.insert-notes-event" ||
      requestKind === "core.voice.insert-rest-event" ||
      requestKind === "core.event.remove"
    ) {
      const requestVersion = ownDataValue(request, "requestVersion");
      if (!isSafeInteger(requestVersion)) {
        return reject("command.invalid-envelope");
      }
      if (requestVersion !== 1) {
        return reject("command.unsupported-version");
      }
      const requestKeys = requestKind === "core.note.replace-written-pitch"
        ? ["requestVersion", "requestKind", "target", "writtenPitch"]
        : requestKind === "core.document.set-metadata"
          ? ["requestVersion", "requestKind", "target", "metadata"]
          : requestKind === "core.event.set-note-value"
            ? ["requestVersion", "requestKind", "target", "noteValue"]
            : requestKind === "core.voice.insert-notes-event" ||
                requestKind === "core.voice.insert-rest-event"
              ? ["requestVersion", "requestKind", "target", "anchor", "event"]
              : ["requestVersion", "requestKind", "target"];
      const coreRecord = readExactDataRecord(request, requestKeys);
      if (coreRecord === undefined) {
        return reject("command.invalid-envelope");
      }
      const commandId = requestKind === "core.note.replace-written-pitch"
        ? "core.note.set-written-pitch"
        : requestKind;
      const payload = requestKind === "core.note.replace-written-pitch"
        ? { writtenPitch: coreRecord.writtenPitch }
        : requestKind === "core.document.set-metadata"
          ? { metadata: coreRecord.metadata }
          : requestKind === "core.event.set-note-value"
            ? { noteValue: coreRecord.noteValue }
            : requestKind === "core.voice.insert-notes-event" ||
                requestKind === "core.voice.insert-rest-event"
              ? { anchor: coreRecord.anchor, event: coreRecord.event }
              : {};
      const decoded = decodeCoreCommand({
        commandVersion: 1,
        commandId,
        target: coreRecord.target,
        payload,
      }, coreAssembly);
      if (!decoded.ok) {
        return reject(commandFailureLeafCode(decoded.failure));
      }
      const definition = findCoreExecutionDefinition(coreAssembly, commandId);
      if (definition === undefined) {
        return reject("command.internal-error");
      }
      const prepared = definition.prepare(candidate, decoded.value);
      if (!prepared.ok) {
        return reject(commandFailureLeafCode(prepared.failure));
      }
      if (!prepared.changed) {
        continue;
      }
      effectsToApply = prepared.effects;
      affectedAddresses = prepared.affected;
    } else {
      if (requestKind !== "module.extension") {
        return reject("command.unknown-id");
      }
      const requestVersion = ownDataValue(request, "requestVersion");
      if (!isSafeInteger(requestVersion)) {
        return reject("command.invalid-envelope");
      }
      if (requestVersion !== 1) {
        return reject("command.unsupported-version");
      }
      const record = readExactDataRecord(request, [
        "requestVersion",
        "requestKind",
        "effectKind",
        "namespace",
        "owner",
        "payload",
      ]);
      if (
        record === undefined ||
        typeof record.effectKind !== "string" ||
        typeof record.namespace !== "string" ||
        typeof record.payload !== "object" ||
        record.payload === null ||
        isArray(record.payload) ||
        !isJsonValue(record.payload)
      ) {
        return reject("command.invalid-envelope");
      }
      let definition: CompiledModuleEffectDefinitionV1 | undefined;
      for (let effectIndex = 0; effectIndex < contribution.effects.length; effectIndex += 1) {
        const candidateDefinition = contribution.effects[effectIndex];
        if (
          candidateDefinition?.descriptor.effectKind === record.effectKind &&
          candidateDefinition.descriptor.namespace === record.namespace &&
          candidateDefinition.descriptor.source.moduleId === contribution.moduleId &&
          candidateDefinition.descriptor.source.contributionId === contribution.contributionId
        ) {
          definition = candidateDefinition;
          break;
        }
      }
      if (definition === undefined) {
        return reject("command.unknown-id");
      }
      const owner = decodeOwner(record.owner);
      if (owner === undefined) {
        return reject("command.invalid-envelope");
      }
      if (!ownerExists(candidate, owner)) {
        return reject("command.target-not-found");
      }
      let ownerAllowed = false;
      for (let ownerIndex = 0; ownerIndex < definition.descriptor.ownerKinds.length; ownerIndex += 1) {
        if (definition.descriptor.ownerKinds[ownerIndex] === owner.kind) {
          ownerAllowed = true;
        }
      }
      if (!ownerAllowed) {
        return reject("command.target-mismatch");
      }
      const binding = getModuleEffectDefinitionBinding(definition);
      if (binding === undefined) {
        return { ok: false, failure: contractFailure(contribution) };
      }
      let decodedRaw: unknown;
      try {
        decodedRaw = invoke(binding.decode, [record.payload]);
      } catch {
        return { ok: false, failure: internalFailure(contribution) };
      }
      const decodedCapture = captureStrictInput(decodedRaw);
      const decoded = decodedCapture.status === "captured"
        ? readExactDataRecord(decodedCapture.value, ["status", "payload"])
        : undefined;
      if (decoded?.status !== "decoded") {
        return { ok: false, failure: contractFailure(contribution) };
      }
      const current = currentBlock(candidate, definition.descriptor.namespace, owner);
      const view = callbackView(candidate, documentVersion, contribution);
      let transformedRaw: unknown;
      try {
        transformedRaw = invoke(binding.transform, [freeze({
          view,
          owner: clone(owner),
          currentBlock: current === undefined ? undefined : clone(current.block),
          payload: decoded.payload,
        })]);
      } catch {
        return { ok: false, failure: internalFailure(contribution) };
      }
      const transformedCapture = captureStrictInput(transformedRaw);
      if (transformedCapture.status !== "captured") {
        return reject("command.invalid-envelope");
      }
      const transformed = transformedCapture.value;
      const remove = readExactDataRecord(transformed, ["status"]);
      const replace = readExactDataRecord(transformed, [
        "status",
        "schemaVersion",
        "payload",
      ]);
      const rejectedResult = readExactDataRecord(transformed, ["status", "issues"]);
      if (rejectedResult?.status === "rejected") {
        const issues = decodeIssueArray(rejectedResult.issues, contribution);
        return issues === undefined
          ? { ok: false, failure: contractFailure(contribution) }
          : {
              ok: false,
              failure: freeze({
                code: "command.contribution-semantic-invalid" as const,
                issues,
              }),
            };
      }
      if (remove?.status === "remove") {
        if (current === undefined) {
          continue;
        }
        effectsToApply = [{
          kind: "remove-extension-block",
          namespace: definition.descriptor.namespace,
          owner: clone(owner),
        }];
      } else if (replace?.status === "replace") {
        if (
          !isSafeInteger(replace.schemaVersion) ||
          replace.schemaVersion <= 0 ||
          typeof replace.payload !== "object" ||
          replace.payload === null ||
          isArray(replace.payload) ||
          !isJsonValue(replace.payload)
        ) {
          return reject("command.invalid-envelope");
        }
        if (!includesVersion(definition.descriptor.supportedSchemaVersions, replace.schemaVersion)) {
          return reject("command.unsupported-version");
        }
        const block: ExtensionBlock = freeze({
          namespace: definition.descriptor.namespace,
          schemaVersion: replace.schemaVersion,
          owner: clone(owner),
          payload: clone(replace.payload as JsonObject),
        });
        if (current !== undefined && deepEqual(current.block, block)) {
          continue;
        }
        effectsToApply = [current === undefined
          ? {
              kind: "insert-extension-block",
              index: candidate.extensions.length,
              value: block,
            }
          : {
              kind: "set-extension-block",
              namespace: block.namespace,
              owner: clone(block.owner),
              value: block,
            }];
      } else {
        return reject("command.invalid-envelope");
      }
      affectedAddresses = [owner.kind === "score"
        ? { kind: "document", documentId: candidate.id }
        : { kind: "part", partId: owner.partId }];
    }
    const effectCount = forward.length + effectsToApply.length;
    if (effectCount > MAX_EFFECTS) {
      return {
        ok: false,
        failure: {
          code: "command.resource-limit-exceeded",
          limitKind: "effects",
          limit: MAX_EFFECTS,
          actual: effectCount,
        },
      };
    }
    const applyFailure = applyPreparedEffects(effectsToApply);
    if (applyFailure !== undefined) {
      return reject(commandFailureLeafCode(applyFailure));
    }
    for (let addressIndex = 0; addressIndex < affectedAddresses.length; addressIndex += 1) {
      const address = affectedAddresses[addressIndex];
      if (address !== undefined && !appendAffected(address)) {
        return {
          ok: false,
          failure: {
            code: "command.resource-limit-exceeded",
            limitKind: "affected-addresses",
            limit: MAX_AFFECTED_ADDRESSES,
            actual: MAX_AFFECTED_ADDRESSES + 1,
          },
        };
      }
    }
  }
  reflectApply(arraySort, affected, [
    (left: ScoreAddress, right: ScoreAddress) => {
      const leftKey = addressKey(left);
      const rightKey = addressKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    },
  ]);
  const frozenAffected = freeze(affected);
  if (
    forward.length === 0 ||
    (!options.preserveEffectiveSequence && deepEqual(candidate, document))
  ) {
    return { ok: true, document, affected: frozenAffected };
  }
  return {
    ok: true,
    document: candidate,
    forward: freezeCoreEffectSet(forward as [CoreEffect, ...CoreEffect[]]),
    inverse: freezeCoreEffectSet(inverse as [CoreEffect, ...CoreEffect[]]),
    affected: frozenAffected,
  };
}

function prepareModuleOperation(
  state: CommandRuntimeState,
  envelope: CapturedEnvelope,
  definition: CompiledDomainCommandDefinitionV1,
  contribution: CompiledDomainCommandContributionV1,
  applicationOptions = DEFAULT_MODULE_REQUEST_APPLICATION_OPTIONS,
): PrepareModuleOperationResult {
  const actualKind = targetKind(envelope.target);
  if (actualKind === undefined) {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  if (actualKind !== definition.descriptor.targetKind) {
    return { ok: false, failure: { code: "command.target-mismatch" } };
  }
  const target = decodeTarget(envelope.target, definition.descriptor.targetKind);
  if (target === undefined) {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  const binding = getDomainCommandDefinitionBinding(definition);
  if (binding === undefined) {
    return { ok: false, failure: contractFailure(contribution) };
  }
  let decodedRaw: unknown;
  try {
    decodedRaw = invoke(binding.decode, [freeze({
      target: clone(target),
      payload: clone(envelope.payload),
    })]);
  } catch {
    return { ok: false, failure: internalFailure(contribution) };
  }
  const decodedCapture = captureStrictInput(decodedRaw);
  if (decodedCapture.status !== "captured") {
    return { ok: false, failure: contractFailure(contribution) };
  }
  const invalid = readExactDataRecord(decodedCapture.value, ["status"]);
  if (invalid?.status === "invalid") {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
  const decoded = readExactDataRecord(decodedCapture.value, ["status", "command"]);
  if (decoded?.status !== "decoded") {
    return { ok: false, failure: contractFailure(contribution) };
  }
  if (!targetExists(state.document, target)) {
    return { ok: false, failure: { code: "command.target-not-found" } };
  }
  let preparedRaw: unknown;
  try {
    preparedRaw = invoke(binding.prepare, [
      callbackView(state.document, state.documentVersion, contribution),
      decoded.command,
    ]);
  } catch {
    return { ok: false, failure: internalFailure(contribution) };
  }
  const preparedCapture = captureStrictInput(preparedRaw);
  if (preparedCapture.status !== "captured") {
    return { ok: false, failure: contractFailure(contribution) };
  }
  const source = freeze({
    kind: "module" as const,
    moduleId: contribution.moduleId,
    contributionId: contribution.contributionId,
  });
  const command = freeze({
    commandVersion: 1,
    commandId: envelope.commandId,
    target,
    payload: clone(envelope.payload),
  }) as CoreCommandEnvelope;
  const noOp = readExactDataRecord(preparedCapture.value, ["status"]);
  if (noOp?.status === "no-op") {
    return {
      ok: true,
      value: {
        status: "no-op",
        command,
        source,
        document: state.document,
        affected: freeze([]),
      },
    };
  }
  const rejectedResult = readExactDataRecord(preparedCapture.value, ["status", "issues"]);
  if (rejectedResult?.status === "rejected") {
    const issues = decodeIssueArray(rejectedResult.issues, contribution);
    return issues === undefined
      ? { ok: false, failure: contractFailure(contribution) }
      : {
          ok: false,
          failure: freeze({
            code: "command.contribution-semantic-invalid" as const,
            issues,
          }),
        };
  }
  const changed = readExactDataRecord(preparedCapture.value, [
    "status",
    "effectRequests",
    "affected",
  ]);
  const requests = readDenseArray(changed?.effectRequests);
  const affectedResult = decodeIntegratedAffectedAddresses(changed?.affected);
  if (!affectedResult.ok && affectedResult.reason === "resource") {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "affected-addresses",
        limit: affectedResult.limit,
        actual: affectedResult.actual,
      },
    };
  }
  if (
    changed?.status !== "changed" ||
    requests === undefined ||
    requests.length === 0 ||
    !affectedResult.ok
  ) {
    return { ok: false, failure: contractFailure(contribution) };
  }
  const applied = applyModuleRequests(
    state.document,
    state.documentVersion,
    state.assembly,
    contribution,
    requests,
    applicationOptions,
  );
  if (!applied.ok) {
    return applied;
  }
  return {
    ok: true,
    value: applied.forward === undefined
      ? {
          status: "no-op",
          command,
          source,
          document: applied.document,
          affected: applied.affected,
        }
      : {
          status: "changed",
          command,
          source,
          document: applied.document,
          forward: applied.forward,
          inverse: applied.inverse as NonEmptyCoreEffectSet,
          affected: applied.affected,
        },
  };
}

function integratedBatchChildFailure(
  failedCommandIndex: number,
  failure: KernelCommandFailure,
): PrepareIntegratedBatchResult {
  const inner: KernelBatchChildFailure =
    failure.code === "command.batch-child-rejected"
      ? { code: "command.internal-error" }
      : (failure as KernelBatchChildFailure);
  return {
    ok: false,
    failure: freeze({
      code: "command.batch-child-rejected" as const,
      failedCommandIndex,
      failure: clone(inner),
    }),
  };
}

function capturedCommandId(value: unknown): string | undefined {
  try {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const descriptor = reflectGetOwnPropertyDescriptor(value, "commandId");
    return descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function prepareIntegratedBatch(
  state: IntegratedCommandBusPrivateState,
  command: BatchCommand,
): PrepareIntegratedBatchResult {
  if (command.target.documentId !== state.session.commandState.document.id) {
    return { ok: false, failure: { code: "command.target-not-found" } };
  }
  try {
    let candidate = cloneCoreEffectCandidate(state.session.commandState.document);
    const forward: CoreEffect[] = [];
    let inverse: CoreEffect[] = [];
    const affected: ScoreAddress[] = [];
    const seen = reflectApply(objectCreate, Object, [null]) as Record<string, true>;
    const segments: EffectiveBatchSegment[] = [];

    const appendSegment = (
      childIndex: number,
      source: BatchChildSource,
      segmentForward: NonEmptyCoreEffectSet,
      segmentInverse: NonEmptyCoreEffectSet,
      segmentAffected: readonly ScoreAddress[],
    ): KernelCommandFailure | undefined => {
      const effectBudget = checkBatchEffectBudget(
        forward.length,
        segmentForward.length,
      );
      if (!effectBudget.ok) {
        return freeze({
          code: "command.batch-child-rejected" as const,
          failedCommandIndex: childIndex,
          failure: effectBudget.failure,
        });
      }
      const affectedBudget = appendBatchAffectedWithinBudget(
        affected,
        seen,
        segmentAffected,
      );
      if (!affectedBudget.ok) {
        return freeze({
          code: "command.batch-child-rejected" as const,
          failedCommandIndex: childIndex,
          failure: affectedBudget.failure,
        });
      }
      for (let index = 0; index < segmentForward.length; index += 1) {
        const effect = segmentForward[index];
        if (effect !== undefined) {
          forward[forward.length] = effect;
        }
      }
      inverse = [
        ...segmentInverse,
        ...inverse,
      ];
      segments[segments.length] = freeze({
        childIndex,
        source: clone(source),
        forward: segmentForward,
        inverse: segmentInverse,
        affected: clone(segmentAffected),
      });
      return undefined;
    };

    for (
      let childIndex = 0;
      childIndex < command.payload.commands.length;
      childIndex += 1
    ) {
      const rawChild = command.payload.commands[childIndex];
      if (capturedCommandId(rawChild) === "core.transaction.batch") {
        return integratedBatchChildFailure(childIndex, {
          code: "command.batch-nested",
        });
      }
      const envelope = captureEnvelope(rawChild);
      if (!envelope.ok) {
        return integratedBatchChildFailure(childIndex, envelope.failure);
      }
      const coreDefinition = findCoreExecutionDefinition(
        state.session.commandState.assembly,
        envelope.value.commandId,
      );
      if (coreDefinition !== undefined) {
        const decoded = decodeCoreCommand(
          envelope.value.captured,
          state.session.commandState.assembly,
        );
        if (!decoded.ok) {
          return integratedBatchChildFailure(childIndex, decoded.failure);
        }
        const prepared = coreDefinition.prepare(candidate, decoded.value);
        if (!prepared.ok) {
          return integratedBatchChildFailure(childIndex, prepared.failure);
        }
        if (!prepared.changed) {
          continue;
        }
        const effectCount = forward.length + prepared.effects.length;
        if (effectCount > BATCH_EFFECT_LIMIT) {
          return integratedBatchChildFailure(childIndex, {
            code: "command.resource-limit-exceeded",
            limitKind: "effects",
            limit: BATCH_EFFECT_LIMIT,
            actual: effectCount,
          });
        }
        const applied = applyCoreEffectSetToCandidate(candidate, prepared.effects);
        if (!applied.ok) {
          return integratedBatchChildFailure(childIndex, applied.failure);
        }
        const aggregateFailure = appendSegment(
          childIndex,
          { kind: "core" },
          prepared.effects,
          applied.inverse,
          prepared.affected,
        );
        if (aggregateFailure !== undefined) {
          return { ok: false, failure: aggregateFailure };
        }
        continue;
      }

      const moduleCommand =
        state.assembly.catalogState.commandIndex[envelope.value.commandId];
      if (moduleCommand === undefined) {
        return integratedBatchChildFailure(childIndex, {
          code: "command.unknown-id",
        });
      }
      const contribution = contributionForCommand(state.assembly, moduleCommand);
      if (contribution === undefined) {
        return integratedBatchChildFailure(childIndex, {
          code: "command.assembly-mismatch",
        });
      }
      const prepared = prepareModuleOperation(
        { ...state.session.commandState, document: candidate },
        envelope.value,
        moduleCommand,
        contribution,
        BATCH_MODULE_REQUEST_APPLICATION_OPTIONS,
      );
      if (!prepared.ok) {
        return integratedBatchChildFailure(childIndex, prepared.failure);
      }
      candidate = prepared.value.document;
      if (
        prepared.value.status === "no-op" ||
        prepared.value.forward === undefined ||
        prepared.value.inverse === undefined
      ) {
        continue;
      }
      const aggregateFailure = appendSegment(
        childIndex,
        prepared.value.source,
        prepared.value.forward,
        prepared.value.inverse,
        prepared.value.affected,
      );
      if (aggregateFailure !== undefined) {
        return { ok: false, failure: aggregateFailure };
      }
    }

    const firstForward = forward[0];
    const firstInverse = inverse[0];
    if (firstForward === undefined || firstInverse === undefined) {
      return { ok: true, changed: false, document: candidate };
    }
    return {
      ok: true,
      changed: true,
      document: candidate,
      forward: freezeCoreEffectSet([firstForward, ...forward.slice(1)]),
      inverse: freezeCoreEffectSet([firstInverse, ...inverse.slice(1)]),
      affected: freeze(clone(affected)),
      segments: freeze(clone(segments)),
    };
  } catch {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
}

function moduleTransition(
  state: CommandRuntimeState,
  prepared: PreparedModuleOperation,
): CommandTransition | undefined {
  if (prepared.status === "no-op") {
    return {
      state,
      result: {
        status: "no-op",
        documentVersion: state.documentVersion,
        support: CORE_CLASSIFICATION_PLACEHOLDER,
        ...depths(state),
      },
    };
  }
  if (
    prepared.forward === undefined ||
    prepared.inverse === undefined ||
    !isSafeInteger(state.documentVersion) ||
    state.documentVersion >= numberMaxSafeInteger ||
    !isSafeInteger(state.nextHistorySequence) ||
    state.nextHistorySequence < 1
  ) {
    return undefined;
  }
  const entry = freeze({
    sequence: state.nextHistorySequence,
    command: prepared.command,
    forward: prepared.forward,
    inverse: prepared.inverse,
    affected: prepared.affected,
    integratedSource: prepared.source,
  }) as HistoryEntry;
  const nextState: CommandRuntimeState = {
    ...state,
    document: prepared.document,
    documentVersion: state.documentVersion + 1,
    nextHistorySequence: state.nextHistorySequence + 1,
    undoStack: (() => {
      const next = reflectApply(arraySlice, state.undoStack, []) as HistoryEntry[];
      next[next.length] = entry;
      return next;
    })(),
    redoStack: [],
  };
  return {
    state: nextState,
    result: {
      status: "committed",
      documentVersion: nextState.documentVersion,
      support: CORE_CLASSIFICATION_PLACEHOLDER,
      ...depths(nextState),
    },
    committed: {
      cause: "submit",
      command: prepared.command,
      affected: prepared.affected,
    },
  };
}

function sourceForHistoryEntry(entry: HistoryEntry | undefined) {
  return entry?.integratedSource ?? ({ kind: "core" as const });
}

function mapRejectedCore(result: Extract<CommandResult, { readonly status: "rejected" }>): KernelCommandResult {
  return freeze({
    status: "rejected" as const,
    documentVersion: result.documentVersion,
    undoDepth: result.undoDepth,
    redoDepth: result.redoDepth,
    failure: clone(result.failure),
  });
}

function successResult(
  transition: CommandTransition,
  assessment: KernelCommandAssessment,
): KernelCommandResult {
  return freeze({
    status: transition.result.status as "committed" | "no-op",
    documentVersion: transition.result.documentVersion,
    undoDepth: transition.result.undoDepth,
    redoDepth: transition.result.redoDepth,
    assessment,
  });
}

function currentDirty(session: IntegratedSessionState): boolean {
  return contentStateIdentity(session.commandState) !== session.readState.cleanStateIdentity;
}

function adoptCommitted(
  state: IntegratedCommandBusPrivateState,
  transition: CommandTransition,
  result: KernelCommandResult,
  source: KernelCommandIdentity["source"],
  availability: KernelDomainAvailabilityState,
): KernelCommandResult {
  if (transition.result.status !== "committed" || transition.committed === undefined) {
    return result;
  }
  const recorded = recordCommittedVersion(transition.state, state.session.readState);
  if (!recorded.ok) {
    return rejected(state, { code: "command.internal-error" });
  }
  const dirtyBefore = currentDirty(state.session);
  const dirtyAfter = contentStateIdentity(transition.state) !== recorded.state.cleanStateIdentity;
  const eventCount = dirtyBefore === dirtyAfter ? 1 : 2;
  const upper = state.session.lastEventSequence + eventCount;
  if (!isSafeInteger(upper)) {
    return rejected(state, { code: "event.sequence-overflow" });
  }
  const affectedEntities = source.kind === "core"
    ? deriveAffectedEntities(transition.committed)
    : transition.committed.affected;
  const events: IntegratedKernelEvent[] = [freeze({
    eventVersion: 1 as const,
    eventSequence: state.session.lastEventSequence + 1,
    eventType: "core.document.committed" as const,
    documentId: transition.state.document.id,
    documentVersion: transition.state.documentVersion,
    cause: transition.committed.cause,
    commandId: transition.committed.command.commandId,
    source: clone(source),
    affectedEntities: clone(affectedEntities),
  })];
  if (dirtyBefore !== dirtyAfter) {
    events[events.length] = freeze({
      eventVersion: 1 as const,
      eventSequence: state.session.lastEventSequence + 2,
      eventType: "core.session.dirty-state-changed" as const,
      documentId: transition.state.document.id,
      documentVersion: transition.state.documentVersion,
      cause: transition.committed.cause,
      dirty: dirtyAfter,
    });
  }
  state.session = {
    commandState: transition.state,
    readState: recorded.state,
    lastEventSequence: upper,
  };
  state.availability = availability;
  return dispatch(state, events, result);
}

function dispatch(
  state: IntegratedCommandBusPrivateState,
  events: readonly IntegratedKernelEvent[],
  result: KernelCommandResult,
): KernelCommandResult {
  if (events.length === 0) {
    return result;
  }
  state.dispatching = true;
  try {
    const handlers: Array<(event: IntegratedKernelEvent) => unknown> = [];
    for (let index = 0; index < state.subscribers.length; index += 1) {
      const handler = state.subscribers[index]?.handler;
      if (handler !== undefined) {
        handlers[handlers.length] = handler;
      }
    }
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex];
      if (event === undefined) {
        continue;
      }
      for (let handlerIndex = 0; handlerIndex < handlers.length; handlerIndex += 1) {
        const handler = handlers[handlerIndex];
        if (handler === undefined) {
          continue;
        }
        try {
          const returned = handler(event);
          if (returned !== undefined) {
            const promise = reflectApply(promiseResolve, Promise, [returned]) as Promise<unknown>;
            void reflectApply(promiseCatch, promise, [() => undefined]);
          }
        } catch {
          // Subscriber failures never affect an adopted transaction.
        }
      }
    }
  } finally {
    state.dispatching = false;
  }
  return result;
}

function submitIntegratedBatch(
  state: IntegratedCommandBusPrivateState,
  command: BatchCommand,
): KernelCommandResult {
  const prepared = prepareIntegratedBatch(state, command);
  if (!prepared.ok) {
    return rejected(state, prepared.failure);
  }
  const pipeline = runModulePipeline(
    prepared.document,
    state.session.commandState.documentVersion + (prepared.changed ? 1 : 0),
    state.assembly,
  );
  if (!pipeline.ok) {
    return rejected(state, pipeline.failure);
  }
  if (!prepared.changed) {
    return freeze({
      status: "no-op" as const,
      documentVersion: state.session.commandState.documentVersion,
      assessment: pipeline.assessment,
      ...depths(state.session.commandState),
    });
  }
  const transition = commitPreparedCommand(
    state.session.commandState,
    {
      command,
      document: prepared.document,
      forward: prepared.forward,
      inverse: prepared.inverse,
      affected: prepared.affected,
      batchSegments: prepared.segments,
      support: CORE_CLASSIFICATION_PLACEHOLDER,
    },
    { classify: () => CORE_CLASSIFICATION_PLACEHOLDER },
  );
  if (transition.result.status === "rejected") {
    return mapRejectedCore(transition.result);
  }
  const result = successResult(transition, pipeline.assessment);
  return adoptCommitted(
    state,
    transition,
    result,
    { kind: "core" },
    pipeline.availability,
  );
}

class IntegratedCommandBusImplementation implements IntegratedCommandBus {
  private constructor(
    token: typeof INTEGRATED_BUS_TOKEN,
    state: IntegratedCommandBusPrivateState,
  ) {
    if (token !== INTEGRATED_BUS_TOKEN) {
      throw new TypeError("IntegratedCommandBus cannot be constructed directly");
    }
    reflectApply(weakMapSet, integratedBusStates, [this, state]);
    reflectApply(objectFreeze, Object, [this]);
  }

  submit(input: unknown): KernelCommandResult {
    const state = this.#state();
    if (state === undefined) {
      return this.#invalidInvocation();
    }
    if (state.dispatching) {
      return rejected(state, { code: "event.reentrant-write" });
    }
    const blocked = availabilityFailure(state);
    if (blocked !== undefined) {
      return rejected(state, blocked);
    }
    if (capturedCommandId(input) === "core.transaction.batch") {
      const decodedBatch = decodeCoreCommand(
        input,
        state.session.commandState.assembly,
      );
      if (!decodedBatch.ok) {
        return rejected(state, decodedBatch.failure);
      }
      if (decodedBatch.value.commandId !== "core.transaction.batch") {
        return rejected(state, { code: "command.internal-error" });
      }
      if (!hasIntactExecutionPrimordials()) {
        return rejected(state, { code: "command.invalid-envelope" });
      }
      return submitIntegratedBatch(state, decodedBatch.value);
    }
    const envelope = captureEnvelope(input);
    if (!envelope.ok) {
      return rejected(state, envelope.failure);
    }
    if (!hasIntactExecutionPrimordials()) {
      return rejected(state, { code: "command.invalid-envelope" });
    }
    const core = findCoreExecutionDefinition(
      state.session.commandState.assembly,
      envelope.value.commandId,
    );
    let transition: CommandTransition;
    let source: { readonly kind: "core" } | {
      readonly kind: "module";
      readonly moduleId: string;
      readonly contributionId: string;
    } = { kind: "core" };
    if (core !== undefined) {
      transition = submitCommand(state.session.commandState, envelope.value.captured, {
        classify: () => CORE_CLASSIFICATION_PLACEHOLDER,
      });
    } else {
      const moduleCommand = state.assembly.catalogState.commandIndex[envelope.value.commandId];
      if (moduleCommand === undefined) {
        return rejected(state, { code: "command.unknown-id" });
      }
      const contribution = contributionForCommand(state.assembly, moduleCommand);
      if (contribution === undefined) {
        return rejected(state, { code: "command.assembly-mismatch" });
      }
      const prepared = prepareModuleOperation(
        state.session.commandState,
        envelope.value,
        moduleCommand,
        contribution,
      );
      if (!prepared.ok) {
        return rejected(state, prepared.failure);
      }
      source = prepared.value.source;
      const moduleCandidate = moduleTransition(state.session.commandState, prepared.value);
      if (moduleCandidate === undefined) {
        return rejected(state, { code: "command.internal-error" });
      }
      transition = moduleCandidate;
    }
    if (transition.result.status === "rejected") {
      return mapRejectedCore(transition.result);
    }
    const pipeline = runModulePipeline(
      transition.state.document,
      transition.state.documentVersion,
      state.assembly,
    );
    if (!pipeline.ok) {
      return rejected(state, pipeline.failure);
    }
    const result = successResult(transition, pipeline.assessment);
    if (transition.result.status === "committed") {
      return adoptCommitted(
        state,
        transition,
        result,
        source,
        pipeline.availability,
      );
    }
    return result;
  }

  undo(): KernelCommandResult {
    return this.#history("undo");
  }

  redo(): KernelCommandResult {
    return this.#history("redo");
  }

  read(): ReadResult<IntegratedKernelReadState> {
    const state = this.#state();
    if (state === undefined) {
      return freeze({
        ok: false as const,
        failure: { code: "read.invariant-violation" as const },
      });
    }
    const transition = readKernelState(
      state.session.commandState,
      state.session.readState,
    );
    state.session = {
      ...state.session,
      readState: transition.state,
    };
    return transition.result.ok
      ? freeze({
          ok: true as const,
          value: {
            ...transition.result.value,
            writeAvailability: state.availability.writeAvailability,
            validationAvailability: state.availability.validationAvailability,
          },
        })
      : transition.result;
  }

  markPersisted(input: unknown): MarkPersistedResult {
    const state = this.#state();
    if (state === undefined) {
      return freeze({
        status: "rejected" as const,
        documentVersion: 0,
        dirty: true,
        failure: { code: "checkpoint.invariant-violation" as const },
      });
    }
    if (state.dispatching) {
      return freeze({
        status: "rejected" as const,
        documentVersion: state.session.commandState.documentVersion,
        dirty: currentDirty(state.session),
        failure: { code: "event.reentrant-write" as const },
      });
    }
    const checkpoint = markPersistedCheckpoint(
      state.session.commandState,
      state.session.readState,
      input,
    );
    if (checkpoint.result.status !== "updated") {
      return checkpoint.result;
    }
    const candidate = buildCheckpointEvents({
      lastEventSequence: state.session.lastEventSequence,
      documentId: state.session.commandState.document.id,
      documentVersion: state.session.commandState.documentVersion,
      dirtyBefore: currentDirty(state.session),
      dirtyAfter:
        contentStateIdentity(state.session.commandState) !==
        checkpoint.state.cleanStateIdentity,
    });
    if (!candidate.ok) {
      return freeze({
        status: "rejected" as const,
        documentVersion: state.session.commandState.documentVersion,
        dirty: currentDirty(state.session),
        failure: {
          code: candidate.reason === "overflow"
            ? "event.sequence-overflow" as const
            : "checkpoint.invariant-violation" as const,
        },
      });
    }
    state.session = {
      ...state.session,
      readState: checkpoint.state,
      lastEventSequence: candidate.lastEventSequence,
    };
    dispatch(
      state,
      candidate.events as readonly IntegratedKernelEvent[],
      freeze({
        status: "no-op" as const,
        documentVersion: state.session.commandState.documentVersion,
        assessment: {
          core: CORE_CLASSIFICATION_PLACEHOLDER,
          modules: [],
        },
        ...depths(state.session.commandState),
      }),
    );
    return checkpoint.result;
  }

  subscribe(handler: unknown): EventSubscriptionResult {
    const state = this.#state();
    if (state === undefined || typeof handler !== "function") {
      return freeze({
        status: "rejected" as const,
        failure: { code: "event.invalid-handler" as const },
      });
    }
    const record: SubscriberRecord = {
      handler: handler as SubscriberRecord["handler"],
    };
    reflectApply(arrayPush, state.subscribers, [record]);
    let active = true;
    return freeze({
      status: "subscribed" as const,
      unsubscribe: () => {
        if (!active) {
          return;
        }
        active = false;
        for (let index = 0; index < state.subscribers.length; index += 1) {
          if (state.subscribers[index] === record) {
            reflectApply(arraySplice, state.subscribers, [index, 1]);
            return;
          }
        }
      },
    });
  }

  #history(kind: "undo" | "redo"): KernelCommandResult {
    const state = this.#state();
    if (state === undefined) {
      return this.#invalidInvocation();
    }
    if (state.dispatching) {
      return rejected(state, { code: "event.reentrant-write" });
    }
    const blocked = availabilityFailure(state);
    if (blocked !== undefined) {
      return rejected(state, blocked);
    }
    const stack = kind === "undo"
      ? state.session.commandState.undoStack
      : state.session.commandState.redoStack;
    const entry = stack[stack.length - 1];
    const transition = kind === "undo"
      ? undoCommand(state.session.commandState, {
          classify: () => CORE_CLASSIFICATION_PLACEHOLDER,
        })
      : redoCommand(state.session.commandState, {
          classify: () => CORE_CLASSIFICATION_PLACEHOLDER,
        });
    if (transition.result.status === "rejected") {
      return mapRejectedCore(transition.result);
    }
    const pipeline = runModulePipeline(
      transition.state.document,
      transition.state.documentVersion,
      state.assembly,
    );
    if (!pipeline.ok) {
      return rejected(state, pipeline.failure);
    }
    const result = successResult(transition, pipeline.assessment);
    return adoptCommitted(
      state,
      transition,
      result,
      sourceForHistoryEntry(entry),
      pipeline.availability,
    );
  }

  #state(): IntegratedCommandBusPrivateState | undefined {
    return reflectApply(weakMapGet, integratedBusStates, [this]) as
      | IntegratedCommandBusPrivateState
      | undefined;
  }

  #invalidInvocation(): KernelCommandResult {
    return freeze({
      status: "rejected" as const,
      documentVersion: 0,
      undoDepth: 0,
      redoDepth: 0,
      failure: { code: "command.assembly-mismatch" as const },
    });
  }
}

function constructIntegratedCommandBus(
  state: IntegratedCommandBusPrivateState,
): IntegratedCommandBus {
  return reflectConstruct(IntegratedCommandBusImplementation, [
    INTEGRATED_BUS_TOKEN,
    state,
  ]) as IntegratedCommandBus;
}

export function createIntegratedCommandBus(
  initialDocument: ScoreDocument,
  catalog: KernelIntegratedCatalog,
  explicitInventory: unknown,
  hasExplicitInventory: boolean,
): IntegratedCommandBusCreationResult {
  const native = nativeIntegratedFactoryV2();
  if (native !== undefined) return native(initialDocument, catalog, explicitInventory, hasExplicitInventory);
  const capturedDocument = captureStrictInput(initialDocument);
  if (!hasIntactExecutionPrimordials()) {
    return freeze({
      ok: false,
      failure: { code: "command.invalid-initial-document" },
    });
  }
  const decodedDocument = capturedDocument.status === "captured"
    ? decodeScoreDocument(capturedDocument.value)
    : undefined;
  if (decodedDocument === undefined || !decodedDocument.ok) {
    return freeze({
      ok: false,
      failure: { code: "command.invalid-initial-document" },
    });
  }
  const created = createCommandRuntime(decodedDocument.value);
  if (!created.ok) {
    return created;
  }
  const assembly = hasExplicitInventory
    ? resolveKernelIntegratedRuntimeAssembly(catalog, explicitInventory)
    : resolveKernelIntegratedRuntimeAssembly(catalog);
  if (!assembly.ok) {
    const failure: KernelCommandBusCreationFailure = assembly.reason === "inventory"
      ? { code: "command.invalid-requirement-inventory" }
      : { code: "command.assembly-mismatch" };
    return freeze({ ok: false, failure });
  }
  if (!hasIntactExecutionPrimordials()) {
    return freeze({
      ok: false,
      failure: { code: "command.invalid-requirement-inventory" },
    });
  }
  const pipeline = runModulePipeline(
    created.state.document,
    created.state.documentVersion,
    assembly.state,
  );
  if (!pipeline.ok) {
    return pipeline.failure.code === "command.semantic-invalid"
      ? freeze({
          ok: false,
          failure: {
            code: "command.invalid-initial-document" as const,
            diagnostics: clone(pipeline.failure.diagnostics),
          },
        })
      : freeze({ ok: false, failure: pipeline.failure });
  }
  return freeze({
    ok: true,
    value: constructIntegratedCommandBus({
      session: {
        commandState: created.state,
        readState: createReadSessionState(),
        lastEventSequence: 0,
      },
      assembly: assembly.state,
      availability: pipeline.availability,
      subscribers: [],
      dispatching: false,
    }),
  });
}

export function getIntegratedCommandBusAssemblyIdentity(
  bus: IntegratedCommandBus,
): object | undefined {
  const state = reflectApply(weakMapGet, integratedBusStates, [bus]) as
    | IntegratedCommandBusPrivateState
    | undefined;
  return state?.assembly.assemblyIdentity ?? nativeIntegratedAssemblyV2(bus)?.assemblyIdentity;
}

export function isIntegratedCommandBus(
  value: unknown,
): value is IntegratedCommandBus {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }
  return getIntegratedCommandBusAssemblyIdentity(value as IntegratedCommandBus) !== undefined;
}

export function getIntegratedCommandBusRuntimeAssembly(
  bus: IntegratedCommandBus,
): KernelIntegratedRuntimeAssemblyState | undefined {
  const state = reflectApply(weakMapGet, integratedBusStates, [bus]) as
    | IntegratedCommandBusPrivateState
    | undefined;
  return state?.assembly ?? nativeIntegratedAssemblyV2(bus);
}
