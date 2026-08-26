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
const FULL_RUNNER_EVENT_COVERAGE_ANCHOR =
  "c69d7b76175e2b818f4d276504a39b741e6e1975";
const PAUSED_FULL_RUNNER_IMPLEMENTATION_HEAD =
  "d366653788a42eb56cd5755a63b1e73700c67310";
const FULL_RUNNER_AMENDMENT_MERGE_COMMIT =
  "b4906ac64a44cc735de7b923818817300d5c70fd";
const FULL_RUNNER_ACCEPTED_IMPLEMENTATION_HEAD =
  "8d9a2a4a35c7707fad5398733eb43c08984bea2b";
const FULL_RUNNER_ACCEPTANCE_SYNC_COMMIT =
  "163a371bc572d062ef335d52ef5a33c71b513b66";
const FULL_RUNNER_ARCHIVE_COMMIT =
  "a1895f36090aafaa8865ffc21e1b6f15679e3be9";
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
const PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD =
  "ee1af9409b4140d322c88389a4c1df1368655a31";
const PART_OWNER_REPAIR_ACCEPTED_CANDIDATE =
  "c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa";
const PART_OWNER_REPAIR_ACTIVE_ROOT =
  ".trellis/tasks/08-26-rkp-2-part-owner-wire-contract-repair";
const PART_OWNER_REPAIR_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-08/08-26-rkp-2-part-owner-wire-contract-repair";
const STAGE_6_PREREQUISITE_HEAD =
  "1bea1b4baeb6547e3a2b5cca645b2fe00d66abc7";
const RKP1A_IMPLEMENTATION_BASE =
  "639e93555c15b46c54c8e9bb7ec610d4a77c7478";
const RKP1A_AUDITED_P2_HEAD =
  "0f65272951fd23080b6f536b2e58f50afe249b02";
const RKP1A_ACCEPTED_P3A_PLANNING_HEAD =
  "1494b5582622d99dd5ad12787bf22e2f1596ebe5";
const RKP1A_AUDITED_P3A_HEAD =
  "bd8946e83137d88a8084ac5851e8b5de8463313a";
const RKP1A_AUDITED_P3B_HEAD =
  "f06c57b2a7be8d6bb57736e585bd8519b7ecc889";
const RKP1A_P3B_REPAIR_HEAD =
  "673a2b961d0f627b5f9e53002da3d8c0bcdfc3cd";
const RKP1A_ACTIVE_ROOT =
  ".trellis/tasks/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair";
const RKP1A_TECHNICAL_PATHS = [
  "crates/brilliant-core-types/src/json.rs",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "src/core-kernel/codec/strict-input-capture.ts",
  "src/core-kernel/native/rust-kernel-smoke.ts",
  "test/core-kernel/cvn-3-strict-input.test.ts",
  "test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const RKP1A_P3A_TECHNICAL_PATHS = [
  "src/core-kernel/codec/strict-input-capture.ts",
  "src/core-kernel/native/rust-kernel-smoke.ts",
  "test/core-kernel/cvn-3-strict-input.test.ts",
  "test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const RKP1A_P3B_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const RKP1A_PLANNING_PATHS = [
  PARENT_PATH,
  TASK_PATH,
  `${RKP1A_ACTIVE_ROOT}/check.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/design.md`,
  `${RKP1A_ACTIVE_ROOT}/implement.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/implement.md`,
  `${RKP1A_ACTIVE_ROOT}/operator-handoff.md`,
  `${RKP1A_ACTIVE_ROOT}/prd.md`,
  `${RKP1A_ACTIVE_ROOT}/research/authority-and-consumer-impact-map.md`,
  `${RKP1A_ACTIVE_ROOT}/research/file-test-ownership-matrix.md`,
  `${RKP1A_ACTIVE_ROOT}/research/implementation-evidence.md`,
  `${RKP1A_ACTIVE_ROOT}/research/planning-self-audit.md`,
  `${RKP1A_ACTIVE_ROOT}/research/root-cause-and-exact-node-count.md`,
  `${RKP1A_ACTIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ACTIVE_ROOT}/task.json`,
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json",
] as const;
const STAGE_6_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-2-store-fixtures.ts",
] as const;
const STAGE_6_LIFECYCLE_PATHS = [
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/implementation-evidence.md",
  PARENT_PATH,
] as const;
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

const EXPECTED_ACTIVE_COORDINATION_PATHS = [
  ...RKP2_HISTORICAL_COORDINATION_PATHS,
  ...ACTIVE_CHILD_PLANNING_PATHS,
] as const;

const EXPECTED_COORDINATION_PATHS = [
  ...RKP2_HISTORICAL_COORDINATION_PATHS,
  ...ARCHIVED_CHILD_PATHS,
] as const;

const EXPECTED_POST_ARCHIVE_COORDINATION_PATHS =
  EXPECTED_COORDINATION_PATHS;

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

const PART_OWNER_REPAIR_TECHNICAL_PATHS = [
  "crates/brilliant-score-foundation/src/dto.rs",
  "crates/brilliant-score-foundation/src/codec.rs",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "test/core-kernel/rust-migration/rkp-2-store-fixtures.ts",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS = {
  "crates/brilliant-score-foundation/src/dto.rs": "cf394c056915f14f42f4adbe12d0d2b9efbc8b43",
  "crates/brilliant-score-foundation/src/codec.rs": "b6f08257fae0e0f24896a58df9c043739b8b3c7c",
  "crates/brilliant-kernel-contracts/src/codec.rs": "6830b482e0b4b17b476023162227afafc28dd4dc",
  "test/core-kernel/rust-migration/rkp-2-store-fixtures.ts": "37a59da1946f5f1e699836fc197961eaf15784bc",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts": "fe8b81368e106f4526a40ca98b12408701d54a93",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts": "00ea2621212fc607d5302412a6124786d2f088ec",
} as const;


const PART_OWNER_REPAIR_LIFECYCLE_PATHS = [
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/task.json`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/prd.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/design.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/implement.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/implement.jsonl`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/check.jsonl`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/operator-handoff.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/review-candidate.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/research/root-cause-and-public-wire-authority.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/research/file-test-and-rollback-matrix.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/research/planning-self-audit.md`,
  `${PART_OWNER_REPAIR_ARCHIVE_ROOT}/research/implementation-evidence.md`,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  PARENT_PATH,
] as const;
const PART_OWNER_REPAIR_ACTIVE_AUTHORITY_PATHS = [
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/task.json`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/prd.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/design.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/implement.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/implement.jsonl`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/check.jsonl`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/operator-handoff.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/review-candidate.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/research/root-cause-and-public-wire-authority.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/research/file-test-and-rollback-matrix.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/research/planning-self-audit.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/research/implementation-evidence.md`,
] as const;

const PART_OWNER_REPAIR_CANDIDATE_LIFECYCLE_PATHS = [
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/task.json`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/operator-handoff.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/review-candidate.md`,
  `${PART_OWNER_REPAIR_ACTIVE_ROOT}/research/implementation-evidence.md`,
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
    sha256: "2ff749eba520ab44b5a6dd68033d1e3a7b4cee5c8723a1183a618e031e296d34",
  },
  {
    path: IMPLEMENT_PATH,
    sha256: "a9204e7c809879a921c3923f914272b945fa96df0a8e8fc4a1d9c610e289d0e1",
  },
  {
    path: FILE_TEST_ROLLBACK_MATRIX_PATH,
    sha256: "20b6ab8eeb4e0b0c010157a4120c6edc494091173f75d912a12ecf3a8567adad",
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

function currentPartOwnerRepairChanges(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--no-renames", "--name-only", `${PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function currentStage6Changes(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--name-only", `${STAGE_6_PREREQUISITE_HEAD}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function currentRkp1aChanges(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--name-only", `${RKP1A_IMPLEMENTATION_BASE}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function currentRkp1aP3aChanges(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--name-only", `${RKP1A_ACCEPTED_P3A_PLANNING_HEAD}..HEAD`],
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

function acceptedFullRunnerImplementationChanges(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--name-only",
        `${FULL_RUNNER_FUTURE_IMPLEMENTATION_BASE}..${FULL_RUNNER_ACCEPTED_IMPLEMENTATION_HEAD}`,
      ]),
    ),
  );
}

function childImplementationAcceptedAndArchived(): boolean {
  const task = JSON.parse(
    readText(`${FULL_RUNNER_ARCHIVE_ROOT}/task.json`),
  ) as {
    status?: unknown;
    meta?: {
      implementation_review?: unknown;
      implementation_rereview?: unknown;
    };
  };
  return (
    task.status === "completed" &&
    task.meta?.implementation_review === "passed" &&
    task.meta?.implementation_rereview === "passed"
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
      ? EXPECTED_ACTIVE_COORDINATION_PATHS
      : EXPECTED_COORDINATION_PATHS;
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

type PlannedRunnerSignal = Readonly<{
  type:
    | "test:pass"
    | "test:fail"
    | "test:interrupted"
    | "stream:error"
    | "stream:abort"
    | "stream:premature-close"
    | "stream:end"
    | "reporter:failure"
    | "reporter:flush";
  data?: Readonly<{
    nesting?: unknown;
    file?: unknown;
    name?: unknown;
    details?: Readonly<{ type?: string }>;
  }>;
}>;

function normalizedAbsolute(path: string): string {
  return resolve(path).replaceAll("\\", "/");
}

function evaluatePlannedFileCoverage(
  manifestFiles: readonly string[],
  runFiles: readonly string[],
  signals: readonly PlannedRunnerSignal[],
): string {
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
  let firstFailure: string | undefined;
  let ended = false;
  let reporterFlushed = false;
  const fail = (code: string): void => {
    firstFailure ??= code;
  };

  for (const signal of signals) {
    switch (signal.type) {
      case "test:pass": {
        const file = signal.data?.file;
        if (typeof file !== "string" || file.length === 0 || !isAbsolute(file)) {
          fail("runner.outcome-path-missing");
          break;
        }
        const normalizedFile = normalizedAbsolute(file);
        if (!manifest.has(normalizedFile)) {
          fail("runner.outcome-unknown");
          break;
        }
        seenManifestFiles.add(normalizedFile);
        break;
      }
      case "test:fail":
        fail("runner.test-failed");
        break;
      case "test:interrupted":
        fail("runner.test-interrupted");
        break;
      case "stream:error":
        fail("runner.stream-error");
        break;
      case "stream:abort":
        fail("runner.stream-aborted");
        break;
      case "stream:premature-close":
        fail("runner.stream-incomplete");
        break;
      case "stream:end":
        ended = true;
        break;
      case "reporter:failure":
        fail("runner.reporter-failed");
        break;
      case "reporter:flush":
        if (!ended) fail("runner.stream-incomplete");
        reporterFlushed = true;
        break;
    }
  }

  if (firstFailure !== undefined) return firstFailure;
  if (!ended) return "runner.stream-incomplete";
  if (!reporterFlushed) return "runner.reporter-flush-failed";
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
  assert.equal(new Set(coordination).size, 23);

  const allowed = new Set<string>([
    ...implementation,
    ...coordination,
    ...CHILD_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_LIFECYCLE_PATHS,
    ...RKP1A_TECHNICAL_PATHS,
    ...RKP1A_PLANNING_PATHS,
  ]);
  assert.equal(CHILD_TECHNICAL_PATHS.length, 4);
  assert.equal(CHILD_ACTIVE_LIFECYCLE_PATHS.length, 11);
  for (const path of currentImplementationChanges()) {
    assert.equal(allowed.has(path), true, `unreviewed implementation path: ${path}`);
  }
  assertFullRunnerLifecycleFixtures();
  await assertCrossVersionOutcomeFixtures();
  assertPhysicalIdentityFixtures();
});

test("part owner repair stays anchored to its accepted six-path wire contract", () => {
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD,
      "HEAD",
    ]),
  );
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${PART_OWNER_REPAIR_ACCEPTED_CANDIDATE}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD,
      PART_OWNER_REPAIR_ACCEPTED_CANDIDATE,
    ]),
  );
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", PART_OWNER_REPAIR_ACCEPTED_CANDIDATE, "HEAD"]),
  );
  assert.equal(PART_OWNER_REPAIR_TECHNICAL_PATHS.length, 6);
  assert.equal(PART_OWNER_REPAIR_LIFECYCLE_PATHS.length, 16);
  const allowed = new Set<string>([
    ...PART_OWNER_REPAIR_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_ACTIVE_AUTHORITY_PATHS.slice(0, 11),
    ...PART_OWNER_REPAIR_LIFECYCLE_PATHS,
  ]);
  assert.equal(allowed.size, 33);
  assert.equal(PART_OWNER_REPAIR_ACTIVE_AUTHORITY_PATHS.length, 12);
  assert.equal(PART_OWNER_REPAIR_CANDIDATE_LIFECYCLE_PATHS.length, 8);
  for (const path of PART_OWNER_REPAIR_ACTIVE_AUTHORITY_PATHS) {
    assert.equal(existsSync(resolve(path)), false, `active repair authority remains: ${path}`);
  }
  for (const path of PART_OWNER_REPAIR_LIFECYCLE_PATHS.slice(0, 12)) {
    assert.equal(existsSync(resolve(path)), true, `archived repair authority missing: ${path}`);
  }
  const historicalCandidate = new Set(
    lines(git(["diff", "--name-only", `${PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD}..${PART_OWNER_REPAIR_ACCEPTED_CANDIDATE}`])),
  );
  assertExactPathSet(
    historicalCandidate,
    [...PART_OWNER_REPAIR_TECHNICAL_PATHS, ...PART_OWNER_REPAIR_CANDIDATE_LIFECYCLE_PATHS],
    "accepted part-owner repair candidate",
  );
  for (const [path, expectedBlob] of Object.entries(PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS)) {
    assert.equal(git(["rev-parse", `${PART_OWNER_REPAIR_ACCEPTED_CANDIDATE}:${path}`]), expectedBlob);
    if (
      !STAGE_6_TECHNICAL_PATHS.includes(
        path as (typeof STAGE_6_TECHNICAL_PATHS)[number],
      )
    ) {
      assert.equal(readText(path), gitTextAt(PART_OWNER_REPAIR_ACCEPTED_CANDIDATE, path));
    }
  }
  assert.equal(Object.keys(PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS).length, 6);
  assert.deepEqual(Object.keys(PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS), [...PART_OWNER_REPAIR_TECHNICAL_PATHS]);
  const actual = currentPartOwnerRepairChanges();
  const expectedPartOwnerAndRkp1a = new Set<string>([
    ...PART_OWNER_REPAIR_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_ACTIVE_AUTHORITY_PATHS.slice(0, 11),
    ...PART_OWNER_REPAIR_LIFECYCLE_PATHS,
    ...RKP1A_TECHNICAL_PATHS,
    ...RKP1A_PLANNING_PATHS,
  ]);
  for (const path of actual) {
    assert.equal(
      expectedPartOwnerAndRkp1a.has(path),
      true,
      `unreviewed part-owner or RKP-1A path: ${path}`,
    );
  }
  assertExactPathSet(
    actual,
    [...expectedPartOwnerAndRkp1a],
    "accepted archived part-owner repair plus bounded RKP-1A descendant",
  );
  assertExactPathSet(
    new Set(
      [...actual].filter((path) =>
        PART_OWNER_REPAIR_TECHNICAL_PATHS.includes(
          path as (typeof PART_OWNER_REPAIR_TECHNICAL_PATHS)[number],
        ),
      ),
    ),
    PART_OWNER_REPAIR_TECHNICAL_PATHS,
    "part-owner repair technical delta",
  );

  const dto = readText("crates/brilliant-score-foundation/src/dto.rs");
  assert.match(
    dto,
    /#\[serde\(tag = "kind", rename_all = "kebab-case", deny_unknown_fields\)\]\s*pub enum ExtensionOwnerV1/gu,
  );
  assert.match(dto, /#\[serde\(rename = "partId"\)\]\s*part_id: StableId/gu);
  assert.doesNotMatch(dto, /serde\([^\]]*alias\s*=\s*"part_id"/gu);
});

test("Stage 6 hostile and resource evidence consumes the existing private Rust seams", () => {
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${STAGE_6_PREREQUISITE_HEAD}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", STAGE_6_PREREQUISITE_HEAD, "HEAD"]),
  );
  const task = JSON.parse(readText(TASK_PATH)) as {
    meta?: { stage_6_completed?: unknown };
  };
  const stage6Changes = currentStage6Changes();
  const allowed = new Set<string>([
    ...STAGE_6_TECHNICAL_PATHS,
    ...STAGE_6_LIFECYCLE_PATHS,
    ...RKP1A_TECHNICAL_PATHS,
    ...RKP1A_PLANNING_PATHS,
  ]);
  for (const path of stage6Changes) {
    assert.equal(allowed.has(path), true, `unreviewed Stage 6 path: ${path}`);
  }
  assertExactPathSet(
    new Set(
      [...stage6Changes].filter((path) =>
        STAGE_6_TECHNICAL_PATHS.includes(
          path as (typeof STAGE_6_TECHNICAL_PATHS)[number],
        ),
      ),
    ),
    STAGE_6_TECHNICAL_PATHS,
    "Stage 6 technical evidence",
  );
  if (task.meta?.stage_6_completed === true) {
    assertExactPathSet(
      stage6Changes,
      [...STAGE_6_TECHNICAL_PATHS, ...STAGE_6_LIFECYCLE_PATHS],
      "completed Stage 6 candidate",
    );
  }

  const foundation = readText("crates/brilliant-score-foundation/src/validation.rs");
  assert.match(foundation, /fn reserve_fault_precedes_latent_semantic_failure\(\)/u);
  assert.match(
    foundation,
    /validate_score_document_with_reserve_fault\(&document\)[\s\S]*FoundationDecodeFailure::InternalCapacity/u,
  );

  const contracts = readText("crates/brilliant-kernel-contracts/src/codec.rs");
  for (const proof of [
    "foundation_capacity_failure_maps_to_existing_internal_wire_shape",
    "response_writer_counts_all_bytes_and_never_retains_above_cap",
    "response_cap_precedes_encode_failure_without_changing_internal_fallback",
  ]) {
    assert.match(contracts, new RegExp(`fn ${proof}\\(\\)`, "u"), proof);
  }

  const store = readText("crates/brilliant-kernel-runtime/src/store.rs");
  assert.match(store, /fn stale_generation_is_rejected_and_key_types_are_nominally_distinct\(\)/u);
  assert.match(store, /fn runtime_reserve_fault_returns_internal_capacity_without_store_publication\(\)/u);

  const indices = readText("crates/brilliant-kernel-runtime/src/indices.rs");
  for (const proof of [
    "indices_cover_entity_owner_content_extension_and_core_references",
    "indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores",
    "indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open",
    "indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity",
  ]) {
    assert.match(indices, new RegExp(`fn ${proof}\\(\\)`, "u"), proof);
  }
  for (const field of [
    "entities_visited",
    "topology_edges_visited",
    "reference_edges_built",
    "time_entries_built",
    "entity_index_lookups",
    "owner_index_lookups",
    "time_index_comparisons",
    "index_rebuild_entries",
    "full_document_materializations",
    "canonical_encode_bytes",
  ]) {
    assert.match(indices, new RegExp(`pub\\(crate\\) ${field}: usize`, "u"), field);
  }
  const metricsDeclaration = indices
    .split("pub(crate) struct Rkp2StoreMetrics {")[1]
    ?.split("}\n\n", 1)[0];
  assert.ok(metricsDeclaration);
  assert.doesNotMatch(metricsDeclaration, /full_document_lookup_scan/u);

  const session = readText("crates/brilliant-kernel-session/src/session.rs");
  assert.match(session, /fn private_runtime_factory_failures_publish_no_session_and_use_existing_failures\(\)/u);
  const nodeBoundary = readText("crates/brilliant-kernel-node/src/boundary.rs");
  assert.match(nodeBoundary, /fn request_cap_is_checked_on_borrowed_length_before_copy\(\)/u);
});

test("RKP-1A P3B candidate is exact and remains closed to P4", () => {
  for (const commit of [
    RKP1A_IMPLEMENTATION_BASE,
    RKP1A_AUDITED_P2_HEAD,
    RKP1A_ACCEPTED_P3A_PLANNING_HEAD,
    RKP1A_AUDITED_P3A_HEAD,
  ]) {
    assert.doesNotThrow(() => git(["cat-file", "-e", `${commit}^{commit}`]));
  }
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      RKP1A_AUDITED_P2_HEAD,
      RKP1A_ACCEPTED_P3A_PLANNING_HEAD,
    ]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      RKP1A_ACCEPTED_P3A_PLANNING_HEAD,
      RKP1A_AUDITED_P3A_HEAD,
    ]),
  );
  assert.deepEqual(
    lines(
      git(["rev-list", "--parents", "-n", "1", RKP1A_AUDITED_P3B_HEAD]),
    ),
    [`${RKP1A_AUDITED_P3B_HEAD} ${RKP1A_AUDITED_P3A_HEAD}`],
    "the audited P3B candidate must remain one commit on audited P3A",
  );
  assert.deepEqual(
    lines(
      git(["rev-list", "--parents", "-n", "1", RKP1A_P3B_REPAIR_HEAD]),
    ),
    [`${RKP1A_P3B_REPAIR_HEAD} ${RKP1A_AUDITED_P3B_HEAD}`],
    "the bounded P3B repair must remain one compatibility-only commit",
  );
  const currentHead = git(["rev-parse", "HEAD"]);
  assert.deepEqual(
    lines(git(["rev-list", "--parents", "-n", "1", "HEAD"])),
    [`${currentHead} ${RKP1A_P3B_REPAIR_HEAD}`],
    "the current governance projection must be exactly one commit on the fixed repair",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_AUDITED_P2_HEAD}..${RKP1A_ACCEPTED_P3A_PLANNING_HEAD}`,
        ]),
      ),
    ),
    RKP1A_PLANNING_PATHS,
    "accepted RKP-1A P3A planning amendment",
  );
  assert.equal(RKP1A_TECHNICAL_PATHS.length, 7);
  assert.equal(RKP1A_P3A_TECHNICAL_PATHS.length, 5);
  assert.equal(RKP1A_P3B_TECHNICAL_PATHS.length, 2);
  assert.equal(RKP1A_PLANNING_PATHS.length, 16);
  assertExactPathSet(
    currentRkp1aChanges(),
    [...RKP1A_TECHNICAL_PATHS, ...RKP1A_PLANNING_PATHS],
    "bounded RKP-1A implementation descendant",
  );
  assertExactPathSet(
    currentRkp1aP3aChanges(),
    RKP1A_P3A_TECHNICAL_PATHS,
    "bounded RKP-1A P3A and P3B technical candidate",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_AUDITED_P3A_HEAD}..HEAD`,
        ]),
      ),
    ),
    RKP1A_P3B_TECHNICAL_PATHS,
    "P3B exact two-path candidate",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_AUDITED_P3A_HEAD}..${RKP1A_AUDITED_P3B_HEAD}`,
        ]),
      ),
    ),
    RKP1A_P3B_TECHNICAL_PATHS,
    "audited P3B exact two-path candidate",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_AUDITED_P3B_HEAD}..${RKP1A_P3B_REPAIR_HEAD}`,
        ]),
      ),
    ),
    [
      "test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts",
    ],
    "bounded P3B repair exact compatibility-only projection",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_P3B_REPAIR_HEAD}..HEAD`,
        ]),
      ),
    ),
    [
      "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
    ],
    "current bounded workspace-law projection",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_AUDITED_P3A_HEAD}..HEAD`,
        ]),
      ),
    ),
    RKP1A_P3B_TECHNICAL_PATHS,
    "bounded P3B cumulative two-path projection",
  );

  const capture = readText("src/core-kernel/codec/strict-input-capture.ts");
  assert.match(
    capture,
    /export const STRICT_INPUT_MAX_PROPERTIES = 1_048_576 as const/u,
  );
  assert.match(
    capture,
    /const STRICT_INPUT_NATIVE_WIRE_MAX_PROPERTIES = 1_572_864 as const/u,
  );
  assert.match(
    capture,
    /type StrictInputCaptureProfile = "default" \| "native-wire-v1"/u,
  );

  const native = readText("src/core-kernel/native/rust-kernel-smoke.ts");
  assert.equal(
    Array.from(
      native.matchAll(/captureStrictInput\([^;]*?, "native-wire-v1"\)/gu),
    ).length,
    2,
    "create and response capture must both select native-wire-v1",
  );

  const p3bTest = readText(
    "test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts",
  );
  assert.match(p3bTest, /BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:/u);
  assert.match(p3bTest, /--rkp1a-p3b-self-worker-v1/u);
  assert.match(
    p3bTest,
    /path\.resolve\(input\.argv\[1\] \?\? ""\) === path\.resolve\(input\.filename\)/u,
  );
  assert.match(p3bTest, /spawn\(process\.execPath/u);
  assert.match(p3bTest, /delete env\.NODE_TEST_CONTEXT/u);
  assert.doesNotMatch(p3bTest, /implementation_candidate_ready\s*[=:]\s*true/u);
});

function assertFullRunnerLifecycleFixtures(): void {
  for (const commit of [
    FULL_RUNNER_PLANNING_BASE,
    FIRST_REVIEWED_FULL_RUNNER_PLANNING_HEAD,
    ACCEPTED_FULL_RUNNER_PLANNING_HEAD,
    FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD,
    FULL_RUNNER_EVENT_COVERAGE_ANCHOR,
    PAUSED_FULL_RUNNER_IMPLEMENTATION_HEAD,
    FULL_RUNNER_AMENDMENT_MERGE_COMMIT,
    FULL_RUNNER_ACCEPTED_IMPLEMENTATION_HEAD,
    FULL_RUNNER_ACCEPTANCE_SYNC_COMMIT,
    FULL_RUNNER_ARCHIVE_COMMIT,
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
  assert.deepEqual(
    git([
      "rev-list",
      "--parents",
      "-n",
      "1",
      FULL_RUNNER_EVENT_COVERAGE_ANCHOR,
    ]).split(" "),
    [FULL_RUNNER_EVENT_COVERAGE_ANCHOR, FULL_RUNNER_EVENT_COVERAGE_CONTENT_HEAD],
  );
  assert.deepEqual(
    git([
      "rev-list",
      "--parents",
      "-n",
      "1",
      FULL_RUNNER_AMENDMENT_MERGE_COMMIT,
    ]).split(" "),
    [
      FULL_RUNNER_AMENDMENT_MERGE_COMMIT,
      PAUSED_FULL_RUNNER_IMPLEMENTATION_HEAD,
      FULL_RUNNER_EVENT_COVERAGE_ANCHOR,
    ],
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      FULL_RUNNER_AMENDMENT_MERGE_COMMIT,
      "HEAD",
    ]),
  );
  assertExactPathSet(
    fullRunnerPlanningChangesAtContentHead(),
    FULL_RUNNER_PLANNING_PATHS,
    "approved base through pinned event-coverage content head",
  );
  assert.equal(new Set(FULL_RUNNER_PLANNING_PATHS).size, 20);

  assert.deepEqual(
    git(["rev-list", "--parents", "-n", "1", FULL_RUNNER_ACCEPTANCE_SYNC_COMMIT]).split(" "),
    [FULL_RUNNER_ACCEPTANCE_SYNC_COMMIT, FULL_RUNNER_ACCEPTED_IMPLEMENTATION_HEAD],
  );
  assert.deepEqual(
    git(["rev-list", "--parents", "-n", "1", FULL_RUNNER_ARCHIVE_COMMIT]).split(" "),
    [FULL_RUNNER_ARCHIVE_COMMIT, FULL_RUNNER_ACCEPTANCE_SYNC_COMMIT],
  );
  assert.equal(existsSync(FULL_RUNNER_ACTIVE_ROOT), false);
  assert.equal(ARCHIVED_CHILD_PATHS.length, 13);
  for (const path of ARCHIVED_CHILD_PATHS) {
    assert.equal(existsSync(path), true, `missing archived authority path: ${path}`);
  }
  assert.equal(childImplementationAcceptedAndArchived(), true);

  const candidateChanges = acceptedFullRunnerImplementationChanges();
  const candidateAllowlist = new Set<string>([
    ...CHILD_TECHNICAL_PATHS,
    ...CHILD_ACTIVE_LIFECYCLE_PATHS,
  ]);
  for (const path of candidateChanges) {
    assert.equal(
      candidateAllowlist.has(path),
      true,
      `unreviewed child implementation path: ${path}`,
    );
  }
  for (const path of CHILD_TECHNICAL_PATHS) {
    assert.equal(
      candidateChanges.has(path),
      true,
      `candidate must contain child technical path: ${path}`,
    );
  }
  assertExactPathSet(
    candidateChanges,
    [...candidateAllowlist],
    "accepted child implementation candidate",
  );

  validateImplementationCandidateFixture([
    ...CHILD_TECHNICAL_PATHS,
    ...CHILD_ACTIVE_LIFECYCLE_PATHS,
  ]);
  assert.throws(() =>
    validateImplementationCandidateFixture(CHILD_TECHNICAL_PATHS),
  );

  validateAuthorityProjectionFixture(EXPECTED_ACTIVE_COORDINATION_PATHS, "active");
  validateAuthorityProjectionFixture(
    EXPECTED_POST_ARCHIVE_COORDINATION_PATHS,
    "archived",
  );
  assert.equal(EXPECTED_ACTIVE_COORDINATION_PATHS.length, 22);
  assert.equal(EXPECTED_COORDINATION_PATHS.length, 23);
  assert.equal(EXPECTED_POST_ARCHIVE_COORDINATION_PATHS.length, 23);
  assert.throws(() =>
    validateAuthorityProjectionFixture(
      [...EXPECTED_ACTIVE_COORDINATION_PATHS, ...ARCHIVED_CHILD_PATHS],
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
  const passSignals: readonly PlannedRunnerSignal[] = [
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
  const complete = (
    signals: readonly PlannedRunnerSignal[],
  ): readonly PlannedRunnerSignal[] => [
    ...signals,
    { type: "stream:end" },
    { type: "reporter:flush" },
  ];
  const assertOutcome = (
    signals: readonly PlannedRunnerSignal[],
    expected: string,
  ): void => {
    assert.equal(evaluatePlannedFileCoverage(manifest, runFiles, signals), expected);
  };

  assertOutcome(complete(passSignals), "ok");
  assertOutcome(
    complete([{ type: "test:fail", data: { nesting: 4 } }, ...passSignals]),
    "runner.test-failed",
  );
  assertOutcome(
    complete([{ type: "test:fail", data: { nesting: 0 } }, ...passSignals]),
    "runner.test-failed",
  );
  assertOutcome(
    complete([{ type: "test:interrupted", data: { nesting: 0 } }, ...passSignals]),
    "runner.test-interrupted",
  );
  assertOutcome(complete([...passSignals, passSignals[0]!]), "ok");
  assertOutcome(complete(passSignals.slice(0, 2)), "runner.outcome-missing");
  assertOutcome(
    complete([
      { type: "test:pass", data: { nesting: 0, file: first, name: second } },
      { type: "test:pass", data: { file: second, name: first } },
    ]),
    "ok",
  );

  for (const malformedFile of [undefined, 42, "", "dist/test/alpha.test.js"]) {
    assertOutcome(
      complete([{ type: "test:pass", data: { file: malformedFile } }]),
      "runner.outcome-path-missing",
    );
  }
  assertOutcome(
    complete([
      {
        type: "test:pass",
        data: { file: resolve("dist/test/unknown.test.js") },
      },
    ]),
    "runner.outcome-unknown",
  );
  assert.equal(
    evaluatePlannedFileCoverage(manifest, [second, first], complete(passSignals)),
    "runner.manifest-mismatch",
  );

  assertOutcome(
    [
      { type: "stream:error" },
      { type: "test:fail" },
      ...passSignals,
      { type: "stream:end" },
      { type: "reporter:flush" },
    ],
    "runner.stream-error",
  );
  assertOutcome(
    [
      { type: "test:fail" },
      { type: "stream:error" },
      ...passSignals,
      { type: "stream:end" },
      { type: "reporter:flush" },
    ],
    "runner.test-failed",
  );

  for (const malformedFile of [undefined, 42, "", "dist/test/alpha.test.js"]) {
    const malformedPass: PlannedRunnerSignal = {
      type: "test:pass",
      data: { file: malformedFile },
    };
    assertOutcome(
      complete([{ type: "stream:abort" }, malformedPass, ...passSignals]),
      "runner.stream-aborted",
    );
    assertOutcome(
      complete([malformedPass, { type: "stream:abort" }, ...passSignals]),
      "runner.outcome-path-missing",
    );
  }

  const observerFailures: readonly Readonly<{
    signal: PlannedRunnerSignal;
    code: string;
  }>[] = [
    { signal: { type: "test:fail", data: { nesting: 7 } }, code: "runner.test-failed" },
    { signal: { type: "test:interrupted" }, code: "runner.test-interrupted" },
    {
      signal: { type: "test:pass", data: {} },
      code: "runner.outcome-path-missing",
    },
    {
      signal: {
        type: "test:pass",
        data: { file: resolve("dist/test/unknown.test.js") },
      },
      code: "runner.outcome-unknown",
    },
  ];
  for (const { signal, code } of observerFailures) {
    assertOutcome(
      complete([signal, { type: "reporter:failure" }, ...passSignals]),
      code,
    );
    assertOutcome(
      complete([{ type: "reporter:failure" }, signal, ...passSignals]),
      "runner.reporter-failed",
    );
  }

  assertOutcome(
    complete([
      { type: "test:interrupted" },
      { type: "stream:error" },
      ...passSignals,
    ]),
    "runner.test-interrupted",
  );
  assertOutcome(
    complete([
      { type: "stream:error" },
      { type: "test:interrupted" },
      ...passSignals,
    ]),
    "runner.stream-error",
  );
  assertOutcome(
    complete([...passSignals, { type: "reporter:failure" }]),
    "runner.reporter-failed",
  );
  assertOutcome(
    [...passSignals, { type: "stream:end" }],
    "runner.reporter-flush-failed",
  );
  assertOutcome(
    [...passSignals, { type: "reporter:flush" }, { type: "stream:end" }],
    "runner.stream-incomplete",
  );
  assertOutcome(
    complete([...passSignals, { type: "stream:premature-close" }]),
    "runner.stream-incomplete",
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
