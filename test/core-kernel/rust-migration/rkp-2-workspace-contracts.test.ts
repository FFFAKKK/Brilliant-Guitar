import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";

import * as coreKernel from "../../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import * as moduleSdk from "../../../src/core-kernel/module-sdk/index";
import { CVN6_REGISTRATION_ENTRIES } from "../fixtures/cvn-6-synthetic-official-modules";
import {
  APPLICATION_RUNTIME_EXPORTS,
  COMMAND_IDS,
  CONTRIBUTION_ABI_FIELDS,
  MODULE_SDK_RUNTIME_EXPORTS,
  MODULE_SDK_TYPE_EXPORTS,
} from "./ts-oracle-fixtures";
import {
  createMinimalRkp2StoreFixture,
  createRkp2StoreFixtureCatalog,
} from "./rkp-2-store-fixtures";

const IMPLEMENTATION_BASE = "df40aef391440ae64ad3e266419579bee5887a1f";
const FULL_RUNNER_PLANNING_BASE =
  "eed4871a86191783d539b7d4097be3627e98e4a0";
const FIRST_REVIEWED_FULL_RUNNER_PLANNING_HEAD =
  "c43a34e7d02a57cfd90de506cf97787ff5571a9e";
const ACCEPTED_FULL_RUNNER_PLANNING_HEAD =
  "cc82ba168ed45b8c3e0182ea8e1370b1474f1155";
const FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD =
  "44832ad01d136368c1b61203e9207ca4a521241f";
const FULL_RUNNER_FUTURE_IMPLEMENTATION_BASE =
  FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD;
const APPROVED_PLANNING_STATE =
  "53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0";
const MANIFEST_PROJECTION_PARENT =
  "4f5f45a5f5a97968ef5280524cd4e6ab8dbebda8";
const MANIFEST_PROJECTION_COMMIT =
  "bda15099f4932aced965eabc6b6e147accd9b5ce";
const DESIGN_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/design.md";
const IMPLEMENT_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/implement.md";
const IMPLEMENT_CONTEXT_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/implement.jsonl";
const CHECK_CONTEXT_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/check.jsonl";
const FILE_TEST_ROLLBACK_MATRIX_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/file-test-and-rollback-matrix.md";
const TASK_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json";
const PARENT_PATH =
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const FULL_RUNNER_ACTIVE_ROOT =
  ".trellis/tasks/08-25-rkp-2-cross-platform-full-test-runner-contract-repair";
const FULL_RUNNER_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-08/08-25-rkp-2-cross-platform-full-test-runner-contract-repair";
const PLANNED_TRUTH_FIELDS = ["type", "data.file"] as const;

const CRATES = [
  "brilliant-core-types",
  "brilliant-score-foundation",
  "brilliant-extension-protocol",
  "brilliant-kernel-contracts",
  "brilliant-kernel-runtime",
  "brilliant-kernel-session",
  "brilliant-kernel-node",
] as const;

type CrateName = (typeof CRATES)[number];

const EXPECTED_GRAPH: Readonly<Record<CrateName, readonly string[]>> = {
  "brilliant-core-types": [],
  "brilliant-score-foundation": ["brilliant-core-types"],
  "brilliant-extension-protocol": ["brilliant-core-types"],
  "brilliant-kernel-contracts": [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
  ],
  "brilliant-kernel-runtime": [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
    "brilliant-kernel-contracts",
  ],
  "brilliant-kernel-session": [
    "brilliant-kernel-runtime",
    "brilliant-kernel-contracts",
    "brilliant-extension-protocol",
  ],
  "brilliant-kernel-node": [
    "brilliant-kernel-contracts",
    "brilliant-kernel-session",
  ],
};

const EXPECTED_IMPLEMENTATION_PATHS = [
  "Cargo.toml",
  "Cargo.lock",
  "crates/brilliant-score-foundation/src/lib.rs",
  "crates/brilliant-score-foundation/src/codec.rs",
  "crates/brilliant-score-foundation/src/fraction.rs",
  "crates/brilliant-score-foundation/src/validation.rs",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "crates/brilliant-kernel-runtime/Cargo.toml",
  "crates/brilliant-kernel-runtime/src/lib.rs",
  "crates/brilliant-kernel-runtime/src/smoke_runtime.rs",
  "crates/brilliant-kernel-runtime/src/handles.rs",
  "crates/brilliant-kernel-runtime/src/records.rs",
  "crates/brilliant-kernel-runtime/src/topology.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "crates/brilliant-kernel-runtime/src/time_index.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-session/src/session.rs",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-2-store-fixtures.ts",
] as const;

const RKP2_HISTORICAL_COORDINATION_PATHS = [
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/implementation-evidence.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
  CHECK_CONTEXT_PATH,
  IMPLEMENT_CONTEXT_PATH,
  DESIGN_PATH,
  IMPLEMENT_PATH,
  FILE_TEST_ROLLBACK_MATRIX_PATH,
] as const;

const ACTIVE_CHILD_PLANNING_PATHS = [
  `${FULL_RUNNER_ACTIVE_ROOT}/task.json`,
  `${FULL_RUNNER_ACTIVE_ROOT}/prd.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/design.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/implement.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/implement.jsonl`,
  `${FULL_RUNNER_ACTIVE_ROOT}/check.jsonl`,
  `${FULL_RUNNER_ACTIVE_ROOT}/operator-handoff.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/review-candidate.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/current-runner-reproduction.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/node-test-api-and-version-contract.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/file-test-integration-and-rollback-matrix.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/planning-self-audit.md`,
] as const;

const ARCHIVED_CHILD_PATHS = [
  `${FULL_RUNNER_ARCHIVE_ROOT}/task.json`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/prd.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/design.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/implement.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/implement.jsonl`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/check.jsonl`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/operator-handoff.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/review-candidate.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/research/current-runner-reproduction.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/research/node-test-api-and-version-contract.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/research/file-test-integration-and-rollback-matrix.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/research/planning-self-audit.md`,
  `${FULL_RUNNER_ARCHIVE_ROOT}/research/implementation-evidence.md`,
] as const;

const EXPECTED_COORDINATION_PATHS = [
  ...RKP2_HISTORICAL_COORDINATION_PATHS,
  ...ACTIVE_CHILD_PLANNING_PATHS,
] as const;

const EXPECTED_POST_ARCHIVE_COORDINATION_PATHS = [
  ...RKP2_HISTORICAL_COORDINATION_PATHS,
  ...ARCHIVED_CHILD_PATHS,
] as const;

const FULL_RUNNER_PLANNING_PATHS = [
  PARENT_PATH,
  DESIGN_PATH,
  IMPLEMENT_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  FILE_TEST_ROLLBACK_MATRIX_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  TASK_PATH,
  `${FULL_RUNNER_ACTIVE_ROOT}/check.jsonl`,
  `${FULL_RUNNER_ACTIVE_ROOT}/design.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/implement.jsonl`,
  `${FULL_RUNNER_ACTIVE_ROOT}/implement.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/operator-handoff.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/prd.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/current-runner-reproduction.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/file-test-integration-and-rollback-matrix.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/node-test-api-and-version-contract.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/planning-self-audit.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/review-candidate.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/task.json`,
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;

const CHILD_TECHNICAL_PATHS = [
  "package.json",
  "test/test-infrastructure/run-compiled-tests.ts",
  "test/test-infrastructure/run-compiled-tests.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;

const CHILD_ACTIVE_LIFECYCLE_PATHS = [
  `${FULL_RUNNER_ACTIVE_ROOT}/task.json`,
  `${FULL_RUNNER_ACTIVE_ROOT}/operator-handoff.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/review-candidate.md`,
  `${FULL_RUNNER_ACTIVE_ROOT}/research/implementation-evidence.md`,
  DESIGN_PATH,
  IMPLEMENT_PATH,
  FILE_TEST_ROLLBACK_MATRIX_PATH,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  PARENT_PATH,
] as const;

const FROZEN_POST_STAGE_5_AUTHORITY_CONTENT = [
  {
    path: CHECK_CONTEXT_PATH,
    sha256: "7e12f6d00ba17e1967ef57e884e7b5d6ca7efedbb2aaf94de04fc4b3091251c3",
  },
  {
    path: IMPLEMENT_CONTEXT_PATH,
    sha256: "cd0a42070a76a18e782d7da4ebc0e9a88d2ed5dece0d093125d4fc8982229705",
  },
  {
    path: DESIGN_PATH,
    sha256: "6ac606e2691b5f6aef9a244267c090138d6b15d064761008cb7417db15bbf0a0",
  },
  {
    path: IMPLEMENT_PATH,
    sha256: "0aba6aa95a535b9c8ef66b4457e3ba459d7ca3564cff40b56739d3955fc511ab",
  },
  {
    path: FILE_TEST_ROLLBACK_MATRIX_PATH,
    sha256: "4f7f888f295b31929db5e10203ac0221e4d8e441fc2350abb6b518820165f017",
  },
] as const;

const STABLE_FAILURE_CODES = [
  "bridge.capture-invalid",
  "bridge.request-too-large",
  "codec.invalid-utf8",
  "codec.invalid-json",
  "codec.invalid-shape",
  "contract.unsupported-api-version",
  "contract.unsupported-protocol-version",
  "score.unsupported-schema",
  "score.invalid-structure",
  "codec.depth-limit",
  "codec.property-limit",
  "codec.number-out-of-range",
  "bridge.handle-unknown",
  "bridge.handle-stale",
  "bridge.handle-wrong-environment",
  "bridge.handle-wrong-thread",
  "bridge.handle-reentrant",
  "bridge.handle-busy",
  "bridge.handle-poisoned",
  "bridge.response-too-large",
  "bridge.panic-contained",
  "bridge.internal",
] as const;

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

function lines(value: string): string[] {
  return value === ""
    ? []
    : value.split(/\r?\n/u).filter((line) => line !== "");
}

function git(args: readonly string[]): string {
  return execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function gitTextAt(commit: string, path: string): string {
  return execFileSync(
    "git",
    ["-c", "core.longpaths=true", "show", `${commit}:${path}`],
    { cwd: process.cwd(), encoding: "utf8" },
  ).replaceAll("\r\n", "\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function section(source: string, name: string): string {
  const header = `[${name}]`;
  const start = source.indexOf(header);
  if (start < 0) {
    return "";
  }
  const bodyStart = start + header.length;
  const next = source.slice(bodyStart).search(/\r?\n\[/u);
  return next < 0
    ? source.slice(bodyStart)
    : source.slice(bodyStart, bodyStart + next);
}

function tomlArray(source: string, name: string): string[] {
  const match = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "u").exec(
    source,
  );
  if (match?.[1] === undefined) {
    return [];
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/gu), (entry) => entry[1] ?? "");
}

function projectInternalDependencies(source: string): string[] {
  return lines(section(source, "dependencies"))
    .map((line) => /^([a-z0-9-]+)\s*=/u.exec(line.trim())?.[1])
    .filter((value): value is string => value?.startsWith("brilliant-") === true);
}

function rustFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(resolve(root))) {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) {
      result.push(...rustFiles(relative(process.cwd(), absolute)));
    } else if (entry.endsWith(".rs")) {
      result.push(relative(process.cwd(), absolute).replaceAll("\\", "/"));
    }
  }
  return result;
}

function designAllowlistBlocks(): readonly [string[], string[]] {
  const future = readText(DESIGN_PATH).split(
    "## 14. Future implementation allowlist",
  )[1];
  assert.ok(future);
  const beforeRollout = future.split("## 15. Rollout and rollback", 1)[0] ?? "";
  const blocks = Array.from(
    beforeRollout.matchAll(/```text\r?\n([\s\S]*?)```/gu),
    (match) => lines(match[1] ?? "").map((path) => path.trim()),
  );
  assert.equal(blocks.length, 2);
  return [blocks[0] ?? [], blocks[1] ?? []];
}

function currentImplementationChanges(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--name-only", `${IMPLEMENTATION_BASE}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function fullRunnerPlanningChangesAtContentHead(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--name-only",
        `${FULL_RUNNER_PLANNING_BASE}..${FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD}`,
      ]),
    ),
  );
}

function assertExactPathSet(
  actual: ReadonlySet<string>,
  expected: readonly string[],
  label: string,
): void {
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${label} path set must be exact`,
  );
}

function validateImplementationCandidateFixture(paths: readonly string[]): void {
  assert.equal(
    FULL_RUNNER_FUTURE_IMPLEMENTATION_BASE,
    FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD,
  );
  const expected = new Set<string>([
    ...CHILD_TECHNICAL_PATHS,
    ...CHILD_ACTIVE_LIFECYCLE_PATHS,
  ]);
  assert.equal(CHILD_TECHNICAL_PATHS.length, 4);
  assert.equal(CHILD_ACTIVE_LIFECYCLE_PATHS.length, 11);
  assert.equal(expected.size, 15);
  assertExactPathSet(new Set(paths), [...expected], "implementation candidate");
  assert.equal(
    CHILD_TECHNICAL_PATHS.some((path) =>
      EXPECTED_IMPLEMENTATION_PATHS.includes(
        path as (typeof EXPECTED_IMPLEMENTATION_PATHS)[number],
      ),
    ),
    true,
    "the workspace-law is intentionally shared by the RKP-2 and child projections",
  );
}

function validateAuthorityProjectionFixture(
  paths: readonly string[],
  phase: "active" | "archived",
): void {
  const actual = new Set(paths);
  const expected =
    phase === "active"
      ? EXPECTED_COORDINATION_PATHS
      : EXPECTED_POST_ARCHIVE_COORDINATION_PATHS;
  const forbidden =
    phase === "active" ? ARCHIVED_CHILD_PATHS : ACTIVE_CHILD_PLANNING_PATHS;
  assertExactPathSet(actual, expected, `${phase} authority projection`);
  for (const path of forbidden) {
    assert.equal(actual.has(path), false, `dual authority is forbidden: ${path}`);
  }
  if (phase === "archived") {
    assert.equal(
      actual.has(`${FULL_RUNNER_ARCHIVE_ROOT}/research/implementation-evidence.md`),
      true,
      "archived authority requires implementation evidence",
    );
  }
}

type PlannedTestEvent = Readonly<{
  type: string;
  data?: Readonly<{
    nesting?: unknown;
    file?: unknown;
    name?: unknown;
    details?: Readonly<{ type?: string }>;
  }>;
}>;

type PlannedStreamState = Readonly<{
  ended: boolean;
  errored?: boolean;
  aborted?: boolean;
  prematureClose?: boolean;
  reporterFlushed: boolean;
}>;

function normalizedAbsolute(path: string): string {
  return resolve(path).replaceAll("\\", "/");
}

function evaluatePlannedFileCoverage(
  manifestFiles: readonly string[],
  runFiles: readonly string[],
  events: readonly PlannedTestEvent[],
  state: PlannedStreamState,
): string {
  if (state.errored === true) return "runner.stream-error";
  if (state.aborted === true) return "runner.stream-aborted";
  if (state.prematureClose === true || !state.ended) {
    return "runner.stream-incomplete";
  }
  if (!state.reporterFlushed) return "runner.reporter-flush-failed";

  const normalizedManifestFiles = manifestFiles.map(normalizedAbsolute);
  const normalizedRunFiles = runFiles.map(normalizedAbsolute);
  if (
    normalizedManifestFiles.length !== normalizedRunFiles.length ||
    normalizedManifestFiles.some((file, index) => file !== normalizedRunFiles[index])
  ) {
    return "runner.manifest-mismatch";
  }
  const manifest = new Set(normalizedManifestFiles);
  const seenManifestFiles = new Set<string>();
  for (const event of events) {
    if (event.type === "test:interrupted") return "runner.test-interrupted";
    if (event.type === "test:fail") return "runner.test-failed";
    if (event.type !== "test:pass") continue;

    const file = event.data?.file;
    if (typeof file !== "string" || file.length === 0 || !isAbsolute(file)) {
      return "runner.outcome-path-missing";
    }
    const normalizedFile = normalizedAbsolute(file);
    if (!manifest.has(normalizedFile)) return "runner.outcome-unknown";
    seenManifestFiles.add(normalizedFile);
  }
  if (seenManifestFiles.size !== manifest.size) return "runner.outcome-missing";
  return "ok";
}

type PlannedIdentityEntry = Readonly<{
  path: string;
  isFile: boolean;
  dev: unknown;
  ino: unknown;
}>;

function validatePhysicalIdentitiesBeforeRun(
  entries: readonly PlannedIdentityEntry[],
  run: () => void,
): string {
  const normalizedPaths = new Set<string>();
  const identities = new Set<string>();
  for (const entry of entries) {
    const path = normalizedAbsolute(entry.path);
    if (normalizedPaths.has(path)) return "runner.path-duplicate";
    normalizedPaths.add(path);
    if (!entry.isFile) return "runner.not-regular-file";
    if (
      typeof entry.dev !== "bigint" ||
      typeof entry.ino !== "bigint" ||
      (entry.dev === 0n && entry.ino === 0n)
    ) {
      return "runner.identity-unavailable";
    }
    const identity = `${entry.dev}:${entry.ino}`;
    if (identities.has(identity)) return "runner.physical-alias";
    identities.add(identity);
  }
  run();
  return "ok";
}

test("implementation changes stay inside the literal RKP-2 allowlists", async () => {
  const [implementation, coordination] = designAllowlistBlocks();
  assert.deepEqual(implementation, [...EXPECTED_IMPLEMENTATION_PATHS]);
  assert.deepEqual(coordination, [...EXPECTED_COORDINATION_PATHS]);
  assert.equal(new Set(implementation).size, 21);
  assert.equal(new Set(coordination).size, 22);

  const allowed = new Set<string>([...implementation, ...coordination]);
  for (const path of currentImplementationChanges()) {
    assert.equal(allowed.has(path), true, `unreviewed implementation path: ${path}`);
  }
  assertFullRunnerLifecycleFixtures();
  await assertCrossVersionOutcomeFixtures();
  assertPhysicalIdentityFixtures();
});

function assertFullRunnerLifecycleFixtures(): void {
  for (const commit of [
    FULL_RUNNER_PLANNING_BASE,
    FIRST_REVIEWED_FULL_RUNNER_PLANNING_HEAD,
    ACCEPTED_FULL_RUNNER_PLANNING_HEAD,
    FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD,
  ]) {
    assert.doesNotThrow(() => git(["cat-file", "-e", `${commit}^{commit}`]));
  }
  assert.deepEqual(
    git([
      "rev-list",
      "--parents",
      "-n",
      "1",
      FIRST_REVIEWED_FULL_RUNNER_PLANNING_HEAD,
    ]).split(" "),
    [FIRST_REVIEWED_FULL_RUNNER_PLANNING_HEAD, FULL_RUNNER_PLANNING_BASE],
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      ACCEPTED_FULL_RUNNER_PLANNING_HEAD,
      FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD,
    ]),
  );
  assert.deepEqual(
    git([
      "rev-list",
      "--parents",
      "-n",
      "1",
      FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD,
    ]).split(" "),
    [FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD, ACCEPTED_FULL_RUNNER_PLANNING_HEAD],
  );
  assertExactPathSet(
    fullRunnerPlanningChangesAtContentHead(),
    FULL_RUNNER_PLANNING_PATHS,
    "approved base through pinned event-coverage content head",
  );
  assert.equal(new Set(FULL_RUNNER_PLANNING_PATHS).size, 20);

  validateImplementationCandidateFixture([
    ...CHILD_TECHNICAL_PATHS,
    ...CHILD_ACTIVE_LIFECYCLE_PATHS,
  ]);
  assert.throws(() =>
    validateImplementationCandidateFixture(CHILD_TECHNICAL_PATHS),
  );

  validateAuthorityProjectionFixture(EXPECTED_COORDINATION_PATHS, "active");
  validateAuthorityProjectionFixture(
    EXPECTED_POST_ARCHIVE_COORDINATION_PATHS,
    "archived",
  );
  assert.equal(EXPECTED_COORDINATION_PATHS.length, 22);
  assert.equal(EXPECTED_POST_ARCHIVE_COORDINATION_PATHS.length, 23);
  assert.throws(() =>
    validateAuthorityProjectionFixture(
      [...EXPECTED_COORDINATION_PATHS, ...ARCHIVED_CHILD_PATHS],
      "active",
    ),
  );
  assert.throws(() =>
    validateAuthorityProjectionFixture(
      EXPECTED_POST_ARCHIVE_COORDINATION_PATHS.filter(
        (path) => path !== `${FULL_RUNNER_ARCHIVE_ROOT}/research/implementation-evidence.md`,
      ),
      "archived",
    ),
  );
}

async function assertCrossVersionOutcomeFixtures(): Promise<void> {
  const first = resolve("dist/test/alpha.test.js");
  const second = resolve("dist/test/nested/beta.test.js");
  const manifest = [first, second];
  const runFiles = [...manifest];
  const ended = { ended: true, reporterFlushed: true } as const;
  const passEvents: readonly PlannedTestEvent[] = [
    {
      type: "test:pass",
      data: { nesting: 0, file: first, name: "internal alpha pass" },
    },
    {
      type: "test:pass",
      data: { nesting: 8, file: first, name: second, details: { type: "ignored" } },
    },
    {
      type: "test:pass",
      data: { nesting: -1, file: second, name: "opaque beta title" },
    },
  ];
  assert.equal(
    evaluatePlannedFileCoverage(manifest, runFiles, passEvents, ended),
    "ok",
  );
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [{ type: "test:fail", data: { nesting: 4 } }, ...passEvents],
      ended,
    ),
    "runner.test-failed",
  );
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [{ type: "test:interrupted", data: { nesting: 0 } }, ...passEvents],
      ended,
    ),
    "runner.test-interrupted",
  );
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [
        { type: "test:complete", data: { nesting: 0, file: first } },
        {
          type: "diagnostic",
          data: { nesting: 0, file: second, details: { type: "pass" } },
        },
      ],
      ended,
    ),
    "runner.outcome-missing",
  );
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [...passEvents, passEvents[0]!],
      ended,
    ),
    "ok",
  );
  assert.equal(
    evaluatePlannedFileCoverage(manifest, runFiles, passEvents.slice(0, 2), ended),
    "runner.outcome-missing",
  );
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [
        {
          type: "test:pass",
          data: { nesting: 0, file: first, name: second },
        },
        { type: "test:pass", data: { file: second, name: first } },
      ],
      ended,
    ),
    "ok",
  );
  for (const malformedFile of [undefined, 42, "", "dist/test/alpha.test.js"]) {
    assert.equal(
      evaluatePlannedFileCoverage(
        manifest,
        runFiles,
        [{ type: "test:pass", data: { file: malformedFile } }],
        ended,
      ),
      "runner.outcome-path-missing",
    );
  }
  assert.equal(
    evaluatePlannedFileCoverage(
      manifest,
      runFiles,
      [{ type: "test:pass", data: { file: resolve("dist/test/unknown.test.js") } }],
      ended,
    ),
    "runner.outcome-unknown",
  );
  assert.equal(
    evaluatePlannedFileCoverage(manifest, [second, first], passEvents, ended),
    "runner.manifest-mismatch",
  );
  assert.equal(
    evaluatePlannedFileCoverage(manifest, runFiles, passEvents, {
      ended: false,
      prematureClose: true,
      reporterFlushed: true,
    }),
    "runner.stream-incomplete",
  );
  assert.equal(
    evaluatePlannedFileCoverage(manifest, runFiles, passEvents, {
      ended: true,
      reporterFlushed: false,
    }),
    "runner.reporter-flush-failed",
  );

  const stream = new EventEmitter();
  const observed: string[] = [];
  const returnedStream = stream;
  returnedStream.on("test:pass", () => observed.push("pass"));
  returnedStream.on("end", () => observed.push("end"));
  await new Promise<void>((done) => {
    queueMicrotask(() => {
      stream.emit("test:pass", { nesting: 0, file: first });
      stream.emit("end");
      done();
    });
  });
  assert.deepEqual(observed, ["pass", "end"]);
  assert.deepEqual(PLANNED_TRUTH_FIELDS, ["type", "data.file"]);
  assert.equal(
    PLANNED_TRUTH_FIELDS.includes(
      "data.details.type" as (typeof PLANNED_TRUTH_FIELDS)[number],
    ),
    false,
  );
  for (const ignored of ["data.name", "data.nesting"]) {
    assert.equal(
      PLANNED_TRUTH_FIELDS.includes(ignored as (typeof PLANNED_TRUTH_FIELDS)[number]),
      false,
    );
  }
}

function assertPhysicalIdentityFixtures(): void {
  const root = mkdtempSync(join(tmpdir(), "rkp2-runner-hardlink-"));
  try {
    const first = join(root, "first.test.js");
    const alias = join(root, "alias.test.js");
    writeFileSync(first, "// fixture\n", "utf8");
    linkSync(first, alias);
    const firstStats = lstatSync(first, { bigint: true });
    const aliasStats = lstatSync(alias, { bigint: true });
    let runCalls = 0;
    assert.equal(
      validatePhysicalIdentitiesBeforeRun(
        [
          {
            path: first,
            isFile: firstStats.isFile(),
            dev: firstStats.dev,
            ino: firstStats.ino,
          },
          {
            path: alias,
            isFile: aliasStats.isFile(),
            dev: aliasStats.dev,
            ino: aliasStats.ino,
          },
        ],
        () => {
          runCalls += 1;
        },
      ),
      "runner.physical-alias",
    );
    assert.equal(runCalls, 0);
    assert.equal(
      validatePhysicalIdentitiesBeforeRun(
        [{ path: first, isFile: true, dev: 1, ino: 2n }],
        () => {
          runCalls += 1;
        },
      ),
      "runner.identity-unavailable",
    );
    assert.equal(runCalls, 0);
    assert.equal(
      validatePhysicalIdentitiesBeforeRun(
        [{ path: first, isFile: true, dev: 0n, ino: 0n }],
        () => {
          runCalls += 1;
        },
      ),
      "runner.identity-unavailable",
    );
    assert.equal(runCalls, 0);
    assert.equal(
      validatePhysicalIdentitiesBeforeRun(
        [
          { path: first, isFile: true, dev: 1n, ino: 2n },
          { path: first, isFile: true, dev: 3n, ino: 4n },
        ],
        () => {
          runCalls += 1;
        },
      ),
      "runner.path-duplicate",
    );
    assert.equal(runCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("one-time post-Stage-5 manifest successor projection is exact and content-frozen", () => {
  for (const commit of [
    APPROVED_PLANNING_STATE,
    MANIFEST_PROJECTION_PARENT,
    MANIFEST_PROJECTION_COMMIT,
  ]) {
    assert.doesNotThrow(
      () => git(["cat-file", "-e", `${commit}^{commit}`]),
      `${commit} must exist as a commit`,
    );
  }
  assert.doesNotThrow(
    () =>
      git([
        "merge-base",
        "--is-ancestor",
        APPROVED_PLANNING_STATE,
        MANIFEST_PROJECTION_PARENT,
      ]),
    "approved planning state must be an ancestor of the Stage 5 parent",
  );
  assert.deepEqual(
    git([
      "rev-list",
      "--parents",
      "-n",
      "1",
      MANIFEST_PROJECTION_COMMIT,
    ]).split(" "),
    [MANIFEST_PROJECTION_COMMIT, MANIFEST_PROJECTION_PARENT],
  );

  const projections = [
    {
      path: IMPLEMENT_CONTEXT_PATH,
      count: 25,
      before:
        '{"file":"crates/brilliant-kernel-runtime/src/smoke_runtime.rs","reason":"Whole-DTO holder replaced only in implementation Stage 5."}',
      after:
        '{"file":"crates/brilliant-kernel-runtime/src/runtime.rs","reason":"Current KernelRuntime is the sole Runtime owner of LiveScoreStore plus revision zero for remaining implementation context."}',
    },
    {
      path: CHECK_CONTEXT_PATH,
      count: 20,
      before:
        '{"file":"crates/brilliant-kernel-runtime/src/smoke_runtime.rs","reason":"Confirm exact whole-DTO holder being replaced and no broader Runtime exists."}',
      after:
        '{"file":"crates/brilliant-kernel-runtime/src/runtime.rs","reason":"Audit KernelRuntime no longer retains a complete ScoreDocument and has no second state owner or alias."}',
    },
  ] as const;

  for (const projection of projections) {
    const approvedText = gitTextAt(APPROVED_PLANNING_STATE, projection.path);
    const stage5ParentText = gitTextAt(
      MANIFEST_PROJECTION_PARENT,
      projection.path,
    );
    assert.equal(
      approvedText,
      stage5ParentText,
      `${projection.path} drifted between approved planning and Stage 5`,
    );
    const approvedRows = lines(approvedText);
    const projectedText = gitTextAt(MANIFEST_PROJECTION_COMMIT, projection.path);
    const projectedRows = lines(projectedText);
    const currentText = readText(projection.path);
    const currentRows = lines(currentText);
    assert.equal(currentText, projectedText, `${projection.path} changed after projection`);
    assert.equal(approvedRows.length, projection.count);
    assert.equal(projectedRows.length, projection.count);
    assert.equal(currentRows.length, projection.count);

    const changedIndices = projectedRows.flatMap((row, index) =>
      row === approvedRows[index] ? [] : [index],
    );
    const projectionIndex = approvedRows.indexOf(projection.before);
    assert.notEqual(projectionIndex, -1);
    assert.deepEqual(changedIndices, [projectionIndex]);
    assert.equal(projectedRows[projectionIndex], projection.after);

    const approvedDecoded = approvedRows.map(
      (row) => JSON.parse(row) as { readonly file: string; readonly reason: string },
    );
    const projectedDecoded = projectedRows.map(
      (row) => JSON.parse(row) as { readonly file: string; readonly reason: string },
    );
    for (const [index, approvedEntry] of approvedDecoded.entries()) {
      const projectedEntry = projectedDecoded[index];
      assert.ok(projectedEntry);
      if (index === projectionIndex) {
        assert.deepEqual(Object.keys(approvedEntry), ["file", "reason"]);
        assert.deepEqual(Object.keys(projectedEntry), ["file", "reason"]);
        assert.notEqual(projectedEntry.file, approvedEntry.file);
        assert.notEqual(projectedEntry.reason, approvedEntry.reason);
      } else {
        assert.deepEqual(projectedEntry, approvedEntry);
      }
    }

    const decoded = currentRows.map(
      (row) => JSON.parse(row) as { readonly file: string; readonly reason: string },
    );
    assert.equal(new Set(decoded.map((entry) => entry.file)).size, projection.count);
    for (const entry of decoded) {
      assert.deepEqual(Object.keys(entry), ["file", "reason"]);
      assert.equal(typeof entry.reason, "string");
      assert.equal(existsSync(resolve(entry.file)), true, entry.file);
    }
  }

  for (const frozen of FROZEN_POST_STAGE_5_AUTHORITY_CONTENT) {
    assert.equal(sha256(readText(frozen.path)), frozen.sha256, frozen.path);
  }
});

test("seven-crate graph and the Runtime-only slotmap pin are exact", () => {
  const root = readText("Cargo.toml");
  assert.deepEqual(
    tomlArray(section(root, "workspace"), "members"),
    CRATES.map((crate) => `crates/${crate}`),
  );
  assert.deepEqual(
    tomlArray(section(root, "workspace"), "default-members"),
    CRATES.map((crate) => `crates/${crate}`),
  );

  const actualCrates = readdirSync(resolve("crates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualCrates, [...CRATES].sort());

  const workspaceDependencies = section(root, "workspace.dependencies");
  assert.equal(
    (workspaceDependencies.match(/^slotmap\s*=\s*"=1\.1\.1"$/gmu) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    workspaceDependencies,
    /slotmap\s*=.*(?:default-features|features|serde|unstable)/u,
  );

  const consumers: string[] = [];
  for (const crate of CRATES) {
    const manifest = readText(`crates/${crate}/Cargo.toml`);
    assert.deepEqual(
      projectInternalDependencies(manifest).sort(),
      [...EXPECTED_GRAPH[crate]].sort(),
    );
    if (/^slotmap\.workspace\s*=\s*true$/gmu.test(manifest)) {
      consumers.push(crate);
    }
    assert.doesNotMatch(
      manifest,
      /slotmap.*(?:default-features|features|serde|unstable)/u,
    );
  }
  assert.deepEqual(consumers, ["brilliant-kernel-runtime"]);

  const lock = readText("Cargo.lock");
  assert.match(
    lock,
    /\[\[package\]\]\nname = "slotmap"\nversion = "1\.1\.1"\n/u,
  );
  assert.equal((lock.match(/\nname = "slotmap"\n/gu) ?? []).length, 1);
});

test("slotmap and RuntimeHandle stay behind the Runtime boundary", () => {
  const manifestsWithSlotmap = CRATES.filter((crate) =>
    readText(`crates/${crate}/Cargo.toml`).includes("slotmap"),
  );
  assert.deepEqual(manifestsWithSlotmap, ["brilliant-kernel-runtime"]);

  const dtoAndFfiCrates = [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
    "brilliant-kernel-contracts",
    "brilliant-kernel-node",
  ] as const;
  for (const crate of dtoAndFfiCrates) {
    const sources = rustFiles(`crates/${crate}`);
    for (const sourcePath of sources) {
      assert.doesNotMatch(readText(sourcePath), /\bRuntimeHandle\b/u, sourcePath);
      if (
        crate === "brilliant-score-foundation" ||
        crate === "brilliant-kernel-contracts" ||
        crate === "brilliant-kernel-node"
      ) {
        assert.doesNotMatch(readText(sourcePath), /\bslotmap\b/u, sourcePath);
      }
    }
  }
});

test("Node exports and the StableFailureV1 union remain closed", () => {
  const nodeRoot = readText("crates/brilliant-kernel-node/src/lib.rs");
  const exports = Array.from(
    nodeRoot.matchAll(/#\[napi\(js_name\s*=\s*"([^"]+)"\)\]/gu),
    (match) => match[1] ?? "",
  ).sort();
  assert.deepEqual(exports, ["createKernelSessionV1", "readKernelSessionV1"]);

  const session = readText("crates/brilliant-kernel-contracts/src/session.rs");
  const codeStart = session.indexOf("pub fn code(&self)");
  const codeEnd = session.indexOf("impl Serialize for StableFailureV1", codeStart);
  assert.notEqual(codeStart, -1);
  assert.notEqual(codeEnd, -1);
  const codeBody = session.slice(codeStart, codeEnd);
  const codes = Array.from(
    codeBody.matchAll(
      /=>\s*(?:\{\s*)?"((?:bridge|codec|contract|score)\.[a-z0-9-]+)"/gu,
    ),
    (match) => match[1] ?? "",
  );
  assert.deepEqual(codes, [...STABLE_FAILURE_CODES]);
  assert.equal(new Set(codes).size, 22);
});

test("TypeScript remains default with exact public 28/51/8/34/9 inventories", () => {
  const manifest = JSON.parse(readText(MANIFEST_PATH)) as {
    readonly commandIds: readonly string[];
    readonly applicationRuntimeExports: readonly string[];
    readonly moduleSdkRuntimeExports: readonly string[];
    readonly moduleSdkTypeExports: readonly string[];
    readonly contributionAbiFields: readonly string[];
  };
  assert.deepEqual(manifest.commandIds, COMMAND_IDS);
  assert.deepEqual(manifest.applicationRuntimeExports, APPLICATION_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkRuntimeExports, MODULE_SDK_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkTypeExports, MODULE_SDK_TYPE_EXPORTS);
  assert.deepEqual(manifest.contributionAbiFields, CONTRIBUTION_ABI_FIELDS);
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map((entry) => entry.commandId),
    COMMAND_IDS,
  );
  assert.deepEqual(Object.keys(coreKernel).sort(), [...APPLICATION_RUNTIME_EXPORTS].sort());
  assert.deepEqual(Object.keys(moduleSdk).sort(), [...MODULE_SDK_RUNTIME_EXPORTS].sort());

  const sdkSource = readText("src/core-kernel/module-sdk/index.ts");
  const typeNames = Array.from(
    sdkSource.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/gmu),
    (match) => match[1] ?? "",
  )
    .flatMap((group) => group.split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort();
  assert.deepEqual(typeNames, [...MODULE_SDK_TYPE_EXPORTS].sort());
  for (const entry of CVN6_REGISTRATION_ENTRIES) {
    assert.deepEqual(Object.keys(entry.contributions[0] ?? {}), CONTRIBUTION_ABI_FIELDS);
  }

  const task = JSON.parse(readText(TASK_PATH)) as {
    readonly meta: Record<string, unknown>;
  };
  const parent = JSON.parse(readText(PARENT_PATH)) as {
    readonly meta: Record<string, unknown>;
  };
  assert.equal(task.meta.default_runtime, "typescript");
  assert.equal(task.meta.default_runtime_switch_authorized, false);
  assert.equal(parent.meta.rkp2_default_runtime, "typescript");
  assert.equal(parent.meta.rkp2_default_runtime_switch_authorized, false);
  assert.equal("createRustKernelSmokeSession" in coreKernel, false);
  assert.equal("readRustKernelSmokeSession" in coreKernel, false);
});

test("Stage 1 fixture helpers are deterministic and detached", () => {
  const first = createMinimalRkp2StoreFixture();
  const second = createMinimalRkp2StoreFixture();
  assert.equal(first.fixtureId, "minimal-score-v1");
  assert.equal(second.fixtureId, "minimal-score-v1");
  assert.notEqual(first, second);
  assert.notEqual(first.document, second.document);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    createRkp2StoreFixtureCatalog().map((fixture) => fixture.fixtureId),
    ["minimal-score-v1"],
  );

  (first.document.metadata as { title: string }).title = "mutated first fixture";
  assert.equal(second.document.metadata.title, "Core fixture");
});
