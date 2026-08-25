import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Transform, Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { run as nodeTestRun } from "node:test";
import { spec } from "node:test/reporters";

const COMPILED_TEST_ROOT = "dist/test";

export type RunnerContractErrorCode =
  | "runner.root-missing"
  | "runner.root-not-directory"
  | "runner.root-symbolic"
  | "runner.entry-symbolic"
  | "runner.entry-unsupported"
  | "runner.path-invalid"
  | "runner.path-duplicate"
  | "runner.identity-unavailable"
  | "runner.physical-alias"
  | "runner.empty"
  | "runner.repository-cwd"
  | "runner.repository-invalid"
  | "runner.node-unsupported"
  | "runner.run-threw"
  | "runner.stream-error"
  | "runner.stream-aborted"
  | "runner.stream-incomplete"
  | "runner.reporter-failed"
  | "runner.test-failed"
  | "runner.test-interrupted"
  | "runner.outcome-path-missing"
  | "runner.outcome-path-mismatch"
  | "runner.outcome-unknown"
  | "runner.outcome-duplicate"
  | "runner.outcome-missing"
  | "runner.manifest-mismatch";

export class RunnerContractError extends Error {
  readonly code: RunnerContractErrorCode;

  constructor(code: RunnerContractErrorCode) {
    super(code);
    this.name = "RunnerContractError";
    this.code = code;
  }
}

export type FullTestManifestV1 = Readonly<{
  kind: "full-test-manifest-v1";
  root: "dist/test";
  fileCount: number;
  sha256: string;
  files: readonly string[];
}>;

export type CompiledTestDiscovery = Readonly<{
  manifest: FullTestManifestV1;
  absoluteFiles: readonly string[];
}>;

export type SemanticTestRequest = Readonly<{
  files: readonly string[];
  cwd: string;
  isolation: "process";
  concurrency: true;
}>;

export type CompiledTestRunResult = Readonly<{
  manifest: FullTestManifestV1;
  request: SemanticTestRequest;
}>;

type BigIntStatsLike = Readonly<{
  dev: unknown;
  ino: unknown;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}>;

type DirectoryEntryLike = Readonly<{
  name: string;
  isSymbolicLink(): boolean;
}>;

export type DiscoverySeams = Readonly<{
  lstat(path: string): Promise<BigIntStatsLike>;
  readdir(path: string): Promise<readonly DirectoryEntryLike[]>;
}>;

type TestsStreamLike = Readable;

export type ExecutionSeams = Readonly<{
  cwd(): string;
  nodeVersion(): string;
  run(options: Readonly<{ files: readonly string[]; concurrency: true }>): TestsStreamLike;
  reporter(): Transform;
  reporterSink(): Writable;
  writeManifestHeader(header: string): void;
}>;

const DEFAULT_DISCOVERY_SEAMS: DiscoverySeams = Object.freeze({
  async lstat(path: string): Promise<BigIntStatsLike> {
    return lstat(path, { bigint: true });
  },
  async readdir(path: string): Promise<readonly DirectoryEntryLike[]> {
    return readdir(path, { withFileTypes: true });
  },
});

function stdoutSink(): Writable {
  return new Writable({
    write(chunk, encoding, callback) {
      process.stdout.write(chunk, encoding, callback);
    },
  });
}

const DEFAULT_EXECUTION_SEAMS: ExecutionSeams = Object.freeze({
  cwd: () => process.cwd(),
  nodeVersion: () => process.versions.node,
  run: (options) => nodeTestRun(options),
  reporter: () => spec(),
  reporterSink: stdoutSink,
  writeManifestHeader: (header) => {
    process.stdout.write(`${header}\n`);
  },
});

export function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelativeFile(root: string, absolutePath: string): string {
  const projected = relative(root, absolutePath).replaceAll("\\", "/");
  if (
    projected === "" ||
    isAbsolute(projected) ||
    projected === ".." ||
    projected.startsWith("../")
  ) {
    throw new RunnerContractError("runner.path-invalid");
  }
  return projected;
}

function physicalIdentity(stats: BigIntStatsLike): string {
  if (
    typeof stats.dev !== "bigint" ||
    typeof stats.ino !== "bigint" ||
    (stats.dev === 0n && stats.ino === 0n)
  ) {
    throw new RunnerContractError("runner.identity-unavailable");
  }
  return `${stats.dev}:${stats.ino}`;
}

function manifestSha256(files: readonly string[]): string {
  return createHash("sha256")
    .update(`${files.join("\n")}\n`, "utf8")
    .digest("hex");
}

export function createFullTestManifest(
  normalizedFiles: readonly string[],
): FullTestManifestV1 {
  const files = Object.freeze([...normalizedFiles]);
  return Object.freeze({
    kind: "full-test-manifest-v1" as const,
    root: COMPILED_TEST_ROOT,
    fileCount: files.length,
    sha256: manifestSha256(files),
    files,
  });
}

async function rootStats(
  root: string,
  seams: DiscoverySeams,
): Promise<BigIntStatsLike> {
  try {
    return await seams.lstat(root);
  } catch {
    throw new RunnerContractError("runner.root-missing");
  }
}

export async function enumerateCompiledTests(
  repoRoot: string,
  seams: DiscoverySeams = DEFAULT_DISCOVERY_SEAMS,
): Promise<CompiledTestDiscovery> {
  const root = resolve(repoRoot, COMPILED_TEST_ROOT);
  const initialRootStats = await rootStats(root, seams);
  if (initialRootStats.isSymbolicLink()) {
    throw new RunnerContractError("runner.root-symbolic");
  }
  if (!initialRootStats.isDirectory()) {
    throw new RunnerContractError("runner.root-not-directory");
  }

  const candidates: Array<{
    absolutePath: string;
    relativePath: string;
    identity: string;
  }> = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await seams.readdir(directory);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new RunnerContractError("runner.entry-symbolic");
      }
      const absolutePath = resolve(directory, entry.name);
      const stats = await seams.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new RunnerContractError("runner.entry-symbolic");
      }
      if (stats.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!stats.isFile()) {
        throw new RunnerContractError("runner.entry-unsupported");
      }
      const relativePath = normalizeRelativeFile(root, absolutePath);
      if (!relativePath.endsWith(".test.js")) {
        continue;
      }
      candidates.push({
        absolutePath,
        relativePath,
        identity: physicalIdentity(stats),
      });
    }
  };

  await visit(root);
  candidates.sort((left, right) =>
    codeUnitCompare(left.relativePath, right.relativePath),
  );

  const normalizedPaths = new Set<string>();
  const physicalIdentities = new Map<string, string>();
  for (const candidate of candidates) {
    if (normalizedPaths.has(candidate.relativePath)) {
      throw new RunnerContractError("runner.path-duplicate");
    }
    normalizedPaths.add(candidate.relativePath);
    const existing = physicalIdentities.get(candidate.identity);
    if (existing !== undefined && existing !== candidate.relativePath) {
      throw new RunnerContractError("runner.physical-alias");
    }
    physicalIdentities.set(candidate.identity, candidate.relativePath);
  }
  if (candidates.length === 0) {
    throw new RunnerContractError("runner.empty");
  }

  const relativeFiles = candidates.map((candidate) => candidate.relativePath);
  const absoluteFiles = Object.freeze(
    candidates.map((candidate) => candidate.absolutePath),
  );
  return Object.freeze({
    manifest: createFullTestManifest(relativeFiles),
    absoluteFiles,
  });
}

export function canonicalManifestHeader(
  manifest: FullTestManifestV1,
): string {
  return JSON.stringify({
    kind: manifest.kind,
    fileCount: manifest.fileCount,
    sha256: manifest.sha256,
  });
}

function requireSupportedNodeVersion(version: string): void {
  const match = /^(0|[1-9]\d*)\./u.exec(version);
  const major = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(major) || major < 20) {
    throw new RunnerContractError("runner.node-unsupported");
  }
}

async function requireRepositoryRoot(
  repoRoot: string,
  cwd: string,
): Promise<void> {
  if (resolve(cwd) !== resolve(repoRoot)) {
    throw new RunnerContractError("runner.repository-cwd");
  }
  try {
    const stats = await lstat(resolve(repoRoot, "package.json"), {
      bigint: true,
    });
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new RunnerContractError("runner.repository-invalid");
    }
  } catch (error) {
    if (error instanceof RunnerContractError) {
      throw error;
    }
    throw new RunnerContractError("runner.repository-invalid");
  }
}

function normalizedAbsolute(repoRoot: string, candidate: string): string {
  return resolve(repoRoot, candidate);
}

type OutcomeObserver = Readonly<{
  finalize(): void;
  failureCode(): RunnerContractErrorCode | undefined;
  streamErrored(): boolean;
}>;

function attachOutcomeObserver(
  stream: TestsStreamLike,
  repoRoot: string,
  manifestFiles: readonly string[],
): OutcomeObserver {
  const manifest = new Set(
    manifestFiles.map((file) =>
      resolve(repoRoot, COMPILED_TEST_ROOT, file),
    ),
  );
  const outcomes = new Map<string, "pass" | "fail">();
  let failure: RunnerContractErrorCode | undefined;
  let ended = false;
  let closedBeforeEnd = false;
  let errored = false;
  let aborted = false;

  const fail = (code: RunnerContractErrorCode): void => {
    failure ??= code;
  };
  const captureFileOutcome = (
    kind: "pass" | "fail",
    data: unknown,
  ): void => {
    if (typeof data !== "object" || data === null) {
      fail("runner.outcome-path-missing");
      return;
    }
    const value = data as {
      nesting?: unknown;
      file?: unknown;
      name?: unknown;
    };
    if (value.nesting !== 0) {
      return;
    }
    const file =
      typeof value.file === "string" && value.file !== ""
        ? normalizedAbsolute(repoRoot, value.file)
        : undefined;
    const name =
      typeof value.name === "string" && value.name !== ""
        ? normalizedAbsolute(repoRoot, value.name)
        : undefined;
    if (file === undefined && name === undefined) {
      fail("runner.outcome-path-missing");
      return;
    }
    if (file !== undefined && name !== undefined && file !== name) {
      fail("runner.outcome-path-mismatch");
      return;
    }
    const outcomePath = file ?? name;
    if (outcomePath === undefined || !manifest.has(outcomePath)) {
      fail("runner.outcome-unknown");
      return;
    }
    if (outcomes.has(outcomePath)) {
      fail("runner.outcome-duplicate");
      return;
    }
    outcomes.set(outcomePath, kind);
  };

  stream.on("test:pass", (data: unknown) => {
    captureFileOutcome("pass", data);
  });
  stream.on("test:fail", (data: unknown) => {
    fail("runner.test-failed");
    captureFileOutcome("fail", data);
  });
  stream.on("test:interrupted", () => {
    fail("runner.test-interrupted");
  });
  stream.on("error", () => {
    errored = true;
    fail("runner.stream-error");
  });
  stream.on("aborted", () => {
    aborted = true;
    fail("runner.stream-aborted");
  });
  stream.on("end", () => {
    ended = true;
  });
  stream.on("close", () => {
    if (!ended) {
      closedBeforeEnd = true;
      fail("runner.stream-incomplete");
    }
  });

  return Object.freeze({
    finalize(): void {
      if (errored) {
        throw new RunnerContractError("runner.stream-error");
      }
      if (aborted) {
        throw new RunnerContractError("runner.stream-aborted");
      }
      if (closedBeforeEnd || !ended) {
        throw new RunnerContractError("runner.stream-incomplete");
      }
      if (failure !== undefined) {
        throw new RunnerContractError(failure);
      }
      if (outcomes.size !== manifest.size) {
        throw new RunnerContractError("runner.outcome-missing");
      }
      for (const file of manifest) {
        if (outcomes.get(file) !== "pass") {
          throw new RunnerContractError("runner.test-failed");
        }
      }
    },
    failureCode: () => failure,
    streamErrored: () => errored,
  });
}

function assertManifestProjection(
  repoRoot: string,
  discovery: CompiledTestDiscovery,
  runFiles: readonly string[],
): void {
  if (runFiles.length !== discovery.manifest.files.length) {
    throw new RunnerContractError("runner.manifest-mismatch");
  }
  for (let index = 0; index < runFiles.length; index += 1) {
    const relativeFile = discovery.manifest.files[index];
    const absoluteFile = runFiles[index];
    if (
      relativeFile === undefined ||
      absoluteFile === undefined ||
      resolve(repoRoot, COMPILED_TEST_ROOT, relativeFile) !== absoluteFile
    ) {
      throw new RunnerContractError("runner.manifest-mismatch");
    }
  }
}

export async function executeCompiledTests(
  repoRoot: string,
  executionOverrides: Partial<ExecutionSeams> = {},
  discoverySeams: DiscoverySeams = DEFAULT_DISCOVERY_SEAMS,
): Promise<CompiledTestRunResult> {
  const seams: ExecutionSeams = {
    ...DEFAULT_EXECUTION_SEAMS,
    ...executionOverrides,
  };
  await requireRepositoryRoot(repoRoot, seams.cwd());
  requireSupportedNodeVersion(seams.nodeVersion());

  const discovery = await enumerateCompiledTests(repoRoot, discoverySeams);
  const runFiles = Object.freeze([...discovery.absoluteFiles]);
  assertManifestProjection(repoRoot, discovery, runFiles);
  seams.writeManifestHeader(canonicalManifestHeader(discovery.manifest));

  let stream: TestsStreamLike;
  try {
    stream = seams.run({ files: runFiles, concurrency: true });
  } catch {
    throw new RunnerContractError("runner.run-threw");
  }

  const observer = attachOutcomeObserver(
    stream,
    repoRoot,
    discovery.manifest.files,
  );
  let reporter: Transform;
  let sink: Writable;
  try {
    reporter = seams.reporter();
    sink = seams.reporterSink();
  } catch {
    throw new RunnerContractError("runner.reporter-failed");
  }
  try {
    await pipeline(stream, reporter, sink);
  } catch {
    const observedFailure = observer.failureCode();
    if (
      observedFailure === "runner.stream-error" ||
      observedFailure === "runner.stream-aborted" ||
      observedFailure === "runner.stream-incomplete"
    ) {
      throw new RunnerContractError(observedFailure);
    }
    throw new RunnerContractError("runner.reporter-failed");
  }
  observer.finalize();

  const request = Object.freeze({
    files: runFiles,
    cwd: resolve(repoRoot),
    isolation: "process" as const,
    concurrency: true as const,
  });
  return Object.freeze({ manifest: discovery.manifest, request });
}

export async function main(): Promise<0 | 1> {
  try {
    await executeCompiledTests(process.cwd());
    return 0;
  } catch (error) {
    const code =
      error instanceof RunnerContractError ? error.code : "runner.run-threw";
    process.stderr.write(`${code}\n`);
    return 1;
  }
}

if (require.main === module) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
