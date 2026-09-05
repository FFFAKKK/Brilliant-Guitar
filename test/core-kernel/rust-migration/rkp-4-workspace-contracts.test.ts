import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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

const RKP4_PLANNING_HEAD = "91b3f057612befa09e74665e0aa70bbf9a6eca48";
const RKP4_AUDITED_HEAD = "902eacd50422994898eca2a0eaaab924595b8ab7";
const RKP4_TASK_NAME = "09-04-rkp-4-history-snapshots-events-replay";
const RKP4_TASK_ROOT = `.trellis/tasks/${RKP4_TASK_NAME}`;
const PARENT_PATH =
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const RKP4_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/authority-runtime-gap.md",
  "research/file-test-and-rollback-matrix.md",
  "research/history-checkpoint-and-dirty-decision.md",
  "research/native-events-read-replay-boundary.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const RKP4_IMPLEMENTATION_ALLOWLIST = [
  ...RKP4_TASK_MANIFEST.map((path) => `${RKP4_TASK_ROOT}/${path}`),
  ".trellis/spec/core-kernel/backend/rust-runtime-transition.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
  ".trellis/workspace/ATOM/index.md",
  ".trellis/workspace/ATOM/journal-1.md",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "crates/brilliant-kernel-contracts/src/command.rs",
  "crates/brilliant-kernel-contracts/src/lib.rs",
  "crates/brilliant-kernel-contracts/src/session.rs",
  "crates/brilliant-kernel-runtime/src/lib.rs",
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-runtime/src/transaction.rs",
  "crates/brilliant-kernel-runtime/src/history.rs",
  "crates/brilliant-kernel-runtime/src/session_projection.rs",
  "crates/brilliant-kernel-runtime/src/selectors.rs",
  "crates/brilliant-kernel-runtime/src/checkpoint.rs",
  "crates/brilliant-kernel-session/src/lib.rs",
  "crates/brilliant-kernel-session/src/session.rs",
  "crates/brilliant-kernel-node/src/boundary.rs",
  "crates/brilliant-kernel-node/src/lib.rs",
  "src/core-kernel/native/rust-kernel-smoke.ts",
  "test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts",
  "test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts",
  "test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-4-fixtures.ts",
  "test/core-kernel/rust-migration/rkp-4-history-events.test.ts",
  "test/core-kernel/rust-migration/rkp-4-read-selectors.test.ts",
  "test/core-kernel/rust-migration/rkp-4-replay-oracle.test.ts",
  "test/core-kernel/rust-migration/rkp-4-workspace-contracts.test.ts",
] as const;
const FROZEN_FIXTURES = [
  {
    path: "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json",
    bytes: 15_168,
    sha256: "3814ed1da21f8de7135a71ab3e4b0a1ba888a76e6163ed1868756353005dabf7",
  },
  {
    path: "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl",
    bytes: 1_307_605,
    sha256: "9761691b07082f5434126f2048f91ad415f91418799ec6bf316c2ae4d2fb9cb2",
  },
  {
    path: "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json",
    bytes: 2_982,
    sha256: "7059cb088d064d4d4450bd23830ac6bce0259070d6e08ce54b5b3d4c4e0cde05",
  },
] as const;
const STABLE_BRIDGE_FAILURE_CODES = [
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

function gitLines(args: readonly string[]): string[] {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" })
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => line.replaceAll("\\", "/"));
}

function currentRkp4Changes(): Set<string> {
  // The RKP-4 allowlist governs its immutable reviewed candidate. Later
  // authorized work has its own scope and must not rewrite that history.
  return new Set(gitLines([
    "diff", "--no-renames", "--name-only",
    `${RKP4_PLANNING_HEAD}..${RKP4_AUDITED_HEAD}`,
  ]));
}

function filesUnder(root: string): string[] {
  const absoluteRoot = resolve(root);
  const rootStat = lstatSync(absoluteRoot);
  assert.equal(rootStat.isSymbolicLink(), false, `${root} must not be a symlink`);
  assert.equal(rootStat.isDirectory(), true, `${root} must be a directory`);
  const result: string[] = [];
  const visit = (absolute: string, prefix: string): void => {
    for (const entry of readdirSync(absolute)) {
      const child = join(absolute, entry);
      const relative = prefix === "" ? entry : `${prefix}/${entry}`;
      const stat = lstatSync(child);
      assert.equal(stat.isSymbolicLink(), false, `${relative} must not be a symlink`);
      if (stat.isDirectory()) visit(child, relative);
      else {
        assert.equal(stat.isFile(), true, `${relative} must be a regular file`);
        result.push(relative.replaceAll("\\", "/"));
      }
    }
  };
  visit(absoluteRoot, "");
  return result.sort();
}

test("RKP-4 keeps one active lifecycle authority and exactly one implementation child", () => {
  assert.equal(existsSync(resolve(RKP4_TASK_ROOT)), true);
  assert.deepEqual(filesUnder(RKP4_TASK_ROOT), [...RKP4_TASK_MANIFEST].sort());
  const task = JSON.parse(readText(`${RKP4_TASK_ROOT}/task.json`)) as {
    status: unknown;
    meta: Record<string, unknown>;
  };
  const parent = JSON.parse(readText(PARENT_PATH)) as {
    meta: Record<string, unknown>;
  };
  assert.equal(task.status, "in_progress");
  assert.equal(parent.meta.current_implementation_child, RKP4_TASK_NAME);
  assert.equal(parent.meta.active_implementation_child, RKP4_TASK_NAME);
  assert.equal(task.meta.production_implementation_authorized, true);
  assert.equal(task.meta.implementation_candidate_ready, true);
  const implementationReview = task.meta.implementation_review;
  if (implementationReview === "pending_one_bounded_final_audit") {
    assert.equal(task.meta.current_stage, "implementation_candidate_ready_pending_bounded_audit");
    assert.equal(task.meta.next_gate, "one_bounded_implementation_audit_only");
    assert.equal(parent.meta.next_gate, "rkp4_one_bounded_implementation_audit_only");
  } else {
    assert.equal(implementationReview, "passed_bounded_final_audit_P0_0_P1_0_P2_0");
    assert.equal(task.meta.current_stage, "implementation_candidate_audited_pending_owner_acceptance");
    assert.equal(
      task.meta.next_gate,
      "owner_acceptance_or_return_decision_requires_explicit_instruction",
    );
    assert.equal(
      parent.meta.next_gate,
      "rkp4_owner_acceptance_or_return_decision_requires_explicit_instruction",
    );
  }
  for (const key of [
    "acceptance_authorized",
    "archive_authorized",
    "rkp5_authorized",
    "qualification_authorized",
    "runtime_cutover_authorized",
    "push_authorized",
  ])
    assert.equal(task.meta[key], false, `RKP-4 later gate drift: ${key}`);
  assert.equal(task.meta.default_runtime, "typescript");
});

test("RKP-4 audited changes stay inside the historical literal implementation allowlist", () => {
  assert.doesNotThrow(() =>
    execFileSync("git", ["merge-base", "--is-ancestor", RKP4_AUDITED_HEAD, "HEAD"], {
      cwd: process.cwd(),
      stdio: "pipe",
    }),
  );
  const allowed = new Set<string>(RKP4_IMPLEMENTATION_ALLOWLIST);
  assert.equal(allowed.size, RKP4_IMPLEMENTATION_ALLOWLIST.length);
  const changes = currentRkp4Changes();
  for (const path of changes)
    assert.equal(allowed.has(path), true, `unreviewed RKP-4 implementation path: ${path}`);
  for (const required of [
    "crates/brilliant-kernel-runtime/src/history.rs",
    "crates/brilliant-kernel-runtime/src/checkpoint.rs",
    "crates/brilliant-kernel-runtime/src/selectors.rs",
    "src/core-kernel/native/rust-kernel-smoke.ts",
    "test/core-kernel/rust-migration/rkp-4-workspace-contracts.test.ts",
  ])
    assert.equal(changes.has(required), true, `missing RKP-4 owned path: ${required}`);
});

test("seven-crate surface stays exact and historical RKP-4 dependencies are unchanged", () => {
  const cargo = readText("Cargo.toml");
  const membersSection = cargo.match(/members = \[(?<members>[\s\S]*?)\]/u)?.groups?.members;
  if (membersSection === undefined) throw new Error("workspace members section missing");
  assert.deepEqual(
    [...membersSection.matchAll(/"crates\/([a-z-]+)"/gu)].map(([, name]) => name),
    [
      "brilliant-core-types",
      "brilliant-score-foundation",
      "brilliant-extension-protocol",
      "brilliant-kernel-contracts",
      "brilliant-kernel-runtime",
      "brilliant-kernel-session",
      "brilliant-kernel-node",
    ],
  );
  assert.doesNotThrow(() =>
    execFileSync(
      "git",
      [
        "diff",
        "--exit-code",
        RKP4_PLANNING_HEAD,
        RKP4_AUDITED_HEAD,
        "--",
        "Cargo.toml",
        "Cargo.lock",
        ":(glob)crates/*/Cargo.toml",
        "package.json",
        "package-lock.json",
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
  );
});

test("RKP-4 exposes exactly five private Node calls and no new bridge failure", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as object;
  assert.deepEqual(Object.keys(addon).sort(), [
    "createKernelSessionV1",
    "operateKernelStage4V1",
    "readKernelSessionV1",
    "replayKernelStage4V1",
    "submitKernelStage3V1",
  ]);
  const nodeRoot = readText("crates/brilliant-kernel-node/src/lib.rs");
  assert.equal((nodeRoot.match(/#\[napi(?:\([^\]]*\))?\]/gu) ?? []).length, 5);
  const session = readText("crates/brilliant-kernel-contracts/src/session.rs");
  for (const code of STABLE_BRIDGE_FAILURE_CODES) {
    assert.equal(session.split(`"${code}"`).length - 1, 1, `bridge failure drift: ${code}`);
  }
  assert.equal(new Set(STABLE_BRIDGE_FAILURE_CODES).size, 22);
});

test("RKP-4 keeps history and mutation results free of full documents and ChangeSets", () => {
  const history = readText("crates/brilliant-kernel-runtime/src/history.rs");
  const entryStart = history.indexOf("struct HistoryEntryV1");
  const entryEnd = history.indexOf("struct HistoryStateV1", entryStart);
  assert.notEqual(entryStart, -1);
  assert.notEqual(entryEnd, -1);
  const entry = history.slice(entryStart, entryEnd);
  assert.equal(entry.includes("ScoreDocumentV1"), false);
  assert.equal(entry.includes("SharedScoreDocumentV1"), false);

  const contracts = readText("crates/brilliant-kernel-contracts/src/session.rs");
  const resultStart = contracts.indexOf("pub struct KernelStage4MutationValueV1");
  const resultEnd = contracts.indexOf("pub struct KernelStage4MarkPersistedValueV1", resultStart);
  assert.notEqual(resultStart, -1);
  assert.notEqual(resultEnd, -1);
  const results = contracts.slice(resultStart, resultEnd);
  assert.equal(results.includes("ScoreDocumentV1"), false);
  assert.equal(results.includes("ChangeSet"), false);
  assert.equal(results.includes("pub document:"), false);
});

test("RKP-4 preserves immutable oracle, manifest and qualification bytes", () => {
  for (const fixture of FROZEN_FIXTURES) {
    const bytes = readFileSync(resolve(fixture.path));
    assert.equal(bytes.length, fixture.bytes, fixture.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256, fixture.path);
  }
  assert.doesNotThrow(() =>
    execFileSync(
      "git",
      ["diff", "--exit-code", RKP4_PLANNING_HEAD, "--", "test/core-kernel/rust-migration/fixtures"],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
  );
});

test("TypeScript remains default with exact public 28/51/8/34/9 inventories", () => {
  const manifest = JSON.parse(readText(MANIFEST_PATH)) as {
    commandIds: readonly string[];
    applicationRuntimeExports: readonly string[];
    moduleSdkRuntimeExports: readonly string[];
    moduleSdkTypeExports: readonly string[];
    contributionAbiFields: readonly string[];
    persistedSchema: unknown;
  };
  assert.equal(manifest.persistedSchema, "brilliant-score-1");
  assert.deepEqual(manifest.commandIds, COMMAND_IDS);
  assert.deepEqual(manifest.applicationRuntimeExports, APPLICATION_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkRuntimeExports, MODULE_SDK_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkTypeExports, MODULE_SDK_TYPE_EXPORTS);
  assert.deepEqual(manifest.contributionAbiFields, CONTRIBUTION_ABI_FIELDS);
  assert.equal(COMMAND_IDS.length, 28);
  assert.equal(APPLICATION_RUNTIME_EXPORTS.length, 51);
  assert.equal(MODULE_SDK_RUNTIME_EXPORTS.length, 8);
  assert.equal(MODULE_SDK_TYPE_EXPORTS.length, 34);
  assert.equal(CONTRIBUTION_ABI_FIELDS.length, 9);
  assert.deepEqual(CORE_COMMAND_DEFINITIONS.map(({ commandId }) => commandId), COMMAND_IDS);
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
  for (const entry of CVN6_REGISTRATION_ENTRIES)
    assert.deepEqual(Object.keys(entry.contributions[0] ?? {}), CONTRIBUTION_ABI_FIELDS);
  for (const privateName of [
    "createRustKernelSmokeSession",
    "createRustKernelStage4Session",
    "replayRustKernelStage4",
  ])
    assert.equal(privateName in coreKernel, false, `${privateName} must stay private`);
});

test("RKP-4 tracks no generated native/build output", () => {
  const trackedGenerated = gitLines(["ls-files"]).filter(
    (path) =>
      /(?:^|\/)(?:target|dist|node_modules)\//u.test(path) ||
      /\.(?:dll|node|log|tmp)$/u.test(path),
  );
  assert.deepEqual(trackedGenerated, []);
});
