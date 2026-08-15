import { createHash } from "node:crypto";

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

function ownDataEntries(value: object): readonly [string, unknown][] {
  const keys = Object.keys(value).sort();
  return keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`canonical JSON requires data property: ${key}`);
    }
    return [key, descriptor.value];
  });
}

export function toJsonData(value: unknown): JsonData {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonData(item));
  if (typeof value !== "object") throw new TypeError(`canonical JSON rejects ${typeof value}`);
  const result: Record<string, JsonData> = {};
  for (const [key, item] of ownDataEntries(value)) result[key] = toJsonData(item);
  return result;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toJsonData(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJsonl(rows: readonly unknown[]): string {
  return rows.map((row) => `${canonicalJson(row)}\n`).join("");
}

function expectRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  const actual = Object.keys(value).sort();
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
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function expectArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function decodeState(value: unknown, label: string): OracleStateProjectionV1 {
  const record = expectRecord(value, ["documentSha256", "documentVersion", "history", "dirty", "eventSequence"], label);
  const history = expectRecord(record.history, ["undoDepth", "redoDepth"], `${label}.history`);
  return {
    documentSha256: expectString(record.documentSha256, `${label}.documentSha256`),
    documentVersion: expectNumber(record.documentVersion, `${label}.documentVersion`),
    history: {
      undoDepth: expectNumber(history.undoDepth, `${label}.history.undoDepth`),
      redoDepth: expectNumber(history.redoDepth, `${label}.history.redoDepth`),
    },
    dirty: expectBoolean(record.dirty, `${label}.dirty`),
    eventSequence: expectNumber(record.eventSequence, `${label}.eventSequence`),
  };
}

function decodeOperation(value: unknown, index: number): OracleOperationV1 {
  const record = value === null || typeof value !== "object" || Array.isArray(value)
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
  return toJsonData(record) as OracleOperationV1;
}

function decodeObservation(value: unknown, index: number): OracleObservationV1 {
  const record = expectRecord(value, ["observationVersion", "operationIndex", "result", "state", "publishedEvents", "callbackTrace"], `observations[${index}]`);
  if (record.observationVersion !== 1 || record.operationIndex !== index) {
    throw new TypeError(`observations[${index}] has invalid version or index`);
  }
  return {
    observationVersion: 1,
    operationIndex: index,
    result: toJsonData(record.result),
    state: decodeState(record.state, `observations[${index}].state`),
    publishedEvents: expectArray(record.publishedEvents, `observations[${index}].publishedEvents`).map(toJsonData),
    callbackTrace: expectArray(record.callbackTrace, `observations[${index}].callbackTrace`).map((entry, traceIndex) => expectString(entry, `observations[${index}].callbackTrace[${traceIndex}]`)),
  };
}

export function decodeOracleScenario(value: unknown): RustMigrationOracleScenarioV1 {
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
  const operations = expectArray(record.operations, "scenario.operations").map(decodeOperation);
  const observations = expectArray(record.observations, "scenario.observations").map(decodeObservation);
  if (operations.length !== observations.length) throw new TypeError("scenario operation/observation count mismatch");
  const inverse = record.inverseProof;
  let inverseProof: RustMigrationOracleScenarioV1["inverseProof"];
  if (inverse !== null && typeof inverse === "object" && !Array.isArray(inverse) && (inverse as { kind?: unknown }).kind === "not-applicable") {
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
  return {
    schemaVersion: 1,
    scenarioId: expectString(record.scenarioId, "scenario.scenarioId"),
    scenarioClass,
    coveredCommandIds: expectArray(record.coveredCommandIds, "scenario.coveredCommandIds").map((entry, index) => expectString(entry, `scenario.coveredCommandIds[${index}]`)),
    assemblyKind,
    sourceAuthority: { file: expectString(sourceAuthority.file, "scenario.sourceAuthority.file"), testTitle: expectString(sourceAuthority.testTitle, "scenario.sourceAuthority.testTitle") },
    initialDocument: toJsonData(record.initialDocument),
    initialState: decodeState(record.initialState, "scenario.initialState"),
    operations,
    observations,
    finalDocument: toJsonData(record.finalDocument),
    finalState: decodeState(record.finalState, "scenario.finalState"),
    inverseProof,
  };
}

export function decodeOracleJsonl(text: string): readonly RustMigrationOracleScenarioV1[] {
  if (!text.endsWith("\n")) throw new TypeError("oracle JSONL requires final LF");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) throw new TypeError("oracle JSONL has empty rows");
  return lines.map((line, index) => {
    try { return decodeOracleScenario(JSON.parse(line)); }
    catch (error) { throw new TypeError(`oracle row ${index}: ${error instanceof Error ? error.message : "invalid"}`); }
  });
}

export function decodeOracleManifest(value: unknown): RustMigrationOracleManifestV1 {
  const record = expectRecord(value, [
    "schemaVersion", "baselineCommit", "persistedSchema", "applicationRuntimeExports", "moduleSdkRuntimeExports",
    "moduleSdkTypeExports", "contributionAbiFields", "commandIds", "factoryModes", "publicContractFamilies",
    "fixtureContracts", "scenarioCount", "scenarioIds", "scenarioHashes", "scenariosFileSha256",
    "qualificationV2ContractSha256", "scenarioSpecification", "sdkSurfaceSpecification",
  ], "manifest");
  if (record.schemaVersion !== 1) throw new TypeError("manifest.schemaVersion must be 1");
  const stringArray = (entry: unknown, label: string): readonly string[] => expectArray(entry, label).map((item, index) => expectString(item, `${label}[${index}]`));
  const scenarioIds = stringArray(record.scenarioIds, "manifest.scenarioIds");
  if (new Set(scenarioIds).size !== scenarioIds.length) throw new TypeError("manifest.scenarioIds must be unique");
  const hashMap = expectRecord(record.scenarioHashes, scenarioIds, "manifest.scenarioHashes");
  const spec = (entry: unknown, label: string) => {
    const parsed = expectRecord(entry, ["file", "sha256"], label);
    return { file: expectString(parsed.file, `${label}.file`), sha256: expectString(parsed.sha256, `${label}.sha256`) };
  };
  return {
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
    fixtureContracts: expectArray(record.fixtureContracts, "manifest.fixtureContracts").map(toJsonData),
    scenarioCount: expectNumber(record.scenarioCount, "manifest.scenarioCount"),
    scenarioIds,
    scenarioHashes: Object.fromEntries(Object.entries(hashMap).map(([key, hash]) => [key, expectString(hash, `manifest.scenarioHashes.${key}`)])),
    scenariosFileSha256: expectString(record.scenariosFileSha256, "manifest.scenariosFileSha256"),
    qualificationV2ContractSha256: expectString(record.qualificationV2ContractSha256, "manifest.qualificationV2ContractSha256"),
    scenarioSpecification: spec(record.scenarioSpecification, "manifest.scenarioSpecification"),
    sdkSurfaceSpecification: spec(record.sdkSurfaceSpecification, "manifest.sdkSurfaceSpecification"),
  };
}

export function assertExactJsonShape(actual: unknown, expected: JsonData, label = "value"): void {
  if (expected === null || typeof expected === "string" || typeof expected === "number" || typeof expected === "boolean") {
    if (actual !== expected) throw new TypeError(`${label} differs`);
    return;
  }
  if (Array.isArray(expected)) {
    const actualArray = expectArray(actual, label);
    if (actualArray.length !== expected.length) throw new TypeError(`${label} length differs`);
    expected.forEach((item, index) => assertExactJsonShape(actualArray[index], item, `${label}[${index}]`));
    return;
  }
  const actualRecord = expectRecord(actual, Object.keys(expected), label);
  for (const [key, value] of Object.entries(expected)) assertExactJsonShape(actualRecord[key], value, `${label}.${key}`);
}
