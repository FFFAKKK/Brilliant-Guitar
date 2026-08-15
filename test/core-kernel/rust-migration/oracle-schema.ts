import { createHash } from "node:crypto";

const PRIMORDIAL_JSON_PARSE = JSON.parse;
const PRIMORDIAL_ARRAY_IS_ARRAY = Array.isArray;
const PRIMORDIAL_OBJECT_ENTRIES = Object.entries;
const PRIMORDIAL_OBJECT_FREEZE = Object.freeze;
const PRIMORDIAL_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PRIMORDIAL_OBJECT_KEYS = Object.keys;
const PRIMORDIAL_NUMBER_IS_FINITE = Number.isFinite;

export type JsonScalar = null | boolean | number | string;
export type JsonData = JsonScalar | readonly JsonData[] | { readonly [key: string]: JsonData };

export interface OracleStateProjectionV1 {
  readonly documentSha256: string;
  readonly documentVersion: number;
  readonly history: { readonly undoDepth: number; readonly redoDepth: number };
  readonly dirty: boolean;
  readonly eventSequence: number;
}

export interface OracleOperationV1 {
  readonly operationVersion: 1;
  readonly operationIndex: number;
  readonly kind: string;
  readonly [key: string]: JsonData;
}

export interface OracleObservationV1 {
  readonly observationVersion: 1;
  readonly operationIndex: number;
  readonly result: JsonData;
  readonly state: OracleStateProjectionV1;
  readonly publishedEvents: readonly JsonData[];
  readonly callbackTrace: readonly string[];
}

export interface RustMigrationOracleScenarioV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioClass: "accepted-command" | "rejected-command" | "cross-cutting";
  readonly coveredCommandIds: readonly string[];
  readonly assemblyKind: "core-only" | "integrated";
  readonly sourceAuthority: { readonly file: string; readonly testTitle: string };
  readonly initialDocument: JsonData;
  readonly initialState: OracleStateProjectionV1;
  readonly operations: readonly OracleOperationV1[];
  readonly observations: readonly OracleObservationV1[];
  readonly finalDocument: JsonData;
  readonly finalState: OracleStateProjectionV1;
  readonly inverseProof:
    | { readonly kind: "not-applicable" }
    | {
      readonly kind: "undo-redo";
      readonly initialDocumentSha256: string;
      readonly afterSubmitDocumentSha256: string;
      readonly afterUndoDocumentSha256: string;
      readonly afterRedoDocumentSha256: string;
    };
}

export interface RustMigrationOracleManifestV1 {
  readonly schemaVersion: 1;
  readonly baselineCommit: string;
  readonly persistedSchema: string;
  readonly applicationRuntimeExports: readonly string[];
  readonly moduleSdkRuntimeExports: readonly string[];
  readonly moduleSdkTypeExports: readonly string[];
  readonly contributionAbiFields: readonly string[];
  readonly commandIds: readonly string[];
  readonly factoryModes: readonly string[];
  readonly publicContractFamilies: readonly string[];
  readonly fixtureContracts: readonly JsonData[];
  readonly scenarioCount: number;
  readonly scenarioIds: readonly string[];
  readonly scenarioHashes: Readonly<Record<string, string>>;
  readonly scenariosFileSha256: string;
  readonly qualificationV2ContractSha256: string;
  readonly scenarioSpecification: { readonly file: string; readonly sha256: string };
  readonly sdkSurfaceSpecification: { readonly file: string; readonly sha256: string };
}

function ownDataEntries(value: object, label: string): readonly [string, unknown][] {
  const keys = PRIMORDIAL_OBJECT_KEYS(value).sort();
  const entries: [string, unknown][] = [];
  for (const key of keys) {
    const descriptor = PRIMORDIAL_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${label} requires data property: ${key}`);
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function copyDenseArray(value: readonly unknown[], label: string): readonly JsonData[] {
  const lengthDescriptor = PRIMORDIAL_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || !PRIMORDIAL_NUMBER_IS_FINITE(lengthDescriptor.value)) {
    throw new TypeError(`${label} requires a finite own length`);
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0 || PRIMORDIAL_OBJECT_KEYS(value).length !== length) {
    throw new TypeError(`${label} rejects sparse or extra array properties`);
  }
  const result: JsonData[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = PRIMORDIAL_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${label} rejects sparse or accessor array entries`);
    }
    result.push(toJsonData(descriptor.value, `${label}[${index}]`));
  }
  return PRIMORDIAL_OBJECT_FREEZE(result);
}

export function toJsonData(value: unknown, label = "JSON data"): JsonData {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!PRIMORDIAL_NUMBER_IS_FINITE(value)) throw new TypeError(`${label} rejects non-finite numbers`);
    return value;
  }
  if (PRIMORDIAL_ARRAY_IS_ARRAY(value)) return copyDenseArray(value, label);
  if (typeof value !== "object") throw new TypeError(`${label} rejects ${typeof value}`);
  const result: Record<string, JsonData> = {};
  for (const [key, item] of ownDataEntries(value, label)) result[key] = toJsonData(item, `${label}.${key}`);
  return PRIMORDIAL_OBJECT_FREEZE(result);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toJsonData(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJsonl(rows: readonly unknown[]): string {
  let text = "";
  for (let index = 0; index < rows.length; index += 1) text += `${canonicalJson(rows[index])}\n`;
  return text;
}

function parseRawJsonText(input: unknown, label: string): unknown {
  if (typeof input !== "string") throw new TypeError(`${label} must be raw UTF-8 JSON text`);
  try {
    return PRIMORDIAL_JSON_PARSE(input);
  } catch {
    throw new TypeError(`${label} is not valid JSON text`);
  }
}

function expectRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || PRIMORDIAL_ARRAY_IS_ARRAY(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  const actual = PRIMORDIAL_OBJECT_KEYS(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has extra or missing fields`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !PRIMORDIAL_NUMBER_IS_FINITE(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function expectArray(value: unknown, label: string): readonly unknown[] {
  if (!PRIMORDIAL_ARRAY_IS_ARRAY(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  const parsed = expectArray(value, label);
  const result: string[] = [];
  for (let index = 0; index < parsed.length; index += 1) result.push(expectString(parsed[index], `${label}[${index}]`));
  return PRIMORDIAL_OBJECT_FREEZE(result);
}

function jsonArray(value: unknown, label: string): readonly JsonData[] {
  const parsed = expectArray(value, label);
  const result: JsonData[] = [];
  for (let index = 0; index < parsed.length; index += 1) result.push(toJsonData(parsed[index], `${label}[${index}]`));
  return PRIMORDIAL_OBJECT_FREEZE(result);
}

function decodeState(value: unknown, label: string): OracleStateProjectionV1 {
  const record = expectRecord(value, ["documentSha256", "documentVersion", "history", "dirty", "eventSequence"], label);
  const history = expectRecord(record.history, ["undoDepth", "redoDepth"], `${label}.history`);
  return toJsonData({
    documentSha256: expectString(record.documentSha256, `${label}.documentSha256`),
    documentVersion: expectNumber(record.documentVersion, `${label}.documentVersion`),
    history: {
      undoDepth: expectNumber(history.undoDepth, `${label}.history.undoDepth`),
      redoDepth: expectNumber(history.redoDepth, `${label}.history.redoDepth`),
    },
    dirty: expectBoolean(record.dirty, `${label}.dirty`),
    eventSequence: expectNumber(record.eventSequence, `${label}.eventSequence`),
  }, label) as unknown as OracleStateProjectionV1;
}

function decodeOperation(value: unknown, index: number): OracleOperationV1 {
  const record = value === null || typeof value !== "object" || PRIMORDIAL_ARRAY_IS_ARRAY(value)
    ? undefined
    : value as Record<string, unknown>;
  if (record === undefined) throw new TypeError(`operations[${index}] must be a record`);
  const kind = expectString(record.kind, `operations[${index}].kind`);
  const base = ["operationVersion", "operationIndex", "kind"];
  const keysByKind: Readonly<Record<string, readonly string[]>> = {
    submit: [...base, "input"], undo: base, redo: base,
    "mark-persisted": [...base, "input"], read: [...base, "projection"],
    replay: [...base, "replayKind", "initialDocument", "commands", "assemblyRef"],
    "migrate-kernel-extension": [...base, "inputDocument", "request", "assemblyRef"],
    "create-gateway": [...base, "registryAssemblyRef", "busAssemblyRef", "moduleId"],
    subscribe: [...base, "subscriptionId", "behavior"],
    unsubscribe: [...base, "subscriptionId"],
  };
  const expected = keysByKind[kind];
  if (expected === undefined) throw new TypeError(`operations[${index}] has unknown kind`);
  expectRecord(record, expected, `operations[${index}]`);
  if (record.operationVersion !== 1 || record.operationIndex !== index) {
    throw new TypeError(`operations[${index}] has invalid version or index`);
  }
  return toJsonData(record, `operations[${index}]`) as OracleOperationV1;
}

function decodeObservation(value: unknown, index: number): OracleObservationV1 {
  const record = expectRecord(value, ["observationVersion", "operationIndex", "result", "state", "publishedEvents", "callbackTrace"], `observations[${index}]`);
  if (record.observationVersion !== 1 || record.operationIndex !== index) {
    throw new TypeError(`observations[${index}] has invalid version or index`);
  }
  return toJsonData({
    observationVersion: 1,
    operationIndex: index,
    result: toJsonData(record.result, `observations[${index}].result`),
    state: decodeState(record.state, `observations[${index}].state`),
    publishedEvents: jsonArray(record.publishedEvents, `observations[${index}].publishedEvents`),
    callbackTrace: stringArray(record.callbackTrace, `observations[${index}].callbackTrace`),
  }, `observations[${index}]`) as unknown as OracleObservationV1;
}

function decodeOracleScenarioParsed(value: unknown): RustMigrationOracleScenarioV1 {
  const record = expectRecord(value, [
    "schemaVersion", "scenarioId", "scenarioClass", "coveredCommandIds", "assemblyKind", "sourceAuthority",
    "initialDocument", "initialState", "operations", "observations", "finalDocument", "finalState", "inverseProof",
  ], "scenario");
  if (record.schemaVersion !== 1) throw new TypeError("scenario.schemaVersion must be 1");
  const scenarioClass = expectString(record.scenarioClass, "scenario.scenarioClass");
  if (scenarioClass !== "accepted-command" && scenarioClass !== "rejected-command" && scenarioClass !== "cross-cutting") throw new TypeError("scenario.scenarioClass invalid");
  const assemblyKind = expectString(record.assemblyKind, "scenario.assemblyKind");
  if (assemblyKind !== "core-only" && assemblyKind !== "integrated") throw new TypeError("scenario.assemblyKind invalid");
  const sourceAuthority = expectRecord(record.sourceAuthority, ["file", "testTitle"], "scenario.sourceAuthority");
  const rawOperations = expectArray(record.operations, "scenario.operations");
  const rawObservations = expectArray(record.observations, "scenario.observations");
  if (rawOperations.length !== rawObservations.length) throw new TypeError("scenario operation/observation count mismatch");
  const operations: OracleOperationV1[] = [];
  const observations: OracleObservationV1[] = [];
  for (let index = 0; index < rawOperations.length; index += 1) {
    operations.push(decodeOperation(rawOperations[index], index));
    observations.push(decodeObservation(rawObservations[index], index));
  }
  const inverse = record.inverseProof;
  let inverseProof: RustMigrationOracleScenarioV1["inverseProof"];
  if (inverse !== null && typeof inverse === "object" && !PRIMORDIAL_ARRAY_IS_ARRAY(inverse) && (inverse as { kind?: unknown }).kind === "not-applicable") {
    expectRecord(inverse, ["kind"], "scenario.inverseProof");
    inverseProof = { kind: "not-applicable" };
  } else {
    const proof = expectRecord(inverse, ["kind", "initialDocumentSha256", "afterSubmitDocumentSha256", "afterUndoDocumentSha256", "afterRedoDocumentSha256"], "scenario.inverseProof");
    if (proof.kind !== "undo-redo") throw new TypeError("scenario.inverseProof.kind invalid");
    inverseProof = {
      kind: "undo-redo",
      initialDocumentSha256: expectString(proof.initialDocumentSha256, "scenario.inverseProof.initialDocumentSha256"),
      afterSubmitDocumentSha256: expectString(proof.afterSubmitDocumentSha256, "scenario.inverseProof.afterSubmitDocumentSha256"),
      afterUndoDocumentSha256: expectString(proof.afterUndoDocumentSha256, "scenario.inverseProof.afterUndoDocumentSha256"),
      afterRedoDocumentSha256: expectString(proof.afterRedoDocumentSha256, "scenario.inverseProof.afterRedoDocumentSha256"),
    };
  }
  return toJsonData({
    schemaVersion: 1,
    scenarioId: expectString(record.scenarioId, "scenario.scenarioId"),
    scenarioClass,
    coveredCommandIds: stringArray(record.coveredCommandIds, "scenario.coveredCommandIds"),
    assemblyKind,
    sourceAuthority: {
      file: expectString(sourceAuthority.file, "scenario.sourceAuthority.file"),
      testTitle: expectString(sourceAuthority.testTitle, "scenario.sourceAuthority.testTitle"),
    },
    initialDocument: toJsonData(record.initialDocument, "scenario.initialDocument"),
    initialState: decodeState(record.initialState, "scenario.initialState"),
    operations,
    observations,
    finalDocument: toJsonData(record.finalDocument, "scenario.finalDocument"),
    finalState: decodeState(record.finalState, "scenario.finalState"),
    inverseProof,
  }, "scenario") as unknown as RustMigrationOracleScenarioV1;
}

export function decodeOracleJsonlText(input: unknown): readonly RustMigrationOracleScenarioV1[] {
  if (typeof input !== "string") throw new TypeError("oracle JSONL must be raw UTF-8 JSON text");
  if (!input.endsWith("\n")) throw new TypeError("oracle JSONL requires final LF");
  const lines = input.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) throw new TypeError("oracle JSONL has empty rows");
  const scenarios: RustMigrationOracleScenarioV1[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    try {
      scenarios.push(decodeOracleScenarioParsed(parseRawJsonText(line, `oracle row ${index}`)));
    } catch (error) {
      throw new TypeError(`oracle row ${index}: ${error instanceof Error ? error.message : "invalid"}`);
    }
  }
  return toJsonData(scenarios, "oracle JSONL") as unknown as readonly RustMigrationOracleScenarioV1[];
}

function decodeOracleManifestParsed(value: unknown): RustMigrationOracleManifestV1 {
  const record = expectRecord(value, [
    "schemaVersion", "baselineCommit", "persistedSchema", "applicationRuntimeExports", "moduleSdkRuntimeExports",
    "moduleSdkTypeExports", "contributionAbiFields", "commandIds", "factoryModes", "publicContractFamilies",
    "fixtureContracts", "scenarioCount", "scenarioIds", "scenarioHashes", "scenariosFileSha256",
    "qualificationV2ContractSha256", "scenarioSpecification", "sdkSurfaceSpecification",
  ], "manifest");
  if (record.schemaVersion !== 1) throw new TypeError("manifest.schemaVersion must be 1");
  const scenarioIds = stringArray(record.scenarioIds, "manifest.scenarioIds");
  if (new Set(scenarioIds).size !== scenarioIds.length) throw new TypeError("manifest.scenarioIds must be unique");
  const hashMap = expectRecord(record.scenarioHashes, scenarioIds, "manifest.scenarioHashes");
  const scenarioHashes: Record<string, string> = {};
  for (const [key, hash] of PRIMORDIAL_OBJECT_ENTRIES(hashMap)) scenarioHashes[key] = expectString(hash, `manifest.scenarioHashes.${key}`);
  const specification = (entry: unknown, label: string) => {
    const parsed = expectRecord(entry, ["file", "sha256"], label);
    return {
      file: expectString(parsed.file, `${label}.file`),
      sha256: expectString(parsed.sha256, `${label}.sha256`),
    };
  };
  return toJsonData({
    schemaVersion: 1,
    baselineCommit: expectString(record.baselineCommit, "manifest.baselineCommit"),
    persistedSchema: expectString(record.persistedSchema, "manifest.persistedSchema"),
    applicationRuntimeExports: stringArray(record.applicationRuntimeExports, "manifest.applicationRuntimeExports"),
    moduleSdkRuntimeExports: stringArray(record.moduleSdkRuntimeExports, "manifest.moduleSdkRuntimeExports"),
    moduleSdkTypeExports: stringArray(record.moduleSdkTypeExports, "manifest.moduleSdkTypeExports"),
    contributionAbiFields: stringArray(record.contributionAbiFields, "manifest.contributionAbiFields"),
    commandIds: stringArray(record.commandIds, "manifest.commandIds"),
    factoryModes: stringArray(record.factoryModes, "manifest.factoryModes"),
    publicContractFamilies: stringArray(record.publicContractFamilies, "manifest.publicContractFamilies"),
    fixtureContracts: jsonArray(record.fixtureContracts, "manifest.fixtureContracts"),
    scenarioCount: expectNumber(record.scenarioCount, "manifest.scenarioCount"),
    scenarioIds,
    scenarioHashes,
    scenariosFileSha256: expectString(record.scenariosFileSha256, "manifest.scenariosFileSha256"),
    qualificationV2ContractSha256: expectString(record.qualificationV2ContractSha256, "manifest.qualificationV2ContractSha256"),
    scenarioSpecification: specification(record.scenarioSpecification, "manifest.scenarioSpecification"),
    sdkSurfaceSpecification: specification(record.sdkSurfaceSpecification, "manifest.sdkSurfaceSpecification"),
  }, "manifest") as unknown as RustMigrationOracleManifestV1;
}

export function decodeOracleManifestText(input: unknown): RustMigrationOracleManifestV1 {
  return decodeOracleManifestParsed(parseRawJsonText(input, "manifest"));
}

function assertExactJsonShapeParsed(actual: unknown, expected: JsonData, label: string): void {
  if (expected === null || typeof expected === "string" || typeof expected === "number" || typeof expected === "boolean") {
    if (actual !== expected) throw new TypeError(`${label} differs`);
    return;
  }
  if (PRIMORDIAL_ARRAY_IS_ARRAY(expected)) {
    const actualArray = expectArray(actual, label);
    if (actualArray.length !== expected.length) throw new TypeError(`${label} length differs`);
    for (let index = 0; index < expected.length; index += 1) {
      assertExactJsonShapeParsed(actualArray[index], expected[index] as JsonData, `${label}[${index}]`);
    }
    return;
  }
  const actualRecord = expectRecord(actual, PRIMORDIAL_OBJECT_KEYS(expected), label);
  for (const [key, value] of PRIMORDIAL_OBJECT_ENTRIES(expected)) {
    assertExactJsonShapeParsed(actualRecord[key], value, `${label}.${key}`);
  }
}

export function decodeExactJsonText(input: unknown, expected: JsonData, label = "value"): JsonData {
  const parsed = parseRawJsonText(input, label);
  assertExactJsonShapeParsed(parsed, expected, label);
  return toJsonData(parsed, label);
}
