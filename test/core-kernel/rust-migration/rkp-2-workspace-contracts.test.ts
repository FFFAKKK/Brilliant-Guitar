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
import {
  PRIVATE_SCALE_PROCESS_STATE_REGISTRY,
  PRIVATE_SCALE_PROCESS_STATE_REGISTRY_SHA256,
} from "./rkp-2-scale-evidence-worker";

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
const RKP1A_P3B_GOVERNANCE_HEAD =
  "e4103b779574fcdc728d024c1b8f30244cb332c3";
const RKP1A_P4_A1_HEAD =
  "aacb057af6eaa7c16e88ed94e2ecfc323c540032";
const RKP1A_P4_A2_HEAD =
  "9e1770b39f01484c860a39a6746f3ef7a638f612";
const RKP1A_ACCEPTED_P4_A3_HEAD =
  "3063e0972072e246d43add8640ba1fe1ad02d787";
const RKP1A_ACCEPTED_B =
  "08374273b05bc992e749a17a959b64af0f293f0b";
const RKP1A_C2_ARCHIVE_COMMIT =
  "00754ca22ea2422ff849b9a7f6e5ba4b8767e094";
const RKP1A_ACTIVE_ROOT =
  ".trellis/tasks/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair";
const RKP1A_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-08/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair";
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
const RKP1A_P4_A1_A2_PATHS = [
  PARENT_PATH,
  TASK_PATH,
  `${RKP1A_ACTIVE_ROOT}/check.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/design.md`,
  `${RKP1A_ACTIVE_ROOT}/implement.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/implement.md`,
  `${RKP1A_ACTIVE_ROOT}/operator-handoff.md`,
  `${RKP1A_ACTIVE_ROOT}/prd.md`,
  `${RKP1A_ACTIVE_ROOT}/research/file-test-ownership-matrix.md`,
  `${RKP1A_ACTIVE_ROOT}/research/planning-self-audit.md`,
  `${RKP1A_ACTIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ACTIVE_ROOT}/task.json`,
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json",
] as const;
const RKP1A_P4_A3_PATHS = [
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
  `${RKP1A_ACTIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ACTIVE_ROOT}/task.json`,
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json",
] as const;
const RKP1A_P4_B_PATHS = [
  `${RKP1A_ACTIVE_ROOT}/task.json`,
  `${RKP1A_ACTIVE_ROOT}/operator-handoff.md`,
  `${RKP1A_ACTIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ACTIVE_ROOT}/research/implementation-evidence.md`,
  PARENT_PATH,
  TASK_PATH,
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const RKP1A_HISTORICAL_ACTIVE_FILES = [
  `${RKP1A_ACTIVE_ROOT}/task.json`,
  `${RKP1A_ACTIVE_ROOT}/prd.md`,
  `${RKP1A_ACTIVE_ROOT}/design.md`,
  `${RKP1A_ACTIVE_ROOT}/implement.md`,
  `${RKP1A_ACTIVE_ROOT}/implement.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/check.jsonl`,
  `${RKP1A_ACTIVE_ROOT}/operator-handoff.md`,
  `${RKP1A_ACTIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ACTIVE_ROOT}/research/root-cause-and-exact-node-count.md`,
  `${RKP1A_ACTIVE_ROOT}/research/authority-and-consumer-impact-map.md`,
  `${RKP1A_ACTIVE_ROOT}/research/file-test-ownership-matrix.md`,
  `${RKP1A_ACTIVE_ROOT}/research/planning-self-audit.md`,
  `${RKP1A_ACTIVE_ROOT}/research/implementation-evidence.md`,
] as const;
const RKP1A_CURRENT_ARCHIVE_FILES = [
  `${RKP1A_ARCHIVE_ROOT}/task.json`,
  `${RKP1A_ARCHIVE_ROOT}/prd.md`,
  `${RKP1A_ARCHIVE_ROOT}/design.md`,
  `${RKP1A_ARCHIVE_ROOT}/implement.md`,
  `${RKP1A_ARCHIVE_ROOT}/implement.jsonl`,
  `${RKP1A_ARCHIVE_ROOT}/check.jsonl`,
  `${RKP1A_ARCHIVE_ROOT}/operator-handoff.md`,
  `${RKP1A_ARCHIVE_ROOT}/review-candidate.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/root-cause-and-exact-node-count.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/authority-and-consumer-impact-map.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/file-test-ownership-matrix.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/planning-self-audit.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/implementation-evidence.md`,
] as const;
const RKP1A_ARCHIVED_IMMUTABLE_AUTHORITY_FILES = [
  `${RKP1A_ARCHIVE_ROOT}/prd.md`,
  `${RKP1A_ARCHIVE_ROOT}/design.md`,
  `${RKP1A_ARCHIVE_ROOT}/implement.md`,
  `${RKP1A_ARCHIVE_ROOT}/implement.jsonl`,
  `${RKP1A_ARCHIVE_ROOT}/check.jsonl`,
  `${RKP1A_ARCHIVE_ROOT}/research/root-cause-and-exact-node-count.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/authority-and-consumer-impact-map.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/file-test-ownership-matrix.md`,
  `${RKP1A_ARCHIVE_ROOT}/research/planning-self-audit.md`,
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
const STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD =
  "eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7";
const STAGE_6_SEMANTIC_CANONICAL_PLANNING_BASE =
  "d14d73117e03822a52fd19c55f3024cb2b73ef45";
const STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT =
  ".trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment";
const STAGE_6_SEMANTIC_CANONICAL_TECHNICAL_PATHS = [
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_E2_CANDIDATE_BASE = "c7aa242b359401f76cd05944404cfc686854bec4";
const STAGE_6_E2_TERMINAL_HEAD = "4ad23773e9c9e1081667a4eccb84cc464b85bc89";
const STAGE_6_E3_SOURCE_TREE = "9dbcef77fbcc258e4fe96fdfb2b28839f095d610";
const STAGE_6_E3_PROTOCOL_PREFIX = "BRILLIANT_RKP2_SCALE_PROCESS_V1:";
const STAGE_6_E3_PROTOCOL_SHA256 =
  "64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862";
const STAGE_6_PRIVATE_SCALE_TASK_ROOT =
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair";
const STAGE_6_E3_EVIDENCE_PATH =
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/research/implementation-evidence.md`;
const STAGE_6_ORIGINAL_E3_PATHS = [
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/review-candidate.md`,
  STAGE_6_E3_EVIDENCE_PATH,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  PARENT_PATH,
] as const;
const STAGE_6_E3_LAW_TASK_ROOT =
  ".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair";
const STAGE_6_E3_AUDITED_CANDIDATE =
  "0c561d14193374436361eec09b361cab0170278a";
const STAGE_6_E3_AUDIT_RECORD_BYTES = 323;
const STAGE_6_E3_AUDIT_RECORD_SHA256 =
  "dee0b92ce8a2ff6c8a9737c5b98104e39633b85aaad70e594f61e4847fdd7589";
const STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS =
  "passed_external_audit_bound_0c561d14193374436361eec09b361cab0170278a_P0_0_P1_0_P2_0";
const STAGE_6_E3_LAW_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_E3_LAW_TASK_PATHS = [
  `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/prd.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/design.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/implement.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/implement.jsonl`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/check.jsonl`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/review-candidate.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/research/current-e3-law-gap-audit.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/research/final-state-projection-contract.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/research/file-test-and-rollback-matrix.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/research/planning-self-audit.md`,
] as const;
const STAGE_6_E3_ACCEPTANCE_TASK_ROOT =
  ".trellis/tasks/08-31-rkp-2-e3-acceptance-state-projection";
const STAGE_6_E3_ACCEPTANCE_IMMUTABLE_PLANNING_PATHS = [
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/prd.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/design.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/implement.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/implement.jsonl`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/check.jsonl`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/research/audit-pass-and-transition-gap.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/research/file-test-and-rollback-matrix.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/research/planning-self-audit.md`,
] as const;
const STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_E3_ACCEPTANCE_LIFECYCLE_PATHS = [
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/review-candidate.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/review-candidate.md`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/review-candidate.md`,
] as const;
const STAGE_6_E3_ACCEPTANCE_ACTIVATION_LIFECYCLE_PATHS = [
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/review-candidate.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
] as const;
const STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE =
  "f27daf7b514731adaabbe8f7814d2b57e12a7df7";
const STAGE_6_E3_ACCEPTANCE_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-08/08-31-rkp-2-e3-acceptance-state-projection";
const STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ROOT =
  ".trellis/tasks/08-31-rkp-2-e3-acceptance-archive-closure";
const STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-08/08-31-rkp-2-e3-acceptance-archive-closure";
const STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_BYTES = 334;
const STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256 =
  "8559f7aed98ddc45154f90dd459688530ba5e24efedeb573389e06ca7d099436";
const STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_IMPLEMENT_SHA256 =
  "d3fb185b510bc384e8234e7c179c66a9a47323c86acbfa39de565b60d50913c3";
const STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_CHECK_SHA256 =
  "f500d9871a1e877874c0d962ce2a2c086897aa23f02f5127532d648b776b24fe";
const STAGE_6_E3_ACCEPTANCE_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/audit-pass-and-transition-gap.md",
  "research/file-test-and-rollback-matrix.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-state-and-recursion-audit.md",
  "research/file-state-test-matrix.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_TECHNICAL_PATH =
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts";
const STAGE_6_E3_LAW_PARENT_LIFECYCLE_PATHS = [
  `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/review-candidate.md`,
] as const;
const STAGE_6_PARENT_LIFECYCLE_PATHS = [
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/review-candidate.md`,
] as const;
const STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_PATHS = [
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/implement.jsonl`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/check.jsonl`,
] as const;
const STAGE_6_E3_ACCEPTANCE_TARGET_LIFECYCLE_PATHS = [
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/review-candidate.md`,
] as const;
const STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD = {
  schemaVersion: 1,
  reviewTaskId: "01a01e48-1934-77b0-821e-a8026cd9e5f7",
  reviewTurnId: "01a0562d-c544-7371-861f-0ead4d04cea2",
  candidateCommit: STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
  technicalCommit: "4abfef9b3f7620d6428382af287cccd662aa7bf7",
  verdict: "PASS_READY_FOR_OWNER_ACCEPTANCE_AND_ARCHIVE_CLOSURE",
  P0: 0,
  P1: 0,
  P2: 0,
} as const;
const STAGE_6_E3_AUDIT_RECORD = {
  schemaVersion: 1,
  reviewTaskId: "01a01e48-1934-77b0-821e-a8026cd9e5f7",
  reviewTurnId: "01a05589-d996-7ec1-ab58-b6f2db049e69",
  candidateCommit: STAGE_6_E3_AUDITED_CANDIDATE,
  technicalCommit: "36fe1956ec8660d664eb9606912dbc6e1b6c3ede",
  verdict: "PASS_READY_FOR_E3_ACCEPTANCE_PREPARATION",
  P0: 0,
  P1: 0,
  P2: 0,
} as const;
const STAGE_6_E2_WORKER_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_E2_TECHNICAL_PATHS = [
  "crates/brilliant-kernel-runtime/src/indices.rs",
  ...STAGE_6_E2_WORKER_TECHNICAL_PATHS,
] as const;
const STAGE_6_SEMANTIC_CANONICAL_LIFECYCLE_PATHS = [
  `${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/task.json`,
  `${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/review-candidate.md`,
  ".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json",
  TASK_PATH,
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

function historicalSemanticCanonicalE2Changes(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--no-renames",
        "--name-only",
        `${STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD}..${STAGE_6_E2_TERMINAL_HEAD}`,
      ]),
    ),
  );
}

function historicalE2WorkerChanges(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--no-renames",
        "--name-only",
        `${STAGE_6_E2_CANDIDATE_BASE}..${STAGE_6_E2_TERMINAL_HEAD}`,
      ]),
    ),
  );
}

function historicalE3AuditedCandidateChanges(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--no-renames",
        "--name-only",
        `${STAGE_6_E2_TERMINAL_HEAD}..${STAGE_6_E3_AUDITED_CANDIDATE}`,
      ]),
    ),
  );
}

function historicalAcceptanceProjectionChanges(): Set<string> {
  return new Set(
    lines(
      git([
        "diff",
        "--no-renames",
        "--name-only",
        `${STAGE_6_E3_AUDITED_CANDIDATE}..${STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE}`,
      ]),
    ),
  );
}

function currentAcceptanceArchiveClosureChanges(): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  for (const line of lines(
    git([
      "diff",
      "--no-renames",
      "--name-status",
      STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
    ]),
  )) {
    const [status, path, extra] = line.split("\t");
    assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
    assert.ok(status === "A" || status === "M" || status === "D");
    assert.ok(path);
    result.set(path, status);
  }
  for (const path of lines(git(["ls-files", "--others", "--exclude-standard"]))) {
    assert.equal(result.has(path), false, `${path} must have one cumulative status`);
    result.set(path, "A");
  }
  return result;
}

function lfNormalizedText(path: string): string {
  const value = readFileSync(resolve(path), "utf8");
  assert.notEqual(value.charCodeAt(0), 0xfeff, `${path} must not contain a BOM`);
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

interface E3ProtocolEnvelope {
  readonly schemaVersion: number;
  readonly status: string;
  readonly evidence: {
    readonly schemaVersion: number;
    readonly status: string;
    readonly fixtureId: string;
    readonly counts: {
      readonly measures: number;
      readonly parts: number;
      readonly staves: number;
      readonly measureContents: number;
      readonly voices: number;
      readonly events: number;
      readonly notes: number;
      readonly extensions: number;
      readonly partOwnedExtensions: number;
      readonly unknownExtensions: number;
    };
    readonly workloadElapsedMicros: number;
  };
  readonly process: {
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly peakWorkingSetBytes: number;
    readonly stdoutBytes: number;
    readonly stderrBytes: number;
    readonly terminationStatus: string;
    readonly reapStatus: string;
    readonly cleanupStatus: string;
  };
  readonly partialEvidence: boolean;
}

interface E3LifecycleProjection {
  readonly stage6Status: unknown;
  readonly stage6ImplementationCandidateReady: unknown;
  readonly stage6ImplementationReview: unknown;
  readonly stage6CurrentImplementationChild: unknown;
  readonly stage6S62Started: unknown;
  readonly stage6S63Started: unknown;
  readonly stage6DefaultRuntime: unknown;
  readonly stage6ArchiveAuthorized: unknown;
  readonly stage6PushAuthorized: unknown;
  readonly stage6RuntimeSwitchAuthorized: unknown;
  readonly stage6OfficialMeasurementAuthorized: unknown;
  readonly stage6Rkp3CreationAuthorized: unknown;
  readonly historicalE2Status: unknown;
  readonly historicalE2Stage6E3Started: unknown;
  readonly rkp2Status: unknown;
  readonly rkp2CurrentImplementationChild: unknown;
  readonly rkp2S62Started: unknown;
  readonly rkp2S63Started: unknown;
  readonly rkp2DefaultRuntime: unknown;
  readonly rkp2ArchiveAuthorized: unknown;
  readonly rkp2PushAuthorized: unknown;
  readonly rkp2RuntimeSwitchAuthorized: unknown;
  readonly rkp2OfficialMeasurementAuthorized: unknown;
  readonly rkp2Rkp3CreationAuthorized: unknown;
  readonly rustCurrentImplementationChild: unknown;
  readonly rustS62Started: unknown;
  readonly rustS63Started: unknown;
  readonly rustDefaultRuntime: unknown;
  readonly rustRuntimeSwitchAuthorized: unknown;
  readonly lawTaskStatus: unknown;
  readonly lawImplementationReview: unknown;
  readonly lawCurrentPlanningChild: unknown;
  readonly lawCurrentImplementationChild: unknown;
  readonly lawAuditRecord: unknown;
  readonly lawAuditRecordBytes: unknown;
  readonly lawAuditRecordSha256: unknown;
  readonly lawIntegrationAuthorized: unknown;
  readonly lawQualificationAuthorized: unknown;
  readonly lawArchiveAuthorized: unknown;
  readonly lawPushAuthorized: unknown;
  readonly lawRuntimeSwitchAuthorized: unknown;
  readonly lawRkp3CreationAuthorized: unknown;
  readonly stage6AuditRecord: unknown;
  readonly stage6AuditRecordOwner: unknown;
  readonly stage6AuditRecordSha256: unknown;
  readonly acceptanceTaskStatus: unknown;
  readonly acceptanceTaskStartRun: unknown;
  readonly acceptanceTaskProductionAuthorized: unknown;
  readonly acceptanceTaskUserAuthorized: unknown;
  readonly acceptanceTaskCandidateReady: unknown;
  readonly acceptanceTaskImplementationReview: unknown;
  readonly acceptanceTaskAuditRecord: unknown;
  readonly acceptanceTaskAuditRecordOwner: unknown;
  readonly acceptanceTaskAuditRecordSha256: unknown;
  readonly acceptanceTaskS62Started: unknown;
  readonly acceptanceTaskS63Started: unknown;
  readonly acceptanceTaskDefaultRuntime: unknown;
  readonly acceptanceTaskAcceptanceAuthorized: unknown;
  readonly acceptanceTaskArchiveAuthorized: unknown;
  readonly acceptanceTaskIntegrationAuthorized: unknown;
  readonly acceptanceTaskQualificationAuthorized: unknown;
  readonly acceptanceTaskRuntimeSwitchAuthorized: unknown;
  readonly acceptanceTaskPushAuthorized: unknown;
  readonly acceptanceTaskRkp3CreationAuthorized: unknown;
}

type E3AcceptanceProjectionPhase = "technical-transition" | "terminal-candidate";

type E3AcceptanceArchiveClosurePhase =
  | "activation"
  | "owner-acceptance"
  | "target-archived"
  | "closure-archived";

interface ExactTaskLocationInput {
  readonly activeFiles: readonly string[] | null;
  readonly archiveFiles: readonly string[] | null;
}

interface ExactTaskLocation {
  readonly kind: "active" | "archive";
  readonly root: string;
}

interface AcceptanceArchiveLifecycleProjection {
  readonly targetLocation: "active" | "archive";
  readonly targetStatus: unknown;
  readonly targetCompletedAt: unknown;
  readonly targetImplementationCandidateReady: unknown;
  readonly targetImplementationReview: unknown;
  readonly targetAcceptanceAuthorized: unknown;
  readonly targetArchiveAuthorized: unknown;
  readonly targetDefaultRuntime: unknown;
  readonly targetS62Started: unknown;
  readonly targetS63Started: unknown;
  readonly targetIntegrationAuthorized: unknown;
  readonly targetQualificationAuthorized: unknown;
  readonly targetRuntimeSwitchAuthorized: unknown;
  readonly targetPushAuthorized: unknown;
  readonly targetRkp3CreationAuthorized: unknown;
  readonly closureLocation: "active" | "archive";
  readonly closureStatus: unknown;
  readonly closureCompletedAt: unknown;
  readonly closureTaskStartRun: unknown;
  readonly closureProductionAuthorized: unknown;
  readonly closureUserAuthorized: unknown;
  readonly closureImplementationCandidateReady: unknown;
  readonly closureImplementationReview: unknown;
  readonly closureTargetAcceptanceAuthorized: unknown;
  readonly closureTargetArchiveAuthorized: unknown;
  readonly closureAcceptanceAuthorized: unknown;
  readonly closureArchiveAuthorized: unknown;
  readonly closureDefaultRuntime: unknown;
  readonly closureS62Started: unknown;
  readonly closureS63Started: unknown;
  readonly closureIntegrationAuthorized: unknown;
  readonly closureQualificationAuthorized: unknown;
  readonly closureRuntimeSwitchAuthorized: unknown;
  readonly closurePushAuthorized: unknown;
  readonly closureRkp3CreationAuthorized: unknown;
  readonly closureE3StressRerun: unknown;
  readonly lawStatus: unknown;
  readonly lawCurrentPlanningChild: unknown;
  readonly lawCurrentImplementationChild: unknown;
  readonly lawNextGate: unknown;
  readonly lawIntegrationAuthorized: unknown;
  readonly lawQualificationAuthorized: unknown;
  readonly lawArchiveAuthorized: unknown;
  readonly lawRuntimeSwitchAuthorized: unknown;
  readonly lawPushAuthorized: unknown;
  readonly lawRkp3CreationAuthorized: unknown;
  readonly stage6Status: unknown;
  readonly stage6CurrentImplementationChild: unknown;
  readonly stage6S62Started: unknown;
  readonly stage6S63Started: unknown;
  readonly stage6DefaultRuntime: unknown;
  readonly stage6ArchiveAuthorized: unknown;
  readonly stage6OfficialMeasurementAuthorized: unknown;
  readonly stage6RuntimeSwitchAuthorized: unknown;
  readonly stage6PushAuthorized: unknown;
  readonly stage6Rkp3CreationAuthorized: unknown;
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

function assertHistoricalE3AuditedCandidateProjection(
  actual: ReadonlySet<string>,
  originalE3Paths: readonly string[] = STAGE_6_ORIGINAL_E3_PATHS,
  repairTechnicalPaths: readonly string[] = STAGE_6_E3_LAW_TECHNICAL_PATHS,
  repairTaskPaths: readonly string[] = STAGE_6_E3_LAW_TASK_PATHS,
): void {
  assertExactPathSet(
    new Set(originalE3Paths),
    STAGE_6_ORIGINAL_E3_PATHS,
    "original E3 lifecycle and evidence declaration",
  );
  assertExactPathSet(
    new Set(repairTechnicalPaths),
    STAGE_6_E3_LAW_TECHNICAL_PATHS,
    "E3 law repair technical declaration",
  );
  assertExactPathSet(
    new Set(repairTaskPaths),
    STAGE_6_E3_LAW_TASK_PATHS,
    "E3 law repair task declaration",
  );
  assert.equal(originalE3Paths.length, 8);
  assert.equal(repairTechnicalPaths.length, 1);
  assert.equal(repairTaskPaths.length, 12);

  const declared = [
    ...originalE3Paths,
    ...repairTechnicalPaths,
    ...repairTaskPaths,
  ];
  assert.equal(
    new Set(declared).size,
    declared.length,
    "E3 final-state owner sets must be disjoint before union",
  );
  assert.equal(declared.length, 21);
  assertExactPathSet(actual, declared, "historical E3 audited candidate");
}

function canonicalizeE3AuditRecord(record: unknown): string {
  assert.ok(record !== null && typeof record === "object");
  assert.equal(Array.isArray(record), false);
  const value = record as Readonly<Record<string, unknown>>;
  assert.deepEqual(Object.keys(value), Object.keys(STAGE_6_E3_AUDIT_RECORD));
  assert.deepEqual(value, STAGE_6_E3_AUDIT_RECORD);
  const canonical = JSON.stringify({
    schemaVersion: value.schemaVersion,
    reviewTaskId: value.reviewTaskId,
    reviewTurnId: value.reviewTurnId,
    candidateCommit: value.candidateCommit,
    technicalCommit: value.technicalCommit,
    verdict: value.verdict,
    P0: value.P0,
    P1: value.P1,
    P2: value.P2,
  });
  assert.equal(Buffer.byteLength(canonical, "utf8"), STAGE_6_E3_AUDIT_RECORD_BYTES);
  assert.equal(sha256(canonical), STAGE_6_E3_AUDIT_RECORD_SHA256);
  return canonical;
}

function assertSingleE3AuditRecordOwner(records: readonly unknown[]): void {
  const owners = records.filter((record) => record !== undefined);
  assert.equal(owners.length, 1, "E3 audit record must have one structured owner");
  canonicalizeE3AuditRecord(owners[0]);
}

function assertAcceptanceProjectionPathSet(
  actual: ReadonlySet<string>,
  phase: E3AcceptanceProjectionPhase,
  immutablePlanningPaths: readonly string[] = STAGE_6_E3_ACCEPTANCE_IMMUTABLE_PLANNING_PATHS,
  technicalPaths: readonly string[] = STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS,
  lifecyclePaths: readonly string[] = STAGE_6_E3_ACCEPTANCE_LIFECYCLE_PATHS,
): void {
  assertExactPathSet(
    new Set(immutablePlanningPaths),
    STAGE_6_E3_ACCEPTANCE_IMMUTABLE_PLANNING_PATHS,
    "acceptance immutable planning declaration",
  );
  assertExactPathSet(
    new Set(technicalPaths),
    STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS,
    "acceptance technical declaration",
  );
  assertExactPathSet(
    new Set(lifecyclePaths),
    STAGE_6_E3_ACCEPTANCE_LIFECYCLE_PATHS,
    "acceptance lifecycle declaration",
  );
  assert.equal(immutablePlanningPaths.length, 8);
  assert.equal(technicalPaths.length, 1);
  assert.equal(lifecyclePaths.length, 9);

  const declaredOwners = [
    ...immutablePlanningPaths,
    ...technicalPaths,
    ...lifecyclePaths,
  ];
  assert.equal(
    new Set(declaredOwners).size,
    declaredOwners.length,
    "acceptance owner sets must be disjoint",
  );
  assert.equal(declaredOwners.length, 18);

  const expected =
    phase === "technical-transition"
      ? [
          ...immutablePlanningPaths,
          ...technicalPaths,
          ...STAGE_6_E3_ACCEPTANCE_ACTIVATION_LIFECYCLE_PATHS,
        ]
      : declaredOwners;
  assert.equal(expected.length, phase === "technical-transition" ? 13 : 18);
  assertExactPathSet(actual, expected, `acceptance ${phase}`);
}

function filesUnder(root: string): string[] {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) {
    return [];
  }
  const result: string[] = [];
  const visit = (absolute: string, prefix: string): void => {
    for (const entry of readdirSync(absolute)) {
      const child = join(absolute, entry);
      const childRelative = prefix === "" ? entry : `${prefix}/${entry}`;
      const stat = lstatSync(child);
      assert.equal(stat.isSymbolicLink(), false, `${childRelative} must not be a symlink`);
      if (stat.isDirectory()) {
        visit(child, childRelative);
      } else {
        assert.equal(stat.isFile(), true, `${childRelative} must be a regular file`);
        result.push(childRelative.replaceAll("\\", "/"));
      }
    }
  };
  visit(absoluteRoot, "");
  return result.sort();
}

function resolveExactTaskLocation(
  activeRoot: string,
  archiveRoot: string,
  manifest: readonly string[],
  input: ExactTaskLocationInput = {
    activeFiles: existsSync(resolve(activeRoot)) ? filesUnder(activeRoot) : null,
    archiveFiles: existsSync(resolve(archiveRoot)) ? filesUnder(archiveRoot) : null,
  },
): ExactTaskLocation {
  assert.notEqual(
    input.activeFiles !== null,
    input.archiveFiles !== null,
    "exactly one active/archive task root must exist",
  );
  const kind = input.activeFiles !== null ? "active" : "archive";
  const files = input.activeFiles ?? input.archiveFiles ?? [];
  assert.deepEqual([...files].sort(), [...manifest].sort());
  return { kind, root: kind === "active" ? activeRoot : archiveRoot };
}

function canonicalizeAcceptanceProjectionAuditRecord(record: unknown): string {
  assert.ok(record !== null && typeof record === "object");
  assert.equal(Array.isArray(record), false);
  const value = record as Readonly<Record<string, unknown>>;
  assert.deepEqual(
    Object.keys(value),
    Object.keys(STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD),
  );
  assert.deepEqual(value, STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD);
  const canonical = JSON.stringify({
    schemaVersion: value.schemaVersion,
    reviewTaskId: value.reviewTaskId,
    reviewTurnId: value.reviewTurnId,
    candidateCommit: value.candidateCommit,
    technicalCommit: value.technicalCommit,
    verdict: value.verdict,
    P0: value.P0,
    P1: value.P1,
    P2: value.P2,
  });
  assert.equal(
    Buffer.byteLength(canonical, "utf8"),
    STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_BYTES,
  );
  assert.equal(
    sha256(canonical),
    STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256,
  );
  return canonical;
}

function assertSingleAcceptanceProjectionAuditRecordOwner(
  records: readonly unknown[],
): void {
  const owners = records.filter((record) => record !== undefined);
  assert.equal(
    owners.length,
    1,
    "acceptance-projection audit record must have one structured owner",
  );
  canonicalizeAcceptanceProjectionAuditRecord(owners[0]);
}

function assertArchiveClockContract(input: {
  readonly month: string;
  readonly date: string;
  readonly time: string;
}): void {
  assert.equal(input.month, "2026-08");
  assert.equal(input.date, "2026-08-31");
  assert.match(input.time, /^\d{2}:\d{2}:\d{2}$/u);
  assert.ok(input.time < "23:50:00", "native archive preflight must retain rollover margin");
}

function expectedAcceptanceArchiveClosureChanges(
  phase: E3AcceptanceArchiveClosurePhase,
): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  const setAll = (
    status: "A" | "M" | "D",
    paths: readonly string[],
  ): void => {
    for (const path of paths) {
      assert.equal(result.has(path), false, `${path} must have one declared owner`);
      result.set(path, status);
    }
  };

  const closureRoot =
    phase === "closure-archived"
      ? STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ARCHIVE_ROOT
      : STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ROOT;
  setAll(
    "A",
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_MANIFEST.map(
      (path) => `${closureRoot}/${path}`,
    ),
  );
  setAll("M", [STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_TECHNICAL_PATH]);
  setAll("M", STAGE_6_E3_LAW_PARENT_LIFECYCLE_PATHS);

  if (phase === "owner-acceptance") {
    setAll("M", STAGE_6_PARENT_LIFECYCLE_PATHS);
    setAll("M", STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_PATHS);
    setAll("M", STAGE_6_E3_ACCEPTANCE_TARGET_LIFECYCLE_PATHS);
  }

  if (phase === "target-archived" || phase === "closure-archived") {
    setAll("M", STAGE_6_PARENT_LIFECYCLE_PATHS);
    setAll(
      "D",
      STAGE_6_E3_ACCEPTANCE_TASK_MANIFEST.map(
        (path) => `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/${path}`,
      ),
    );
    setAll(
      "A",
      STAGE_6_E3_ACCEPTANCE_TASK_MANIFEST.map(
        (path) => `${STAGE_6_E3_ACCEPTANCE_ARCHIVE_ROOT}/${path}`,
      ),
    );
  }

  return result;
}

function assertAcceptanceArchiveClosurePathSet(
  actual: ReadonlyMap<string, "A" | "M" | "D">,
  phase: E3AcceptanceArchiveClosurePhase,
): void {
  const expected = expectedAcceptanceArchiveClosureChanges(phase);
  const project = (value: ReadonlyMap<string, "A" | "M" | "D">): string[] =>
    [...value].map(([path, status]) => `${status}\t${path}`).sort();
  assert.deepEqual(project(actual), project(expected));
  if (phase === "target-archived" || phase === "closure-archived") {
    assert.equal(actual.size, 40);
  }
}

function assertJsonlReferencesExist(root: string): void {
  for (const name of ["implement.jsonl", "check.jsonl"] as const) {
    const seen = new Set<string>();
    for (const line of lines(readText(`${root}/${name}`))) {
      const row = JSON.parse(line) as { readonly file?: unknown };
      assert.equal(typeof row.file, "string");
      const path = row.file as string;
      assert.equal(seen.has(path), false, `${root}/${name} repeats ${path}`);
      seen.add(path);
      assert.equal(existsSync(resolve(path)), true, `${root}/${name} references ${path}`);
    }
  }
}

function assertTargetSuccessorJsonl(root: string): void {
  const implement = lfNormalizedText(`${root}/implement.jsonl`);
  const check = lfNormalizedText(`${root}/check.jsonl`);
  assert.equal(
    sha256(implement),
    STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_IMPLEMENT_SHA256,
  );
  assert.equal(
    sha256(check),
    STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_CHECK_SHA256,
  );
  assert.equal(implement.includes(STAGE_6_E3_ACCEPTANCE_TASK_ROOT), false);
  assert.equal(check.includes(STAGE_6_E3_ACCEPTANCE_TASK_ROOT), false);
  assertJsonlReferencesExist(root);
}

function assertTaskImmutablePlanningAuthority(
  root: string,
  contract: unknown,
  count: unknown,
  authority: unknown,
): void {
  assert.equal(contract, "lf_normalized_utf8_sha256");
  assert.ok(authority !== null && typeof authority === "object");
  assert.equal(Array.isArray(authority), false);
  const entries = Object.entries(authority as Readonly<Record<string, unknown>>);
  assert.equal(count, entries.length);
  for (const [path, digest] of entries) {
    assert.equal(typeof digest, "string");
    assert.equal(sha256(lfNormalizedText(`${root}/${path}`)), digest);
  }
}

function assertAcceptanceArchiveLifecycleProjection(
  projection: AcceptanceArchiveLifecycleProjection,
  phase: E3AcceptanceArchiveClosurePhase,
): void {
  const targetArchived = phase === "target-archived" || phase === "closure-archived";
  const closureArchived = phase === "closure-archived";
  const ownerAccepted = phase !== "activation";

  assert.equal(projection.targetLocation, targetArchived ? "archive" : "active");
  assert.equal(projection.targetStatus, targetArchived ? "completed" : "in_progress");
  assert.equal(projection.targetCompletedAt, targetArchived ? "2026-08-31" : null);
  assert.equal(projection.targetImplementationCandidateReady, true);
  assert.equal(
    projection.targetImplementationReview,
    ownerAccepted
      ? "passed_dedicated_independent_acceptance_projection_implementation_review"
      : "pending_dedicated_independent_acceptance_projection_implementation_review",
  );
  assert.equal(projection.targetAcceptanceAuthorized, ownerAccepted);
  assert.equal(projection.targetArchiveAuthorized, ownerAccepted);
  assert.equal(projection.targetDefaultRuntime, "typescript");
  assert.equal(projection.targetS62Started, false);
  assert.equal(projection.targetS63Started, false);
  assert.equal(projection.targetIntegrationAuthorized, false);
  assert.equal(projection.targetQualificationAuthorized, false);
  assert.equal(projection.targetRuntimeSwitchAuthorized, false);
  assert.equal(projection.targetPushAuthorized, false);
  assert.equal(projection.targetRkp3CreationAuthorized, false);

  assert.equal(projection.closureLocation, closureArchived ? "archive" : "active");
  assert.equal(projection.closureStatus, closureArchived ? "completed" : "in_progress");
  assert.equal(projection.closureCompletedAt, closureArchived ? "2026-08-31" : null);
  assert.equal(projection.closureTaskStartRun, true);
  assert.equal(projection.closureProductionAuthorized, false);
  assert.equal(projection.closureUserAuthorized, true);
  assert.equal(
    projection.closureImplementationCandidateReady,
    phase === "target-archived" || closureArchived,
  );
  assert.equal(
    projection.closureImplementationReview,
    closureArchived
      ? "passed_dedicated_independent_E3_acceptance_archive_closure_implementation_review"
      : phase === "target-archived"
        ? "pending_dedicated_independent_E3_acceptance_archive_closure_implementation_review"
        : "pending_not_started",
  );
  assert.equal(projection.closureTargetAcceptanceAuthorized, ownerAccepted);
  assert.equal(projection.closureTargetArchiveAuthorized, ownerAccepted);
  assert.equal(projection.closureAcceptanceAuthorized, closureArchived);
  assert.equal(projection.closureArchiveAuthorized, closureArchived);
  assert.equal(projection.closureDefaultRuntime, "typescript");
  assert.equal(projection.closureS62Started, false);
  assert.equal(projection.closureS63Started, false);
  assert.equal(projection.closureIntegrationAuthorized, false);
  assert.equal(projection.closureQualificationAuthorized, false);
  assert.equal(projection.closureRuntimeSwitchAuthorized, false);
  assert.equal(projection.closurePushAuthorized, false);
  assert.equal(projection.closureRkp3CreationAuthorized, false);
  assert.equal(projection.closureE3StressRerun, false);

  assert.equal(projection.lawStatus, "in_progress");
  assert.equal(projection.lawCurrentPlanningChild, null);
  assert.equal(
    projection.lawCurrentImplementationChild,
    closureArchived ? null : "08-31-rkp-2-e3-acceptance-archive-closure",
  );
  assert.equal(
    projection.lawNextGate,
    closureArchived
      ? "explicit_owner_decision_for_e3_law_parent_acceptance_archive"
      : phase === "target-archived"
        ? "dedicated_independent_E3_acceptance_archive_closure_implementation_review_pending"
        : phase === "owner-acceptance"
          ? "native_target_archive_clock_preflight_required"
          : "acceptance_archive_closure_archive_aware_workspace_law_technical_checkpoint",
  );
  assert.equal(projection.lawIntegrationAuthorized, false);
  assert.equal(projection.lawQualificationAuthorized, false);
  assert.equal(projection.lawArchiveAuthorized, false);
  assert.equal(projection.lawRuntimeSwitchAuthorized, false);
  assert.equal(projection.lawPushAuthorized, false);
  assert.equal(projection.lawRkp3CreationAuthorized, false);

  assert.equal(projection.stage6Status, "in_progress");
  assert.equal(
    projection.stage6CurrentImplementationChild,
    "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair",
  );
  assert.equal(projection.stage6S62Started, false);
  assert.equal(projection.stage6S63Started, false);
  assert.equal(projection.stage6DefaultRuntime, "typescript");
  assert.equal(projection.stage6ArchiveAuthorized, false);
  assert.equal(projection.stage6OfficialMeasurementAuthorized, false);
  assert.equal(projection.stage6RuntimeSwitchAuthorized, false);
  assert.equal(projection.stage6PushAuthorized, false);
  assert.equal(projection.stage6Rkp3CreationAuthorized, false);
}

function extractE3ProtocolLine(source: string): string {
  const protocol = lines(source).find((line) =>
    line.startsWith(STAGE_6_E3_PROTOCOL_PREFIX),
  );
  assert.ok(protocol, "E3 evidence must contain exactly one process protocol");
  assert.equal(
    lines(source).filter((line) =>
      line.startsWith(STAGE_6_E3_PROTOCOL_PREFIX),
    ).length,
    1,
  );
  return protocol;
}

function assertE3EvidenceProjection(
  evidenceSource: string,
  protocolLine: string,
): E3ProtocolEnvelope {
  assert.match(evidenceSource, new RegExp(STAGE_6_E2_TERMINAL_HEAD, "u"));
  assert.match(evidenceSource, new RegExp(STAGE_6_E3_SOURCE_TREE, "u"));
  assert.match(
    evidenceSource,
    /It is not a product benchmark, RKP-7 budget result, RKP-9 qualification result/u,
  );
  assert.equal(Buffer.byteLength(protocolLine, "utf8"), 1_525);
  assert.equal(sha256(protocolLine), STAGE_6_E3_PROTOCOL_SHA256);
  assert.equal(protocolLine.startsWith(STAGE_6_E3_PROTOCOL_PREFIX), true);

  const envelope = JSON.parse(
    protocolLine.slice(STAGE_6_E3_PROTOCOL_PREFIX.length),
  ) as E3ProtocolEnvelope;
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.status, "ok");
  assert.equal(envelope.evidence.schemaVersion, 1);
  assert.equal(envelope.evidence.status, "ok");
  assert.equal(envelope.evidence.fixtureId, "cvn7-stress-v1");
  assert.deepEqual(envelope.evidence.counts, {
    measures: 400,
    parts: 16,
    staves: 16,
    measureContents: 6_400,
    voices: 12_800,
    events: 102_400,
    notes: 51_200,
    extensions: 18,
    partOwnedExtensions: 16,
    unknownExtensions: 1,
  });
  assert.equal(envelope.evidence.workloadElapsedMicros, 12_964_590);
  assert.deepEqual(envelope.process, {
    exitCode: 0,
    timedOut: false,
    peakWorkingSetBytes: 821_886_976,
    stdoutBytes: 1_438,
    stderrBytes: 0,
    terminationStatus: "not-required",
    reapStatus: "succeeded",
    cleanupStatus: "succeeded",
  });
  assert.equal(envelope.partialEvidence, false);
  return envelope;
}

function assertE3LifecycleProjection(
  projection: E3LifecycleProjection,
  phase: E3AcceptanceProjectionPhase,
): void {
  assert.equal(projection.stage6Status, "in_progress");
  assert.equal(projection.stage6ImplementationCandidateReady, true);
  assert.equal(
    projection.stage6ImplementationReview,
    phase === "technical-transition"
      ? "pending_dedicated_independent_E3_candidate_review"
      : STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS,
  );
  assert.equal(
    projection.stage6CurrentImplementationChild,
    "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair",
  );
  assert.equal(projection.stage6S62Started, false);
  assert.equal(projection.stage6S63Started, false);
  assert.equal(projection.stage6DefaultRuntime, "typescript");
  assert.equal(projection.stage6ArchiveAuthorized, false);
  assert.equal(projection.stage6PushAuthorized, false);
  assert.equal(projection.stage6RuntimeSwitchAuthorized, false);
  assert.equal(projection.stage6OfficialMeasurementAuthorized, false);
  assert.equal(projection.stage6Rkp3CreationAuthorized, false);
  assert.equal(projection.stage6AuditRecord, undefined);
  assert.equal(
    projection.stage6AuditRecordOwner,
    phase === "technical-transition"
      ? undefined
      : `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  );
  assert.equal(
    projection.stage6AuditRecordSha256,
    phase === "technical-transition" ? undefined : STAGE_6_E3_AUDIT_RECORD_SHA256,
  );
  assert.equal(
    projection.historicalE2Status,
    "completed_historical_E1R2_and_E2_authority_consumed_parent_Stage6_E3_owned_elsewhere",
  );
  assert.equal(projection.historicalE2Stage6E3Started, false);

  assert.equal(projection.rkp2Status, "in_progress");
  assert.equal(
    projection.rkp2CurrentImplementationChild,
    "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
  );
  assert.equal(projection.rkp2S62Started, false);
  assert.equal(projection.rkp2S63Started, false);
  assert.equal(projection.rkp2DefaultRuntime, "typescript");
  assert.equal(projection.rkp2ArchiveAuthorized, false);
  assert.equal(projection.rkp2PushAuthorized, false);
  assert.equal(projection.rkp2RuntimeSwitchAuthorized, false);
  assert.equal(projection.rkp2OfficialMeasurementAuthorized, false);
  assert.equal(projection.rkp2Rkp3CreationAuthorized, false);

  assert.equal(
    projection.rustCurrentImplementationChild,
    "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
  );
  assert.equal(projection.rustS62Started, false);
  assert.equal(projection.rustS63Started, false);
  assert.equal(projection.rustDefaultRuntime, "typescript");
  assert.equal(projection.rustRuntimeSwitchAuthorized, false);

  assert.equal(projection.lawTaskStatus, "in_progress");
  assert.equal(
    projection.lawImplementationReview,
    phase === "technical-transition"
      ? "pending_dedicated_independent_E3_workspace_law_implementation_review"
      : STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS,
  );
  assert.equal(projection.lawCurrentPlanningChild, null);
  assert.equal(
    projection.lawCurrentImplementationChild,
    "08-31-rkp-2-e3-acceptance-state-projection",
  );
  canonicalizeE3AuditRecord(projection.lawAuditRecord);
  assert.equal(projection.lawAuditRecordBytes, STAGE_6_E3_AUDIT_RECORD_BYTES);
  assert.equal(projection.lawAuditRecordSha256, STAGE_6_E3_AUDIT_RECORD_SHA256);
  assert.equal(projection.lawIntegrationAuthorized, false);
  assert.equal(projection.lawQualificationAuthorized, false);
  assert.equal(projection.lawArchiveAuthorized, false);
  assert.equal(projection.lawPushAuthorized, false);
  assert.equal(projection.lawRuntimeSwitchAuthorized, false);
  assert.equal(projection.lawRkp3CreationAuthorized, false);

  assert.equal(projection.acceptanceTaskStatus, "in_progress");
  assert.equal(projection.acceptanceTaskStartRun, true);
  assert.equal(projection.acceptanceTaskProductionAuthorized, true);
  assert.equal(projection.acceptanceTaskUserAuthorized, true);
  assert.equal(
    projection.acceptanceTaskCandidateReady,
    phase === "terminal-candidate",
  );
  assert.equal(
    projection.acceptanceTaskImplementationReview,
    phase === "technical-transition"
      ? "pending_not_started"
      : "pending_dedicated_independent_acceptance_projection_implementation_review",
  );
  assert.equal(projection.acceptanceTaskAuditRecord, undefined);
  assert.equal(
    projection.acceptanceTaskAuditRecordOwner,
    `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  );
  assert.equal(
    projection.acceptanceTaskAuditRecordSha256,
    STAGE_6_E3_AUDIT_RECORD_SHA256,
  );
  assert.equal(projection.acceptanceTaskS62Started, false);
  assert.equal(projection.acceptanceTaskS63Started, false);
  assert.equal(projection.acceptanceTaskDefaultRuntime, "typescript");
  assert.equal(projection.acceptanceTaskAcceptanceAuthorized, false);
  assert.equal(projection.acceptanceTaskArchiveAuthorized, false);
  assert.equal(projection.acceptanceTaskIntegrationAuthorized, false);
  assert.equal(projection.acceptanceTaskQualificationAuthorized, false);
  assert.equal(projection.acceptanceTaskRuntimeSwitchAuthorized, false);
  assert.equal(projection.acceptanceTaskPushAuthorized, false);
  assert.equal(projection.acceptanceTaskRkp3CreationAuthorized, false);

  assertSingleE3AuditRecordOwner([
    projection.lawAuditRecord,
    projection.stage6AuditRecord,
    projection.acceptanceTaskAuditRecord,
  ]);
}

function assertImmutablePlanningAuthority(
  contract: unknown,
  count: unknown,
  registry: unknown,
): void {
  assert.equal(contract, "lf_normalized_utf8_sha256");
  assert.equal(count, 9);
  assert.ok(registry !== null && typeof registry === "object");
  assert.equal(Array.isArray(registry), false);
  const entries = Object.entries(registry as Readonly<Record<string, unknown>>);
  assert.equal(entries.length, 9);
  for (const [path, expected] of entries) {
    assert.equal(typeof expected, "string", `${path} digest must be a string`);
    assert.equal(existsSync(resolve(path)), true, `${path} must exist`);
    assert.equal(
      sha256(lfNormalizedText(path)),
      expected,
      `${path} immutable planning digest`,
    );
  }
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

test("Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts", () => {
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      STAGE_6_SEMANTIC_CANONICAL_PLANNING_BASE,
      STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD,
    ]),
  );
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${STAGE_6_E2_CANDIDATE_BASE}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${STAGE_6_E2_TERMINAL_HEAD}^{commit}`]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD,
      STAGE_6_E2_TERMINAL_HEAD,
    ]),
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      STAGE_6_E2_CANDIDATE_BASE,
      STAGE_6_E2_TERMINAL_HEAD,
    ]),
  );
  assertExactPathSet(
    historicalSemanticCanonicalE2Changes(),
    [
      ...STAGE_6_E2_TECHNICAL_PATHS,
      ...STAGE_6_SEMANTIC_CANONICAL_LIFECYCLE_PATHS,
    ],
    "Stage 6 semantic/canonical E1R2 plus E2 worker candidate",
  );
  assertExactPathSet(
    historicalE2WorkerChanges(),
    [
      ...STAGE_6_E2_WORKER_TECHNICAL_PATHS,
      ...STAGE_6_SEMANTIC_CANONICAL_LIFECYCLE_PATHS,
    ],
    "Stage 6 E2 fourth bounded repair candidate",
  );

  assert.equal(
    git(["rev-parse", `${STAGE_6_E2_TERMINAL_HEAD}^{tree}`]),
    STAGE_6_E3_SOURCE_TREE,
  );
  const historicalE3Paths = historicalE3AuditedCandidateChanges();
  assertHistoricalE3AuditedCandidateProjection(historicalE3Paths);

  const withoutEvidence = new Set(historicalE3Paths);
  withoutEvidence.delete(STAGE_6_E3_EVIDENCE_PATH);
  assert.throws(() =>
    assertHistoricalE3AuditedCandidateProjection(withoutEvidence),
  );
  assert.throws(() =>
    assertHistoricalE3AuditedCandidateProjection(historicalE3Paths, [
      ...STAGE_6_ORIGINAL_E3_PATHS,
      `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/ninth-e3-lifecycle-path.md`,
    ]),
  );
  assert.throws(() =>
    assertHistoricalE3AuditedCandidateProjection(
      historicalE3Paths,
      STAGE_6_ORIGINAL_E3_PATHS,
      [
        ...STAGE_6_E3_LAW_TECHNICAL_PATHS,
        STAGE_6_E3_EVIDENCE_PATH,
      ],
    ),
  );
  const historicalLawTask = JSON.parse(
    gitTextAt(
      STAGE_6_E3_AUDITED_CANDIDATE,
      `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly meta?: {
      readonly implementation_review?: unknown;
      readonly external_independent_implementation_audit_result?: unknown;
    };
  };
  assert.equal(
    historicalLawTask.meta?.implementation_review,
    "pending_dedicated_independent_E3_workspace_law_implementation_review",
  );
  assert.equal(
    historicalLawTask.meta?.external_independent_implementation_audit_result,
    undefined,
  );

  const acceptanceTask = JSON.parse(
    gitTextAt(
      STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
      `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly status?: unknown;
    readonly meta?: {
      readonly task_start_run?: unknown;
      readonly production_implementation_authorized?: unknown;
      readonly user_implementation_authorization?: unknown;
      readonly implementation_candidate_ready?: unknown;
      readonly implementation_review?: unknown;
      readonly source_audit_record_owner?: unknown;
      readonly source_audit_record_sha256?: unknown;
      readonly external_independent_implementation_audit_result?: unknown;
      readonly rkp2_stage6_s6_2_started?: unknown;
      readonly rkp2_stage6_s6_3_started?: unknown;
      readonly default_runtime?: unknown;
      readonly acceptance_authorized?: unknown;
      readonly archive_authorized?: unknown;
      readonly integration_authorized?: unknown;
      readonly qualification_authorized?: unknown;
      readonly default_runtime_switch_authorized?: unknown;
      readonly push_authorized?: unknown;
      readonly rkp3_creation_authorized?: unknown;
    };
  };
  const acceptancePhase: E3AcceptanceProjectionPhase = "terminal-candidate";
  const currentAcceptancePaths = historicalAcceptanceProjectionChanges();
  assertAcceptanceProjectionPathSet(currentAcceptancePaths, acceptancePhase);

  const withoutAcceptanceTechnical = new Set(currentAcceptancePaths);
  withoutAcceptanceTechnical.delete(STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS[0]);
  assert.throws(() =>
    assertAcceptanceProjectionPathSet(
      withoutAcceptanceTechnical,
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertAcceptanceProjectionPathSet(
      new Set([
        ...currentAcceptancePaths,
        `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/undeclared.md`,
      ]),
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertAcceptanceProjectionPathSet(
      currentAcceptancePaths,
      acceptancePhase,
      STAGE_6_E3_ACCEPTANCE_IMMUTABLE_PLANNING_PATHS,
      STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS,
      [
        ...STAGE_6_E3_ACCEPTANCE_LIFECYCLE_PATHS,
        STAGE_6_E3_ACCEPTANCE_TECHNICAL_PATHS[0],
      ],
    ),
  );

  const task = JSON.parse(
    readText(`${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly meta?: {
      readonly planning_base_commit?: unknown;
      readonly accepted_planning_authority_head?: unknown;
      readonly future_technical_allowlist?: unknown;
      readonly future_lifecycle_allowlist?: unknown;
      readonly stage6_e2_started?: unknown;
      readonly stage6_e3_started?: unknown;
    };
  };
  assert.equal(task.status, "in_progress");
  assert.equal(
    task.meta?.planning_base_commit,
    STAGE_6_SEMANTIC_CANONICAL_PLANNING_BASE,
  );
  assert.equal(
    task.meta?.accepted_planning_authority_head,
    STAGE_6_SEMANTIC_CANONICAL_PLANNING_HEAD,
  );
  assert.deepEqual(task.meta?.future_technical_allowlist, [
    ...STAGE_6_SEMANTIC_CANONICAL_TECHNICAL_PATHS,
  ]);
  assert.deepEqual(task.meta?.future_lifecycle_allowlist, [
    ...STAGE_6_SEMANTIC_CANONICAL_LIFECYCLE_PATHS,
  ]);
  assert.equal(task.meta?.stage6_e2_started, true);
  assert.equal(task.meta?.stage6_e3_started, false);

  const stage6Task = JSON.parse(
    gitTextAt(
      STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
      `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly status?: unknown;
    readonly children?: unknown;
    readonly meta?: {
      readonly future_technical_allowlist?: unknown;
      readonly future_lifecycle_allowlist?: unknown;
      readonly implementation_candidate_ready?: unknown;
      readonly implementation_review?: unknown;
      readonly current_implementation_child?: unknown;
      readonly rkp2_stage_6_s6_2_started?: unknown;
      readonly rkp2_stage_6_s6_3_started?: unknown;
      readonly default_runtime?: unknown;
      readonly archive_authorized?: unknown;
      readonly push_authorized?: unknown;
      readonly default_runtime_switch_authorized?: unknown;
      readonly official_measurement_authorized?: unknown;
      readonly rkp3_creation_authorized?: unknown;
      readonly external_independent_implementation_audit_result?: unknown;
      readonly e3_workspace_law_audit_record_owner?: unknown;
      readonly e3_workspace_law_audit_record_sha256?: unknown;
      readonly e3_evidence_source_head?: unknown;
      readonly e3_evidence_source_tree?: unknown;
      readonly e3_protocol_sha256?: unknown;
      readonly e3_workload_elapsed_micros?: unknown;
      readonly e3_wall_elapsed_micros?: unknown;
      readonly e3_peak_working_set_bytes?: unknown;
      readonly e3_partial_evidence?: unknown;
      readonly immutable_planning_authority_hash_contract?: unknown;
      readonly immutable_planning_authority_count?: unknown;
      readonly immutable_planning_authority?: unknown;
      readonly stage6_semantic_canonical_authority_amendment?: {
        readonly status?: unknown;
        readonly stage6_e2_started?: unknown;
        readonly stage6_e3_started?: unknown;
      };
    };
  };
  assert.deepEqual(stage6Task.meta?.future_technical_allowlist, [
    ...STAGE_6_E2_WORKER_TECHNICAL_PATHS,
  ]);
  assert.deepEqual(stage6Task.meta?.future_lifecycle_allowlist, [
    ...STAGE_6_ORIGINAL_E3_PATHS,
  ]);
  assert.deepEqual(stage6Task.children, [
    "08-30-rkp-2-stage-6-semantic-canonical-authority-amendment",
    "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair",
  ]);
  assert.equal(
    stage6Task.meta?.stage6_semantic_canonical_authority_amendment
      ?.stage6_e2_started,
    true,
  );
  assert.equal(
    stage6Task.meta?.stage6_semantic_canonical_authority_amendment
      ?.stage6_e3_started,
    false,
  );

  const evidenceSource = readText(STAGE_6_E3_EVIDENCE_PATH);
  const protocolLine = extractE3ProtocolLine(evidenceSource);
  assertE3EvidenceProjection(evidenceSource, protocolLine);
  assert.throws(() =>
    assertE3EvidenceProjection(
      evidenceSource,
      protocolLine.replace(
        '"fixtureId":"cvn7-stress-v1"',
        '"fixtureId":"cvn7-stress-v2"',
      ),
    ),
  );
  assert.equal(
    stage6Task.meta?.e3_evidence_source_head,
    STAGE_6_E2_TERMINAL_HEAD,
  );
  assert.equal(stage6Task.meta?.e3_evidence_source_tree, STAGE_6_E3_SOURCE_TREE);
  assert.equal(stage6Task.meta?.e3_protocol_sha256, STAGE_6_E3_PROTOCOL_SHA256);
  assert.equal(stage6Task.meta?.e3_workload_elapsed_micros, 12_964_590);
  assert.equal(stage6Task.meta?.e3_wall_elapsed_micros, 14_077_309);
  assert.equal(stage6Task.meta?.e3_peak_working_set_bytes, 821_886_976);
  assert.equal(stage6Task.meta?.e3_partial_evidence, false);
  assertImmutablePlanningAuthority(
    stage6Task.meta?.immutable_planning_authority_hash_contract,
    stage6Task.meta?.immutable_planning_authority_count,
    stage6Task.meta?.immutable_planning_authority,
  );

  const rkp2Task = JSON.parse(readText(TASK_PATH)) as {
    readonly status?: unknown;
    readonly meta?: {
      readonly current_implementation_child?: unknown;
      readonly stage_6_s6_2_started?: unknown;
      readonly stage_6_s6_3_started?: unknown;
      readonly default_runtime?: unknown;
      readonly archive_authorized?: unknown;
      readonly push_authorized?: unknown;
      readonly default_runtime_switch_authorized?: unknown;
      readonly official_measurement_authorized?: unknown;
      readonly rkp3_creation_authorized?: unknown;
    };
  };
  const rustTask = JSON.parse(readText(PARENT_PATH)) as {
    readonly meta?: {
      readonly current_implementation_child?: unknown;
      readonly rkp2_stage_6_s6_2_started?: unknown;
      readonly rkp2_stage_6_s6_3_started?: unknown;
      readonly rkp2_default_runtime?: unknown;
      readonly rkp2_default_runtime_switch_authorized?: unknown;
    };
  };
  const lawTask = JSON.parse(
    gitTextAt(
      STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
      `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly status?: unknown;
    readonly meta?: {
      readonly implementation_review?: unknown;
      readonly current_planning_child?: unknown;
      readonly current_implementation_child?: unknown;
      readonly external_independent_implementation_audit_result?: unknown;
      readonly external_independent_implementation_audit_canonical_bytes?: unknown;
      readonly external_independent_implementation_audit_sha256?: unknown;
      readonly integration_authorized?: unknown;
      readonly qualification_authorized?: unknown;
      readonly archive_authorized?: unknown;
      readonly push_authorized?: unknown;
      readonly default_runtime_switch_authorized?: unknown;
      readonly rkp3_creation_authorized?: unknown;
    };
  };
  const lifecycle: E3LifecycleProjection = {
    stage6Status: stage6Task.status,
    stage6ImplementationCandidateReady:
      stage6Task.meta?.implementation_candidate_ready,
    stage6ImplementationReview: stage6Task.meta?.implementation_review,
    stage6CurrentImplementationChild:
      stage6Task.meta?.current_implementation_child,
    stage6S62Started: stage6Task.meta?.rkp2_stage_6_s6_2_started,
    stage6S63Started: stage6Task.meta?.rkp2_stage_6_s6_3_started,
    stage6DefaultRuntime: stage6Task.meta?.default_runtime,
    stage6ArchiveAuthorized: stage6Task.meta?.archive_authorized,
    stage6PushAuthorized: stage6Task.meta?.push_authorized,
    stage6RuntimeSwitchAuthorized:
      stage6Task.meta?.default_runtime_switch_authorized,
    stage6OfficialMeasurementAuthorized:
      stage6Task.meta?.official_measurement_authorized,
    stage6Rkp3CreationAuthorized: stage6Task.meta?.rkp3_creation_authorized,
    stage6AuditRecord:
      stage6Task.meta?.external_independent_implementation_audit_result,
    stage6AuditRecordOwner:
      stage6Task.meta?.e3_workspace_law_audit_record_owner,
    stage6AuditRecordSha256:
      stage6Task.meta?.e3_workspace_law_audit_record_sha256,
    historicalE2Status:
      stage6Task.meta?.stage6_semantic_canonical_authority_amendment?.status,
    historicalE2Stage6E3Started: task.meta?.stage6_e3_started,
    rkp2Status: rkp2Task.status,
    rkp2CurrentImplementationChild:
      rkp2Task.meta?.current_implementation_child,
    rkp2S62Started: rkp2Task.meta?.stage_6_s6_2_started,
    rkp2S63Started: rkp2Task.meta?.stage_6_s6_3_started,
    rkp2DefaultRuntime: rkp2Task.meta?.default_runtime,
    rkp2ArchiveAuthorized: rkp2Task.meta?.archive_authorized,
    rkp2PushAuthorized: rkp2Task.meta?.push_authorized,
    rkp2RuntimeSwitchAuthorized:
      rkp2Task.meta?.default_runtime_switch_authorized,
    rkp2OfficialMeasurementAuthorized:
      rkp2Task.meta?.official_measurement_authorized,
    rkp2Rkp3CreationAuthorized: rkp2Task.meta?.rkp3_creation_authorized,
    rustCurrentImplementationChild: rustTask.meta?.current_implementation_child,
    rustS62Started: rustTask.meta?.rkp2_stage_6_s6_2_started,
    rustS63Started: rustTask.meta?.rkp2_stage_6_s6_3_started,
    rustDefaultRuntime: rustTask.meta?.rkp2_default_runtime,
    rustRuntimeSwitchAuthorized:
      rustTask.meta?.rkp2_default_runtime_switch_authorized,
    lawTaskStatus: lawTask.status,
    lawImplementationReview: lawTask.meta?.implementation_review,
    lawCurrentPlanningChild: lawTask.meta?.current_planning_child,
    lawCurrentImplementationChild: lawTask.meta?.current_implementation_child,
    lawAuditRecord:
      lawTask.meta?.external_independent_implementation_audit_result,
    lawAuditRecordBytes:
      lawTask.meta?.external_independent_implementation_audit_canonical_bytes,
    lawAuditRecordSha256:
      lawTask.meta?.external_independent_implementation_audit_sha256,
    lawIntegrationAuthorized: lawTask.meta?.integration_authorized,
    lawQualificationAuthorized: lawTask.meta?.qualification_authorized,
    lawArchiveAuthorized: lawTask.meta?.archive_authorized,
    lawPushAuthorized: lawTask.meta?.push_authorized,
    lawRuntimeSwitchAuthorized:
      lawTask.meta?.default_runtime_switch_authorized,
    lawRkp3CreationAuthorized: lawTask.meta?.rkp3_creation_authorized,
    acceptanceTaskStatus: acceptanceTask.status,
    acceptanceTaskStartRun: acceptanceTask.meta?.task_start_run,
    acceptanceTaskProductionAuthorized:
      acceptanceTask.meta?.production_implementation_authorized,
    acceptanceTaskUserAuthorized:
      acceptanceTask.meta?.user_implementation_authorization,
    acceptanceTaskCandidateReady:
      acceptanceTask.meta?.implementation_candidate_ready,
    acceptanceTaskImplementationReview:
      acceptanceTask.meta?.implementation_review,
    acceptanceTaskAuditRecord:
      acceptanceTask.meta?.external_independent_implementation_audit_result,
    acceptanceTaskAuditRecordOwner:
      acceptanceTask.meta?.source_audit_record_owner,
    acceptanceTaskAuditRecordSha256:
      acceptanceTask.meta?.source_audit_record_sha256,
    acceptanceTaskS62Started:
      acceptanceTask.meta?.rkp2_stage6_s6_2_started,
    acceptanceTaskS63Started:
      acceptanceTask.meta?.rkp2_stage6_s6_3_started,
    acceptanceTaskDefaultRuntime: acceptanceTask.meta?.default_runtime,
    acceptanceTaskAcceptanceAuthorized:
      acceptanceTask.meta?.acceptance_authorized,
    acceptanceTaskArchiveAuthorized: acceptanceTask.meta?.archive_authorized,
    acceptanceTaskIntegrationAuthorized:
      acceptanceTask.meta?.integration_authorized,
    acceptanceTaskQualificationAuthorized:
      acceptanceTask.meta?.qualification_authorized,
    acceptanceTaskRuntimeSwitchAuthorized:
      acceptanceTask.meta?.default_runtime_switch_authorized,
    acceptanceTaskPushAuthorized: acceptanceTask.meta?.push_authorized,
    acceptanceTaskRkp3CreationAuthorized:
      acceptanceTask.meta?.rkp3_creation_authorized,
  };
  assertE3LifecycleProjection(lifecycle, acceptancePhase);

  canonicalizeE3AuditRecord(lifecycle.lawAuditRecord);
  const missingAuditKey = {
    ...STAGE_6_E3_AUDIT_RECORD,
  } as Record<string, unknown>;
  delete missingAuditKey.P2;
  const malformedAuditRecords: readonly unknown[] = [
    undefined,
    missingAuditKey,
    { ...STAGE_6_E3_AUDIT_RECORD, schemaVersion: 2 },
    { ...STAGE_6_E3_AUDIT_RECORD, reviewTaskId: "wrong-task" },
    { ...STAGE_6_E3_AUDIT_RECORD, reviewTurnId: "wrong-turn" },
    { ...STAGE_6_E3_AUDIT_RECORD, candidateCommit: "wrong-candidate" },
    { ...STAGE_6_E3_AUDIT_RECORD, technicalCommit: "wrong-technical" },
    { ...STAGE_6_E3_AUDIT_RECORD, verdict: "PASS" },
    { ...STAGE_6_E3_AUDIT_RECORD, P0: 1 },
    { ...STAGE_6_E3_AUDIT_RECORD, P1: 1 },
    { ...STAGE_6_E3_AUDIT_RECORD, P2: 1 },
    { ...STAGE_6_E3_AUDIT_RECORD, extra: true },
    {
      reviewTaskId: STAGE_6_E3_AUDIT_RECORD.reviewTaskId,
      schemaVersion: STAGE_6_E3_AUDIT_RECORD.schemaVersion,
      reviewTurnId: STAGE_6_E3_AUDIT_RECORD.reviewTurnId,
      candidateCommit: STAGE_6_E3_AUDIT_RECORD.candidateCommit,
      technicalCommit: STAGE_6_E3_AUDIT_RECORD.technicalCommit,
      verdict: STAGE_6_E3_AUDIT_RECORD.verdict,
      P0: 0,
      P1: 0,
      P2: 0,
    },
  ];
  for (const malformedAuditRecord of malformedAuditRecords) {
    assert.throws(() => canonicalizeE3AuditRecord(malformedAuditRecord));
  }

  const terminalLifecycle: E3LifecycleProjection = {
    ...lifecycle,
    stage6ImplementationReview: STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS,
    stage6AuditRecordOwner: `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
    stage6AuditRecordSha256: STAGE_6_E3_AUDIT_RECORD_SHA256,
    lawImplementationReview: STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS,
    acceptanceTaskCandidateReady: true,
    acceptanceTaskImplementationReview:
      "pending_dedicated_independent_acceptance_projection_implementation_review",
  };
  assert.doesNotThrow(() =>
    assertE3LifecycleProjection(terminalLifecycle, "terminal-candidate"),
  );

  const rejectedTerminalMutations: readonly Partial<E3LifecycleProjection>[] = [
    { lawAuditRecord: undefined },
    { lawAuditRecordBytes: STAGE_6_E3_AUDIT_RECORD_BYTES + 1 },
    { lawAuditRecordSha256: "wrong-law-digest" },
    { stage6AuditRecord: STAGE_6_E3_AUDIT_RECORD },
    { stage6AuditRecordOwner: undefined },
    { stage6AuditRecordSha256: "wrong-stage6-digest" },
    { acceptanceTaskAuditRecord: STAGE_6_E3_AUDIT_RECORD },
    { acceptanceTaskAuditRecordOwner: "wrong-owner" },
    { acceptanceTaskAuditRecordSha256: "wrong-child-digest" },
    { stage6S62Started: true },
    { stage6S63Started: true },
    { stage6ArchiveAuthorized: true },
    { stage6PushAuthorized: true },
    { stage6RuntimeSwitchAuthorized: true },
    { stage6OfficialMeasurementAuthorized: true },
    { stage6Rkp3CreationAuthorized: true },
    { lawIntegrationAuthorized: true },
    { lawQualificationAuthorized: true },
    { lawArchiveAuthorized: true },
    { lawPushAuthorized: true },
    { lawRuntimeSwitchAuthorized: true },
    { lawRkp3CreationAuthorized: true },
    { acceptanceTaskS62Started: true },
    { acceptanceTaskS63Started: true },
    { acceptanceTaskAcceptanceAuthorized: true },
    { acceptanceTaskArchiveAuthorized: true },
    { acceptanceTaskIntegrationAuthorized: true },
    { acceptanceTaskQualificationAuthorized: true },
    { acceptanceTaskRuntimeSwitchAuthorized: true },
    { acceptanceTaskPushAuthorized: true },
    { acceptanceTaskRkp3CreationAuthorized: true },
    { stage6DefaultRuntime: "rust" },
    { acceptanceTaskDefaultRuntime: "rust" },
    { historicalE2Stage6E3Started: true },
  ];
  for (const mutation of rejectedTerminalMutations) {
    assert.throws(() =>
      assertE3LifecycleProjection(
        { ...terminalLifecycle, ...mutation },
        "terminal-candidate",
      ),
    );
  }

  assert.throws(() =>
    assertE3LifecycleProjection(
      {
        ...lifecycle,
        stage6ImplementationReview: "passed",
      },
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertE3LifecycleProjection(
      { ...lifecycle, stage6S62Started: true },
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertE3LifecycleProjection(
      { ...lifecycle, stage6S63Started: true },
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertE3LifecycleProjection(
      { ...lifecycle, stage6DefaultRuntime: "rust" },
      acceptancePhase,
    ),
  );
  assert.throws(() =>
    assertE3LifecycleProjection(
      {
        ...lifecycle,
        historicalE2Stage6E3Started: true,
      },
      acceptancePhase,
    ),
  );

  const targetLocation = resolveExactTaskLocation(
    STAGE_6_E3_ACCEPTANCE_TASK_ROOT,
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_ROOT,
    STAGE_6_E3_ACCEPTANCE_TASK_MANIFEST,
  );
  const closureLocation = resolveExactTaskLocation(
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ROOT,
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ARCHIVE_ROOT,
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_MANIFEST,
  );
  const liveTargetTask = JSON.parse(
    readText(`${targetLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveClosureTask = JSON.parse(
    readText(`${closureLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveLawTask = JSON.parse(
    readText(`${STAGE_6_E3_LAW_TASK_ROOT}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveStage6Task = JSON.parse(
    readText(`${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveTargetMeta = liveTargetTask.meta ?? {};
  const liveClosureMeta = liveClosureTask.meta ?? {};
  const liveLawMeta = liveLawTask.meta ?? {};
  const liveStage6Meta = liveStage6Task.meta ?? {};
  const archiveClosurePhase: E3AcceptanceArchiveClosurePhase =
    targetLocation.kind === "active" && closureLocation.kind === "active"
      ? liveTargetMeta.acceptance_authorized === true
        ? "owner-acceptance"
        : "activation"
      : targetLocation.kind === "archive" && closureLocation.kind === "active"
        ? "target-archived"
        : targetLocation.kind === "archive" && closureLocation.kind === "archive"
          ? "closure-archived"
          : assert.fail("closure archive cannot precede target archive");

  const archiveClosureChanges = currentAcceptanceArchiveClosureChanges();
  assertAcceptanceArchiveClosurePathSet(
    archiveClosureChanges,
    archiveClosurePhase,
  );
  const withoutClosureTechnical = new Map(archiveClosureChanges);
  withoutClosureTechnical.delete(
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_TECHNICAL_PATH,
  );
  assert.throws(() =>
    assertAcceptanceArchiveClosurePathSet(
      withoutClosureTechnical,
      archiveClosurePhase,
    ),
  );
  const withUndeclaredClosurePath = new Map(archiveClosureChanges);
  withUndeclaredClosurePath.set(
    `${STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ROOT}/undeclared.md`,
    "A",
  );
  assert.throws(() =>
    assertAcceptanceArchiveClosurePathSet(
      withUndeclaredClosurePath,
      archiveClosurePhase,
    ),
  );
  const withWrongClosureStatus = new Map(archiveClosureChanges);
  withWrongClosureStatus.set(
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_TECHNICAL_PATH,
    "A",
  );
  assert.throws(() =>
    assertAcceptanceArchiveClosurePathSet(
      withWrongClosureStatus,
      archiveClosurePhase,
    ),
  );
  for (const phase of [
    "activation",
    "owner-acceptance",
    "target-archived",
    "closure-archived",
  ] as const) {
    assert.doesNotThrow(() =>
      assertAcceptanceArchiveClosurePathSet(
        expectedAcceptanceArchiveClosureChanges(phase),
        phase,
      ),
    );
  }

  canonicalizeAcceptanceProjectionAuditRecord(
    liveClosureMeta.source_review_record,
  );
  assert.equal(
    liveClosureMeta.source_review_record_canonical_bytes,
    STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_BYTES,
  );
  assert.equal(
    liveClosureMeta.source_review_record_sha256,
    STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256,
  );
  assert.notEqual(
    STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256,
    STAGE_6_E3_AUDIT_RECORD_SHA256,
  );
  assertSingleAcceptanceProjectionAuditRecordOwner([
    liveClosureMeta.source_review_record,
    liveLawMeta.acceptance_projection_audit_record,
    liveStage6Meta.acceptance_projection_audit_record,
  ]);
  const missingAcceptanceAuditKey = {
    ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD,
  } as Record<string, unknown>;
  delete missingAcceptanceAuditKey.P2;
  for (const malformedRecord of [
    undefined,
    missingAcceptanceAuditKey,
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, schemaVersion: 2 },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, reviewTaskId: "wrong" },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, reviewTurnId: "wrong" },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, candidateCommit: "wrong" },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, technicalCommit: "wrong" },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, verdict: "PASS" },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, P0: 1 },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, P1: 1 },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, P2: 1 },
    { ...STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD, extra: true },
  ] as const) {
    assert.throws(() => canonicalizeAcceptanceProjectionAuditRecord(malformedRecord));
  }
  assert.throws(() =>
    assertSingleAcceptanceProjectionAuditRecordOwner([
      liveClosureMeta.source_review_record,
      STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD,
    ]),
  );

  assert.deepEqual(
    resolveExactTaskLocation("active", "archive", ["task.json"], {
      activeFiles: ["task.json"],
      archiveFiles: null,
    }),
    { kind: "active", root: "active" },
  );
  assert.deepEqual(
    resolveExactTaskLocation("active", "archive", ["task.json"], {
      activeFiles: null,
      archiveFiles: ["task.json"],
    }),
    { kind: "archive", root: "archive" },
  );
  for (const invalidLocation of [
    { activeFiles: ["task.json"], archiveFiles: ["task.json"] },
    { activeFiles: null, archiveFiles: null },
    { activeFiles: [], archiveFiles: null },
    { activeFiles: ["task.json", "twelfth.md"], archiveFiles: null },
  ] as const) {
    assert.throws(() =>
      resolveExactTaskLocation("active", "archive", ["task.json"], invalidLocation),
    );
  }

  assertArchiveClockContract({
    month: "2026-08",
    date: "2026-08-31",
    time: "23:49:59",
  });
  for (const invalidClock of [
    { month: "2026-09", date: "2026-08-31", time: "12:00:00" },
    { month: "2026-08", date: "2026-09-01", time: "00:00:00" },
    { month: "2026-08", date: "2026-08-31", time: "23:50:00" },
    { month: "2026-08", date: "2026-08-31", time: "23:59:59" },
  ] as const) {
    assert.throws(() => assertArchiveClockContract(invalidClock));
  }

  assertTaskImmutablePlanningAuthority(
    closureLocation.root,
    liveClosureMeta.immutable_planning_authority_hash_contract,
    liveClosureMeta.immutable_planning_authority_count,
    liveClosureMeta.immutable_planning_authority,
  );
  const historicalTargetAuthorityTask = JSON.parse(
    gitTextAt(
      STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE,
      `${STAGE_6_E3_ACCEPTANCE_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly meta?: {
      readonly immutable_planning_authority?: Readonly<Record<string, unknown>>;
    };
  };
  const expectedTargetAuthority = {
    ...(historicalTargetAuthorityTask.meta?.immutable_planning_authority ?? {}),
    ...(archiveClosurePhase === "activation"
      ? {}
      : {
          "implement.jsonl":
            STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_IMPLEMENT_SHA256,
          "check.jsonl": STAGE_6_E3_ACCEPTANCE_TARGET_SUCCESSOR_CHECK_SHA256,
        }),
  };
  assert.deepEqual(
    liveTargetMeta.immutable_planning_authority,
    expectedTargetAuthority,
  );
  assertTaskImmutablePlanningAuthority(
    targetLocation.root,
    liveTargetMeta.immutable_planning_authority_hash_contract,
    liveTargetMeta.immutable_planning_authority_count,
    liveTargetMeta.immutable_planning_authority,
  );
  assertJsonlReferencesExist(closureLocation.root);
  if (archiveClosurePhase !== "activation") {
    assertTargetSuccessorJsonl(targetLocation.root);
    const selectedOwner = `${closureLocation.root}/task.json`;
    assert.equal(
      liveLawMeta.acceptance_archive_closure_source_review_owner,
      selectedOwner,
    );
    assert.equal(
      liveLawMeta.acceptance_archive_closure_source_review_sha256,
      STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256,
    );
    assert.equal(
      liveStage6Meta.e3_acceptance_archive_closure_source_review_owner,
      selectedOwner,
    );
    assert.equal(
      liveStage6Meta.e3_acceptance_archive_closure_source_review_sha256,
      STAGE_6_E3_ACCEPTANCE_PROJECTION_AUDIT_RECORD_SHA256,
    );
  }

  const archiveLifecycle: AcceptanceArchiveLifecycleProjection = {
    targetLocation: targetLocation.kind,
    targetStatus: liveTargetTask.status,
    targetCompletedAt: liveTargetTask.completedAt,
    targetImplementationCandidateReady:
      liveTargetMeta.implementation_candidate_ready,
    targetImplementationReview: liveTargetMeta.implementation_review,
    targetAcceptanceAuthorized: liveTargetMeta.acceptance_authorized,
    targetArchiveAuthorized: liveTargetMeta.archive_authorized,
    targetDefaultRuntime: liveTargetMeta.default_runtime,
    targetS62Started: liveTargetMeta.rkp2_stage6_s6_2_started,
    targetS63Started: liveTargetMeta.rkp2_stage6_s6_3_started,
    targetIntegrationAuthorized: liveTargetMeta.integration_authorized,
    targetQualificationAuthorized: liveTargetMeta.qualification_authorized,
    targetRuntimeSwitchAuthorized:
      liveTargetMeta.default_runtime_switch_authorized,
    targetPushAuthorized: liveTargetMeta.push_authorized,
    targetRkp3CreationAuthorized: liveTargetMeta.rkp3_creation_authorized,
    closureLocation: closureLocation.kind,
    closureStatus: liveClosureTask.status,
    closureCompletedAt: liveClosureTask.completedAt,
    closureTaskStartRun: liveClosureMeta.task_start_run,
    closureProductionAuthorized:
      liveClosureMeta.production_implementation_authorized,
    closureUserAuthorized: liveClosureMeta.user_implementation_authorization,
    closureImplementationCandidateReady:
      liveClosureMeta.implementation_candidate_ready,
    closureImplementationReview: liveClosureMeta.implementation_review,
    closureTargetAcceptanceAuthorized:
      liveClosureMeta.target_acceptance_authorized,
    closureTargetArchiveAuthorized: liveClosureMeta.target_archive_authorized,
    closureAcceptanceAuthorized: liveClosureMeta.closure_acceptance_authorized,
    closureArchiveAuthorized: liveClosureMeta.closure_archive_authorized,
    closureDefaultRuntime: liveClosureMeta.default_runtime,
    closureS62Started: liveClosureMeta.rkp2_stage6_s6_2_started,
    closureS63Started: liveClosureMeta.rkp2_stage6_s6_3_started,
    closureIntegrationAuthorized: liveClosureMeta.integration_authorized,
    closureQualificationAuthorized: liveClosureMeta.qualification_authorized,
    closureRuntimeSwitchAuthorized:
      liveClosureMeta.default_runtime_switch_authorized,
    closurePushAuthorized: liveClosureMeta.push_authorized,
    closureRkp3CreationAuthorized: liveClosureMeta.rkp3_creation_authorized,
    closureE3StressRerun: liveClosureMeta.e3_stress_rerun,
    lawStatus: liveLawTask.status,
    lawCurrentPlanningChild: liveLawMeta.current_planning_child,
    lawCurrentImplementationChild: liveLawMeta.current_implementation_child,
    lawNextGate: liveLawMeta.next_gate,
    lawIntegrationAuthorized: liveLawMeta.integration_authorized,
    lawQualificationAuthorized: liveLawMeta.qualification_authorized,
    lawArchiveAuthorized: liveLawMeta.archive_authorized,
    lawRuntimeSwitchAuthorized: liveLawMeta.default_runtime_switch_authorized,
    lawPushAuthorized: liveLawMeta.push_authorized,
    lawRkp3CreationAuthorized: liveLawMeta.rkp3_creation_authorized,
    stage6Status: liveStage6Task.status,
    stage6CurrentImplementationChild:
      liveStage6Meta.current_implementation_child,
    stage6S62Started: liveStage6Meta.rkp2_stage_6_s6_2_started,
    stage6S63Started: liveStage6Meta.rkp2_stage_6_s6_3_started,
    stage6DefaultRuntime: liveStage6Meta.default_runtime,
    stage6ArchiveAuthorized: liveStage6Meta.archive_authorized,
    stage6OfficialMeasurementAuthorized:
      liveStage6Meta.official_measurement_authorized,
    stage6RuntimeSwitchAuthorized:
      liveStage6Meta.default_runtime_switch_authorized,
    stage6PushAuthorized: liveStage6Meta.push_authorized,
    stage6Rkp3CreationAuthorized: liveStage6Meta.rkp3_creation_authorized,
  };
  assertAcceptanceArchiveLifecycleProjection(
    archiveLifecycle,
    archiveClosurePhase,
  );
  for (const mutation of [
    { closureProductionAuthorized: true },
    { closureE3StressRerun: true },
    { closureS62Started: true },
    { closureS63Started: true },
    { closureIntegrationAuthorized: true },
    { closureQualificationAuthorized: true },
    { closureRuntimeSwitchAuthorized: true },
    { closurePushAuthorized: true },
    { closureRkp3CreationAuthorized: true },
    { targetDefaultRuntime: "rust" },
    { stage6S62Started: true },
    { stage6S63Started: true },
    { stage6DefaultRuntime: "rust" },
    { stage6OfficialMeasurementAuthorized: true },
    { lawCurrentImplementationChild: "wrong-child" },
  ] as const) {
    assert.throws(() =>
      assertAcceptanceArchiveLifecycleProjection(
        { ...archiveLifecycle, ...mutation },
        archiveClosurePhase,
      ),
    );
  }

  const worker = readText(
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  );
  const workerTest = readText(
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  );
  const process = readText(
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
  );
  assert.deepEqual(PRIVATE_SCALE_PROCESS_STATE_REGISTRY, {
    schemaVersion: 1,
    workloadTimeoutMs: 180_000,
    terminationBudgetMs: 5_000,
    reapBudgetMs: 5_000,
    cleanupBudgetMs: 5_000,
    outerCushionMs: 10_000,
    outerDeadlineMs: 205_000,
    outerDeadlineFormula: "workload-plus-termination-plus-reap-plus-cleanup-plus-cushion",
    workloadDeadlineOwner: "powershell-wrapper",
    nodeWorkloadTermination: "forbidden",
    ownershipStates: ["root-absent", "offered", "accepted-residue", "unknown"],
    terminationStates: ["not-required", "succeeded", "failed"],
    cleanupStates: ["succeeded", "failed"],
  });
  assert.equal(
    PRIVATE_SCALE_PROCESS_STATE_REGISTRY_SHA256,
    "bb4ceb53ccf6879838930f3335d2880583334c5529cec18c05628418a0851f8e",
  );
  assert.ok(worker.includes("export async function spawnPowerShell("));
  assert.ok(worker.includes("PowerShell alone owns the 180-second workload deadline"));
  assert.equal(worker.includes("workloadTimer = setTimer"), false);
  assert.ok(worker.includes("actual <= PRIVATE_SCALE_STREAM_LIMIT_BYTES"));
  assert.ok(worker.includes("outputLimitStream"));
  assert.ok(worker.includes("const outerDeadline = startedAt + PRIVATE_SCALE_OUTER_TIMEOUT_MS;"));
  assert.ok(worker.includes("outerTimer = setTimer"));
  assert.ok(worker.includes("observePrivateScaleOwnershipForTest"));
  assert.ok(worker.includes("removeOwnedLeafExactlyOnce"));
  assert.ok(worker.includes("accepted-residue"));
  assert.ok(worker.includes("case \"process.start-failed\":"));
  assert.ok(worker.includes("case \"process.cleanup-failed\":"));
  assert.ok(workerTest.includes("createFakeTimers"));
  assert.ok(workerTest.includes("spawnPowerShell(\"worker.ps1\""));
  assert.ok(workerTest.includes("Stage 6 E2 gives the 180-second deadline exclusively to PowerShell"));
  assert.ok(workerTest.includes("Stage 6 E2 reaps taskkill through the production settlement seam before reaping the wrapper"));
  assert.ok(workerTest.includes("Stage 6 E2 executes the PowerShell taskkill timeout seam and uses its second reap result"));
  assert.ok(workerTest.includes("Stage 6 E2 rejects impossible process envelopes rather than inventing state"));
  assert.ok(process.includes("function Invoke-TaskKill"));
  assert.ok(worker.includes("taskkillReapTimer"));
  assert.ok(worker.includes("killRequested"));
  assert.ok(process.includes("function Invoke-TaskKillTestSeam"));
  assert.ok(process.includes("Stop-TaskKill $taskkill"));
  assert.ok(process.includes("$secondWait = $taskkill.WaitForExit($terminationBudgetMs)"));
  assert.ok(process.includes("$script:handoffAccepted = $true"));
  assert.ok(process.includes("Remove-OwnedPath $RequestPath \"request\""));
  const indices = readText("crates/brilliant-kernel-runtime/src/indices.rs");
  const collectStart = indices.indexOf("fn collect_scale_evidence(");
  const collectEnd = indices.indexOf("\n    #[test]", collectStart);
  assert.notEqual(collectStart, -1);
  assert.notEqual(collectEnd, -1);
  const collect = indices.slice(collectStart, collectEnd);
  assert.equal(
    (collect.match(/decode_create_request\(/gu) ?? []).length,
    2,
    "collect_scale_evidence must decode exactly the initial and verification requests",
  );
  assert.equal(
    (collect.match(/store\.export_document\(/gu) ?? []).length,
    1,
    "collect_scale_evidence must export exactly once",
  );
  assert.equal(
    (collect.match(/canonical_score_bytes\(/gu) ?? []).length,
    2,
    "collect_scale_evidence must encode primary and verification DTOs exactly once each",
  );
  assert.doesNotMatch(collect, /input_score_bytes|assert_eq!\(encoded,/u);
  assert.match(
    collect,
    /assert_eq!\(verification_document, document\);[\s\S]*assert_eq!\(verification_document, exported\);[\s\S]*assert_eq!\(primary_canonical, verification_canonical\);/u,
  );
  assert.match(
    collect,
    /canonical_encode_bytes: primary_canonical\.len\(\),/u,
  );
  assert.match(
    indices,
    /fn private_scale_evidence_accepts_noncanonical_extension_payload_order\(\)[\s\S]*assert_ne!\(noncanonical_text\.as_bytes\(\), primary_canonical\.as_slice\(\)\);[\s\S]*assert_eq!\(noncanonical_text\.len\(\), primary_canonical\.len\(\)\);/u,
  );
});

test("RKP-1A P4 candidate freeze is exact on accepted A3", () => {
  for (const commit of [
    RKP1A_IMPLEMENTATION_BASE,
    RKP1A_AUDITED_P2_HEAD,
    RKP1A_ACCEPTED_P3A_PLANNING_HEAD,
    RKP1A_AUDITED_P3A_HEAD,
    RKP1A_AUDITED_P3B_HEAD,
    RKP1A_P3B_REPAIR_HEAD,
    RKP1A_P3B_GOVERNANCE_HEAD,
    RKP1A_P4_A1_HEAD,
    RKP1A_P4_A2_HEAD,
    RKP1A_ACCEPTED_P4_A3_HEAD,
    RKP1A_ACCEPTED_B,
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
  assert.deepEqual(
    lines(
      git([
        "rev-list",
        "--parents",
        "-n",
        "1",
        RKP1A_P3B_GOVERNANCE_HEAD,
      ]),
    ),
    [`${RKP1A_P3B_GOVERNANCE_HEAD} ${RKP1A_P3B_REPAIR_HEAD}`],
    "the P3B workspace-law projection must remain one commit on the repair",
  );
  assert.deepEqual(
    lines(git(["rev-list", "--parents", "-n", "1", RKP1A_P4_A1_HEAD])),
    [`${RKP1A_P4_A1_HEAD} ${RKP1A_P3B_GOVERNANCE_HEAD}`],
    "A1 must remain one planning commit on the fixed P3B governance head",
  );
  assert.deepEqual(
    lines(git(["rev-list", "--parents", "-n", "1", RKP1A_P4_A2_HEAD])),
    [`${RKP1A_P4_A2_HEAD} ${RKP1A_P4_A1_HEAD}`],
    "A2 must remain one planning commit on A1",
  );
  assert.deepEqual(
    lines(
      git(["rev-list", "--parents", "-n", "1", RKP1A_ACCEPTED_P4_A3_HEAD]),
    ),
    [`${RKP1A_ACCEPTED_P4_A3_HEAD} ${RKP1A_P4_A2_HEAD}`],
    "accepted replacement A3 must remain one authority commit on A2",
  );
  assert.deepEqual(
    lines(git(["rev-list", "--parents", "-n", "1", RKP1A_ACCEPTED_B])),
    [`${RKP1A_ACCEPTED_B} ${RKP1A_ACCEPTED_P4_A3_HEAD}`],
    "accepted B must remain one non-merge commit directly on independently accepted A3",
  );
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", RKP1A_ACCEPTED_B, "HEAD"]),
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
  assert.equal(RKP1A_P4_A1_A2_PATHS.length, 13);
  assert.equal(RKP1A_P4_A3_PATHS.length, 15);
  assert.equal(RKP1A_P4_B_PATHS.length, 8);
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_IMPLEMENTATION_BASE}..${RKP1A_ACCEPTED_B}`,
        ]),
      ),
    ),
    [...RKP1A_TECHNICAL_PATHS, ...RKP1A_PLANNING_PATHS],
    "immutable RKP-1A implementation base through accepted B",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_ACCEPTED_P3A_PLANNING_HEAD}..${RKP1A_ACCEPTED_B}`,
        ]),
      ),
    ),
    [...RKP1A_P3A_TECHNICAL_PATHS, ...RKP1A_P4_A3_PATHS],
    "immutable RKP-1A P3A through accepted B",
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
          `${RKP1A_P3B_REPAIR_HEAD}..${RKP1A_P3B_GOVERNANCE_HEAD}`,
        ]),
      ),
    ),
    ["test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts"],
    "bounded P3B repair workspace-law projection",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_P3B_GOVERNANCE_HEAD}..${RKP1A_P4_A1_HEAD}`,
        ]),
      ),
    ),
    RKP1A_P4_A1_A2_PATHS,
    "A1 exact thirteen-path P4-entry amendment",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_P4_A1_HEAD}..${RKP1A_P4_A2_HEAD}`,
        ]),
      ),
    ),
    RKP1A_P4_A1_A2_PATHS,
    "A2 exact thirteen-path P4-entry amendment",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_P4_A2_HEAD}..${RKP1A_ACCEPTED_P4_A3_HEAD}`,
        ]),
      ),
    ),
    RKP1A_P4_A3_PATHS,
    "accepted replacement A3 exact fifteen-path authority repair",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_P3B_GOVERNANCE_HEAD}..${RKP1A_ACCEPTED_P4_A3_HEAD}`,
        ]),
      ),
    ),
    RKP1A_P4_A3_PATHS,
    "P4-entry amendments cumulative exact fifteen-path authority set",
  );
  assertExactPathSet(
    new Set(
      lines(
        git([
          "diff",
          "--name-only",
          `${RKP1A_ACCEPTED_P4_A3_HEAD}..${RKP1A_ACCEPTED_B}`,
        ]),
      ),
    ),
    RKP1A_P4_B_PATHS,
    "accepted B exact candidate-freeze and mechanical workspace-law projection",
  );

  assert.equal(RKP1A_HISTORICAL_ACTIVE_FILES.length, 13);
  assert.equal(RKP1A_CURRENT_ARCHIVE_FILES.length, 13);
  for (const path of RKP1A_HISTORICAL_ACTIVE_FILES) {
    assert.doesNotThrow(() => gitTextAt(RKP1A_ACCEPTED_B, path));
    assert.equal(existsSync(resolve(path)), false, `active authority remains after C2: ${path}`);
  }
  for (const path of RKP1A_CURRENT_ARCHIVE_FILES) {
    assert.equal(existsSync(resolve(path)), true, `archive authority missing after C2: ${path}`);
  }

  const archivedTaskPath = `${RKP1A_ARCHIVE_ROOT}/task.json`;
  const archivedTask = JSON.parse(readText(archivedTaskPath)) as {
    status?: unknown;
    completedAt?: unknown;
    relatedFiles?: unknown;
    meta?: { immutable_planning_authority?: unknown };
  };
  const c2ArchivedTask = JSON.parse(
    gitTextAt(RKP1A_C2_ARCHIVE_COMMIT, archivedTaskPath),
  ) as {
    relatedFiles?: unknown;
    meta?: { immutable_planning_authority?: unknown };
  };
  assert.equal(archivedTask.status, "completed");
  assert.equal(archivedTask.completedAt, "2026-08-29");
  assert.ok(Array.isArray(archivedTask.relatedFiles));
  assert.ok(Array.isArray(c2ArchivedTask.relatedFiles));
  assert.deepEqual(
    archivedTask.relatedFiles.slice(0, 12),
    RKP1A_CURRENT_ARCHIVE_FILES.slice(1),
    "only current self relatedFiles move to the archive root",
  );
  assert.deepEqual(
    archivedTask.relatedFiles.slice(12),
    c2ArchivedTask.relatedFiles.slice(12),
    "historical and external relatedFiles remain byte-semantic C2 values",
  );

  const archivedRegistry = archivedTask.meta?.immutable_planning_authority;
  const c2Registry = c2ArchivedTask.meta?.immutable_planning_authority;
  assert.ok(archivedRegistry && typeof archivedRegistry === "object");
  assert.ok(c2Registry && typeof c2Registry === "object");
  const archivedHashes = archivedRegistry as Record<string, unknown>;
  const c2Hashes = c2Registry as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(archivedHashes).sort(),
    [...RKP1A_ARCHIVED_IMMUTABLE_AUTHORITY_FILES].sort(),
    "archived immutable authority registry has the exact nine current archive paths",
  );
  for (const path of RKP1A_ARCHIVED_IMMUTABLE_AUTHORITY_FILES) {
    const c2Path = path.replace(RKP1A_ARCHIVE_ROOT, RKP1A_ACTIVE_ROOT);
    assert.equal(archivedHashes[path], sha256(readText(path)), path);
    if (path.endsWith("implement.jsonl") || path.endsWith("check.jsonl")) {
      assert.notEqual(archivedHashes[path], c2Hashes[c2Path], path);
    } else {
      assert.equal(archivedHashes[path], c2Hashes[c2Path], path);
    }
  }

  const archiveRows = (path: string): Array<{ file: string; reason: string }> =>
    lines(readText(path)).map((line) => JSON.parse(line) as { file: string; reason: string });
  const c2ArchiveRows = (path: string): Array<{ file: string; reason: string }> =>
    lines(gitTextAt(RKP1A_C2_ARCHIVE_COMMIT, path)).map(
      (line) => JSON.parse(line) as { file: string; reason: string },
    );
  for (const [path, firstChangedRow, lastChangedRow] of [
    [`${RKP1A_ARCHIVE_ROOT}/implement.jsonl`, 6, 9],
    [`${RKP1A_ARCHIVE_ROOT}/check.jsonl`, 5, 10],
  ] as const) {
    const currentRows = archiveRows(path);
    const c2Rows = c2ArchiveRows(path);
    assert.equal(new Set(currentRows.map((row) => row.file)).size, currentRows.length);
    assert.equal(currentRows.length, c2Rows.length);
    for (const [index, row] of currentRows.entries()) {
      const c2Row = c2Rows[index];
      assert.ok(c2Row);
      assert.deepEqual(Object.keys(row), ["file", "reason"]);
      assert.equal(existsSync(resolve(row.file)), true, row.file);
      const oneBasedRow = index + 1;
      if (oneBasedRow >= firstChangedRow && oneBasedRow <= lastChangedRow) {
        assert.equal(row.reason, c2Row.reason);
        assert.equal(
          row.file,
          c2Row.file.replace(RKP1A_ACTIVE_ROOT, RKP1A_ARCHIVE_ROOT),
        );
      } else {
        assert.deepEqual(row, c2Row);
      }
    }
  }

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
