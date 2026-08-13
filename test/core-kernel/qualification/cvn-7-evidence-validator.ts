import { createHash } from "node:crypto";

import {
  CVN7_EVIDENCE_SCHEMA_VERSION,
  CVN7_MEASURED_COUNT,
  CVN7_OPERATION_BUDGETS_MS,
  CVN7_OPERATIONS,
  CVN7_PORTABLE_RATIO_LIMIT,
  CVN7_QUALIFICATION_BASE,
  CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES,
  CVN7_STRESS_RSS_LIMIT_BYTES,
  CVN7_TASK_ID,
  CVN7_WARMUP_COUNT,
  type QualificationBenchmarkOperationV1,
  type QualificationDecision,
  type QualificationOperation,
} from "./cvn-7-qualification-contracts";
import { CVN7_CONTRACT_IDS } from "./cvn-7-contract-trace";

export type QualificationEvidenceValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

export const CVN7_EVIDENCE_ARTIFACT_KEYS = Object.freeze([
  "environment",
  "baselineBuildManifest",
  "candidateBuildManifest",
  "contractTrace",
  "functionalMatrix",
  "representativeFixture",
  "portableAb",
  "referenceWindows",
  "stress",
  "summary",
] as const);

type EvidenceArtifactKey = (typeof CVN7_EVIDENCE_ARTIFACT_KEYS)[number];
type DataRecord = Readonly<Record<string, unknown>>;

export interface QualificationGateDecisionInput {
  readonly functionalPassed: boolean;
  readonly deterministicPassed: boolean;
  readonly resourcePassed: boolean;
  readonly portablePassed: boolean;
  readonly environmentMatch: boolean;
  readonly referencePassed: boolean;
}

export function classifyQualificationGates(
  gates: QualificationGateDecisionInput,
): Exclude<QualificationDecision, "QUALIFIED" | "EVIDENCE_INVALID" | "REFERENCE_GATE_PASSED_PENDING_STRESS"> {
  return !gates.functionalPassed
    ? "NOT_QUALIFIED_FUNCTIONAL"
    : !gates.deterministicPassed
      ? "NOT_QUALIFIED_DETERMINISM"
      : !gates.resourcePassed
        ? "NOT_QUALIFIED_RESOURCE"
        : !gates.portablePassed
          ? "NOT_QUALIFIED_PORTABLE_PERFORMANCE"
          : !gates.environmentMatch
            ? "REFERENCE_ENVIRONMENT_PENDING"
            : !gates.referencePassed
              ? "NOT_QUALIFIED_REFERENCE_PERFORMANCE"
              : "BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW";
}

function invalid(errors: readonly string[]): QualificationEvidenceValidationResult {
  return Object.freeze({ ok: false as const, errors: Object.freeze([...errors]) });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: string[],
): DataRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path}: expected object`);
    return undefined;
  }
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    errors.push(`${path}: unreadable object`);
    return undefined;
  }
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    errors.push(`${path}: exact keys required`);
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    } catch {
      errors.push(`${path}.${key}: unreadable property`);
      return undefined;
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      errors.push(`${path}.${key}: own data property required`);
      return undefined;
    }
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(
  value: unknown,
  path: string,
  errors: string[],
): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return undefined;
  }
  let keys: readonly PropertyKey[];
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    keys = Reflect.ownKeys(value);
    lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  } catch {
    errors.push(`${path}: unreadable array`);
    return undefined;
  }
  if (
    lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
    keys.length !== lengthDescriptor.value + 1
  ) {
    errors.push(`${path}: dense exact array required`);
    return undefined;
  }
  const result: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    } catch {
      errors.push(`${path}[${index}]: unreadable property`);
      return undefined;
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      errors.push(`${path}: dense exact array required`);
      return undefined;
    }
    result.push(descriptor.value);
  }
  if (keys.some((key) =>
    typeof key !== "string" ||
    (key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(key)),
  )) {
    errors.push(`${path}: dense exact array required`);
    return undefined;
  }
  return result;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function exactNumber(actual: unknown, expected: number): boolean {
  return typeof actual === "number" && Object.is(actual, expected);
}

export function medianOf20(values: readonly number[]): number {
  if (
    values.length !== CVN7_MEASURED_COUNT ||
    values.some((value) => !positiveFinite(value))
  ) {
    throw new TypeError("medianOf20 requires exactly twenty positive finite durations");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return (sorted[9]! + sorted[10]!) / 2;
}

export function nearestRankP95Of20(values: readonly number[]): number {
  if (
    values.length !== CVN7_MEASURED_COUNT ||
    values.some((value) => !positiveFinite(value))
  ) {
    throw new TypeError("nearestRankP95Of20 requires exactly twenty positive finite durations");
  }
  return [...values].sort((left, right) => left - right)[18]!;
}

function validateFixtureProvenance(
  value: unknown,
  expectedKind: "representative" | "stress",
  path: string,
  errors: string[],
): void {
  const record = exactRecord(
    value,
    ["generatorVersion", "fixtureKind", "seed"],
    path,
    errors,
  );
  if (
    record !== undefined &&
    (record.generatorVersion !== 1 ||
      record.fixtureKind !== expectedKind ||
      record.seed !== `cvn7-${expectedKind}-v1`)
  ) {
    errors.push(`${path}: invalid fixture identity`);
  }
}

export function validateBenchmarkOperation(
  value: unknown,
  expectedOperation?: QualificationOperation,
): QualificationEvidenceValidationResult {
  const errors: string[] = [];
  const record = exactRecord(value, [
    "operation", "warmupCount", "measuredCount", "fixtureProvenance", "pairs",
    "baselineMedianMs", "baselineP95Ms", "candidateMedianMs", "candidateP95Ms",
    "medianRatio", "p95Ratio", "portableRatioPassed", "absoluteBudgetMs",
    "absoluteBudgetApplied", "absoluteBudgetPassed",
  ], "operation", errors);
  if (record === undefined) return invalid(errors);
  if (
    !CVN7_OPERATIONS.includes(record.operation as QualificationOperation) ||
    (expectedOperation !== undefined && record.operation !== expectedOperation)
  ) {
    errors.push("operation.operation: invalid or unexpected operation");
  }
  if (record.warmupCount !== CVN7_WARMUP_COUNT) errors.push("operation.warmupCount: expected 5");
  if (record.measuredCount !== CVN7_MEASURED_COUNT) errors.push("operation.measuredCount: expected 20");
  validateFixtureProvenance(record.fixtureProvenance, "representative", "operation.fixtureProvenance", errors);
  const pairs = denseArray(record.pairs, "operation.pairs", errors);
  const baseline: number[] = [];
  const candidate: number[] = [];
  if (pairs !== undefined) {
    if (pairs.length !== CVN7_MEASURED_COUNT) errors.push("operation.pairs: expected 20 pairs");
    pairs.forEach((pair, index) => {
      const pairRecord = exactRecord(pair, [
        "pairIndex", "invocationOrder", "baselineDurationMs", "candidateDurationMs",
      ], `operation.pairs[${index}]`, errors);
      if (pairRecord === undefined) return;
      const expectedOrder = index % 2 === 0
        ? "baseline-then-candidate"
        : "candidate-then-baseline";
      if (pairRecord.pairIndex !== index) errors.push(`operation.pairs[${index}]: wrong pair index`);
      if (pairRecord.invocationOrder !== expectedOrder) errors.push(`operation.pairs[${index}]: wrong invocation order`);
      if (!positiveFinite(pairRecord.baselineDurationMs)) {
        errors.push(`operation.pairs[${index}].baselineDurationMs: positive finite required`);
      } else baseline.push(pairRecord.baselineDurationMs);
      if (!positiveFinite(pairRecord.candidateDurationMs)) {
        errors.push(`operation.pairs[${index}].candidateDurationMs: positive finite required`);
      } else candidate.push(pairRecord.candidateDurationMs);
    });
  }
  if (baseline.length === 20 && candidate.length === 20) {
    const baselineMedian = medianOf20(baseline);
    const baselineP95 = nearestRankP95Of20(baseline);
    const candidateMedian = medianOf20(candidate);
    const candidateP95 = nearestRankP95Of20(candidate);
    const medianRatio = candidateMedian / baselineMedian;
    const p95Ratio = candidateP95 / baselineP95;
    const expectedBudget = CVN7_OPERATION_BUDGETS_MS[record.operation as QualificationOperation];
    if (!exactNumber(record.baselineMedianMs, baselineMedian)) errors.push("operation.baselineMedianMs: aggregate mismatch");
    if (!exactNumber(record.baselineP95Ms, baselineP95)) errors.push("operation.baselineP95Ms: aggregate mismatch");
    if (!exactNumber(record.candidateMedianMs, candidateMedian)) errors.push("operation.candidateMedianMs: aggregate mismatch");
    if (!exactNumber(record.candidateP95Ms, candidateP95)) errors.push("operation.candidateP95Ms: aggregate mismatch");
    if (!exactNumber(record.medianRatio, medianRatio)) errors.push("operation.medianRatio: aggregate mismatch");
    if (!exactNumber(record.p95Ratio, p95Ratio)) errors.push("operation.p95Ratio: aggregate mismatch");
    if (record.portableRatioPassed !== (medianRatio <= CVN7_PORTABLE_RATIO_LIMIT && p95Ratio <= CVN7_PORTABLE_RATIO_LIMIT)) {
      errors.push("operation.portableRatioPassed: decision mismatch");
    }
    if (record.absoluteBudgetMs !== expectedBudget) errors.push("operation.absoluteBudgetMs: budget mismatch");
    if (record.absoluteBudgetApplied === true) {
      if (record.absoluteBudgetPassed !== (candidateP95 <= expectedBudget)) {
        errors.push("operation.absoluteBudgetPassed: decision mismatch");
      }
    } else if (record.absoluteBudgetApplied !== false || record.absoluteBudgetPassed !== null) {
      errors.push("operation.absoluteBudgetPassed: must be null when not applied");
    }
  }
  return errors.length === 0 ? Object.freeze({ ok: true }) : invalid(errors);
}

function validateHeader(
  record: DataRecord,
  path: string,
  errors: string[],
): void {
  if (record.schemaVersion !== CVN7_EVIDENCE_SCHEMA_VERSION) errors.push(`${path}.schemaVersion: expected 1`);
  if (record.taskId !== CVN7_TASK_ID) errors.push(`${path}.taskId: mismatch`);
  if (record.qualificationBaseCommit !== CVN7_QUALIFICATION_BASE) errors.push(`${path}.qualificationBaseCommit: mismatch`);
  for (const key of ["candidateCommit", "harnessCommit"] as const) {
    if (typeof record[key] !== "string" || !/^[0-9a-f]{40}$/u.test(record[key])) {
      errors.push(`${path}.${key}: expected lowercase 40-hex`);
    }
  }
  if (
    typeof record.generatedAtUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.generatedAtUtc)
  ) {
    errors.push(`${path}.generatedAtUtc: expected canonical UTC timestamp`);
  }
}

function validateCommonHeader(
  record: DataRecord,
  common: DataRecord | undefined,
  path: string,
  errors: string[],
): void {
  validateHeader(record, path, errors);
  if (common === undefined) return;
  for (const key of [
    "schemaVersion", "taskId", "qualificationBaseCommit", "candidateCommit",
    "harnessCommit", "generatedAtUtc",
  ] as const) {
    if (record[key] !== common[key]) errors.push(`${path}.${key}: cross-artifact mismatch`);
  }
}

const HEADER_KEYS = [
  "schemaVersion", "taskId", "qualificationBaseCommit", "candidateCommit",
  "harnessCommit", "generatedAtUtc",
] as const;

function countRecord(
  value: unknown,
  expected: readonly number[],
  path: string,
  errors: string[],
): void {
  const keys = [
    "measures", "parts", "staves", "measureContents", "voices", "events",
    "notes", "knownExtensionBlocks", "unknownExtensionBlocks",
  ] as const;
  const record = exactRecord(value, keys, path, errors);
  if (record === undefined) return;
  keys.forEach((key, index) => {
    if (record[key] !== expected[index]) errors.push(`${path}.${key}: count mismatch`);
  });
}

function validateMemoryObservation(
  value: unknown,
  path: string,
  errors: string[],
): void {
  const record = exactRecord(value, [
    "setupBeforeHeapUsedBytes", "operationBeforeHeapUsedBytes",
    "operationAfterHeapUsedBytes", "resultEncodeAfterHeapUsedBytes",
    "observedPeakHeapUsedBytes", "maxRssRaw", "maxRssPlatformUnit", "maxRssBytes",
  ], path, errors);
  if (record === undefined) return;
  for (const key of [
    "setupBeforeHeapUsedBytes", "operationBeforeHeapUsedBytes",
    "operationAfterHeapUsedBytes", "resultEncodeAfterHeapUsedBytes",
    "observedPeakHeapUsedBytes", "maxRssRaw", "maxRssBytes",
  ] as const) {
    if (!Number.isSafeInteger(record[key]) || (record[key] as number) < 0) {
      errors.push(`${path}.${key}: nonnegative safe integer required`);
    }
  }
  if (record.maxRssPlatformUnit !== "kilobytes") {
    errors.push(`${path}.maxRssPlatformUnit: expected kilobytes`);
  }
  const converted = (record.maxRssRaw as number) * 1_024;
  if (record.maxRssBytes !== converted) errors.push(`${path}.maxRssBytes: conversion mismatch`);
  const heapFields = [
    record.setupBeforeHeapUsedBytes, record.operationBeforeHeapUsedBytes,
    record.operationAfterHeapUsedBytes, record.resultEncodeAfterHeapUsedBytes,
  ] as number[];
  if (record.observedPeakHeapUsedBytes !== Math.max(...heapFields)) {
    errors.push(`${path}.observedPeakHeapUsedBytes: peak mismatch`);
  }
}

function validateEnvironment(
  value: unknown,
  common: DataRecord | undefined,
  errors: string[],
): DataRecord | undefined {
  const path = "environment";
  const record = exactRecord(value, [
    ...HEADER_KEYS, "nodeVersion", "nodeExecutableSha256", "platform", "arch",
    "osType", "osRelease", "osVersion", "reportLabel", "cpuModels",
    "logicalCpuCount", "physicalMemoryBytes", "physicalMemoryGiBRounded",
    "processExecArgv", "nodeOptionsPresent", "packageLockSha256",
    "baselineBuildTreeSha256", "candidateBuildTreeSha256",
    "debuggerOrInstrumentationPresent", "checks", "environmentMatch",
  ], path, errors);
  if (record === undefined) return undefined;
  validateCommonHeader(record, common, path, errors);
  for (const key of [
    "nodeVersion", "platform", "arch", "osType", "osRelease", "osVersion",
    "reportLabel",
  ] as const) {
    if (typeof record[key] !== "string" || record[key].length === 0) errors.push(`${path}.${key}: nonempty string required`);
  }
  for (const key of [
    "nodeExecutableSha256", "packageLockSha256", "baselineBuildTreeSha256",
    "candidateBuildTreeSha256",
  ] as const) {
    if (typeof record[key] !== "string" || !/^[0-9a-f]{64}$/u.test(record[key])) errors.push(`${path}.${key}: lowercase sha256 required`);
  }
  const cpuModels = denseArray(record.cpuModels, `${path}.cpuModels`, errors);
  if (cpuModels === undefined || cpuModels.length === 0 || cpuModels.some((model) => typeof model !== "string" || model.trim().length === 0 || model !== model.trim())) {
    errors.push(`${path}.cpuModels: nonempty trimmed strings required`);
  }
  if (!Number.isSafeInteger(record.logicalCpuCount) || (record.logicalCpuCount as number) <= 0) errors.push(`${path}.logicalCpuCount: positive integer required`);
  if (!Number.isSafeInteger(record.physicalMemoryBytes) || (record.physicalMemoryBytes as number) <= 0) errors.push(`${path}.physicalMemoryBytes: positive integer required`);
  if (typeof record.physicalMemoryGiBRounded !== "number" || !Number.isFinite(record.physicalMemoryGiBRounded) || record.physicalMemoryGiBRounded <= 0) errors.push(`${path}.physicalMemoryGiBRounded: positive finite required`);
  const expectedRounded = typeof record.physicalMemoryBytes === "number"
    ? Math.round((record.physicalMemoryBytes / 2 ** 30) * 10) / 10
    : undefined;
  if (record.physicalMemoryGiBRounded !== expectedRounded) errors.push(`${path}.physicalMemoryGiBRounded: derivation mismatch`);
  const execArgv = denseArray(record.processExecArgv, `${path}.processExecArgv`, errors);
  if (execArgv?.some((argument) => typeof argument !== "string")) errors.push(`${path}.processExecArgv: strings required`);
  for (const key of ["nodeOptionsPresent", "debuggerOrInstrumentationPresent", "environmentMatch"] as const) {
    if (typeof record[key] !== "boolean") errors.push(`${path}.${key}: boolean required`);
  }
  const checks = denseArray(record.checks, `${path}.checks`, errors);
  const checkFields = new Set<string>();
  let allMatched = true;
  const exactReferenceChecks = [
    ["nodeVersion", record.nodeVersion === "v24.15.0"],
    ["platform", record.platform === "win32"],
    ["arch", record.arch === "x64"],
    ["osType", record.osType === "Windows_NT"],
    ["osRelease", record.osRelease === "10.0.26200"],
    ["cpuModels", cpuModels?.length === 32 && cpuModels.every((model) => model === "13th Gen Intel(R) Core(TM) i9-13900HX")],
    ["logicalCpuCount", record.logicalCpuCount === 32],
    ["physicalMemoryGiBRounded", record.physicalMemoryGiBRounded === 39.7],
    ["processExecArgv", JSON.stringify(execArgv) === JSON.stringify(["--expose-gc"])],
    ["nodeOptionsPresent", record.nodeOptionsPresent === false],
    ["debuggerOrInstrumentationPresent", record.debuggerOrInstrumentationPresent === false],
  ] as const;
  if (checks?.length !== exactReferenceChecks.length) errors.push(`${path}.checks: exact reference checks required`);
  checks?.forEach((check, index) => {
    const item = exactRecord(check, ["field", "matched"], `${path}.checks[${index}]`, errors);
    if (typeof item?.field !== "string" || item.field.length === 0 || checkFields.has(item.field)) {
      errors.push(`${path}.checks[${index}].field: unique nonempty field required`);
    } else checkFields.add(item.field);
    if (typeof item?.matched !== "boolean") errors.push(`${path}.checks[${index}].matched: boolean required`);
    const expected = exactReferenceChecks[index];
    if (expected === undefined || item?.field !== expected[0] || item.matched !== expected[1]) {
      errors.push(`${path}.checks[${index}]: raw environment derivation mismatch`);
    }
    if (item?.matched !== true) allMatched = false;
  });
  if (record.environmentMatch !== allMatched) errors.push(`${path}.environmentMatch: checks mismatch`);
  if (record.nodeOptionsPresent === true || record.debuggerOrInstrumentationPresent === true) {
    if (record.environmentMatch === true) errors.push(`${path}.environmentMatch: instrumentation cannot match reference`);
  }
  return record;
}

function inspectForLeakage(
  value: unknown,
  path: string,
  active: Set<object>,
  completed: Set<object>,
  errors: string[],
): void {
  if (typeof value === "string") {
    if (/^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value) || value.includes("../") || value.includes("..\\")) {
      errors.push(`${path}: absolute or traversal path forbidden`);
    }
    return;
  }
  if (value === null || typeof value !== "object" || completed.has(value)) return;
  if (active.has(value)) {
    errors.push(`${path}: cyclic evidence forbidden`);
    return;
  }
  active.add(value);
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    errors.push(`${path}: unreadable evidence value`);
    active.delete(value);
    return;
  }
  for (const key of keys) {
    if (typeof key !== "string") {
      errors.push(`${path}: symbol evidence key forbidden`);
      continue;
    }
    if (/^(?:stack|env|environmentVariables|cwd|buildRoot|absolutePath)$/iu.test(key)) {
      errors.push(`${path}.${key}: private diagnostic field forbidden`);
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    } catch {
      errors.push(`${path}.${key}: unreadable evidence property`);
      continue;
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      errors.push(`${path}.${key}: accessor evidence forbidden`);
      continue;
    }
    inspectForLeakage(descriptor.value, `${path}.${key}`, active, completed, errors);
  }
  active.delete(value);
  completed.add(value);
}

function validateBuildManifest(
  value: unknown,
  role: "baseline" | "candidate",
  commonCommit: string | undefined,
  common: DataRecord | undefined,
  path: string,
  errors: string[],
): DataRecord | undefined {
  const record = exactRecord(value, [
    ...HEADER_KEYS, "buildRole", "commit", "fileCount", "treeSha256", "entries",
  ], path, errors);
  if (record === undefined) return undefined;
  validateCommonHeader(record, common, path, errors);
  if (record.buildRole !== role) errors.push(`${path}.buildRole: mismatch`);
  if (typeof record.commit !== "string" || !/^[0-9a-f]{40}$/u.test(record.commit)) errors.push(`${path}.commit: invalid`);
  if (commonCommit !== undefined && role === "candidate" && record.commit !== commonCommit) errors.push(`${path}.commit: candidate mismatch`);
  if (typeof record.treeSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.treeSha256)) errors.push(`${path}.treeSha256: invalid`);
  const entries = denseArray(record.entries, `${path}.entries`, errors);
  if (entries === undefined) return record;
  if (record.fileCount !== entries.length) errors.push(`${path}.fileCount: mismatch`);
  const paths: string[] = [];
  const tree = createHash("sha256");
  entries.forEach((entry, index) => {
    const item = exactRecord(entry, ["relativePath", "sizeBytes", "sha256"], `${path}.entries[${index}]`, errors);
    if (item === undefined) return;
    if (typeof item.relativePath !== "string" || !/^(?:[^/]+\/)*[^/]+$/u.test(item.relativePath) || item.relativePath.includes("\\") || item.relativePath.split("/").includes("..")) {
      errors.push(`${path}.entries[${index}].relativePath: invalid`);
      return;
    }
    if (!Number.isSafeInteger(item.sizeBytes) || (item.sizeBytes as number) < 0) errors.push(`${path}.entries[${index}].sizeBytes: invalid`);
    if (typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(item.sha256)) errors.push(`${path}.entries[${index}].sha256: invalid`);
    paths.push(item.relativePath);
    tree.update(`${item.relativePath}\0${String(item.sizeBytes)}\0${String(item.sha256)}\n`, "utf8");
  });
  if (new Set(paths).size !== paths.length || paths.some((pathValue, index) => index > 0 && pathValue <= paths[index - 1]!)) {
    errors.push(`${path}.entries: paths must be unique ordinal-sorted`);
  }
  if (record.treeSha256 !== tree.digest("hex")) errors.push(`${path}.treeSha256: recomputation mismatch`);
  return record;
}

export function validateQualificationEvidenceSet(
  input: unknown,
): QualificationEvidenceValidationResult {
  const errors: string[] = [];
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return invalid(["evidence: malformed JSON"]);
    }
  }
  const evidenceSet = exactRecord(value, CVN7_EVIDENCE_ARTIFACT_KEYS, "evidence", errors);
  if (evidenceSet === undefined) return invalid(errors);
  inspectForLeakage(
    evidenceSet,
    "evidence",
    new Set<object>(),
    new Set<object>(),
    errors,
  );

  const summary = exactRecord(evidenceSet.summary, [
    ...HEADER_KEYS, "result", "qualified", "functionalPassed", "deterministicPassed",
    "resourcePassed", "portablePassed", "referencePassed", "stressPassed",
    "independentReviewPassed",
  ], "summary", errors);
  if (summary !== undefined) validateHeader(summary, "summary", errors);
  const candidateCommit = typeof summary?.candidateCommit === "string" ? summary.candidateCommit : undefined;
  const environment = validateEnvironment(evidenceSet.environment, summary, errors);

  const baselineBuild = validateBuildManifest(evidenceSet.baselineBuildManifest, "baseline", undefined, summary, "baselineBuildManifest", errors);
  const candidateBuild = validateBuildManifest(evidenceSet.candidateBuildManifest, "candidate", candidateCommit, summary, "candidateBuildManifest", errors);
  if (environment !== undefined) {
    if (environment.baselineBuildTreeSha256 !== baselineBuild?.treeSha256) {
      errors.push("environment.baselineBuildTreeSha256: manifest mismatch");
    }
    if (environment.candidateBuildTreeSha256 !== candidateBuild?.treeSha256) {
      errors.push("environment.candidateBuildTreeSha256: manifest mismatch");
    }
  }

  const trace = exactRecord(evidenceSet.contractTrace, [
    ...HEADER_KEYS, "contracts", "expectedCount", "fullSuitePassed", "qualificationSuitePassed",
  ], "contractTrace", errors);
  if (trace !== undefined) {
    validateCommonHeader(trace, summary, "contractTrace", errors);
    const contracts = denseArray(trace.contracts, "contractTrace.contracts", errors);
    if (trace.expectedCount !== 44 || contracts?.length !== 44) errors.push("contractTrace: expected 44 rows");
    const ids = contracts?.map((entry) =>
      exactRecord(entry, [
        "contractId", "primaryOwner", "consumerOwner", "caseId", "qualificationTitle",
        "qualificationTestFile", "decisiveTestFile", "decisiveTestTitle",
      ], "contractTrace.contract", errors)?.contractId,
    );
    if (ids !== undefined && JSON.stringify(ids) !== JSON.stringify(CVN7_CONTRACT_IDS)) errors.push("contractTrace.contracts: contract set mismatch");
    for (const key of ["fullSuitePassed", "qualificationSuitePassed"] as const) {
      if (typeof trace[key] !== "boolean") errors.push(`contractTrace.${key}: boolean required`);
    }
  }

  const representativeFixture = exactRecord(evidenceSet.representativeFixture, [
    ...HEADER_KEYS, "fixtureProvenance", "counts", "idsUnique", "coverageComplete",
    "semanticValid", "codecRoundTripEqual", "repeatedGenerationEqual",
  ], "representativeFixture", errors);
  if (representativeFixture !== undefined) {
    validateCommonHeader(representativeFixture, summary, "representativeFixture", errors);
    validateFixtureProvenance(representativeFixture.fixtureProvenance, "representative", "representativeFixture.fixtureProvenance", errors);
    countRecord(representativeFixture.counts, [200, 8, 8, 1_600, 3_200, 25_600, 12_800, 9, 1], "representativeFixture.counts", errors);
    for (const key of ["idsUnique", "coverageComplete", "semanticValid", "codecRoundTripEqual", "repeatedGenerationEqual"] as const) {
      if (typeof representativeFixture[key] !== "boolean") errors.push(`representativeFixture.${key}: boolean required`);
    }
  }

  const portable = exactRecord(evidenceSet.portableAb, [
    ...HEADER_KEYS, "fixtureProvenance", "operations", "passed",
  ], "portableAb", errors);
  if (portable !== undefined) {
    validateCommonHeader(portable, summary, "portableAb", errors);
    validateFixtureProvenance(portable.fixtureProvenance, "representative", "portableAb.fixtureProvenance", errors);
    const operations = denseArray(portable.operations, "portableAb.operations", errors);
    if (operations?.length !== CVN7_OPERATIONS.length) errors.push("portableAb.operations: exact operation set required");
    operations?.forEach((operation, index) => {
      const result = validateBenchmarkOperation(operation, CVN7_OPERATIONS[index]);
      if (!result.ok) errors.push(...result.errors.map((message) => `portableAb.${message}`));
    });
    const everyPortablePassed =
      operations?.length === CVN7_OPERATIONS.length &&
      operations.every((operation) =>
        (operation as Partial<QualificationBenchmarkOperationV1>).portableRatioPassed === true,
      );
    if (portable.passed !== everyPortablePassed) {
      errors.push("portableAb.passed: operation aggregate mismatch");
    }
  }

  const functional = exactRecord(evidenceSet.functionalMatrix, [
    ...HEADER_KEYS, "fixtureProvenance", "cases", "passed",
  ], "functionalMatrix", errors);
  if (functional !== undefined) {
    validateCommonHeader(functional, summary, "functionalMatrix", errors);
    validateFixtureProvenance(functional.fixtureProvenance, "representative", "functionalMatrix.fixtureProvenance", errors);
    const cases = denseArray(functional.cases, "functionalMatrix.cases", errors);
    if (cases === undefined || cases.length === 0) errors.push("functionalMatrix: nonempty cases required");
    const caseIds = new Set<string>();
    let everyFunctionalCasePassed = true;
    cases?.forEach((entry, index) => {
      if (entry === null || typeof entry !== "object") {
        errors.push(`functionalMatrix.cases[${index}]: invalid`);
        return;
      }
      let entryKeys: readonly PropertyKey[];
      try {
        entryKeys = Reflect.ownKeys(entry);
      } catch {
        errors.push(`functionalMatrix.cases[${index}]: unreadable`);
        return;
      }
      const keys = entryKeys.includes("failureKind")
        ? ["caseId", "status", "failureKind"]
        : ["caseId", "status"];
      const item = exactRecord(entry, keys, `functionalMatrix.cases[${index}]`, errors);
      if (typeof item?.caseId !== "string" || caseIds.has(item.caseId)) errors.push(`functionalMatrix.cases[${index}]: duplicate/invalid caseId`);
      else caseIds.add(item.caseId);
      if (item?.status !== "passed" && item?.status !== "failed") {
        errors.push(`functionalMatrix.cases[${index}].status: invalid`);
      }
      if (item?.status === "failed" && (typeof item.failureKind !== "string" || item.failureKind.length === 0)) {
        errors.push(`functionalMatrix.cases[${index}].failureKind: nonempty string required for failure`);
      }
      if (item?.status === "passed" && "failureKind" in (item ?? {})) {
        errors.push(`functionalMatrix.cases[${index}].failureKind: forbidden for pass`);
      }
      if (item?.status === "failed") everyFunctionalCasePassed = false;
    });
    if (functional.passed !== everyFunctionalCasePassed) {
      errors.push("functionalMatrix.passed: case aggregate mismatch");
    }
  }

  const reference = exactRecord(evidenceSet.referenceWindows, [
    ...HEADER_KEYS, "fixtureProvenance", "environmentMatch", "operations",
    "representativeMemoryAggregation", "representativeMemoryOperationCount",
    "representativeMemory", "absoluteBudgetsPassed", "result", "qualified",
  ], "referenceWindows", errors);
  if (reference !== undefined) {
    validateCommonHeader(reference, summary, "referenceWindows", errors);
    validateFixtureProvenance(reference.fixtureProvenance, "representative", "referenceWindows.fixtureProvenance", errors);
    if (reference.qualified !== false) errors.push("referenceWindows.qualified: must remain false");
    if (reference.environmentMatch === false && reference.absoluteBudgetsPassed !== null) errors.push("referenceWindows.absoluteBudgetsPassed: false environment requires null");
    if (reference.environmentMatch === true && typeof reference.absoluteBudgetsPassed !== "boolean") errors.push("referenceWindows.absoluteBudgetsPassed: matching environment requires boolean");
    if (reference.environmentMatch !== environment?.environmentMatch) errors.push("referenceWindows.environmentMatch: environment artifact mismatch");
    if (reference.representativeMemoryAggregation !== "fieldwise-max-across-eight-operations") {
      errors.push("referenceWindows.representativeMemoryAggregation: mismatch");
    }
    if (reference.representativeMemoryOperationCount !== 8) {
      errors.push("referenceWindows.representativeMemoryOperationCount: mismatch");
    }
    const referenceOperations = denseArray(reference.operations, "referenceWindows.operations", errors);
    if (referenceOperations?.length !== CVN7_OPERATIONS.length) errors.push("referenceWindows.operations: exact operation set required");
    let everyAbsolutePassed = true;
    referenceOperations?.forEach((operation, index) => {
      const validation = validateBenchmarkOperation(operation, CVN7_OPERATIONS[index]);
      if (!validation.ok) errors.push(...validation.errors.map((message) => `referenceWindows.${message}`));
      const operationRecord = operation as Partial<QualificationBenchmarkOperationV1>;
      if (operationRecord.absoluteBudgetApplied !== reference.environmentMatch) {
        errors.push(`referenceWindows.operations[${index}].absoluteBudgetApplied: environment mismatch`);
      }
      if (reference.environmentMatch === true && operationRecord.absoluteBudgetPassed !== true) everyAbsolutePassed = false;
      if (reference.environmentMatch === false && operationRecord.absoluteBudgetPassed !== null) everyAbsolutePassed = false;
    });
    if (reference.environmentMatch === true && reference.absoluteBudgetsPassed !== everyAbsolutePassed) {
      errors.push("referenceWindows.absoluteBudgetsPassed: operation aggregate mismatch");
    }
    validateMemoryObservation(
      reference.representativeMemory,
      "referenceWindows.representativeMemory",
      errors,
    );
    const expectedReferenceResult = reference.environmentMatch === false
      ? "REFERENCE_ENVIRONMENT_PENDING"
      : everyAbsolutePassed
        ? "REFERENCE_GATE_PASSED_PENDING_STRESS"
        : "NOT_QUALIFIED_REFERENCE_PERFORMANCE";
    if (reference.result !== expectedReferenceResult) errors.push("referenceWindows.result: decision mismatch");
  }

  const stress = exactRecord(evidenceSet.stress, [
    ...HEADER_KEYS, "fixtureProvenance", "counts", "envelopeCount", "liveCommittedCount",
    "replayCommittedCount", "statusSequencesEqual", "finalDocumentEqual",
    "documentVersionEqual", "supportEqual", "availabilityEqual",
    "effectBasedHistoryVerified", "wholeDocumentHistoryEvidenceAbsent", "historyEvidence", "memory",
    "peakRssLimitBytes", "trendLatencyMs", "processCompleted",
    "unhandledRejectionObserved", "passed",
  ], "stress", errors);
  if (stress !== undefined) {
    validateCommonHeader(stress, summary, "stress", errors);
    validateFixtureProvenance(stress.fixtureProvenance, "stress", "stress.fixtureProvenance", errors);
    countRecord(stress.counts, [400, 16, 16, 6_400, 12_800, 102_400, 51_200, 17, 1], "stress.counts", errors);
    if (stress.envelopeCount !== 10_000) errors.push("stress.envelopeCount: expected 10000");
    for (const key of ["liveCommittedCount", "replayCommittedCount"] as const) {
      if (!Number.isSafeInteger(stress[key]) || (stress[key] as number) < 0 || (stress[key] as number) > 10_000) {
        errors.push(`stress.${key}: invalid count`);
      }
    }
    for (const key of ["statusSequencesEqual", "finalDocumentEqual", "documentVersionEqual", "supportEqual", "availabilityEqual", "effectBasedHistoryVerified", "wholeDocumentHistoryEvidenceAbsent", "processCompleted", "unhandledRejectionObserved", "passed"] as const) {
      if (typeof stress[key] !== "boolean") errors.push(`stress.${key}: boolean required`);
    }
    const historyEvidence = exactRecord(stress.historyEvidence, [
      "relativeArtifactPath", "artifactSha256", "historyEntryLocated",
      "effectFieldsPresent", "wholeDocumentFieldsAbsent",
    ], "stress.historyEvidence", errors);
    if (historyEvidence !== undefined) {
      if (historyEvidence.relativeArtifactPath !== "src/core-kernel/commands/runtime.js") {
        errors.push("stress.historyEvidence.relativeArtifactPath: mismatch");
      }
      if (typeof historyEvidence.artifactSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(historyEvidence.artifactSha256)) {
        errors.push("stress.historyEvidence.artifactSha256: invalid");
      }
      for (const key of ["historyEntryLocated", "effectFieldsPresent", "wholeDocumentFieldsAbsent"] as const) {
        if (typeof historyEvidence[key] !== "boolean") errors.push(`stress.historyEvidence.${key}: boolean required`);
      }
      if (stress.effectBasedHistoryVerified !== (
        historyEvidence.historyEntryLocated === true && historyEvidence.effectFieldsPresent === true
      )) {
        errors.push("stress.effectBasedHistoryVerified: source evidence mismatch");
      }
      if (stress.wholeDocumentHistoryEvidenceAbsent !== historyEvidence.wholeDocumentFieldsAbsent) {
        errors.push("stress.wholeDocumentHistoryEvidenceAbsent: source evidence mismatch");
      }
    }
    if (stress.peakRssLimitBytes !== CVN7_STRESS_RSS_LIMIT_BYTES) errors.push("stress.peakRssLimitBytes: mismatch");
    if (!positiveFinite(stress.trendLatencyMs)) errors.push("stress.trendLatencyMs: positive finite required");
    validateMemoryObservation(
      stress.memory,
      "stress.memory",
      errors,
    );
    const stressMemory = stress.memory as { readonly maxRssBytes?: unknown };
    const expectedStressPassed =
      stress.processCompleted === true &&
      stress.unhandledRejectionObserved === false &&
      stress.liveCommittedCount === 10_000 &&
      stress.replayCommittedCount === 10_000 &&
      stress.statusSequencesEqual === true &&
      stress.finalDocumentEqual === true &&
      stress.documentVersionEqual === true &&
      stress.supportEqual === true &&
      stress.availabilityEqual === true &&
      stress.effectBasedHistoryVerified === true &&
      stress.wholeDocumentHistoryEvidenceAbsent === true &&
      typeof stressMemory.maxRssBytes === "number" &&
      stressMemory.maxRssBytes <= CVN7_STRESS_RSS_LIMIT_BYTES;
    if (stress.passed !== expectedStressPassed) {
      errors.push("stress.passed: sub-gate aggregate mismatch");
    }
  }

  if (summary !== undefined) {
    const stressFunctionalGate =
      stress?.processCompleted === true &&
      stress.unhandledRejectionObserved === false &&
      stress.liveCommittedCount === 10_000 &&
      stress.replayCommittedCount === 10_000;
    const stressDeterministicGate =
      stress?.statusSequencesEqual === true &&
      stress.finalDocumentEqual === true &&
      stress.documentVersionEqual === true &&
      stress.supportEqual === true &&
      stress.availabilityEqual === true &&
      stress.effectBasedHistoryVerified === true &&
      stress.wholeDocumentHistoryEvidenceAbsent === true;
    const functionalGate = functional?.passed === true && stressFunctionalGate;
    const deterministicGate =
      trace?.fullSuitePassed === true &&
      trace.qualificationSuitePassed === true &&
      representativeFixture?.idsUnique === true &&
      representativeFixture.coverageComplete === true &&
      representativeFixture.semanticValid === true &&
      representativeFixture.codecRoundTripEqual === true &&
      representativeFixture.repeatedGenerationEqual === true &&
      stressDeterministicGate;
    const representativeMemory = reference?.representativeMemory as { readonly maxRssBytes?: unknown } | undefined;
    const stressMemory = stress?.memory as { readonly maxRssBytes?: unknown } | undefined;
    const resourceGate =
      typeof representativeMemory?.maxRssBytes === "number" &&
      representativeMemory.maxRssBytes <= CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES &&
      typeof stressMemory?.maxRssBytes === "number" &&
      stressMemory.maxRssBytes <= CVN7_STRESS_RSS_LIMIT_BYTES;
    const portableGate = portable?.passed === true;
    const referenceGate =
      environment?.environmentMatch === true &&
      reference?.absoluteBudgetsPassed === true &&
      reference.result === "REFERENCE_GATE_PASSED_PENDING_STRESS";
    const stressGate =
      stressFunctionalGate && stressDeterministicGate &&
      typeof stressMemory?.maxRssBytes === "number" &&
      stressMemory.maxRssBytes <= CVN7_STRESS_RSS_LIMIT_BYTES;
    const expectedGates = {
      functionalPassed: functionalGate,
      deterministicPassed: deterministicGate,
      resourcePassed: resourceGate,
      portablePassed: portableGate,
      referencePassed: referenceGate,
      stressPassed: stressGate,
    } as const;
    for (const [key, expected] of Object.entries(expectedGates)) {
      if (summary[key] !== expected) errors.push(`summary.${key}: artifact gate mismatch`);
    }
    if (summary.independentReviewPassed !== false) {
      errors.push("summary.independentReviewPassed: Stage 5 has no verified review record");
    }
    if (summary.qualified !== false || summary.result === "QUALIFIED") {
      errors.push("summary: Stage 5 evidence cannot self-assert QUALIFIED");
    }
    const expectedResult = classifyQualificationGates({
      functionalPassed: functionalGate,
      deterministicPassed: deterministicGate,
      resourcePassed: resourceGate,
      portablePassed: portableGate,
      environmentMatch: environment?.environmentMatch === true,
      referencePassed: referenceGate,
    });
    if (summary.result !== expectedResult) errors.push("summary.result: artifact decision mismatch");
  }
  return errors.length === 0 ? Object.freeze({ ok: true }) : invalid(errors);
}

export function assertQualificationEvidenceSet(input: unknown): void {
  const result = validateQualificationEvidenceSet(input);
  if (!result.ok) {
    throw new TypeError(`invalid CVN-7 evidence: ${result.errors.join("; ")}`);
  }
}

export function createBenchmarkOperation(
  operation: QualificationOperation,
  pairs: QualificationBenchmarkOperationV1["pairs"],
  absoluteBudgetApplied: boolean,
): QualificationBenchmarkOperationV1 {
  const baseline = pairs.map(({ baselineDurationMs }) => baselineDurationMs);
  const candidate = pairs.map(({ candidateDurationMs }) => candidateDurationMs);
  const baselineMedianMs = medianOf20(baseline);
  const baselineP95Ms = nearestRankP95Of20(baseline);
  const candidateMedianMs = medianOf20(candidate);
  const candidateP95Ms = nearestRankP95Of20(candidate);
  const medianRatio = candidateMedianMs / baselineMedianMs;
  const p95Ratio = candidateP95Ms / baselineP95Ms;
  const absoluteBudgetMs = CVN7_OPERATION_BUDGETS_MS[operation];
  return Object.freeze({
    operation,
    warmupCount: 5,
    measuredCount: 20,
    fixtureProvenance: {
      generatorVersion: 1 as const,
      fixtureKind: "representative" as const,
      seed: "cvn7-representative-v1" as const,
    },
    pairs: Object.freeze([...pairs]),
    baselineMedianMs,
    baselineP95Ms,
    candidateMedianMs,
    candidateP95Ms,
    medianRatio,
    p95Ratio,
    portableRatioPassed:
      medianRatio <= CVN7_PORTABLE_RATIO_LIMIT &&
      p95Ratio <= CVN7_PORTABLE_RATIO_LIMIT,
    absoluteBudgetMs,
    absoluteBudgetApplied,
    absoluteBudgetPassed: absoluteBudgetApplied
      ? candidateP95Ms <= absoluteBudgetMs
      : null,
  });
}
