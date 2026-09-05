import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import {
  RKP3_CORE_COMMAND_IDS,
  createRkp3AtLimitBatchCommand,
  createRkp3OverLimitBatchPayload,
  createRkp3Stage3SubmitRequest,
} from "./rkp-3-transaction-fixtures";

const RKP2_ACCEPTED_BASE = "6d0956c970f4414cb61e0f3d7148672a6e635032";
const RKP3_PLANNING_HEAD = "78660bb63e249f7bbfec848b9b19e16d7dc55c25";
const RKP3_ARCHIVE_COMPATIBILITY_HEAD = "560fd89d32026cdc41c3cf0df65285e99e015456";
const RKP3_TASK_NAME = "09-04-rkp-3-transaction-overlay-changeset-core-commands";
const RKP4_TASK_NAME = "09-04-rkp-4-history-snapshots-events-replay";
const RKP3_ACTIVE_ROOT = `.trellis/tasks/${RKP3_TASK_NAME}`;
const RKP3_ARCHIVE_ROOT = `.trellis/tasks/archive/2026-09/${RKP3_TASK_NAME}`;
const RKP3_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/authority-and-runtime-gap.md",
  "research/changeset-overlay-and-capacity-decision.md",
  "research/file-test-and-rollback-matrix.md",
  "research/implementation-evidence.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const RKP3_LIFECYCLE_PATHS = [
  ...RKP3_TASK_MANIFEST.map((path) => `${RKP3_ACTIVE_ROOT}/${path}`),
  ...RKP3_TASK_MANIFEST.map((path) => `${RKP3_ARCHIVE_ROOT}/${path}`),
] as const;
const RKP3_IMPLEMENTATION_ALLOWLIST = [
  ...RKP3_LIFECYCLE_PATHS,
  ".trellis/spec/core-kernel/backend/rust-runtime-transition.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
  ".trellis/workspace/ATOM/index.md",
  ".trellis/workspace/ATOM/journal-1.md",
  "crates/brilliant-core-types/src/scalar.rs",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "crates/brilliant-kernel-contracts/src/command.rs",
  "crates/brilliant-kernel-contracts/src/lib.rs",
  "crates/brilliant-kernel-node/src/boundary.rs",
  "crates/brilliant-kernel-node/src/lib.rs",
  "crates/brilliant-kernel-runtime/src/change_set.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "crates/brilliant-kernel-runtime/src/lib.rs",
  "crates/brilliant-kernel-runtime/src/overlay.rs",
  "crates/brilliant-kernel-runtime/src/records.rs",
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/time_index.rs",
  "crates/brilliant-kernel-runtime/src/topology.rs",
  "crates/brilliant-kernel-runtime/src/transaction.rs",
  "crates/brilliant-kernel-session/src/commands/catalog.rs",
  "crates/brilliant-kernel-session/src/commands/hierarchy.rs",
  "crates/brilliant-kernel-session/src/commands/local.rs",
  "crates/brilliant-kernel-session/src/commands/measure.rs",
  "crates/brilliant-kernel-session/src/commands/mod.rs",
  "crates/brilliant-kernel-session/src/commands/range.rs",
  "crates/brilliant-kernel-session/src/lib.rs",
  "crates/brilliant-kernel-session/src/session.rs",
  "src/core-kernel/native/rust-kernel-smoke.ts",
  "test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts",
  "test/core-kernel/rust-migration/rkp-3-oracle-projection.test.ts",
  "test/core-kernel/rust-migration/rkp-3-transaction-fixtures.ts",
  "test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts",
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
const EXPECTED_COMMAND_CATALOG = [
  ["core.document.set-metadata", "document"],
  ["core.note.set-written-pitch", "note"],
  ["core.event.set-note-value", "event"],
  ["core.voice.insert-notes-event", "voice"],
  ["core.voice.insert-rest-event", "voice"],
  ["core.event.remove", "event"],
  ["core.measure.insert", "document"],
  ["core.measure.remove", "measure"],
  ["core.measure.move", "measure"],
  ["core.measure.set-definition", "measure"],
  ["core.part.insert", "document"],
  ["core.part.remove", "part"],
  ["core.part.move", "part"],
  ["core.part.set-name", "part"],
  ["core.part.set-instrument", "part"],
  ["core.staff.insert", "part"],
  ["core.staff.remove", "staff"],
  ["core.staff.move", "staff"],
  ["core.staff.set-definition", "staff"],
  ["core.voice.insert", "part"],
  ["core.voice.remove", "voice"],
  ["core.voice.move", "voice"],
  ["core.voice.set-default-staff", "voice"],
  ["core.voice.set-sequence-start", "voice"],
  ["core.event.set-staff-assignment", "event"],
  ["core.range.delete", "document"],
  ["core.range.transpose-written-pitch", "document"],
  ["core.transaction.batch", "document"],
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
  const output = execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return output.split(/\r?\n/u).filter((line) => line.length > 0);
}

function currentRkp3Changes(): Set<string> {
  if (existsSync(resolve(RKP3_ARCHIVE_ROOT))) {
    return new Set(
      gitLines([
        "diff",
        "--no-renames",
        "--name-only",
        `${RKP3_PLANNING_HEAD}..${RKP3_ARCHIVE_COMPATIBILITY_HEAD}`,
      ]),
    );
  }
  return new Set([
    ...gitLines(["diff", "--no-renames", "--name-only", `${RKP3_PLANNING_HEAD}..HEAD`]),
    ...gitLines(["diff", "--name-only"]),
    ...gitLines(["diff", "--cached", "--name-only"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ]);
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
      const childRelative = prefix === "" ? entry : `${prefix}/${entry}`;
      const stat = lstatSync(child);
      assert.equal(stat.isSymbolicLink(), false, `${childRelative} must not be a symlink`);
      if (stat.isDirectory()) visit(child, childRelative);
      else {
        assert.equal(stat.isFile(), true, `${childRelative} must be a regular file`);
        result.push(childRelative.replaceAll("\\", "/"));
      }
    }
  };
  visit(absoluteRoot, "");
  return result.sort();
}

test("RKP-3 resolves one exact active or archived lifecycle authority", () => {
  const activeExists = existsSync(resolve(RKP3_ACTIVE_ROOT));
  const archiveExists = existsSync(resolve(RKP3_ARCHIVE_ROOT));
  assert.notEqual(activeExists, archiveExists, "exactly one RKP-3 task root must exist");

  const root = activeExists ? RKP3_ACTIVE_ROOT : RKP3_ARCHIVE_ROOT;
  assert.deepEqual(filesUnder(root), [...RKP3_TASK_MANIFEST].sort());

  const task = JSON.parse(readText(`${root}/task.json`)) as {
    status?: unknown;
    completedAt?: unknown;
    relatedFiles?: unknown;
    meta?: Record<string, unknown>;
  };
  const parent = JSON.parse(
    readText(".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"),
  ) as { meta?: Record<string, unknown> };
  const taskMeta = task.meta ?? {};
  const parentMeta = parent.meta ?? {};

  if (activeExists) {
    assert.equal(task.status, "in_progress");
    assert.equal(parentMeta.current_implementation_child, RKP3_TASK_NAME);
    assert.equal(parentMeta.active_implementation_child, RKP3_TASK_NAME);
    return;
  }

  assert.equal(task.status, "completed");
  assert.equal(typeof task.completedAt, "string");
  assert.equal(taskMeta.current_stage, "accepted_archived_completed_historical_no_live_gate");
  assert.equal(taskMeta.acceptance_authorized, true);
  assert.equal(taskMeta.archive_authorized, true);
  assert.equal(taskMeta.next_gate, "completed_historical_no_live_gate");
  assert.equal(taskMeta.rkp4_authorized, false);
  assert.equal(taskMeta.qualification_authorized, false);
  assert.equal(taskMeta.runtime_cutover_authorized, false);
  assert.equal(taskMeta.push_authorized, false);
  assert.equal(parentMeta.rkp3_status, "accepted_archived");
  assert.equal(parentMeta.current_blocking_descendant, RKP4_TASK_NAME);
  assert.equal(parentMeta.current_implementation_child, RKP4_TASK_NAME);
  assert.equal(parentMeta.active_implementation_child, RKP4_TASK_NAME);
  assert.equal(parentMeta.rkp4_authorized, true);

  assert.ok(Array.isArray(task.relatedFiles));
  for (const path of task.relatedFiles) {
    if (typeof path === "string" && path.includes(RKP3_TASK_NAME))
      assert.equal(path.startsWith(`${RKP3_ARCHIVE_ROOT}/`), true, path);
  }
});

test("RKP-3 freezes the exact 28-command order and target kinds", () => {
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map(({ commandId, targetKind }) => [
      commandId,
      targetKind,
    ]),
    EXPECTED_COMMAND_CATALOG,
  );
  assert.deepEqual(RKP3_CORE_COMMAND_IDS, EXPECTED_COMMAND_CATALOG.map(([id]) => id));

  const rust = readText("crates/brilliant-kernel-contracts/src/command.rs");
  let previous = -1;
  for (const [commandId] of EXPECTED_COMMAND_CATALOG) {
    const next = rust.indexOf(`=> "${commandId}"`, previous + 1);
    assert.notEqual(next, -1, `Rust command ID missing or out of order: ${commandId}`);
    previous = next;
  }
  assert.match(rust, /pub const CORE_COMMAND_COUNT_V1: usize = 28;/u);
  assert.match(rust, /pub const MAX_BATCH_CHILDREN_V1: usize = 100;/u);
});

test("RKP-3 request and batch fixtures preserve exact public boundary keys", () => {
  const atLimit = createRkp3AtLimitBatchCommand();
  const request = createRkp3Stage3SubmitRequest(atLimit);
  assert.deepEqual(Object.keys(request), ["apiVersion", "command"]);
  assert.deepEqual(Object.keys(request.command), [
    "commandVersion",
    "commandId",
    "target",
    "payload",
  ]);
  assert.equal(atLimit.payload.commands.length, 100);
  assert.equal(createRkp3OverLimitBatchPayload().commands.length, 101);
});

test("RKP-3 keeps the seven-crate dependency surface and Cargo bytes unchanged", () => {
  const cargo = readText("Cargo.toml");
  const membersSection = cargo.match(/members = \[(?<members>[\s\S]*?)\]/u)?.groups?.members;
  if (membersSection === undefined) throw new Error("workspace members section missing");
  const members = [...membersSection.matchAll(/"crates\/([a-z-]+)"/gu)].map(
    ([, name]) => name,
  );
  assert.deepEqual(members, [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
    "brilliant-kernel-contracts",
    "brilliant-kernel-runtime",
    "brilliant-kernel-session",
    "brilliant-kernel-node",
  ]);
  assert.doesNotThrow(() =>
    execFileSync(
      "git",
      [
        "diff",
        "--exit-code",
        RKP2_ACCEPTED_BASE,
        "--",
        "Cargo.toml",
        "Cargo.lock",
        ":(glob)crates/*/Cargo.toml",
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
  );
});

test("RKP-3 adds no bridge failure and keeps stage failures data-only", () => {
  const nodeRoot = readText("crates/brilliant-kernel-node/src/lib.rs");
  const exports = Array.from(
    nodeRoot.matchAll(/#\[napi\(js_name\s*=\s*"([^"]+)"\)\]/gu),
    (match) => match[1] ?? "",
  ).sort();
  assert.deepEqual(exports, [
    "createKernelSessionV1",
    "operateKernelStage4V1",
    "readKernelSessionV1",
    "replayKernelStage4V1",
  ]);
  assert.match(nodeRoot, /#\[napi\]\s*pub fn submit_kernel_stage3_v1\(/u);
  assert.equal((nodeRoot.match(/#\[napi(?:\([^\]]*\))?\]/gu) ?? []).length, 5);

  const session = readText("crates/brilliant-kernel-contracts/src/session.rs");
  for (const code of STABLE_BRIDGE_FAILURE_CODES) {
    assert.equal(
      session.split(`"${code}"`).length - 1,
      1,
      `bridge failure drift: ${code}`,
    );
  }
  assert.equal(new Set(STABLE_BRIDGE_FAILURE_CODES).size, 22);

  const command = readText("crates/brilliant-kernel-contracts/src/command.rs");
  for (const token of [
    "command.invalid-envelope",
    "command.batch-child-rejected",
    "changeset-logical-bytes",
    "stage3.local-invariant-rejected",
    "full_document_scans",
    "ffi_response_bytes",
  ]) {
    assert.ok(command.includes(token), `missing stage-three contract token: ${token}`);
  }
  for (const forbidden of ["std::error::Error", "anyhow", "thiserror", "Box<dyn", "callback"])
    assert.equal(command.includes(forbidden), false, `data-only boundary leaked: ${forbidden}`);
});

test("RKP-3 implementation changes stay inside its literal successor allowlist", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", RKP3_PLANNING_HEAD, "HEAD"],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
  );
  const allowed = new Set<string>(RKP3_IMPLEMENTATION_ALLOWLIST);
  assert.equal(allowed.size, RKP3_IMPLEMENTATION_ALLOWLIST.length);
  const changes = currentRkp3Changes();
  for (const path of changes)
    assert.equal(allowed.has(path), true, `unreviewed RKP-3 implementation path: ${path}`);
  for (const required of [
    "crates/brilliant-kernel-runtime/src/change_set.rs",
    "crates/brilliant-kernel-runtime/src/transaction.rs",
    "crates/brilliant-kernel-session/src/commands/catalog.rs",
    "src/core-kernel/native/rust-kernel-smoke.ts",
    "test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts",
  ])
    assert.equal(changes.has(required), true, `missing RKP-3 owned path: ${required}`);
});

test("RKP-3 preserved its historical inputs and current fixtures/build-output rules remain intact", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      "git",
      [
        "diff",
        "--exit-code",
        RKP2_ACCEPTED_BASE,
        RKP3_ARCHIVE_COMPATIBILITY_HEAD,
        "--",
        "Cargo.toml",
        "Cargo.lock",
        ":(glob)crates/*/Cargo.toml",
        "rust-toolchain.toml",
        "rustfmt.toml",
        "crates/brilliant-score-foundation",
        "crates/brilliant-extension-protocol",
        "src/core-kernel/index.ts",
        "src/core-kernel/module-sdk/index.ts",
        "test/core-kernel/rust-migration/fixtures",
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
  );

  for (const fixture of FROZEN_FIXTURES) {
    const bytes = readFileSync(resolve(fixture.path));
    assert.equal(bytes.length, fixture.bytes, fixture.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      fixture.sha256,
      fixture.path,
    );
  }

  const trackedGenerated = gitLines(["ls-files"]).filter(
    (path) =>
      /(?:^|\/)(?:target|dist|node_modules)\//u.test(path) ||
      /\.(?:dll|node)$/u.test(path),
  );
  assert.deepEqual(trackedGenerated, []);
});
