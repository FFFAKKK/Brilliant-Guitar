import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, release, tmpdir, totalmem, type, version } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CVN7_FUNCTIONAL_TIMEOUT_MS,
  CVN7_MEASURED_COUNT,
  CVN7_OPERATIONS,
  CVN7_QUALIFICATION_BASE,
  CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES,
  CVN7_SAMPLE_TIMEOUT_MS,
  CVN7_STRESS_RSS_LIMIT_BYTES,
  CVN7_STRESS_TIMEOUT_MS,
  CVN7_TASK_ID,
  CVN7_TIMEOUT_GRACE_MS,
  CVN7_WARMUP_COUNT,
  type QualificationBenchmarkPairV1,
  type QualificationEvidenceHeaderV1,
  type QualificationOperation,
  type QualificationRunMode,
  type QualificationWorkerRequestV1,
  type QualificationWorkerResultV1,
} from "./cvn-7-qualification-contracts";
import { CVN7_CONTRACT_TRACE } from "./cvn-7-contract-trace";
import {
  classifyQualificationGates,
  createBenchmarkOperation,
  validateQualificationEvidenceSet,
} from "./cvn-7-evidence-validator";

interface RunnerArguments {
  readonly mode: QualificationRunMode;
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly evidenceDir: string;
  readonly qualificationBase: string;
  readonly candidateCommit: string;
  readonly harnessCommit: string;
}

interface BuildManifestEntry {
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface BuildManifestData {
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly entries: readonly BuildManifestEntry[];
}

interface WorkerInvocation {
  readonly result: QualificationWorkerResultV1;
  readonly maxRssBytes: number | undefined;
}

interface SuiteResult {
  readonly passed: true;
  readonly testCount: number;
  readonly passCount: number;
}

interface PreflightResult {
  readonly baselineManifest: BuildManifestData;
  readonly candidateManifest: BuildManifestData;
  readonly fullSuite: SuiteResult;
  readonly qualificationSuite: SuiteResult;
}

interface HistoryStorageEvidence {
  readonly relativeArtifactPath: "src/core-kernel/commands/runtime.js";
  readonly artifactSha256: string;
  readonly historyEntryLocated: boolean;
  readonly effectFieldsPresent: boolean;
  readonly wholeDocumentFieldsAbsent: boolean;
}

interface StressWorkerData {
  readonly envelopeCount: 10_000;
  readonly committedCount: number;
  readonly statuses: readonly string[];
  readonly documentVersion: number;
  readonly finalDocumentSha256: string;
  readonly support: unknown;
  readonly writeAvailability: unknown;
  readonly validationAvailability: unknown;
  readonly historyStorageEvidence: HistoryStorageEvidence;
  readonly unhandledRejectionObserved: boolean;
}

const CLI_KEYS = Object.freeze([
  "--mode", "--baseline-root", "--candidate-root", "--evidence-dir",
  "--qualification-base", "--candidate-commit", "--harness-commit",
] as const);
const MODES = Object.freeze([
  "functional", "portable", "reference", "stress", "all",
] as const);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

function parseArguments(values: readonly string[]): RunnerArguments {
  if (values.length !== CLI_KEYS.length * 2) throw new TypeError("exact runner arguments required");
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !CLI_KEYS.includes(key as never) || parsed.has(key)) {
      throw new TypeError("runner arguments contain an extra, missing, or duplicate key");
    }
    parsed.set(key, value);
  }
  const mode = parsed.get("--mode");
  const baselineRoot = parsed.get("--baseline-root");
  const candidateRoot = parsed.get("--candidate-root");
  const evidenceDir = parsed.get("--evidence-dir");
  const qualificationBase = parsed.get("--qualification-base");
  const candidateCommit = parsed.get("--candidate-commit");
  const harnessCommit = parsed.get("--harness-commit");
  if (
    !MODES.includes(mode as never) ||
    baselineRoot === undefined || candidateRoot === undefined || evidenceDir === undefined ||
    !isAbsolute(baselineRoot) || !isAbsolute(candidateRoot) ||
    qualificationBase === undefined || candidateCommit === undefined || harnessCommit === undefined ||
    !COMMIT_PATTERN.test(qualificationBase) || !COMMIT_PATTERN.test(candidateCommit) ||
    !COMMIT_PATTERN.test(harnessCommit)
  ) {
    throw new TypeError("runner argument values are invalid");
  }
  return {
    mode: mode as QualificationRunMode,
    baselineRoot: resolve(baselineRoot),
    candidateRoot: resolve(candidateRoot),
    evidenceDir: resolve(candidateRoot, evidenceDir),
    qualificationBase,
    candidateCommit,
    harnessCommit,
  };
}

function commandOutput(command: string, arguments_: readonly string[], cwd: string): string {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitOutput(root: string, arguments_: readonly string[]): string {
  return commandOutput("git", arguments_, root);
}

function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function walkFiles(root: string): readonly string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort((left, right) => {
    const leftRelative = relative(root, left).split(sep).join("/");
    const rightRelative = relative(root, right).split(sep).join("/");
    return leftRelative < rightRelative ? -1 : leftRelative > rightRelative ? 1 : 0;
  });
}

export function computeProductionBuildManifest(buildRoot: string): BuildManifestData {
  const sourceRoot = resolve(buildRoot, "dist", "src");
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new TypeError("production build output is missing");
  }
  const entries = walkFiles(sourceRoot)
    .filter((path) => /\.(?:js|d\.ts)$/u.test(path))
    .map((path): BuildManifestEntry => ({
      relativePath: `src/${relative(sourceRoot, path).split(sep).join("/")}`,
      sizeBytes: statSync(path).size,
      sha256: fileSha256(path),
    }));
  const tree = createHash("sha256");
  for (const entry of entries) {
    tree.update(`${entry.relativePath}\0${entry.sizeBytes}\0${entry.sha256}\n`, "utf8");
  }
  return Object.freeze({
    fileCount: entries.length,
    treeSha256: tree.digest("hex"),
    entries: Object.freeze(entries),
  });
}

function cleanBuildManifest(root: string): BuildManifestData {
  rmSync(resolve(root, "dist"), { recursive: true, force: true });
  commandOutput("npm.cmd", ["run", "typecheck"], root);
  commandOutput("npm.cmd", ["run", "build"], root);
  return computeProductionBuildManifest(root);
}

export function parseNodeTestSummary(output: string): SuiteResult {
  let summaryPrefix: "#" | "ℹ" | undefined;
  const field = (name: "tests" | "pass" | "fail"): number => {
    const matches = [...output.matchAll(new RegExp(`^(#|ℹ) ${name} (\\d+)\\r?$`, "gmu"))];
    if (matches.length !== 1 || matches[0]?.[1] === undefined) {
      throw new TypeError(`test suite output has ambiguous or missing ${name} count`);
    }
    const prefix = matches[0][1] as "#" | "ℹ";
    if (summaryPrefix !== undefined && prefix !== summaryPrefix) {
      throw new TypeError("test suite output mixes reporter summary forms");
    }
    summaryPrefix = prefix;
    return Number(matches[0][2]);
  };
  const tests = field("tests");
  const passed = field("pass");
  const failed = field("fail");
  if (
    !Number.isSafeInteger(tests) || !Number.isSafeInteger(passed) ||
    !Number.isSafeInteger(failed) || failed !== 0 || tests !== passed || tests <= 0
  ) {
    throw new TypeError("test suite output did not prove an exact all-pass result");
  }
  return { passed: true, testCount: tests, passCount: passed };
}

function executeTestSuite(root: string, arguments_: readonly string[]): SuiteResult {
  return parseNodeTestSummary(commandOutput("npm.cmd", arguments_, root));
}

function assertPreflight(arguments_: RunnerArguments): PreflightResult {
  for (const root of [arguments_.baselineRoot, arguments_.candidateRoot]) {
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new TypeError("worktree root missing");
    if (gitOutput(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
      throw new TypeError("worktree must be completely clean before qualification");
    }
  }
  if (arguments_.qualificationBase !== CVN7_QUALIFICATION_BASE) throw new TypeError("qualification base mismatch");
  if (gitOutput(arguments_.baselineRoot, ["rev-parse", "HEAD"]) !== arguments_.qualificationBase) {
    throw new TypeError("baseline commit mismatch");
  }
  if (gitOutput(arguments_.candidateRoot, ["rev-parse", "HEAD"]) !== arguments_.candidateCommit) {
    throw new TypeError("candidate commit mismatch");
  }
  if (arguments_.harnessCommit !== arguments_.candidateCommit) {
    throw new TypeError("harness commit must be the frozen candidate HEAD");
  }
  const expectedEvidenceDir = resolve(
    arguments_.candidateRoot,
    ".trellis", "tasks", "08-11-cvn-7-core-vnext-final-qualification", "evidence",
  );
  if (arguments_.evidenceDir !== expectedEvidenceDir) {
    throw new TypeError("evidence directory must be the CVN-7 task-local evidence directory");
  }
  if (
    fileSha256(resolve(arguments_.baselineRoot, "package-lock.json")) !==
    fileSha256(resolve(arguments_.candidateRoot, "package-lock.json"))
  ) {
    throw new TypeError("package lock hash mismatch");
  }
  const baselineFirst = cleanBuildManifest(arguments_.baselineRoot);
  const baselineSecond = cleanBuildManifest(arguments_.baselineRoot);
  const candidateFirst = cleanBuildManifest(arguments_.candidateRoot);
  const candidateSecond = cleanBuildManifest(arguments_.candidateRoot);
  if (JSON.stringify(baselineFirst) !== JSON.stringify(baselineSecond)) throw new TypeError("baseline build is not reproducible");
  if (JSON.stringify(candidateFirst) !== JSON.stringify(candidateSecond)) throw new TypeError("candidate build is not reproducible");
  const sourceDiff = gitOutput(arguments_.candidateRoot, [
    "diff", "--no-ext-diff", "--name-only", arguments_.qualificationBase, "--", "src",
  ]);
  if (sourceDiff !== "") throw new TypeError("candidate production source differs from qualification base");
  if (JSON.stringify(baselineSecond) !== JSON.stringify(candidateSecond)) {
    throw new TypeError("equal production source produced unequal manifests");
  }
  const qualificationSuite = executeTestSuite(arguments_.candidateRoot, ["run", "test:cvn7"]);
  const fullSuite = executeTestSuite(arguments_.candidateRoot, ["test"]);
  return {
    baselineManifest: baselineSecond,
    candidateManifest: candidateSecond,
    fullSuite,
    qualificationSuite,
  };
}

function timeoutFor(action: QualificationWorkerRequestV1["action"]): number {
  if (action === "latency-sample" || action === "memory-sample") return CVN7_SAMPLE_TIMEOUT_MS;
  if (action === "stress-submit" || action === "stress-replay") return CVN7_STRESS_TIMEOUT_MS;
  return CVN7_FUNCTIONAL_TIMEOUT_MS;
}

function terminateTree(processId: number): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/pid", String(processId), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      // Already exited.
    }
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch {
    try {
      process.kill(processId, "SIGKILL");
    } catch {
      // Already exited.
    }
  }
}

export function completeTimedOutWorkerCleanup(
  processId: number,
  terminate: (targetProcessId: number) => void = terminateTree,
): Error {
  terminate(processId);
  return new Error("worker-timeout");
}

async function invokeWorker(
  arguments_: Pick<RunnerArguments, "baselineRoot" | "candidateRoot">,
  temporaryRoot: string,
  request: QualificationWorkerRequestV1,
): Promise<WorkerInvocation> {
  const nonce = randomBytes(12).toString("hex");
  const requestPath = resolve(temporaryRoot, `worker-${nonce}.request.json`);
  const resultPath = resolve(temporaryRoot, `worker-${nonce}.result.json`);
  writeFileSync(requestPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", flag: "wx" });
  const workerPath = resolve(arguments_.candidateRoot, "dist", "test", "core-kernel", "qualification", "cvn-7-worker.js");
  const timeoutMs = timeoutFor(request.action);
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, [
      "--expose-gc",
      workerPath,
      requestPath,
      resultPath,
      arguments_.baselineRoot,
      arguments_.candidateRoot,
    ], {
      cwd: arguments_.candidateRoot,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: "ignore",
    });
    let settled = false;
    let timedOut = false;
    let termination: NodeJS.Timeout | undefined;
    const finishTimeout = (): void => {
      if (settled) return;
      if (termination !== undefined) clearTimeout(termination);
      const error = completeTimedOutWorkerCleanup(child.pid ?? -1);
      settled = true;
      rejectExit(error);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      termination = setTimeout(finishTimeout, CVN7_TIMEOUT_GRACE_MS);
      child.kill();
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      clearTimeout(timeout);
      if (timedOut) {
        finishTimeout();
        return;
      }
      settled = true;
      rejectExit(error);
    });
    child.once("exit", (code) => {
      if (settled) return;
      clearTimeout(timeout);
      if (timedOut) {
        finishTimeout();
        return;
      }
      settled = true;
      resolveExit(code ?? -1);
    });
  });
  if (exitCode !== 0 || !existsSync(resultPath)) throw new Error("worker-process-failed");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(resultPath, "utf8")) as unknown;
  } catch {
    throw new Error("worker-result-invalid");
  }
  const result = value as QualificationWorkerResultV1;
  if (
    result === null || typeof result !== "object" || result.schemaVersion !== 1 ||
    result.action !== request.action || (result.status !== "passed" && result.status !== "failed")
  ) {
    throw new Error("worker-result-invalid");
  }
  const raw = result.status === "passed" ? result.result : undefined;
  const observation = raw !== null && typeof raw === "object"
    ? (raw as { readonly observation?: { readonly maxRssBytes?: unknown } }).observation
    : undefined;
  return {
    result,
    maxRssBytes: typeof observation?.maxRssBytes === "number" ? observation.maxRssBytes : undefined,
  };
}

function header(arguments_: RunnerArguments): QualificationEvidenceHeaderV1 {
  return {
    schemaVersion: 1,
    taskId: CVN7_TASK_ID,
    qualificationBaseCommit: arguments_.qualificationBase,
    candidateCommit: arguments_.candidateCommit,
    harnessCommit: arguments_.harnessCommit,
    generatedAtUtc: new Date().toISOString(),
  };
}

function resultValue(invocation: WorkerInvocation): unknown {
  if (invocation.result.status !== "passed") {
    throw new Error(`worker-failed-${invocation.result.failureKind}`);
  }
  return invocation.result.result;
}

function exactObject(value: unknown, expectedKeys: readonly string[], failure: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(failure);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new Error(failure);
  }
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) throw new Error(failure);
    output[key] = descriptor.value;
  }
  return output;
}

function decodeStressWorkerData(value: unknown): StressWorkerData {
  const record = exactObject(value, [
    "envelopeCount", "committedCount", "statuses", "documentVersion",
    "finalDocumentSha256", "support", "writeAvailability",
    "validationAvailability", "historyStorageEvidence",
    "unhandledRejectionObserved",
  ], "worker-stress-result-invalid");
  const statuses = record.statuses;
  const history = exactObject(record.historyStorageEvidence, [
    "relativeArtifactPath", "artifactSha256", "historyEntryLocated",
    "effectFieldsPresent", "wholeDocumentFieldsAbsent",
  ], "worker-history-evidence-invalid");
  if (
    record.envelopeCount !== 10_000 ||
    !Number.isSafeInteger(record.committedCount) || (record.committedCount as number) < 0 ||
    !Array.isArray(statuses) || Reflect.ownKeys(statuses).length !== statuses.length + 1 ||
    statuses.length > 10_000 || statuses.some((status) => typeof status !== "string") ||
    record.committedCount !== statuses.filter((status) => status === "committed").length ||
    !Number.isSafeInteger(record.documentVersion) || (record.documentVersion as number) < 0 ||
    typeof record.finalDocumentSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.finalDocumentSha256) ||
    (record.support !== null && typeof record.support !== "object") ||
    record.writeAvailability === null || typeof record.writeAvailability !== "object" ||
    record.validationAvailability === null || typeof record.validationAvailability !== "object" ||
    typeof record.unhandledRejectionObserved !== "boolean" ||
    history.relativeArtifactPath !== "src/core-kernel/commands/runtime.js" ||
    typeof history.artifactSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(history.artifactSha256) ||
    typeof history.historyEntryLocated !== "boolean" ||
    typeof history.effectFieldsPresent !== "boolean" ||
    typeof history.wholeDocumentFieldsAbsent !== "boolean"
  ) {
    throw new Error("worker-stress-result-invalid");
  }
  return {
    envelopeCount: 10_000,
    committedCount: record.committedCount as number,
    statuses: statuses as string[],
    documentVersion: record.documentVersion as number,
    finalDocumentSha256: record.finalDocumentSha256,
    support: record.support,
    writeAvailability: record.writeAvailability,
    validationAvailability: record.validationAvailability,
    historyStorageEvidence: {
      relativeArtifactPath: "src/core-kernel/commands/runtime.js",
      artifactSha256: history.artifactSha256,
      historyEntryLocated: history.historyEntryLocated,
      effectFieldsPresent: history.effectFieldsPresent,
      wholeDocumentFieldsAbsent: history.wholeDocumentFieldsAbsent,
    },
    unhandledRejectionObserved: record.unhandledRejectionObserved,
  };
}

export function decodeStressWorkerEnvelope(value: unknown): {
  readonly result: StressWorkerData;
  readonly observation: MemoryRecord;
} {
  const record = exactObject(value, ["result", "observation"], "worker-stress-envelope-invalid");
  return {
    result: decodeStressWorkerData(record.result),
    observation: requireMemoryObservation(record.observation),
  };
}

async function benchmarkOperation(
  arguments_: RunnerArguments,
  temporaryRoot: string,
  operation: QualificationOperation,
  absoluteBudgetApplied: boolean,
): Promise<ReturnType<typeof createBenchmarkOperation>> {
  const request = (
    buildRoot: string,
    phase: "warmup" | "measured",
    sampleIndex: number,
  ): QualificationWorkerRequestV1 => ({
    schemaVersion: 1,
    action: "latency-sample",
    buildRoot,
    fixture: "representative",
    operation,
    phase,
    sampleIndex,
  });
  for (let index = 0; index < CVN7_WARMUP_COUNT; index += 1) {
    resultValue(await invokeWorker(arguments_, temporaryRoot, request(arguments_.baselineRoot, "warmup", index)));
    resultValue(await invokeWorker(arguments_, temporaryRoot, request(arguments_.candidateRoot, "warmup", index)));
  }
  const pairs: QualificationBenchmarkPairV1[] = [];
  for (let pairIndex = 0; pairIndex < CVN7_MEASURED_COUNT; pairIndex += 1) {
    const baselineFirst = pairIndex % 2 === 0;
    const firstRoot = baselineFirst ? arguments_.baselineRoot : arguments_.candidateRoot;
    const secondRoot = baselineFirst ? arguments_.candidateRoot : arguments_.baselineRoot;
    const first = resultValue(await invokeWorker(arguments_, temporaryRoot, request(firstRoot, "measured", pairIndex))) as { readonly durationMs: number };
    const second = resultValue(await invokeWorker(arguments_, temporaryRoot, request(secondRoot, "measured", pairIndex))) as { readonly durationMs: number };
    pairs.push({
      pairIndex,
      invocationOrder: baselineFirst ? "baseline-then-candidate" : "candidate-then-baseline",
      baselineDurationMs: baselineFirst ? first.durationMs : second.durationMs,
      candidateDurationMs: baselineFirst ? second.durationMs : first.durationMs,
    });
  }
  return createBenchmarkOperation(operation, pairs, absoluteBudgetApplied);
}

function memoryFromInvocation(invocation: WorkerInvocation): unknown {
  const value = resultValue(invocation) as { readonly observation?: unknown };
  if (value === null || typeof value !== "object" || value.observation === undefined) {
    throw new Error("worker-memory-missing");
  }
  return value.observation;
}

const MEMORY_FIELDS = Object.freeze([
  "setupBeforeHeapUsedBytes", "operationBeforeHeapUsedBytes",
  "operationAfterHeapUsedBytes", "resultEncodeAfterHeapUsedBytes",
  "observedPeakHeapUsedBytes", "maxRssRaw", "maxRssBytes",
] as const);

type MemoryField = (typeof MEMORY_FIELDS)[number];
type MemoryRecord = Readonly<Record<MemoryField, number>> & {
  readonly maxRssPlatformUnit: "kilobytes";
};

function requireMemoryObservation(value: unknown): MemoryRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("worker-memory-invalid");
  }
  const record = value as Partial<Record<MemoryField, unknown>> & {
    readonly maxRssPlatformUnit?: unknown;
  };
  if (
    MEMORY_FIELDS.some((field) =>
      typeof record[field] !== "number" || !Number.isFinite(record[field]) || (record[field] as number) < 0,
    ) ||
    record.maxRssPlatformUnit !== "kilobytes"
  ) {
    throw new Error("worker-memory-invalid");
  }
  return record as MemoryRecord;
}

function maximumMemoryObservation(values: readonly unknown[]): MemoryRecord {
  if (values.length === 0) throw new Error("worker-memory-missing");
  const records = values.map(requireMemoryObservation);
  const unit = records[0]!.maxRssPlatformUnit;
  if (records.some(({ maxRssPlatformUnit }) => maxRssPlatformUnit !== unit)) {
    throw new Error("worker-memory-unit-mismatch");
  }
  const maximum = Object.fromEntries(MEMORY_FIELDS.map((field) => [
    field,
    Math.max(...records.map((record) => record[field])),
  ])) as Record<MemoryField, number>;
  return { ...maximum, maxRssPlatformUnit: unit };
}

function environmentArtifact(
  arguments_: RunnerArguments,
  manifests: PreflightResult,
  evidenceHeader: QualificationEvidenceHeaderV1,
): unknown {
  const models = cpus().map(({ model }) => model.trim());
  const memoryBytes = totalmem();
  const checks = [
    { field: "nodeVersion", matched: process.version === "v24.15.0" },
    { field: "platform", matched: process.platform === "win32" },
    { field: "arch", matched: process.arch === "x64" },
    { field: "osType", matched: type() === "Windows_NT" },
    { field: "osRelease", matched: release() === "10.0.26200" },
    { field: "cpuModels", matched: models.length === 32 && models.every((model) => model === "13th Gen Intel(R) Core(TM) i9-13900HX") },
    { field: "logicalCpuCount", matched: models.length === 32 },
    { field: "physicalMemoryGiBRounded", matched: Math.round((memoryBytes / 2 ** 30) * 10) / 10 === 39.7 },
    { field: "processExecArgv", matched: JSON.stringify(process.execArgv) === JSON.stringify(["--expose-gc"]) },
    { field: "nodeOptionsPresent", matched: process.env.NODE_OPTIONS === undefined || process.env.NODE_OPTIONS === "" },
  ];
  const debuggerOrInstrumentationPresent = process.execArgv.some((argument) => /inspect|prof|trace/u.test(argument));
  checks.push({ field: "debuggerOrInstrumentationPresent", matched: !debuggerOrInstrumentationPresent });
  return {
    ...evidenceHeader,
    nodeVersion: process.version,
    nodeExecutableSha256: fileSha256(process.execPath),
    platform: process.platform,
    arch: process.arch,
    osType: type(),
    osRelease: release(),
    osVersion: version(),
    reportLabel: "NT 10.0.26200.0",
    cpuModels: models,
    logicalCpuCount: models.length,
    physicalMemoryBytes: memoryBytes,
    physicalMemoryGiBRounded: Math.round((memoryBytes / 2 ** 30) * 10) / 10,
    processExecArgv: [...process.execArgv],
    nodeOptionsPresent: process.env.NODE_OPTIONS !== undefined && process.env.NODE_OPTIONS !== "",
    packageLockSha256: fileSha256(resolve(arguments_.candidateRoot, "package-lock.json")),
    baselineBuildTreeSha256: manifests.baselineManifest.treeSha256,
    candidateBuildTreeSha256: manifests.candidateManifest.treeSha256,
    debuggerOrInstrumentationPresent,
    checks,
    environmentMatch: checks.every(({ matched }) => matched),
  };
}

function buildManifestArtifact(
  arguments_: RunnerArguments,
  role: "baseline" | "candidate",
  manifest: BuildManifestData,
  evidenceHeader: QualificationEvidenceHeaderV1,
): unknown {
  return {
    ...evidenceHeader,
    buildRole: role,
    commit: role === "baseline" ? arguments_.qualificationBase : arguments_.candidateCommit,
    ...manifest,
  };
}

function writeJson(directory: string, filename: string, value: unknown): void {
  writeFileSync(resolve(directory, filename), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function publishAtomically(source: string, target: string): void {
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const nonce = randomBytes(8).toString("hex");
  const incoming = resolve(parent, `.${basename(target)}.incoming-${nonce}`);
  const backup = resolve(parent, `.${basename(target)}.backup-${nonce}`);
  mkdirSync(incoming, { recursive: false });
  let existingMoved = false;
  try {
    if (existsSync(target)) {
      if (!statSync(target).isDirectory()) throw new TypeError("official evidence target must be a directory");
      const existing = readdirSync(target).sort();
      if (JSON.stringify(existing) !== JSON.stringify(["README.md"])) {
        throw new TypeError("official evidence target contains unexpected pre-existing artifacts");
      }
      copyFileSync(resolve(target, "README.md"), resolve(incoming, "README.md"));
    }
    for (const file of readdirSync(source)) copyFileSync(resolve(source, file), resolve(incoming, file));
    if (existsSync(target)) {
      renameSync(target, backup);
      existingMoved = true;
    }
    renameSync(incoming, target);
    if (existingMoved) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(incoming, { recursive: true, force: true });
    if (existingMoved && !existsSync(target) && existsSync(backup)) renameSync(backup, target);
    throw error;
  }
}

function pathIsWithin(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

export async function runQualification(arguments_: RunnerArguments): Promise<string> {
  const manifests = assertPreflight(arguments_);
  const evidenceHeader = Object.freeze(header(arguments_));
  const runId = randomBytes(12).toString("hex");
  const operatingSystemTemporaryRoot = resolve(process.env.TEMP ?? process.env.TMP ?? tmpdir());
  if (
    pathIsWithin(arguments_.baselineRoot, operatingSystemTemporaryRoot) ||
    pathIsWithin(arguments_.candidateRoot, operatingSystemTemporaryRoot)
  ) {
    throw new TypeError("qualification temporary root must be outside both worktrees");
  }
  const temporaryParent = resolve(
    operatingSystemTemporaryRoot,
    "cvn7-qualification",
    arguments_.harnessCommit,
  );
  mkdirSync(temporaryParent, { recursive: true });
  const temporaryRoot = mkdtempSync(resolve(temporaryParent, `${runId}-`));
  const artifactsRoot = resolve(temporaryRoot, "artifacts");
  mkdirSync(artifactsRoot);

  const environment = environmentArtifact(arguments_, manifests, evidenceHeader) as { readonly environmentMatch: boolean };
  const baselineBuildManifest = buildManifestArtifact(arguments_, "baseline", manifests.baselineManifest, evidenceHeader);
  const candidateBuildManifest = buildManifestArtifact(arguments_, "candidate", manifests.candidateManifest, evidenceHeader);
  const fixtureInvocation = await invokeWorker(arguments_, temporaryRoot, {
    schemaVersion: 1,
    action: "fixture-verify",
    buildRoot: arguments_.candidateRoot,
    fixture: "representative",
    phase: "functional",
  });
  const fixture = resultValue(fixtureInvocation) as Record<string, unknown>;
  const functionalInvocation = await invokeWorker(arguments_, temporaryRoot, {
    schemaVersion: 1,
    action: "functional-case",
    buildRoot: arguments_.candidateRoot,
    fixture: "representative",
    phase: "functional",
  });
  const functionalCase = functionalInvocation.result.status === "passed"
    ? { caseId: "representative-history-2000", status: "passed" as const }
    : {
        caseId: "representative-history-2000",
        status: "failed" as const,
        failureKind: functionalInvocation.result.failureKind,
      };
  const functionalMatrix = {
    ...evidenceHeader,
    fixtureProvenance: fixture.provenance,
    cases: [functionalCase],
    passed: functionalCase.status === "passed",
  };
  const representativeFixture = {
    ...evidenceHeader,
    fixtureProvenance: fixture.provenance,
    counts: fixture.counts,
    idsUnique: fixture.idsUnique,
    coverageComplete: fixture.coverageComplete,
    semanticValid: fixture.semanticValid,
    codecRoundTripEqual: fixture.codecRoundTripEqual,
    repeatedGenerationEqual: fixture.repeatedGenerationEqual,
  };

  const operations = [];
  if (arguments_.mode === "portable" || arguments_.mode === "reference" || arguments_.mode === "all") {
    for (const operation of CVN7_OPERATIONS) {
      operations.push(await benchmarkOperation(
        arguments_, temporaryRoot, operation,
        (arguments_.mode === "reference" || arguments_.mode === "all") && environment.environmentMatch,
      ));
    }
  }
  const portableAb = {
    ...evidenceHeader,
    fixtureProvenance: fixture.provenance,
    operations,
    passed: operations.length === 8 && operations.every(({ portableRatioPassed }) => portableRatioPassed),
  };
  const representativeMemorySamples: unknown[] = [];
  for (const operation of CVN7_OPERATIONS) {
    const invocation = await invokeWorker(arguments_, temporaryRoot, {
      schemaVersion: 1,
      action: "memory-sample",
      buildRoot: arguments_.candidateRoot,
      fixture: "representative",
      operation,
      phase: "memory",
    });
    representativeMemorySamples.push(memoryFromInvocation(invocation));
  }
  const representativeMemory = maximumMemoryObservation(representativeMemorySamples);
  const absoluteBudgetsPassed = environment.environmentMatch
    ? operations.length === 8 && operations.every(({ absoluteBudgetPassed }) => absoluteBudgetPassed === true)
    : null;
  const referenceWindows = {
    ...evidenceHeader,
    fixtureProvenance: fixture.provenance,
    environmentMatch: environment.environmentMatch,
    operations,
    representativeMemoryAggregation: "fieldwise-max-across-eight-operations",
    representativeMemoryOperationCount: 8,
    representativeMemory,
    absoluteBudgetsPassed,
    result: environment.environmentMatch
      ? absoluteBudgetsPassed
        ? "REFERENCE_GATE_PASSED_PENDING_STRESS"
        : "NOT_QUALIFIED_REFERENCE_PERFORMANCE"
      : "REFERENCE_ENVIRONMENT_PENDING",
    qualified: false,
  };

  let stress = {
    ...evidenceHeader,
    fixtureProvenance: { generatorVersion: 1, fixtureKind: "stress", seed: "cvn7-stress-v1" },
    counts: { measures: 400, parts: 16, staves: 16, measureContents: 6_400, voices: 12_800, events: 102_400, notes: 51_200, knownExtensionBlocks: 17, unknownExtensionBlocks: 1 },
    envelopeCount: 10_000,
    liveCommittedCount: 0,
    replayCommittedCount: 0,
    statusSequencesEqual: false,
    finalDocumentEqual: false,
    documentVersionEqual: false,
    supportEqual: false,
    availabilityEqual: false,
    effectBasedHistoryVerified: false,
    wholeDocumentHistoryEvidenceAbsent: false,
    historyEvidence: {
      relativeArtifactPath: "src/core-kernel/commands/runtime.js",
      artifactSha256: "0".repeat(64),
      historyEntryLocated: false,
      effectFieldsPresent: false,
      wholeDocumentFieldsAbsent: false,
    },
    memory: representativeMemory,
    peakRssLimitBytes: CVN7_STRESS_RSS_LIMIT_BYTES,
    trendLatencyMs: 1,
    processCompleted: false,
    unhandledRejectionObserved: true,
    passed: false,
  };
  if (arguments_.mode === "stress" || arguments_.mode === "all") {
    const start = process.hrtime.bigint();
    const liveInvocation = await invokeWorker(arguments_, temporaryRoot, {
      schemaVersion: 1, action: "stress-submit", buildRoot: arguments_.candidateRoot,
      fixture: "stress", phase: "memory",
    });
    const replayInvocation = await invokeWorker(arguments_, temporaryRoot, {
      schemaVersion: 1, action: "stress-replay", buildRoot: arguments_.candidateRoot,
      fixture: "stress", phase: "memory",
    });
    const liveEnvelope = decodeStressWorkerEnvelope(resultValue(liveInvocation));
    const replayEnvelope = decodeStressWorkerEnvelope(resultValue(replayInvocation));
    const live = liveEnvelope.result;
    const replay = replayEnvelope.result;
    const statusSequencesEqual = JSON.stringify(live.statuses) === JSON.stringify(replay.statuses);
    const finalDocumentEqual = live.finalDocumentSha256 === replay.finalDocumentSha256;
    const documentVersionEqual = live.documentVersion === replay.documentVersion;
    const supportEqual = JSON.stringify(live.support) === JSON.stringify(replay.support);
    const availabilityEqual =
      JSON.stringify(live.writeAvailability) === JSON.stringify(replay.writeAvailability) &&
      JSON.stringify(live.validationAvailability) === JSON.stringify(replay.validationAvailability);
    const historyEvidenceEqual =
      JSON.stringify(live.historyStorageEvidence) === JSON.stringify(replay.historyStorageEvidence);
    const historyEvidence = live.historyStorageEvidence;
    const effectBasedHistoryVerified =
      historyEvidenceEqual && historyEvidence.historyEntryLocated === true &&
      historyEvidence.effectFieldsPresent === true;
    const wholeDocumentHistoryEvidenceAbsent =
      historyEvidenceEqual && historyEvidence.wholeDocumentFieldsAbsent === true;
    const unhandledRejectionObserved =
      live.unhandledRejectionObserved !== false || replay.unhandledRejectionObserved !== false;
    const stressMemory = maximumMemoryObservation([
      liveEnvelope.observation,
      replayEnvelope.observation,
    ]);
    stress = {
      ...stress,
      liveCommittedCount: live.committedCount,
      replayCommittedCount: replay.committedCount,
      statusSequencesEqual,
      finalDocumentEqual,
      documentVersionEqual,
      supportEqual,
      availabilityEqual,
      effectBasedHistoryVerified,
      wholeDocumentHistoryEvidenceAbsent,
      historyEvidence,
      memory: stressMemory,
      trendLatencyMs: Number(process.hrtime.bigint() - start) / 1_000_000,
      processCompleted: true,
      unhandledRejectionObserved,
      passed:
        live.committedCount === 10_000 && replay.committedCount === 10_000 &&
        statusSequencesEqual && finalDocumentEqual && documentVersionEqual &&
        supportEqual && availabilityEqual && effectBasedHistoryVerified &&
        wholeDocumentHistoryEvidenceAbsent && !unhandledRejectionObserved &&
        stressMemory.maxRssBytes <= CVN7_STRESS_RSS_LIMIT_BYTES,
    };
  }

  const contractTrace = {
    ...evidenceHeader,
    contracts: CVN7_CONTRACT_TRACE,
    expectedCount: 44,
    fullSuitePassed: manifests.fullSuite.passed,
    qualificationSuitePassed: manifests.qualificationSuite.passed,
  };
  const representativeRss = representativeMemory.maxRssBytes;
  const stressFunctionalPassed =
    stress.processCompleted === true &&
    stress.unhandledRejectionObserved === false &&
    stress.liveCommittedCount === 10_000 &&
    stress.replayCommittedCount === 10_000;
  const stressDeterministicPassed =
    stress.statusSequencesEqual === true &&
    stress.finalDocumentEqual === true &&
    stress.documentVersionEqual === true &&
    stress.supportEqual === true &&
    stress.availabilityEqual === true &&
    stress.effectBasedHistoryVerified === true &&
    stress.wholeDocumentHistoryEvidenceAbsent === true;
  const stressResourcePassed =
    ((stress.memory as { readonly maxRssBytes?: number }).maxRssBytes ?? Infinity) <=
    CVN7_STRESS_RSS_LIMIT_BYTES;
  const resourcePassed = representativeRss <= CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES &&
    stressResourcePassed;
  const functionalPassed = functionalMatrix.passed && stressFunctionalPassed;
  const deterministicPassed =
    manifests.fullSuite.passed && manifests.qualificationSuite.passed &&
    representativeFixture.idsUnique === true &&
    representativeFixture.coverageComplete === true &&
    representativeFixture.semanticValid === true &&
    representativeFixture.codecRoundTripEqual === true &&
    representativeFixture.repeatedGenerationEqual === true &&
    stressDeterministicPassed;
  const summary = {
    ...evidenceHeader,
    result: classifyQualificationGates({
      functionalPassed,
      deterministicPassed,
      resourcePassed,
      portablePassed: portableAb.passed,
      environmentMatch: environment.environmentMatch,
      referencePassed: environment.environmentMatch && absoluteBudgetsPassed === true,
    }),
    qualified: false,
    functionalPassed,
    deterministicPassed,
    resourcePassed,
    portablePassed: portableAb.passed,
    referencePassed: environment.environmentMatch && absoluteBudgetsPassed === true,
    stressPassed:
      stressFunctionalPassed && stressDeterministicPassed && stressResourcePassed,
    independentReviewPassed: false,
  };
  const evidenceSet = {
    environment,
    baselineBuildManifest,
    candidateBuildManifest,
    contractTrace,
    functionalMatrix,
    representativeFixture,
    portableAb,
    referenceWindows,
    stress,
    summary,
  };
  if (arguments_.mode === "all") {
    const validated = validateQualificationEvidenceSet(evidenceSet);
    if (!validated.ok) throw new Error(`evidence-invalid:${validated.errors.join("|")}`);
  }
  writeJson(artifactsRoot, "environment.json", environment);
  writeJson(artifactsRoot, "build-manifest-baseline.json", baselineBuildManifest);
  writeJson(artifactsRoot, "build-manifest-candidate.json", candidateBuildManifest);
  writeJson(artifactsRoot, "contract-trace.json", contractTrace);
  writeJson(artifactsRoot, "functional-matrix.json", functionalMatrix);
  writeJson(artifactsRoot, "representative-fixture.json", representativeFixture);
  writeJson(artifactsRoot, "portable-ab.json", portableAb);
  writeJson(artifactsRoot, "reference-windows.json", referenceWindows);
  writeJson(artifactsRoot, "stress.json", stress);
  const jsonArtifacts = [
    "environment.json",
    "build-manifest-baseline.json",
    "build-manifest-candidate.json",
    "contract-trace.json",
    "functional-matrix.json",
    "representative-fixture.json",
    "portable-ab.json",
    "reference-windows.json",
    "stress.json",
  ] as const;
  const jsonHashes = jsonArtifacts.map((filename) => ({
    filename,
    sha256: fileSha256(resolve(artifactsRoot, filename)),
  }));
  const summaryMarkdown = [
    "# CVN-7 Qualification Summary",
    "",
    `- Result: \`${summary.result}\``,
    "- Qualified: `false`",
    `- Generated at UTC: \`${evidenceHeader.generatedAtUtc}\``,
    `- Qualification base: \`${evidenceHeader.qualificationBaseCommit}\``,
    `- Candidate commit: \`${evidenceHeader.candidateCommit}\``,
    `- Harness commit: \`${evidenceHeader.harnessCommit}\``,
    "",
    "## Test suites",
    "",
    `- Full suite: ${manifests.fullSuite.passCount}/${manifests.fullSuite.testCount} passed`,
    `- CVN-7 suite: ${manifests.qualificationSuite.passCount}/${manifests.qualificationSuite.testCount} passed`,
    "",
    "## Gates",
    "",
    `- Functional: ${summary.functionalPassed ? "PASS" : "FAIL"}`,
    `- Determinism: ${summary.deterministicPassed ? "PASS" : "FAIL"}`,
    `- Resource: ${summary.resourcePassed ? "PASS" : "FAIL"}`,
    `- Portable A/B: ${summary.portablePassed ? "PASS" : "FAIL"}`,
    `- Reference Windows: ${summary.referencePassed ? "PASS" : environment.environmentMatch ? "FAIL" : "PENDING_ENVIRONMENT"}`,
    `- Stress: ${summary.stressPassed ? "PASS" : "FAIL"}`,
    "- Independent technical review: PENDING",
    "",
    "## Production build manifests",
    "",
    `- Baseline tree SHA-256: \`${manifests.baselineManifest.treeSha256}\``,
    `- Candidate tree SHA-256: \`${manifests.candidateManifest.treeSha256}\``,
    "",
    "## JSON artifact SHA-256",
    "",
    ...jsonHashes.map(({ filename, sha256 }) => `- \`${filename}\`: \`${sha256}\``),
    "",
  ].join("\n");
  writeFileSync(resolve(artifactsRoot, "qualification-summary.md"), summaryMarkdown, {
    encoding: "utf8",
    flag: "wx",
  });
  if (arguments_.mode === "all") publishAtomically(artifactsRoot, arguments_.evidenceDir);
  return artifactsRoot;
}

async function main(): Promise<void> {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const output = await runQualification(arguments_);
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "qualification-runner-failed"}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
