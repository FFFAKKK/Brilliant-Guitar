import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { relative, resolve } from "node:path";
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

const EXPECTED_COORDINATION_PATHS = [
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
    sha256: "03ac7dcca317f472fd7fb7181b99d96861c3692524982ef37268e130d7d5149e",
  },
  {
    path: IMPLEMENT_PATH,
    sha256: "97d2cdaf1088b7f53fbf51e374e02f7e3863ef62609afbebe8f3e7093bbaa906",
  },
  {
    path: FILE_TEST_ROLLBACK_MATRIX_PATH,
    sha256: "99989324eceb8cb81c0f7db1073b0a829005898bc9d07447ca6cd20acfe93a94",
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

test("implementation changes stay inside the literal RKP-2 allowlists", () => {
  const [implementation, coordination] = designAllowlistBlocks();
  assert.deepEqual(implementation, [...EXPECTED_IMPLEMENTATION_PATHS]);
  assert.deepEqual(coordination, [...EXPECTED_COORDINATION_PATHS]);
  assert.equal(new Set(implementation).size, 21);
  assert.equal(new Set(coordination).size, 10);

  const allowed = new Set<string>([...implementation, ...coordination]);
  for (const path of currentImplementationChanges()) {
    assert.equal(allowed.has(path), true, `unreviewed implementation path: ${path}`);
  }
});

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
