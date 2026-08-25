import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

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
  | "runner.empty";

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

const DEFAULT_DISCOVERY_SEAMS: DiscoverySeams = Object.freeze({
  async lstat(path: string): Promise<BigIntStatsLike> {
    return lstat(path, { bigint: true });
  },
  async readdir(path: string): Promise<readonly DirectoryEntryLike[]> {
    return readdir(path, { withFileTypes: true });
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
