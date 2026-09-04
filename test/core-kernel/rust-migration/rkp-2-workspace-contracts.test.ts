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
  decodeProcessEnvelope,
  PRIVATE_SCALE_CONSUMPTION_PREFIX,
  PRIVATE_SCALE_PROCESS_PREFIX,
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
const POST_ARCHIVE_REPAIR_PLANNING_HEAD =
  "3bcba71a2944f66149facf53bdf802cf57bb1cd2";
const POST_ARCHIVE_REPAIR_ACTIVATION_HEAD =
  "c152143fe88bc872ebbf2f249b9b3dc43a181458";
const RKP2_ACTIVE_ROOT =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity";
const RKP2_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/08-24-rkp-2-indexed-live-score-store-load-encode-parity";
const RKP2_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/container-and-index-decision.md",
  "research/current-rust-and-ts-baseline-audit.md",
  "research/file-test-and-rollback-matrix.md",
  "research/planning-candidate-self-audit.md",
  "research/rkp1-repair-and-rkp2-entry-gate.md",
  "review-candidate.md",
  "task.json",
] as const;
const DESIGN_PATH =
  `${RKP2_ACTIVE_ROOT}/design.md`;
const IMPLEMENT_PATH =
  `${RKP2_ACTIVE_ROOT}/implement.md`;
const IMPLEMENT_CONTEXT_PATH =
  `${RKP2_ACTIVE_ROOT}/implement.jsonl`;
const CHECK_CONTEXT_PATH =
  `${RKP2_ACTIVE_ROOT}/check.jsonl`;
const FILE_TEST_ROLLBACK_MATRIX_PATH =
  `${RKP2_ACTIVE_ROOT}/research/file-test-and-rollback-matrix.md`;
const TASK_PATH =
  `${RKP2_ACTIVE_ROOT}/task.json`;
const PARENT_PATH =
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json";
const POST_ARCHIVE_REPAIR_TASK_NAME =
  "09-04-rkp-2-post-archive-path-compatibility";
const POST_ARCHIVE_REPAIR_TASK_ROOT =
  `.trellis/tasks/${POST_ARCHIVE_REPAIR_TASK_NAME}`;
const POST_ARCHIVE_REPAIR_ARCHIVE_ROOT =
  `.trellis/tasks/archive/2026-09/${POST_ARCHIVE_REPAIR_TASK_NAME}`;
const POST_ARCHIVE_REPAIR_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "prd.md",
  "research/bug-analysis.md",
  "research/current-state.md",
  "research/implementation-evidence.md",
  "task.json",
] as const;
const POST_ARCHIVE_REPAIR_LIFECYCLE_PATHS = [
  ...POST_ARCHIVE_REPAIR_TASK_MANIFEST.map(
    (path) => `${POST_ARCHIVE_REPAIR_TASK_ROOT}/${path}`,
  ),
  ...POST_ARCHIVE_REPAIR_TASK_MANIFEST.map(
    (path) => `${POST_ARCHIVE_REPAIR_ARCHIVE_ROOT}/${path}`,
  ),
] as const;
const POST_ARCHIVE_REPAIR_ALLOWED_PATHS = [
  ".trellis/scripts/common/task_context.py",
  ".trellis/spec/core-kernel/backend/rust-runtime-transition.md",
  ...POST_ARCHIVE_REPAIR_LIFECYCLE_PATHS,
  PARENT_PATH,
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
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
const STAGE_6_E3_LAW_CLOSEOUT_BASE =
  "c73e2139d3a1a9e89e4ec6071678d75be1c02abb";
const STAGE_6_E3_LAW_CLOSEOUT_ARCHIVED_HEAD =
  "65debd52d379004c966cefe59f54d72ac1136eb4";
const STAGE_6_E3_LAW_CLOSEOUT_PLANNING_AUTHORITY =
  "9bf82a221f0585719f36f36906dfc292d0e2bd5c";
const STAGE_6_E3_LAW_CLOSEOUT_ROOT =
  ".trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure";
const STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure";
const STAGE_6_E3_LAW_TARGET_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair";
const STAGE_6_E3_LAW_TARGET_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-e3-law-gap-audit.md",
  "research/file-test-and-rollback-matrix.md",
  "research/final-state-projection-contract.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_E3_LAW_CLOSEOUT_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-state-and-archive-gap-audit.md",
  "research/file-state-and-test-matrix.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_E3_LAW_CLOSEOUT_TECHNICAL_PATH =
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts";
const STAGE_6_E3_LAW_TARGET_CONTEXT_LIFECYCLE_PATHS = [
  `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/review-candidate.md`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/implement.jsonl`,
  `${STAGE_6_E3_LAW_TASK_ROOT}/check.jsonl`,
] as const;
const STAGE_6_E3_LAW_CLOSEOUT_Q4_STAGED_PATHS = [
  `${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/task.json`,
  `${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/operator-handoff.md`,
  `${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/review-candidate.md`,
  ...STAGE_6_PARENT_LIFECYCLE_PATHS,
] as const;
const STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT = {
  sourceRows: 12,
  sourceBytes: 2129,
  sourceSha256: "7258f1d0758be729f902205406c84bf4d9836bae6966f0fc894b7777797c5f84",
  successorRows: 9,
  successorBytes: 1492,
  successorSha256: "54c6912c5829a69d6d92a3f12825537e8489b30a906463bd9c41724a39174ca9",
  removedPaths: [
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/current-e3-law-gap-audit.md`,
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/final-state-projection-contract.md`,
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/file-test-and-rollback-matrix.md`,
  ],
} as const;
const STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK = {
  sourceRows: 9,
  sourceBytes: 1795,
  sourceSha256: "11371426f57123fd0058463ca9baaaa05c9e59d07d4ae7ff3faa333f48ed707c",
  successorRows: 6,
  successorBytes: 1117,
  successorSha256: "83aaf6771c56066982f718cbe39b66fa7399f8ec116800eec2b9efbd1fe2aa52",
  removedPaths: [
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/current-e3-law-gap-audit.md`,
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/final-state-projection-contract.md`,
    `${STAGE_6_E3_LAW_TASK_ROOT}/research/planning-self-audit.md`,
  ],
} as const;
const STAGE_6_E3_LAW_CLOSEOUT_Q3_AUDIT_KEYS = [
  "schemaVersion",
  "reviewTaskId",
  "reviewTurnId",
  "candidateCommit",
  "technicalCommit",
  "verdict",
  "P0",
  "P1",
  "P2",
] as const;
const STAGE_6_CLOSEOUT_BASE = STAGE_6_E3_LAW_CLOSEOUT_ARCHIVED_HEAD;
const STAGE_6_CLOSEOUT_PLANNING_AUTHORITY =
  "e7708bf84ffb6ac71818f46d367ff6e8bba7beb6";
const STAGE_6_CLOSEOUT_ACTIVATION_COMMIT =
  "ddfb596ffcd4c2ea13d4b3aa703eab852ce2c2be";
const STAGE_6_SEMANTIC_ACCEPTANCE_COMMIT =
  "2a0fe4eb3b77c8498a5067fc4dfee91a69020ea4";
const STAGE_6_SEMANTIC_NATIVE_ARCHIVE_COMMIT =
  "1e3759d9fef2524e68c2667a4a5363802c4ccd36";
const STAGE_6_SEMANTIC_ARCHIVE_PROJECTION_COMMIT =
  "974a9875db07de907647cf93e251406e280cce4f";
const STAGE_6_OWNER_ACCEPTANCE_COMMIT =
  "6a71733a2c148b14f0048e7d050f69b63636551e";
const STAGE_6_NATIVE_ARCHIVE_COMMIT =
  "bcc1c905bc58ab9810e076c23891d6683a2ae607";
const STAGE_6_ARCHIVE_CANDIDATE_COMMIT =
  "1f024630e0a09bb252790c6e80ea59375906f9e4";
const STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT =
  "baf2655c58949b415e2663169d3d238c48c4c1f0";
const STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE =
  "b3850a48b67f24b1176f573fa143b33c784348ec";
const STAGE_6_CLOSEOUT_INTEGRATION_PRE_HEAD =
  "4a302bc9f9981940336fc97941b08e09bd0d1f67";
const STAGE_6_CLOSEOUT_SOURCE_BRANCH =
  "codex/rkp-2-stage-6-acceptance-archive-integration-closeout";
const STAGE_6_CLOSEOUT_SOURCE_WORKTREE =
  ".worktrees/rkp-2-stage-6-acceptance-archive-integration-closeout";
const STAGE_6_CLOSEOUT_TARGET_BRANCH =
  "codex/rkp-2-indexed-live-score-store-implementation";
const STAGE_6_CLOSEOUT_TARGET_WORKTREE =
  ".worktrees/rkp-2-indexed-live-score-store-implementation";
const STAGE_6_CLOSEOUT_L5_INTEGRATION_COMMIT =
  "3799faf635482f0301e61a56f1faf83ea3fe0f5f";
const STAGE_6_CLOSEOUT_L6_CLOCK_DATE_REPAIR_COMMIT =
  "55ca574df1156bcda2ec26499d8fb717d9faff82";
const STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT =
  "d0396bbb6239be9c36e8027d09d38e0753c5f3b6";
const STAGE_6_CLOSEOUT_L6_OWNER_ACCEPTANCE_COMMIT =
  "9e74b826e2c4c8e0cbe9685e33c18a798f14b5dc";
const STAGE_6_CLOSEOUT_L6_NATIVE_ARCHIVE_COMMIT =
  "34389020ba93879589f5a2fcb59ab06918647245";
const STAGE_6_CLOSEOUT_TERMINAL_PROJECTION_COMMIT =
  "55cb575c606646e8449359b0c46d5c905b3bb3c6";
const STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DATE = "2026-09-01";
const STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DEADLINE = "23:50:00+08:00";
const STAGE_6_CLOSEOUT_ARCHIVE_DATE = "2026-09-02";
const STAGE_6_CLOSEOUT_ARCHIVE_DEADLINE = "2026-09-02T23:50:00+08:00";
const STAGE_6_CLOSEOUT_L6_DATE_REPAIR_PATHS = [
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/design.md",
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/implement.md",
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/task.json",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_PATHS = [
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/implement.md",
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/task.json",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
] as const;
const STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_BEGIN =
  "# L6_POWERSHELL_PREFLIGHT_V1_BEGIN";
const STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_END =
  "# L6_POWERSHELL_PREFLIGHT_V1_END";
const STAGE_6_CLOSEOUT_FROZEN_PARENT_CHAIN = [
  {
    commit: STAGE_6_CLOSEOUT_ACTIVATION_COMMIT,
    parent: STAGE_6_CLOSEOUT_PLANNING_AUTHORITY,
  },
  {
    commit: STAGE_6_SEMANTIC_ACCEPTANCE_COMMIT,
    parent: STAGE_6_CLOSEOUT_ACTIVATION_COMMIT,
  },
  {
    commit: STAGE_6_SEMANTIC_NATIVE_ARCHIVE_COMMIT,
    parent: STAGE_6_SEMANTIC_ACCEPTANCE_COMMIT,
  },
  {
    commit: STAGE_6_SEMANTIC_ARCHIVE_PROJECTION_COMMIT,
    parent: STAGE_6_SEMANTIC_NATIVE_ARCHIVE_COMMIT,
  },
  {
    commit: STAGE_6_OWNER_ACCEPTANCE_COMMIT,
    parent: STAGE_6_SEMANTIC_ARCHIVE_PROJECTION_COMMIT,
  },
  {
    commit: STAGE_6_NATIVE_ARCHIVE_COMMIT,
    parent: STAGE_6_OWNER_ACCEPTANCE_COMMIT,
  },
  {
    commit: STAGE_6_ARCHIVE_CANDIDATE_COMMIT,
    parent: STAGE_6_NATIVE_ARCHIVE_COMMIT,
  },
  {
    commit: STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT,
    parent: STAGE_6_ARCHIVE_CANDIDATE_COMMIT,
  },
  {
    commit: STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE,
    parent: STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT,
  },
] as const;
const STAGE_6_CLOSEOUT_ROOT =
  ".trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout";
const STAGE_6_CLOSEOUT_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout";
const STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment";
const STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT =
  ".trellis/tasks/archive/2026-09/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair";
const STAGE_6_CLOSEOUT_TECHNICAL_PATH =
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts";
const STAGE_6_SEMANTIC_CANONICAL_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-seam-and-authority-audit.md",
  "research/e1r2-file-test-rollback-matrix.md",
  "research/planning-self-audit.md",
  "research/semantic-canonical-role-matrix.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_PRIVATE_SCALE_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/file-ownership-and-rollback.md",
  "research/implementation-evidence.md",
  "research/planning-self-audit.md",
  "research/root-cause-and-counter-write-map.md",
  "research/scale-worker-and-failure-matrix.md",
  "review-candidate.md",
  "task.json",
] as const;
const STAGE_6_CLOSEOUT_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/archive-inventory-and-authority-map.md",
  "research/current-state-and-branch-topology.md",
  "research/file-test-rollback-matrix.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const S62F_PLANNING_BASE =
  "9da9d036a6c2ef184ea68d5b33fabfb1e9a0eba5";
const S62F_PLANNING_HEAD =
  "7942de056f6b0b6806740e5567de9e493236cec2";
const S62F_PLANNING_PASS_HEAD =
  "a013a904b7636a59038a5be6c8a5e0bc803bcb11";
const S62F_ACTIVATION_HEAD =
  "b2648d9fd7c0f9b96fb87a954483174c521e79f0";
const S62F_STOPPED_ATTEMPT_HEAD =
  "c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b";
const S62F_REVIEWED_CANDIDATE =
  "c920f057bd19d3636e82de6b9c80dcde358488de";
const S62F_ACCEPTANCE_COMMIT =
  "e3518896d8ea184d79284d31111220bcaf7ebdae";
const S62F_NATIVE_ARCHIVE_COMMIT =
  "51dbabd1e48dabb1333b011ee5446ed3f56b714f";
const S62F_TASK_NAME =
  "09-03-rkp-2-stage-6-s6-2-fresh-evidence-consumption";
const S62F_TASK_ROOT = `.trellis/tasks/${S62F_TASK_NAME}`;
const S62F_EVIDENCE_PATH =
  `${S62F_TASK_ROOT}/research/implementation-evidence.md`;
const S62F_ARCHIVE_ROOT =
  `.trellis/tasks/archive/2026-09/${S62F_TASK_NAME}`;
const S62F_ARCHIVE_EVIDENCE_PATH =
  `${S62F_ARCHIVE_ROOT}/research/implementation-evidence.md`;
const S62F_ACCEPTED_SENTINEL_SHA256 =
  "4cbcbf8705d9abcb1b1f51c7fa188573ac5879bd7c6617d13c59961ea191bb0c";
const S62F_ARCHIVED_MECHANISM_ROOT =
  ".trellis/tasks/archive/2026-09/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair";
const S62F_ARCHIVED_MECHANISM_EVIDENCE =
  `${S62F_ARCHIVED_MECHANISM_ROOT}/research/implementation-evidence.md`;
const S62F_HISTORICAL_SENTINEL_SHA256 =
  "64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862";
const S62F_PLANNING_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-state-and-authority-audit.md",
  "research/file-test-and-rollback-matrix.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const S62F_ARCHIVE_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "operator-handoff.md",
  "prd.md",
  "research/current-state-and-authority-audit.md",
  "research/file-test-and-rollback-matrix.md",
  "research/implementation-evidence.md",
  "research/planning-self-audit.md",
  "review-candidate.md",
  "task.json",
] as const;
const S63_PLANNING_HEAD =
  "ca718569553ea4efeea05e4ee37a0e77171d1169";
const S63_ACTIVATION_HEAD =
  "e88e52ace1d41c097d1ddd8143814dfb69922dfc";
const S63_TASK_NAME =
  "09-03-rkp-2-stage-6-s6-3-final-candidate-freeze";
const S63_TASK_ROOT = `.trellis/tasks/${S63_TASK_NAME}`;
const S63_ARCHIVE_ROOT = `.trellis/tasks/archive/2026-09/${S63_TASK_NAME}`;
const S63_TASK_MANIFEST = [
  "check.jsonl",
  "design.md",
  "implement.jsonl",
  "implement.md",
  "prd.md",
  "research/implementation-evidence.md",
  "task.json",
] as const;
const S63_EVIDENCE_PATH = `${S63_TASK_ROOT}/research/implementation-evidence.md`;
const S63_AUTHORITY_PATHS = [
  `${S63_TASK_ROOT}/task.json`,
  `${S63_TASK_ROOT}/prd.md`,
  `${S63_TASK_ROOT}/design.md`,
  `${S63_TASK_ROOT}/implement.md`,
  `${S63_TASK_ROOT}/implement.jsonl`,
  `${S63_TASK_ROOT}/check.jsonl`,
  S63_EVIDENCE_PATH,
  DESIGN_PATH,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/implementation-evidence.md",
  PARENT_PATH,
] as const;
const S62F_TECHNICAL_PATHS = [
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
] as const;
const S62F_ACTIVATION_PATHS = [
  `${S62F_TASK_ROOT}/task.json`,
  `${S62F_TASK_ROOT}/operator-handoff.md`,
  `${S62F_TASK_ROOT}/review-candidate.md`,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  PARENT_PATH,
] as const;
const S62F_LIFECYCLE_PATHS = [
  `${S62F_TASK_ROOT}/task.json`,
  `${S62F_TASK_ROOT}/operator-handoff.md`,
  `${S62F_TASK_ROOT}/review-candidate.md`,
  S62F_EVIDENCE_PATH,
  TASK_PATH,
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  PARENT_PATH,
] as const;
const S62F_WORKLOAD_PATHS = [
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
] as const;
const S62F_TRACKED_EOL_PATHS = [
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
] as const;
const S62F_PLANNING_WORKLOAD_HASHES = {
  "crates/brilliant-kernel-runtime/src/indices.rs":
    "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts":
    "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts":
    "ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts":
    "72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1":
    "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f",
} as const;
const S62F_IMPLEMENTATION_WORKLOAD_HASHES = {
  "crates/brilliant-kernel-runtime/src/indices.rs":
    "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts":
    "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts":
    "909624a8a32807d0f4103bb4f61524dc7dc538f0c2c0a4fedd5e3eaf4533cd1c",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts":
    "222bf43058ee06a2411029531f8ca3ee55f5437c3f8c78b7e7869d8a57110fbe",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1":
    "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f",
} as const;
const STAGE_6_ARCHIVED_CHILDREN = [
  "08-30-rkp-2-stage-6-semantic-canonical-authority-amendment",
  "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair",
  "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure",
] as const;
const RKP_2_CURRENT_CHILDREN = [
  "08-25-rkp-2-cross-platform-full-test-runner-contract-repair",
  "08-26-rkp-2-part-owner-wire-contract-repair",
  "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
  "09-01-rkp-2-stage-6-acceptance-archive-integration-closeout",
] as const;
const RUST_PARENT_CURRENT_CHILDREN = [
  "08-15-rkp-0-authority-contract-oracle-freeze",
  "08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke",
  "08-24-rkp-1-post-archive-workspace-contract-authority-repair",
  "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
  "08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair",
  "08-28-rkp-1a-acceptance-archive-stage6-integration-closeout",
] as const;
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
  ".gitattributes",
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
    sha256: "096697c52847c2531719fade662abea2104b728306f10431d130fc119ca34e12",
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

function rawFileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function rawGitFileAt(commit: string, path: string): Buffer {
  return execFileSync(
    "git",
    ["-c", "core.longpaths=true", "show", `${commit}:${path}`],
    { cwd: process.cwd(), maxBuffer: 80 * 1024 * 1024 },
  );
}

function rawGitFileSha256At(commit: string, path: string): string {
  return createHash("sha256").update(rawGitFileAt(commit, path)).digest("hex");
}

function exactSourceSection(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
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
  const future = readCurrentRkp2Text(DESIGN_PATH).split(
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
    ["diff", "--no-renames", "--name-only", `${IMPLEMENTATION_BASE}..HEAD`],
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
    ["diff", "--no-renames", "--name-only", `${STAGE_6_PREREQUISITE_HEAD}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function committedChanges(base: string, head: string): Set<string> {
  return new Set(
    lines(git(["diff", "--no-renames", "--name-only", `${base}..${head}`])),
  );
}

function currentChangesSince(base: string): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--no-renames", "--name-only", `${base}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

function acceptedChangesWithS63Evidence(
  base: string,
): Set<string> {
  const acceptedAtActivation = committedChanges(
    base,
    POST_ARCHIVE_REPAIR_ACTIVATION_HEAD,
  );
  const allowedRepairPaths = new Set<string>(POST_ARCHIVE_REPAIR_ALLOWED_PATHS);
  for (const path of currentChangesSince(POST_ARCHIVE_REPAIR_ACTIVATION_HEAD)) {
    assert.equal(
      allowedRepairPaths.has(path),
      true,
      `unreviewed post-archive repair path: ${path}`,
    );
  }
  const current = currentChangesSince(base);
  for (const path of current) {
    if (!acceptedAtActivation.has(path)) {
      assert.equal(
        allowedRepairPaths.has(path),
        true,
        `unreviewed net post-archive repair path: ${path}`,
      );
    }
  }
  return current;
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
      `${STAGE_6_E3_ACCEPTANCE_REVIEWED_CANDIDATE}..${STAGE_6_E3_LAW_CLOSEOUT_BASE}`,
    ]),
  )) {
    const [status, path, extra] = line.split("\t");
    assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
    assert.ok(status === "A" || status === "M" || status === "D");
    assert.ok(path);
    result.set(path, status);
  }
  return result;
}

function currentWorkspaceLawCloseoutChanges(): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  for (const line of lines(
    git([
      "diff",
      "--no-renames",
      "--name-status",
      `${STAGE_6_E3_LAW_CLOSEOUT_BASE}..${STAGE_6_E3_LAW_CLOSEOUT_ARCHIVED_HEAD}`,
    ]),
  )) {
    const [status, path, extra] = line.split("\t");
    assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
    assert.ok(status === "A" || status === "M" || status === "D");
    assert.ok(path);
    assert.equal(result.has(path), false, `${path} must have one cumulative status`);
    result.set(path, status);
  }
  return result;
}

function currentStage6CloseoutChanges(): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  const collect = (
    args: readonly string[],
    fallbackStatus?: "A",
    preserveExisting = false,
  ): void => {
    for (const line of lines(git(args))) {
      const [statusOrPath, path, extra] = line.split("\t");
      const status = fallbackStatus ?? statusOrPath;
      const resolvedPath = fallbackStatus === undefined ? path : statusOrPath;
      assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
      assert.ok(status === "A" || status === "M" || status === "D");
      assert.ok(resolvedPath);
      if (!preserveExisting || !result.has(resolvedPath)) {
        result.set(resolvedPath, status);
      }
    }
  };
  collect([
    "diff",
    "--no-renames",
    "--name-status",
    `${STAGE_6_CLOSEOUT_BASE}..${STAGE_6_CLOSEOUT_TERMINAL_PROJECTION_COMMIT}`,
  ]);
  if (existsSync(resolve(STAGE_6_CLOSEOUT_ARCHIVE_ROOT))) {
    for (const line of lines(
      git([
        "diff-tree",
        "--no-commit-id",
        "--no-renames",
        "--name-status",
        "-r",
        STAGE_6_CLOSEOUT_L6_NATIVE_ARCHIVE_COMMIT,
      ]),
    )) {
      const [status, path, extra] = line.split("\t");
      assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
      assert.ok(path);
      if (status === "D" && path.startsWith(`${STAGE_6_CLOSEOUT_ROOT}/`)) {
        result.set(path, "D");
      }
    }
  }
  for (const path of [...result.keys()]) {
    if (
      path.startsWith(`${S62F_TASK_ROOT}/`) ||
      (S62F_TECHNICAL_PATHS.includes(
        path as (typeof S62F_TECHNICAL_PATHS)[number],
      ) && path !== STAGE_6_CLOSEOUT_TECHNICAL_PATH)
    ) {
      result.delete(path);
    }
  }
  return result;
}

function currentS62FChanges(): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  const collect = (
    args: readonly string[],
    fallbackStatus?: "A",
    preserveExisting = false,
  ): void => {
    for (const line of lines(git(args))) {
      const [statusOrPath, path, extra] = line.split("\t");
      const status = fallbackStatus ?? statusOrPath;
      const resolvedPath = fallbackStatus === undefined ? path : statusOrPath;
      assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
      assert.ok(status === "A" || status === "M" || status === "D");
      assert.ok(resolvedPath);
      if (!preserveExisting || !result.has(resolvedPath)) {
        result.set(resolvedPath, status);
      }
    }
  };
  collect([
    "diff",
    "--no-renames",
    "--name-status",
    `${S62F_PLANNING_BASE}..HEAD`,
  ]);
  collect(["diff", "--no-renames", "--name-status"], undefined, true);
  collect(
    ["diff", "--cached", "--no-renames", "--name-status"],
    undefined,
    true,
  );
  collect(["ls-files", "--others", "--exclude-standard"], "A", true);
  return result;
}

function expectedS62FChanges(
  evidencePresent: boolean,
): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  const insert = (status: "A" | "M", paths: readonly string[]): void => {
    for (const path of paths) {
      assert.equal(result.has(path), false, `${path} must have one S6.2 owner`);
      result.set(path, status);
    }
  };
  insert(
    "A",
    S62F_PLANNING_MANIFEST.map((path) => `${S62F_TASK_ROOT}/${path}`),
  );
  if (evidencePresent) {
    result.set(S62F_EVIDENCE_PATH, "A");
  }
  insert("M", S62F_TECHNICAL_PATHS);
  insert(
    "M",
    S62F_LIFECYCLE_PATHS.filter(
      (path) =>
        !path.startsWith(`${S62F_TASK_ROOT}/`) &&
        path !== S62F_EVIDENCE_PATH,
    ),
  );
  return result;
}

function assertS62FPathSet(
  actual: ReadonlyMap<string, "A" | "M" | "D">,
  evidencePresent: boolean,
): void {
  const project = (value: ReadonlyMap<string, "A" | "M" | "D">): string[] =>
    [...value].map(([path, status]) => `${status}\t${path}`).sort();
  assert.deepEqual(project(actual), project(expectedS62FChanges(evidencePresent)));
  const counts = [...actual.values()].reduce(
    (result, status) => ({ ...result, [status]: result[status] + 1 }),
    { A: 0, M: 0, D: 0 },
  );
  assert.deepEqual(
    counts,
    evidencePresent ? { A: 12, M: 7, D: 0 } : { A: 11, M: 7, D: 0 },
  );
}

function assertS62FWorkloadTransition(
  planning: unknown,
  implementation: unknown,
): asserts implementation is Readonly<Record<string, string>> {
  assert.ok(
    planning !== null && typeof planning === "object" && !Array.isArray(planning),
  );
  assert.ok(
    implementation !== null &&
      typeof implementation === "object" &&
      !Array.isArray(implementation),
  );
  const planningRecord = planning as Readonly<Record<string, unknown>>;
  const implementationRecord = implementation as Readonly<
    Record<string, unknown>
  >;
  assert.deepEqual(Object.keys(planningRecord), [...S62F_WORKLOAD_PATHS]);
  assert.deepEqual(Object.keys(implementationRecord), [...S62F_WORKLOAD_PATHS]);
  assert.deepEqual(planningRecord, S62F_PLANNING_WORKLOAD_HASHES);
  assert.deepEqual(implementationRecord, S62F_IMPLEMENTATION_WORKLOAD_HASHES);
  for (const path of S62F_WORKLOAD_PATHS) {
    assert.equal(
      rawGitFileSha256At(S62F_PLANNING_HEAD, path),
      planningRecord[path],
    );
    assert.equal(
      rawGitFileSha256At(S62F_REVIEWED_CANDIDATE, path),
      implementationRecord[path],
    );
  }
  for (const path of [
    "crates/brilliant-kernel-runtime/src/indices.rs",
    "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
  ] as const) {
    assert.equal(implementationRecord[path], planningRecord[path]);
  }
  for (const path of [
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  ] as const) {
    assert.notEqual(implementationRecord[path], planningRecord[path]);
  }
}

function assertS62FDualAutocrlfBytes(sourceHead: string): void {
  const attributes = lines(
    git(["check-attr", "text", "eol", "--", ...S62F_TRACKED_EOL_PATHS]),
  );
  for (const path of S62F_TRACKED_EOL_PATHS) {
    assert.ok(attributes.includes(`${path}: text: set`));
    assert.ok(attributes.includes(`${path}: eol: lf`));
    const sourceBytes = rawGitFileAt(sourceHead, path);
    assert.deepEqual(rawGitFileAt(S62F_REVIEWED_CANDIDATE, path), sourceBytes);
    assert.equal(sourceBytes.includes(13), false, `${path} must be LF-only`);
  }

  for (const autocrlf of ["true", "false"] as const) {
    const checkoutRoot = mkdtempSync(
      join(tmpdir(), `rkp2-s62f-autocrlf-${autocrlf}-`),
    );
    try {
      const prefix = `${checkoutRoot.replaceAll("\\", "/")}/`;
      execFileSync(
        "git",
        [
          "-c",
          "core.longpaths=true",
          "-c",
          `core.autocrlf=${autocrlf}`,
          "checkout-index",
          "--force",
          `--prefix=${prefix}`,
          "--",
          ...S62F_TRACKED_EOL_PATHS,
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      for (const path of S62F_TRACKED_EOL_PATHS) {
        const checkoutBytes = readFileSync(resolve(checkoutRoot, path));
        assert.deepEqual(checkoutBytes, rawGitFileAt(sourceHead, path));
        assert.equal(
          checkoutBytes.includes(13),
          false,
          `${path} changed under core.autocrlf=${autocrlf}`,
        );
      }
    } finally {
      rmSync(checkoutRoot, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 25,
      });
    }
  }
}

interface S62FConsumptionProjection {
  readonly processSentinelBase64: string;
  readonly processSentinelBytes: number;
  readonly processSentinelSha256: string;
  readonly wallElapsedMicros: number;
  readonly processEnvelope: Extract<
    ReturnType<typeof decodeProcessEnvelope>,
    { readonly status: "ok" }
  >;
}

function archivedS62FProcessSentinel(): Buffer {
  const records = lines(readText(S62F_ARCHIVED_MECHANISM_EVIDENCE)).filter(
    (line) => line.startsWith(PRIVATE_SCALE_PROCESS_PREFIX),
  );
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  const sentinel = Buffer.from(record, "utf8");
  assert.equal(
    createHash("sha256").update(sentinel).digest("hex"),
    S62F_HISTORICAL_SENTINEL_SHA256,
  );
  return sentinel;
}

function s62FConsumptionRecordForSentinel(sentinel: Buffer): string {
  return `${PRIVATE_SCALE_CONSUMPTION_PREFIX}${JSON.stringify({
    schemaVersion: 1,
    processSentinelBase64: sentinel.toString("base64"),
    processSentinelBytes: sentinel.length,
    processSentinelSha256: createHash("sha256").update(sentinel).digest("hex"),
    wallElapsedMicros: 1,
  })}`;
}

function syntheticFreshS62FProcessSentinel(): Buffer {
  const archived = archivedS62FProcessSentinel().toString("utf8");
  const envelope = JSON.parse(
    archived.slice(PRIVATE_SCALE_PROCESS_PREFIX.length),
  ) as Record<string, unknown>;
  const evidence = envelope.evidence as Record<string, unknown>;
  const processState = envelope.process as Record<string, unknown>;
  evidence.workloadElapsedMicros =
    (evidence.workloadElapsedMicros as number) + 1;
  processState.peakWorkingSetBytes =
    (processState.peakWorkingSetBytes as number) + 1;
  return Buffer.from(
    `${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(envelope)}\n`,
    "utf8",
  );
}

function assertS62FConsumptionRecordText(
  text: string,
): S62FConsumptionProjection {
  const records = lines(text).filter((line) =>
    line.startsWith(PRIVATE_SCALE_CONSUMPTION_PREFIX),
  );
  assert.equal(records.length, 1, "S6.2 must publish one consumption record");
  const recordLine = records[0];
  assert.ok(recordLine);
  const record = JSON.parse(
    recordLine.slice(PRIVATE_SCALE_CONSUMPTION_PREFIX.length),
  ) as Readonly<Record<string, unknown>>;
  assert.deepEqual(Object.keys(record), [
    "schemaVersion",
    "processSentinelBase64",
    "processSentinelBytes",
    "processSentinelSha256",
    "wallElapsedMicros",
  ]);
  assert.equal(record.schemaVersion, 1);
  assert.equal(typeof record.processSentinelBase64, "string");
  assert.ok(Number.isSafeInteger(record.processSentinelBytes));
  assert.ok((record.processSentinelBytes as number) > 0);
  assert.match(record.processSentinelSha256 as string, /^[0-9a-f]{64}$/u);
  assert.ok(Number.isSafeInteger(record.wallElapsedMicros));
  assert.ok((record.wallElapsedMicros as number) > 0);

  const processSentinel = Buffer.from(
    record.processSentinelBase64 as string,
    "base64",
  );
  assert.equal(
    processSentinel.toString("base64"),
    record.processSentinelBase64,
    "process sentinel Base64 must be canonical and lossless",
  );
  assert.equal(processSentinel.length, record.processSentinelBytes);
  assert.equal(
    createHash("sha256").update(processSentinel).digest("hex"),
    record.processSentinelSha256,
  );
  assert.notEqual(
    record.processSentinelSha256,
    S62F_HISTORICAL_SENTINEL_SHA256,
    "archived mechanism sentinel must not be reused",
  );
  const sentinelText = processSentinel.toString("utf8");
  assert.equal(
    sentinelText.split(PRIVATE_SCALE_PROCESS_PREFIX).length - 1,
    1,
  );
  assert.ok(sentinelText.startsWith(PRIVATE_SCALE_PROCESS_PREFIX));
  assert.ok(sentinelText.endsWith("\n"));

  const processEnvelope = decodeProcessEnvelope(
    processSentinel,
    Buffer.alloc(0),
  );
  assert.equal(processEnvelope.status, "ok");
  if (processEnvelope.status !== "ok") {
    assert.fail("fresh S6.2 consumption must decode to an ok process envelope");
  }
  assert.equal(processEnvelope.partialEvidence, false);
  assert.equal(processEnvelope.process.exitCode, 0);
  assert.equal(processEnvelope.process.timedOut, false);
  assert.ok((processEnvelope.process.peakWorkingSetBytes ?? 0) > 0);
  assert.equal(processEnvelope.process.terminationStatus, "not-required");
  assert.equal(processEnvelope.process.reapStatus, "succeeded");
  assert.equal(processEnvelope.process.cleanupStatus, "succeeded");
  assert.equal(processEnvelope.evidence.counts.events, 102_400);
  assert.equal(processEnvelope.evidence.counts.notes, 51_200);
  assert.equal(processEnvelope.evidence.counts.extensions, 18);
  assert.equal(
    processEnvelope.evidence.metrics.indexEntriesBuilt,
    474_517,
  );
  assert.equal(
    processEnvelope.evidence.metrics.indexRebuildEntries,
    474_517,
  );
  assert.equal(
    processEnvelope.evidence.metrics.fullDocumentMaterializations,
    1,
  );
  assert.deepEqual(processEnvelope.evidence.parity, {
    normalizedProjectionEqual: true,
    indexEntryCountEqual: true,
  });
  assert.deepEqual(processEnvelope.evidence.roundTrip, {
    semanticEqual: true,
    canonicalBytesEqual: true,
  });
  assert.deepEqual(processEnvelope.evidence.ordering, {
    topologyCanonical: true,
    extensionsPreserved: true,
  });
  return {
    processSentinelBase64: record.processSentinelBase64 as string,
    processSentinelBytes: record.processSentinelBytes as number,
    processSentinelSha256: record.processSentinelSha256 as string,
    wallElapsedMicros: record.wallElapsedMicros as number,
    processEnvelope,
  };
}

function assertS62FSourceProjection(projection: {
  readonly parent: string;
  readonly changedPaths: readonly string[];
  readonly evidenceAtSource: boolean;
  readonly technicalDeltaAfterSource: readonly string[];
}): void {
  assert.equal(projection.parent, S62F_ACTIVATION_HEAD);
  assert.deepEqual([...projection.changedPaths].sort(), [
    ...S62F_TECHNICAL_PATHS,
    `${S62F_TASK_ROOT}/task.json`,
  ].sort());
  assert.equal(projection.evidenceAtSource, false);
  assert.deepEqual(projection.technicalDeltaAfterSource, []);
}

function assertS62FLifecycleProjection(
  projection: Readonly<Record<string, unknown>>,
): void {
  assert.equal(projection.childStatus, "completed");
  assert.equal(
    projection.childParent,
    "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
  );
  assert.equal(projection.taskStartRun, true);
  assert.equal(projection.activationAuthorized, true);
  assert.equal(projection.productionAuthorized, true);
  assert.equal(projection.userAuthorized, true);
  assert.equal(projection.e3Authorized, true);
  assert.equal(projection.e3ExecutionCount, 1);
  assert.equal(projection.childS62Started, true);
  assert.equal(projection.childS62Completed, true);
  assert.equal(projection.childS63Started, false);
  assert.equal(projection.childDefaultRuntime, "typescript");
  assert.equal(projection.candidateReady, false);
  assert.equal(projection.currentPhase, "owner_accepted_pending_native_archive");
  assert.equal(
    projection.nextGate,
    "native_archive_then_fast_forward_only_integration",
  );
  for (const gate of [
    "qualificationAuthorized",
    "runtimeCutoverAuthorized",
    "rkp3Authorized",
    "pushAuthorized",
  ] as const) {
    assert.equal(projection[gate], false, `${gate} must remain false`);
  }
  for (const completedGate of [
    "acceptanceAuthorized",
    "archiveAuthorized",
    "integrationAuthorized",
  ] as const) {
    assert.equal(
      projection[completedGate],
      true,
      `${completedGate} must preserve accepted S6.2 history`,
    );
  }
  assert.ok(Array.isArray(projection.parentChildren));
  assert.equal(
    (projection.parentChildren as readonly unknown[]).filter(
      (child) => child === S62F_TASK_NAME,
    ).length,
    1,
  );
  assert.equal(
    (projection.parentChildren as readonly unknown[]).filter(
      (child) => child === S63_TASK_NAME,
    ).length,
    1,
  );
  assert.equal(projection.parentPlanningChild, null);
  assert.equal(projection.parentImplementationChild, S63_TASK_NAME);
  assert.equal(projection.parentS62Started, true);
  assert.equal(projection.parentS62Completed, true);
  assert.equal(projection.parentS63Started, true);
  assert.equal(projection.parentDefaultRuntime, "typescript");
  assert.equal(projection.rustPlanningChild, null);
  assert.equal(projection.rustImplementationChild, S63_TASK_NAME);
  assert.equal(projection.rustS62Started, true);
  assert.equal(projection.rustS62Completed, true);
  assert.equal(projection.rustS63Started, true);
  assert.equal(projection.rustDefaultRuntime, "typescript");
  assert.equal(projection.parentCandidateReady, projection.rustCandidateReady);
  assert.equal(projection.parentStage6Completed, projection.parentCandidateReady);
  assert.equal(projection.rustStage6Completed, projection.rustCandidateReady);
}

function assertFreshS62FWorkspaceLaw(): void {
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", S62F_PLANNING_BASE, S62F_PLANNING_HEAD]),
  );
  assert.equal(git(["rev-parse", `${S62F_PLANNING_PASS_HEAD}^`]), S62F_PLANNING_HEAD);
  assert.equal(git(["rev-parse", `${S62F_ACTIVATION_HEAD}^`]), S62F_PLANNING_PASS_HEAD);
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", S62F_ACTIVATION_HEAD, "HEAD"]),
  );
  assert.equal(
    git(["rev-parse", `${S62F_ACCEPTANCE_COMMIT}^`]),
    S62F_REVIEWED_CANDIDATE,
  );
  assert.equal(
    git(["rev-parse", `${S62F_NATIVE_ARCHIVE_COMMIT}^`]),
    S62F_ACCEPTANCE_COMMIT,
  );
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", S62F_NATIVE_ARCHIVE_COMMIT, "HEAD"]),
  );
  assert.deepEqual(
    resolveExactlyOneTaskLocation(
      S62F_TASK_ROOT,
      S62F_ARCHIVE_ROOT,
      S62F_ARCHIVE_MANIFEST,
    ),
    { kind: "archive", root: S62F_ARCHIVE_ROOT },
  );
  assert.throws(() =>
    resolveExactlyOneTaskLocation(
      S62F_TASK_ROOT,
      S62F_ARCHIVE_ROOT,
      S62F_ARCHIVE_MANIFEST,
      {
        activeFiles: [...S62F_ARCHIVE_MANIFEST],
        archiveFiles: [...S62F_ARCHIVE_MANIFEST],
      },
    ),
  );
  assert.throws(() =>
    resolveExactlyOneTaskLocation(
      S62F_TASK_ROOT,
      S62F_ARCHIVE_ROOT,
      S62F_ARCHIVE_MANIFEST,
      {
        activeFiles: null,
        archiveFiles: [...S62F_ARCHIVE_MANIFEST, "research/forbidden-drift.md"],
      },
    ),
  );
  assert.throws(() =>
    git(["merge-base", "--is-ancestor", S62F_STOPPED_ATTEMPT_HEAD, "HEAD"]),
  );

  const planningPaths = lines(
    git([
      "diff",
      "--no-renames",
      "--name-only",
      `${S62F_PLANNING_BASE}..${S62F_PLANNING_PASS_HEAD}`,
    ]),
  );
  assert.deepEqual(planningPaths.sort(), [
    ...S62F_PLANNING_MANIFEST.map((path) => `${S62F_TASK_ROOT}/${path}`),
    TASK_PATH,
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
    PARENT_PATH,
  ].sort());
  assert.deepEqual(
    lines(
      git([
        "diff-tree",
        "--no-commit-id",
        "--no-renames",
        "--name-only",
        "-r",
        S62F_ACTIVATION_HEAD,
      ]),
    ).sort(),
    [...S62F_ACTIVATION_PATHS].sort(),
  );

  const s62Task = JSON.parse(readText(`${S62F_ARCHIVE_ROOT}/task.json`)) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly parent?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const rkp2Task = JSON.parse(readCurrentRkp2Text(TASK_PATH)) as {
    readonly children?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const rustTask = JSON.parse(readText(PARENT_PATH)) as {
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const s62Meta = s62Task.meta ?? {};
  const rkp2Meta = rkp2Task.meta ?? {};
  const rustMeta = rustTask.meta ?? {};
  assert.equal(existsSync(resolve(S62F_ARCHIVE_EVIDENCE_PATH)), true);

  assertS62FWorkloadTransition(
    s62Meta.immutable_workload_inputs,
    s62Meta.implementation_workload_inputs,
  );
  const implementationHashes =
    s62Meta.implementation_workload_inputs as Readonly<Record<string, string>>;
  for (const drift of [
    {
      ...implementationHashes,
      "crates/brilliant-kernel-runtime/src/indices.rs": "0".repeat(64),
    },
    {
      ...implementationHashes,
      "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts":
        S62F_PLANNING_WORKLOAD_HASHES[
          "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts"
        ],
    },
    Object.fromEntries(Object.entries(implementationHashes).reverse()),
    { ...implementationHashes, "test/undeclared.ts": "0".repeat(64) },
  ]) {
    assert.throws(() =>
      assertS62FWorkloadTransition(s62Meta.immutable_workload_inputs, drift),
    );
  }

  assert.equal(s62Meta.planning_candidate_commit, S62F_PLANNING_HEAD);
  assert.equal(s62Meta.activation_commit, S62F_ACTIVATION_HEAD);
  assert.equal(
    s62Meta.historical_private_mechanism_sentinel_sha256,
    S62F_HISTORICAL_SENTINEL_SHA256,
  );
  const finalPlanningReview =
    s62Meta.final_targeted_planning_rereview as
      | Readonly<Record<string, unknown>>
      | undefined;
  assert.ok(finalPlanningReview);
  assert.equal(finalPlanningReview.candidate_commit, S62F_PLANNING_HEAD);
  assert.equal(finalPlanningReview.P0, 0);
  assert.equal(finalPlanningReview.P1, 0);
  assert.equal(finalPlanningReview.P2, 0);
  assert.equal(
    finalPlanningReview.verdict,
    "pass_for_explicit_user_activation_decision_only",
  );

  const planningWorker = gitTextAt(
    S62F_PLANNING_HEAD,
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  );
  const currentWorker = readText(
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  );
  assert.equal(
    exactSourceSection(
      currentWorker,
      "export type ScaleProcessEnvelope =",
      "export interface WorkerResult",
    ),
    exactSourceSection(
      planningWorker,
      "export type ScaleProcessEnvelope =",
      "export interface WorkerResult",
    ),
  );
  assert.equal(
    exactSourceSection(
      currentWorker,
      "export function decodeProcessEnvelope",
      "export function selectPrivateScaleExecutable",
    ),
    exactSourceSection(
      planningWorker,
      "export function decodeProcessEnvelope",
      "export function selectPrivateScaleExecutable",
    ),
  );
  const currentWorkerTest = readText(
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  );
  assert.equal(
    (currentWorker.match(/BRILLIANT_RKP2_SCALE_CONSUMPTION_V1:/gu) ?? []).length,
    1,
  );
  assert.equal(
    (currentWorkerTest.match(/process\.stdout\.write\(/gu) ?? []).length,
    1,
  );
  assert.match(
    currentWorker,
    /const processSentinel = Buffer\.from\(processResult\.stdout\);/u,
  );
  assert.match(
    currentWorkerTest,
    /process\.stdout\.write\([\s\S]*schemaVersion: 1,[\s\S]*processSentinelBase64:[\s\S]*processSentinelBytes:[\s\S]*processSentinelSha256:[\s\S]*wallElapsedMicros:/u,
  );
  const optInStart = currentWorkerTest.indexOf(
    'test("Stage 6 E2 runs the one real private scale journey only when explicitly enabled"',
  );
  const optInWrite = currentWorkerTest.indexOf(
    "process.stdout.write(",
    optInStart,
  );
  assert.ok(optInStart >= 0 && optInWrite > optInStart);
  assert.ok(
    currentWorkerTest.lastIndexOf("assert.", optInWrite) > optInStart,
    "consumption emission must follow sentinel validation",
  );

  const sourceHead = s62Meta.implementation_source_head as string;
  assert.match(sourceHead, /^[0-9a-f]{40}$/u);
  const sourceParent = git(["rev-parse", `${sourceHead}^`]);
  const sourceChangedPaths = lines(
    git([
      "diff-tree",
      "--no-commit-id",
      "--no-renames",
      "--name-only",
      "-r",
      sourceHead,
    ]),
  );
  const technicalDeltaAfterSource = lines(
    git([
      "diff",
      "--no-renames",
      "--name-only",
      `${sourceHead}..${S62F_REVIEWED_CANDIDATE}`,
      "--",
      ...S62F_TECHNICAL_PATHS,
    ]),
  );
  const evidenceAtSource =
    git(["ls-tree", "--name-only", sourceHead, "--", S62F_EVIDENCE_PATH]) !==
    "";
  const sourceProjection = {
    parent: sourceParent,
    changedPaths: sourceChangedPaths,
    evidenceAtSource,
    technicalDeltaAfterSource,
  };
  assertS62FSourceProjection(sourceProjection);
  assert.equal(
    git(["show", "-s", "--format=%s", sourceHead]),
    "test(rkp-2): rebuild S6.2 evidence source",
  );
  for (const mutation of [
    { parent: S62F_PLANNING_PASS_HEAD },
    { changedPaths: [...sourceChangedPaths, "src/forbidden.ts"] },
    { evidenceAtSource: true },
    { technicalDeltaAfterSource: [S62F_TECHNICAL_PATHS[0]] },
  ] as const) {
    assert.throws(() =>
      assertS62FSourceProjection({ ...sourceProjection, ...mutation }),
    );
  }
  for (const path of S62F_WORKLOAD_PATHS) {
    assert.equal(rawGitFileSha256At(sourceHead, path), implementationHashes[path]);
  }
  assertS62FDualAutocrlfBytes(sourceHead);

  const archivedSentinel = archivedS62FProcessSentinel();
  const syntheticConsumption = s62FConsumptionRecordForSentinel(
    syntheticFreshS62FProcessSentinel(),
  );
  assertS62FConsumptionRecordText(syntheticConsumption);
  assert.throws(() => assertS62FConsumptionRecordText(""));
  assert.throws(() =>
    assertS62FConsumptionRecordText(
      `${syntheticConsumption}\n${syntheticConsumption}`,
    ),
  );
  assert.throws(() =>
    assertS62FConsumptionRecordText(
      s62FConsumptionRecordForSentinel(archivedSentinel),
    ),
  );
  const extraRecord = JSON.parse(
    syntheticConsumption.slice(PRIVATE_SCALE_CONSUMPTION_PREFIX.length),
  ) as Record<string, unknown>;
  extraRecord.unexpected = true;
  assert.throws(() =>
    assertS62FConsumptionRecordText(
      `${PRIVATE_SCALE_CONSUMPTION_PREFIX}${JSON.stringify(extraRecord)}`,
    ),
  );
  const wrongLength = JSON.parse(
    syntheticConsumption.slice(PRIVATE_SCALE_CONSUMPTION_PREFIX.length),
  ) as Record<string, unknown>;
  wrongLength.processSentinelBytes =
    (wrongLength.processSentinelBytes as number) + 1;
  assert.throws(() =>
    assertS62FConsumptionRecordText(
      `${PRIVATE_SCALE_CONSUMPTION_PREFIX}${JSON.stringify(wrongLength)}`,
    ),
  );
  const partialSentinelText = syntheticFreshS62FProcessSentinel().toString("utf8");
  const partialEnvelope = JSON.parse(
    partialSentinelText
      .slice(PRIVATE_SCALE_PROCESS_PREFIX.length)
      .replace(/\n$/u, ""),
  ) as Record<string, unknown>;
  partialEnvelope.partialEvidence = true;
  const partialSentinel = Buffer.from(
    `${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(partialEnvelope)}\n`,
    "utf8",
  );
  assert.throws(() =>
    assertS62FConsumptionRecordText(
      s62FConsumptionRecordForSentinel(partialSentinel),
    ),
  );

  const lifecycleProjection = {
    childStatus: s62Task.status,
    childParent: s62Task.parent,
    taskStartRun: s62Meta.task_start_run,
    activationAuthorized: s62Meta.activation_authorized,
    productionAuthorized: s62Meta.production_implementation_authorized,
    userAuthorized: s62Meta.user_implementation_authorization,
    e3Authorized: s62Meta.e3_authorized,
    e3ExecutionCount: s62Meta.e3_execution_count,
    childS62Started: s62Meta.parent_s6_2_started,
    childS62Completed: s62Meta.parent_s6_2_completed,
    childS63Started: s62Meta.parent_s6_3_started,
    childDefaultRuntime: s62Meta.default_runtime,
    candidateReady: s62Meta.implementation_candidate_ready,
    currentPhase: s62Meta.current_phase,
    nextGate: s62Meta.next_gate,
    qualificationAuthorized: s62Meta.qualification_authorized,
    runtimeCutoverAuthorized: s62Meta.runtime_cutover_authorized,
    rkp3Authorized: s62Meta.rkp3_creation_authorized,
    acceptanceAuthorized: s62Meta.acceptance_authorized,
    archiveAuthorized: s62Meta.archive_authorized,
    integrationAuthorized: s62Meta.integration_authorized,
    pushAuthorized: s62Meta.push_authorized,
    parentChildren: rkp2Task.children,
    parentPlanningChild: rkp2Meta.current_planning_child,
    parentImplementationChild: rkp2Meta.current_implementation_child,
    parentS62Started: rkp2Meta.stage_6_s6_2_started,
    parentS62Completed: rkp2Meta.stage_6_s6_2_completed,
    parentS63Started: rkp2Meta.stage_6_s6_3_started,
    parentStage6Completed: rkp2Meta.stage_6_completed,
    parentDefaultRuntime: rkp2Meta.default_runtime,
    parentCandidateReady: rkp2Meta.implementation_candidate_ready,
    rustPlanningChild: rustMeta.rkp2_current_planning_child,
    rustImplementationChild: rustMeta.rkp2_current_implementation_child,
    rustS62Started: rustMeta.rkp2_stage_6_s6_2_started,
    rustS62Completed: rustMeta.rkp2_stage_6_s6_2_completed,
    rustS63Started: rustMeta.rkp2_stage_6_s6_3_started,
    rustStage6Completed: rustMeta.rkp2_stage_6_completed,
    rustDefaultRuntime: rustMeta.rkp2_default_runtime,
    rustCandidateReady: rustMeta.rkp2_implementation_candidate_ready,
  };
  assertS62FLifecycleProjection(lifecycleProjection);
  for (const mutation of [
    { childS62Completed: false },
    { childS63Started: true },
    { candidateReady: true },
    { e3ExecutionCount: 2 },
    { parentPlanningChild: S62F_TASK_NAME },
    { parentImplementationChild: "wrong-child" },
    { parentS63Started: false },
    { rustImplementationChild: "wrong-child" },
    { qualificationAuthorized: true },
    { acceptanceAuthorized: false },
    { integrationAuthorized: false },
    { parentCandidateReady: !lifecycleProjection.parentCandidateReady },
    { pushAuthorized: true },
  ] as const) {
    assert.throws(() =>
      assertS62FLifecycleProjection({ ...lifecycleProjection, ...mutation }),
    );
  }

  assert.equal(s62Task.completedAt, "2026-09-03");
  assert.equal(s62Meta.implementation_source_head, sourceHead);
  assert.equal(
    s62Meta.implementation_source_tree,
    git(["rev-parse", `${sourceHead}^{tree}`]),
  );
  assert.equal(s62Meta.evidence_source_head, sourceHead);
  assert.equal(s62Meta.fresh_request_generated, true);
  assert.equal(s62Meta.archived_result_reused, false);
  assert.equal(s62Meta.partial_evidence, false);
  assert.equal(s62Meta.process_sentinel_sha256, S62F_ACCEPTED_SENTINEL_SHA256);
  const directCheck = s62Meta.s6_2_direct_implementation_check as
    | Readonly<Record<string, unknown>>
    | undefined;
  const ownerAcceptance = s62Meta.s6_2_owner_acceptance as
    | Readonly<Record<string, unknown>>
    | undefined;
  assert.ok(directCheck);
  assert.ok(ownerAcceptance);
  assert.equal(directCheck.reviewed_head, S62F_REVIEWED_CANDIDATE);
  assert.equal(directCheck.P0, 0);
  assert.equal(directCheck.P1, 0);
  assert.equal(directCheck.P2, 0);
  assert.equal(ownerAcceptance.accepted_candidate_head, S62F_REVIEWED_CANDIDATE);
  assert.equal(ownerAcceptance.acceptance_authorized, true);
  assert.equal(ownerAcceptance.archive_authorized, true);
  assert.equal(ownerAcceptance.fast_forward_integration_authorized, true);
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", sourceHead, "HEAD"]),
  );
  assert.deepEqual(
    lines(
      git([
        "diff",
        "--no-renames",
        "--name-only",
        `${sourceHead}..${S62F_REVIEWED_CANDIDATE}`,
      ]),
    ).sort(),
    [...S62F_LIFECYCLE_PATHS].sort(),
  );
  const evidenceText = readText(S62F_ARCHIVE_EVIDENCE_PATH);
  const consumption = assertS62FConsumptionRecordText(evidenceText);
  assert.equal(
    s62Meta.process_sentinel_base64,
    consumption.processSentinelBase64,
  );
  assert.equal(s62Meta.process_sentinel_bytes, consumption.processSentinelBytes);
  assert.equal(
    s62Meta.process_sentinel_sha256,
    consumption.processSentinelSha256,
  );
  assert.notEqual(
    consumption.processSentinelBase64,
    archivedSentinel.toString("base64"),
  );
  assert.match(evidenceText, /fresh_request_generated=true/u);
  assert.match(evidenceText, /archived_result_reused=false/u);
  assert.match(evidenceText, /partialEvidence=false/u);
}

function currentStage6CloseoutL6DateRepairChanges(): Map<string, "A" | "M" | "D"> {
  const result = new Map<string, "A" | "M" | "D">();
  const collect = (
    args: readonly string[],
    fallbackStatus?: "A",
    preserveExisting = false,
  ): void => {
    for (const line of lines(git(args))) {
      const [statusOrPath, path, extra] = line.split("\t");
      const status = fallbackStatus ?? statusOrPath;
      const resolvedPath = fallbackStatus === undefined ? path : statusOrPath;
      assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
      assert.ok(status === "A" || status === "M" || status === "D");
      assert.ok(resolvedPath);
      if (!preserveExisting || !result.has(resolvedPath)) {
        result.set(resolvedPath, status);
      }
    }
  };
  collect([
    "diff-tree",
    "--no-commit-id",
    "--no-renames",
    "--name-status",
    "-r",
    STAGE_6_CLOSEOUT_L6_CLOCK_DATE_REPAIR_COMMIT,
  ]);
  return result;
}

function currentStage6CloseoutPowerShellPreflightRepairChanges(): Map<
  string,
  "A" | "M" | "D"
> {
  const result = new Map<string, "A" | "M" | "D">();
  const collect = (args: readonly string[]): void => {
    for (const line of lines(git(args))) {
      const [statusOrPath, path, extra] = line.split("\t");
      const status = statusOrPath;
      const resolvedPath = path;
      assert.equal(extra, undefined, "rename-collapsed paths are forbidden");
      assert.ok(status === "A" || status === "M" || status === "D");
      assert.ok(resolvedPath);
      assert.equal(result.has(resolvedPath), false);
      result.set(resolvedPath, status);
    }
  };
  collect([
    "diff-tree",
    "--no-commit-id",
    "--no-renames",
    "--name-status",
    "-r",
    STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT,
  ]);
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

type E3WorkspaceLawCloseoutPhase =
  | "planning"
  | "activation"
  | "owner-acceptance"
  | "target-archived"
  | "closure-archived";

type Stage6CloseoutPhase =
  | "planning"
  | "activation"
  | "semantic-child-archived"
  | "stage6-archived"
  | "integrated"
  | "closeout-archived";

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
  readonly targetImplementationStage: unknown;
  readonly targetImplementationReview: unknown;
  readonly targetNextGate: unknown;
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

interface WorkspaceLawCloseoutLifecycleProjection {
  readonly targetLocation: "active" | "archive";
  readonly targetStatus: unknown;
  readonly targetCompletedAt: unknown;
  readonly targetImplementationCandidateReady: unknown;
  readonly targetImplementationStage: unknown;
  readonly targetImplementationReview: unknown;
  readonly targetNextGate: unknown;
  readonly targetAcceptanceAuthorized: unknown;
  readonly targetArchiveAuthorized: unknown;
  readonly targetAuditRecord: unknown;
  readonly targetAuditRecordBytes: unknown;
  readonly targetAuditRecordSha256: unknown;
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
  readonly closureAcceptedPlanningAuthority: unknown;
  readonly closureImplementationCandidateReady: unknown;
  readonly closureImplementationReview: unknown;
  readonly closureNextGate: unknown;
  readonly closureTargetAcceptanceAuthorized: unknown;
  readonly closureTargetArchiveAuthorized: unknown;
  readonly closureAcceptanceAuthorized: unknown;
  readonly closureArchiveAuthorized: unknown;
  readonly closureQ3AuditRecord: unknown;
  readonly closureDefaultRuntime: unknown;
  readonly closureS62Started: unknown;
  readonly closureS63Started: unknown;
  readonly closureIntegrationAuthorized: unknown;
  readonly closureQualificationAuthorized: unknown;
  readonly closureRuntimeSwitchAuthorized: unknown;
  readonly closurePushAuthorized: unknown;
  readonly closureRkp3CreationAuthorized: unknown;
  readonly closureE3StressRerun: unknown;
  readonly stage6Status: unknown;
  readonly stage6CurrentPlanningChild: unknown;
  readonly stage6CurrentImplementationChild: unknown;
  readonly stage6NextGate: unknown;
  readonly stage6Q3AuditRecord: unknown;
  readonly stage6Q3AuditOwner: unknown;
  readonly stage6Q3AuditSha256: unknown;
  readonly stage6S61RetainedComplete: unknown;
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

function resolveExactlyOneTaskLocation(
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

function currentRkp2Path(historicalActivePath: string): string {
  assert.ok(
    historicalActivePath === RKP2_ACTIVE_ROOT ||
      historicalActivePath.startsWith(`${RKP2_ACTIVE_ROOT}/`),
    `${historicalActivePath} must be beneath the historical RKP-2 root`,
  );
  const location = resolveExactlyOneTaskLocation(
    RKP2_ACTIVE_ROOT,
    RKP2_ARCHIVE_ROOT,
    RKP2_TASK_MANIFEST,
  );
  return location.root + historicalActivePath.slice(RKP2_ACTIVE_ROOT.length);
}

function readCurrentRkp2Text(historicalActivePath: string): string {
  return readText(currentRkp2Path(historicalActivePath));
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

function jsonlReferenceExists(path: string): boolean {
  if (existsSync(resolve(path))) {
    return true;
  }
  for (const [activeRoot, archiveRoot] of [
    [RKP2_ACTIVE_ROOT, RKP2_ARCHIVE_ROOT],
    [STAGE_6_E3_LAW_TASK_ROOT, STAGE_6_E3_LAW_TARGET_ARCHIVE_ROOT],
    [
      STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT,
      STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT,
    ],
    [STAGE_6_PRIVATE_SCALE_TASK_ROOT, STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT],
  ] as const) {
    if (path === activeRoot || path.startsWith(`${activeRoot}/`)) {
      const archivedPath = archiveRoot + path.slice(activeRoot.length);
      return existsSync(resolve(archivedPath));
    }
  }
  return false;
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
      assert.equal(jsonlReferenceExists(path), true, `${root}/${name} references ${path}`);
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
    projection.targetImplementationStage,
    targetArchived
      ? "accepted_archived_completed_historical_no_live_gate"
      : "terminal_candidate_ready_for_dedicated_independent_implementation_review",
  );
  assert.equal(
    projection.targetImplementationReview,
    ownerAccepted
      ? "passed_dedicated_independent_acceptance_projection_implementation_review"
      : "pending_dedicated_independent_acceptance_projection_implementation_review",
  );
  assert.equal(
    projection.targetNextGate,
    targetArchived
      ? "completed_historical_no_live_gate"
      : ownerAccepted
        ? "native_target_archive_clock_preflight_required"
        : "dedicated_independent_acceptance_projection_implementation_review_pending",
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

function expectedWorkspaceLawCloseoutChanges(
  phase: E3WorkspaceLawCloseoutPhase,
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
      ? STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT
      : STAGE_6_E3_LAW_CLOSEOUT_ROOT;
  setAll(
    "A",
    STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.map((path) => `${closureRoot}/${path}`),
  );
  if (phase === "planning") {
    setAll("M", [`${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`]);
    return result;
  }
  setAll("M", [STAGE_6_E3_LAW_CLOSEOUT_TECHNICAL_PATH]);
  setAll("M", STAGE_6_PARENT_LIFECYCLE_PATHS);
  if (phase === "owner-acceptance") {
    setAll("M", STAGE_6_E3_LAW_TARGET_CONTEXT_LIFECYCLE_PATHS);
  }
  if (phase === "target-archived" || phase === "closure-archived") {
    setAll(
      "D",
      STAGE_6_E3_LAW_TARGET_MANIFEST.map(
        (path) => `${STAGE_6_E3_LAW_TASK_ROOT}/${path}`,
      ),
    );
    setAll(
      "A",
      STAGE_6_E3_LAW_TARGET_MANIFEST.map(
        (path) => `${STAGE_6_E3_LAW_TARGET_ARCHIVE_ROOT}/${path}`,
      ),
    );
  }
  return result;
}

function assertWorkspaceLawCloseoutPathSet(
  actual: ReadonlyMap<string, "A" | "M" | "D">,
  phase: E3WorkspaceLawCloseoutPhase,
): void {
  const expected = expectedWorkspaceLawCloseoutChanges(phase);
  const project = (value: ReadonlyMap<string, "A" | "M" | "D">): string[] =>
    [...value].map(([path, status]) => `${status}\t${path}`).sort();
  assert.deepEqual(project(actual), project(expected));
  const counts = [...actual.values()].reduce(
    (result, status) => ({ ...result, [status]: result[status] + 1 }),
    { A: 0, M: 0, D: 0 },
  );
  const expectedCounts = {
    planning: { A: 11, M: 1, D: 0 },
    activation: { A: 11, M: 4, D: 0 },
    "owner-acceptance": { A: 11, M: 9, D: 0 },
    "target-archived": { A: 23, M: 4, D: 12 },
    "closure-archived": { A: 23, M: 4, D: 12 },
  } as const;
  assert.deepEqual(counts, expectedCounts[phase]);
}

function expectedStage6CloseoutChanges(
  phase: Stage6CloseoutPhase,
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
  const closeoutRoot =
    phase === "closeout-archived"
      ? STAGE_6_CLOSEOUT_ARCHIVE_ROOT
      : STAGE_6_CLOSEOUT_ROOT;
  setAll(
    "A",
    STAGE_6_CLOSEOUT_MANIFEST.map((path) => `${closeoutRoot}/${path}`),
  );
  if (phase === "closeout-archived") {
    setAll(
      "D",
      STAGE_6_CLOSEOUT_MANIFEST.map(
        (path) => `${STAGE_6_CLOSEOUT_ROOT}/${path}`,
      ),
    );
  }

  const semanticArchived =
    phase === "semantic-child-archived" ||
    phase === "stage6-archived" ||
    phase === "integrated" ||
    phase === "closeout-archived";
  if (semanticArchived) {
    setAll(
      "D",
      STAGE_6_SEMANTIC_CANONICAL_MANIFEST.map(
        (path) => `${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/${path}`,
      ),
    );
    setAll(
      "A",
      STAGE_6_SEMANTIC_CANONICAL_MANIFEST.map(
        (path) => `${STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT}/${path}`,
      ),
    );
  }

  const stage6Archived =
    phase === "stage6-archived" ||
    phase === "integrated" ||
    phase === "closeout-archived";
  if (stage6Archived) {
    setAll(
      "D",
      STAGE_6_PRIVATE_SCALE_MANIFEST.map(
        (path) => `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/${path}`,
      ),
    );
    setAll(
      "A",
      STAGE_6_PRIVATE_SCALE_MANIFEST.map(
        (path) => `${STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT}/${path}`,
      ),
    );
    setAll("M", [TASK_PATH, PARENT_PATH, STAGE_6_CLOSEOUT_TECHNICAL_PATH]);
    if (phase === "closeout-archived") {
      setAll("M", [
        ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
        ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
      ]);
    }
  } else {
    setAll("M", [TASK_PATH, PARENT_PATH, `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`]);
    if (phase === "semantic-child-archived") {
      setAll("M", [
        `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/operator-handoff.md`,
        `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/review-candidate.md`,
        STAGE_6_CLOSEOUT_TECHNICAL_PATH,
      ]);
    }
  }
  return result;
}

function assertStage6CloseoutPathSet(
  actual: ReadonlyMap<string, "A" | "M" | "D">,
  phase: Stage6CloseoutPhase,
): void {
  const project = (value: ReadonlyMap<string, "A" | "M" | "D">): string[] =>
    [...value].map(([path, status]) => `${status}\t${path}`).sort();
  assert.deepEqual(project(actual), project(expectedStage6CloseoutChanges(phase)));
  const counts = [...actual.values()].reduce(
    (result, status) => ({ ...result, [status]: result[status] + 1 }),
    { A: 0, M: 0, D: 0 },
  );
  const expectedCounts = {
    planning: { A: 12, M: 3, D: 0 },
    activation: { A: 12, M: 3, D: 0 },
    "semantic-child-archived": { A: 24, M: 6, D: 12 },
    "stage6-archived": { A: 37, M: 3, D: 25 },
    integrated: { A: 37, M: 3, D: 25 },
    "closeout-archived": { A: 37, M: 5, D: 37 },
  } as const;
  assert.deepEqual(counts, expectedCounts[phase]);
}

interface NativeTaskArchiveCommitProjection {
  readonly parents: readonly string[];
  readonly rows: readonly string[];
}

function readCommitProjection(commit: string): NativeTaskArchiveCommitProjection {
  const parentLine = git(["show", "-s", "--format=%P", commit]);
  return {
    parents: parentLine === "" ? [] : parentLine.split(/\s+/u),
    rows: lines(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "--no-renames",
        "-r",
        commit,
      ]),
    ),
  };
}

function assertNativeTaskArchiveCommitProjection(
  projection: NativeTaskArchiveCommitProjection,
  expectedParent: string,
  activeRoot: string,
  archiveRoot: string,
  manifest: readonly string[],
): void {
  assert.deepEqual(projection.parents, [expectedParent]);
  assert.deepEqual(
    [...projection.rows].sort(),
    manifest
      .flatMap((artifact) => [
        `D\t${activeRoot}/${artifact}`,
        `A\t${archiveRoot}/${artifact}`,
      ])
      .sort(),
  );
}

interface ExactCommitParentProjection {
  readonly commit: string;
  readonly parents: readonly string[];
}

interface Stage6CloseoutL6DateRepairProjection {
  readonly parents: readonly string[];
  readonly changes: ReadonlyMap<string, "A" | "M" | "D">;
}

function currentStage6CloseoutL6DateRepairParents(): readonly string[] {
  return lines(
    git([
      "show",
      "-s",
      "--format=%P",
      STAGE_6_CLOSEOUT_L6_CLOCK_DATE_REPAIR_COMMIT,
    ]),
  ).flatMap((line) =>
    line.split(" ").filter(Boolean),
  );
}

function assertStage6CloseoutL6DateRepairProjection(
  projection: Stage6CloseoutL6DateRepairProjection,
): void {
  assert.deepEqual(
    projection.parents,
    [STAGE_6_CLOSEOUT_L5_INTEGRATION_COMMIT],
    "L6 date repair must be the direct single-parent child of the L5 integration commit",
  );
  assert.deepEqual(
    [...projection.changes]
      .map(([path, status]) => `${status}\t${path}`)
      .sort(),
    STAGE_6_CLOSEOUT_L6_DATE_REPAIR_PATHS.map((path) => `M\t${path}`).sort(),
    "L6 date repair must change exactly the four declared files",
  );
}

function currentStage6CloseoutPowerShellPreflightRepairParents(): readonly string[] {
  return lines(
    git([
      "show",
      "-s",
      "--format=%P",
      STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT,
    ]),
  ).flatMap((line) => line.split(" ").filter(Boolean));
}

function assertStage6CloseoutPowerShellPreflightRepairProjection(
  projection: Stage6CloseoutL6DateRepairProjection,
): void {
  assert.deepEqual(
    projection.parents,
    [STAGE_6_CLOSEOUT_L6_CLOCK_DATE_REPAIR_COMMIT],
    "PowerShell preflight repair must be the direct single-parent child of the clock/date repair",
  );
  assert.deepEqual(
    [...projection.changes]
      .map(([path, status]) => `${status}\t${path}`)
      .sort(),
    STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_PATHS.map(
      (path) => `M\t${path}`,
    ).sort(),
    "PowerShell preflight repair must change exactly the three declared files",
  );
}

interface Stage6CloseoutPowerShellPreflightEvidence {
  readonly schemaVersion: unknown;
  readonly pwshVersion: unknown;
  readonly currentCulture: unknown;
  readonly archiveDateType: unknown;
  readonly deadlineType: unknown;
  readonly parseExactSucceeded: unknown;
  readonly dateMatches: unknown;
  readonly offsetMatches: unknown;
  readonly beforeDeadline: unknown;
}

function stage6CloseoutPowerShellPreflightScript(): string {
  const root = existsSync(resolve(STAGE_6_CLOSEOUT_ARCHIVE_ROOT))
    ? STAGE_6_CLOSEOUT_ARCHIVE_ROOT
    : STAGE_6_CLOSEOUT_ROOT;
  const implement = readText(`${root}/implement.md`);
  const start = implement.indexOf(STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_BEGIN);
  const end = implement.indexOf(STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_END);
  assert.ok(start >= 0, "PowerShell preflight begin marker must exist");
  assert.ok(end > start, "PowerShell preflight end marker must follow begin");
  const script = implement
    .slice(start + STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_BEGIN.length, end)
    .trim();
  assert.equal(
    script.includes("task.py archive"),
    false,
    "execution-level preflight must never archive the task",
  );
  if (root === STAGE_6_CLOSEOUT_ARCHIVE_ROOT) {
    return replaceStage6CloseoutPowerShellPreflightOnce(
      script,
      `$taskPath = '${STAGE_6_CLOSEOUT_ROOT}/task.json'`,
      `$taskPath = '${STAGE_6_CLOSEOUT_ARCHIVE_ROOT}/task.json'`,
    );
  }
  return script;
}

function executeStage6CloseoutPowerShellPreflight(
  script: string,
  culture?: string,
): Stage6CloseoutPowerShellPreflightEvidence {
  const culturePrefix =
    culture === undefined
      ? ""
      : [
          `$culture = [Globalization.CultureInfo]::GetCultureInfo('${culture}')`,
          "[Threading.Thread]::CurrentThread.CurrentCulture = $culture",
          "[Threading.Thread]::CurrentThread.CurrentUICulture = $culture",
        ].join("\n");
  const output = execFileSync(
    process.env.BRILLIANT_RKP2_PWSH ?? "pwsh",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `${culturePrefix}\n${script}`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  ).trim();
  const result = JSON.parse(lines(output).at(-1) ?? "") as unknown;
  assert.ok(
    result !== null && typeof result === "object" && !Array.isArray(result),
  );
  return result as Stage6CloseoutPowerShellPreflightEvidence;
}

function assertStage6CloseoutPowerShellPreflightEvidence(
  evidence: Stage6CloseoutPowerShellPreflightEvidence,
  expectedCulture?: string,
): void {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(typeof evidence.pwshVersion, "string");
  assert.match(evidence.pwshVersion as string, /^(?:[7-9]|[1-9]\d+)\./u);
  if (expectedCulture !== undefined) {
    assert.equal(evidence.currentCulture, expectedCulture);
  }
  assert.equal(evidence.archiveDateType, "System.String");
  assert.equal(evidence.deadlineType, "System.String");
  assert.equal(evidence.parseExactSucceeded, true);
  assert.equal(evidence.dateMatches, true);
  assert.equal(evidence.offsetMatches, true);
  assert.equal(evidence.beforeDeadline, true);
}

function replaceStage6CloseoutPowerShellPreflightOnce(
  script: string,
  expected: string,
  replacement: string,
): string {
  assert.equal(
    script.split(expected).length,
    2,
    `PowerShell preflight mutation target must occur exactly once: ${expected}`,
  );
  return script.replace(expected, replacement);
}

interface Stage6CloseoutClockProjection {
  readonly archiveMonth: unknown;
  readonly historicalArchiveDate: unknown;
  readonly historicalArchiveDeadline: unknown;
  readonly historicalArchiveClockScope: unknown;
  readonly closeoutArchiveRoot: unknown;
  readonly closeoutArchiveDate: unknown;
  readonly closeoutArchiveDeadline: unknown;
  readonly closeoutArchiveClockOwner: unknown;
  readonly closeoutCompletedAt: unknown;
}

function assertStage6CloseoutClockProjection(
  projection: Stage6CloseoutClockProjection,
  closeoutArchived: boolean,
): void {
  assert.equal(projection.archiveMonth, "2026-09");
  assert.equal(
    projection.historicalArchiveDate,
    STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DATE,
    "semantic child and Stage 6 historical archive date must remain 2026-09-01",
  );
  assert.equal(
    projection.historicalArchiveDeadline,
    STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DEADLINE,
  );
  assert.equal(
    projection.historicalArchiveClockScope,
    "historical_semantic_child_and_stage6_native_archive_window_only_not_l6",
  );
  assert.equal(projection.closeoutArchiveRoot, STAGE_6_CLOSEOUT_ARCHIVE_ROOT);
  assert.equal(projection.closeoutArchiveDate, STAGE_6_CLOSEOUT_ARCHIVE_DATE);
  assert.equal(
    projection.closeoutArchiveDeadline,
    STAGE_6_CLOSEOUT_ARCHIVE_DEADLINE,
  );
  assert.equal(projection.closeoutArchiveClockOwner, "L6_closeout_only");
  assert.equal(
    projection.closeoutCompletedAt,
    closeoutArchived ? STAGE_6_CLOSEOUT_ARCHIVE_DATE : null,
    "closeout completedAt must match only the L6 execution date",
  );
}

interface Stage6CloseoutIntegrationReviewProjection {
  readonly candidateCommit: unknown;
  readonly P0: unknown;
  readonly P1: unknown;
  readonly P2: unknown;
  readonly verdict: unknown;
  readonly reviewTaskId: unknown;
  readonly reviewThreadId: unknown;
  readonly reviewTurnId: unknown;
  readonly reviewGeneratedAuthorization: unknown;
}

function assertStage6CloseoutIntegrationReviewProjection(
  projection: Stage6CloseoutIntegrationReviewProjection,
): void {
  assert.equal(projection.candidateCommit, STAGE_6_CLOSEOUT_L5_INTEGRATION_COMMIT);
  assert.equal(projection.P0, 0);
  assert.equal(projection.P1, 1);
  assert.equal(projection.P2, 0);
  assert.equal(
    projection.verdict,
    "RETURN FOR ONE BOUNDED L6 CLOCK/DATE CONTRACT REPAIR",
  );
  assert.equal(
    projection.reviewTaskId,
    "01a05f7a-de45-77c3-9287-88e354d2fd6f",
  );
  assert.equal(projection.reviewThreadId, "01a05f7a-de45-77c3-9287-88e354d2fd6f");
  assert.equal(projection.reviewTurnId, "01a05f7a-e32b-7b71-8497-d41987574d0d");
  assert.equal(
    projection.reviewGeneratedAuthorization,
    false,
    "integration review must remain evidence only",
  );
}

interface Stage6CloseoutPowerShellPreflightReviewProjection {
  readonly candidateCommit: unknown;
  readonly P0: unknown;
  readonly P1: unknown;
  readonly P2: unknown;
  readonly verdict: unknown;
  readonly reviewTaskId: unknown;
  readonly reviewThreadId: unknown;
  readonly reviewTurnId: unknown;
  readonly finding: unknown;
  readonly reviewGeneratedAuthorization: unknown;
}

function assertStage6CloseoutPowerShellPreflightReviewProjection(
  projection: Stage6CloseoutPowerShellPreflightReviewProjection,
): void {
  assert.equal(
    projection.candidateCommit,
    STAGE_6_CLOSEOUT_L6_CLOCK_DATE_REPAIR_COMMIT,
  );
  assert.equal(projection.P0, 0);
  assert.equal(projection.P1, 1);
  assert.equal(projection.P2, 0);
  assert.equal(
    projection.verdict,
    "RETURN FOR ONE BOUNDED POWERSHELL PREFLIGHT REPAIR",
  );
  assert.equal(projection.reviewTaskId, "01a05f7a-de45-77c3-9287-88e354d2fd6f");
  assert.equal(
    projection.reviewThreadId,
    "01a05f7a-de45-77c3-9287-88e354d2fd6f",
  );
  assert.equal(
    projection.reviewTurnId,
    "01a05fa0-26c7-7b81-94f0-eb2291db4ec1",
  );
  assert.equal(
    projection.finding,
    "plain_ConvertFrom_Json_auto_converts_ISO_deadline_to_System_DateTime_before_DateTimeOffset_ParseExact",
  );
  assert.equal(
    projection.reviewGeneratedAuthorization,
    false,
    "PowerShell preflight review must remain evidence only",
  );
}

function assertStage6CloseoutFrozenParentChain(
  projections: readonly ExactCommitParentProjection[],
): void {
  assert.deepEqual(
    projections,
    STAGE_6_CLOSEOUT_FROZEN_PARENT_CHAIN.map(({ commit, parent }) => ({
      commit,
      parents: [parent],
    })),
  );
}

interface Stage6CloseoutLifecycleProjection {
  readonly semanticLocation: "active" | "archive";
  readonly semanticStatus: unknown;
  readonly semanticCompletedAt: unknown;
  readonly semanticParent: unknown;
  readonly semanticChildren: unknown;
  readonly semanticImplementationStage: unknown;
  readonly semanticNextGate: unknown;
  readonly semanticParentOwnership: unknown;
  readonly semanticCurrentPlanningOwner: unknown;
  readonly semanticActiveImplementationOwner: unknown;
  readonly semanticLiveOwner: unknown;
  readonly semanticActiveAuthorityPresent: unknown;
  readonly semanticArchiveAuthorityPresent: unknown;
  readonly stage6Location: "active" | "archive";
  readonly stage6Status: unknown;
  readonly stage6CompletedAt: unknown;
  readonly stage6Parent: unknown;
  readonly stage6Children: unknown;
  readonly stage6CurrentPlanningChild: unknown;
  readonly stage6CurrentImplementationChild: unknown;
  readonly stage6ImplementationStage: unknown;
  readonly stage6NextGate: unknown;
  readonly stage6ActiveAuthorityPresent: unknown;
  readonly stage6ArchiveAuthorityPresent: unknown;
  readonly closeoutLocation: "active" | "archive";
  readonly closeoutStatus: unknown;
  readonly closeoutCompletedAt: unknown;
  readonly closeoutImplementationStage: unknown;
  readonly closeoutImplementationReview: unknown;
  readonly closeoutIntegrationReview: unknown;
  readonly closeoutNextGate: unknown;
  readonly closeoutProductionAuthorized: unknown;
  readonly closeoutPlanningAuthority: unknown;
  readonly closeoutStage6AcceptanceAuthorized: unknown;
  readonly closeoutStage6ArchiveAuthorized: unknown;
  readonly closeoutCandidateReady: unknown;
  readonly closeoutArchiveCandidateReview: unknown;
  readonly closeoutIntegrationAuthorized: unknown;
  readonly closeoutIntegrationCompleted: unknown;
  readonly closeoutCurrentAuthorityOwnerBranch: unknown;
  readonly closeoutCurrentAuthorityOwnerWorktree: unknown;
  readonly closeoutFrozenSourceBranch: unknown;
  readonly closeoutFrozenSourceWorktree: unknown;
  readonly closeoutFrozenSourceHead: unknown;
  readonly closeoutIntegrationTargetBranch: unknown;
  readonly closeoutIntegrationTargetWorktree: unknown;
  readonly closeoutIntegrationTargetPreHead: unknown;
  readonly closeoutIntegrationCandidate: unknown;
  readonly closeoutIntegrationMode: unknown;
  readonly closeoutL4FastForwardCompleted: unknown;
  readonly closeoutL4NoMergeCommit: unknown;
  readonly closeoutL3AuditCandidate: unknown;
  readonly closeoutL3AuditP0: unknown;
  readonly closeoutL3AuditP1: unknown;
  readonly closeoutL3AuditP2: unknown;
  readonly closeoutL3AuditVerdict: unknown;
  readonly closeoutL3AuditTaskId: unknown;
  readonly closeoutL3AuditThreadId: unknown;
  readonly closeoutL3AuditTurnId: unknown;
  readonly closeoutL3AuditReviewGeneratedAuthorization: unknown;
  readonly closeoutL3AuditAuthorizationSource: unknown;
  readonly closeoutL6DateRepairCandidateReady: unknown;
  readonly closeoutL6PowerShellPreflightRepairCandidateReady: unknown;
  readonly closeoutL6ExecutionAuthorized: unknown;
  readonly closeoutL6Started: unknown;
  readonly closeoutL6Completed: unknown;
  readonly closeoutTerminalProjectionReview: unknown;
  readonly closeoutActiveAuthorityPresent: unknown;
  readonly closeoutArchiveAuthorityPresent: unknown;
  readonly closeoutAcceptanceAuthorized: unknown;
  readonly closeoutArchiveAuthorized: unknown;
  readonly rkp2Status: unknown;
  readonly rkp2Parent: unknown;
  readonly rkp2Children: unknown;
  readonly rkp2CurrentPlanningChild: unknown;
  readonly rkp2CurrentImplementationChild: unknown;
  readonly rkp2ImplementationStage: unknown;
  readonly rkp2NextGate: unknown;
  readonly rkp2CloseoutStatus: unknown;
  readonly rkp2CloseoutImplementationStage: unknown;
  readonly rkp2CloseoutNextGate: unknown;
  readonly rkp2CloseoutIntegrationCompleted: unknown;
  readonly rkp2CloseoutIntegrationReview: unknown;
  readonly rkp2CloseoutL6Completed: unknown;
  readonly rkp2CloseoutTerminalProjectionReview: unknown;
  readonly rkp2Stage6Completed: unknown;
  readonly s62Started: unknown;
  readonly s63Started: unknown;
  readonly defaultRuntime: unknown;
  readonly rustStatus: unknown;
  readonly rustParent: unknown;
  readonly rustChildren: unknown;
  readonly rustCurrentPlanningChild: unknown;
  readonly rustCurrentImplementationChild: unknown;
  readonly rustActiveImplementationChild: unknown;
  readonly rustRkp2Status: unknown;
  readonly rustNextGate: unknown;
  readonly rustCloseoutStatus: unknown;
  readonly rustCloseoutImplementationStage: unknown;
  readonly rustCloseoutNextGate: unknown;
  readonly rustCloseoutIntegrationCompleted: unknown;
  readonly rustCloseoutIntegrationReview: unknown;
  readonly rustCloseoutL6Completed: unknown;
  readonly rustCloseoutTerminalProjectionReview: unknown;
  readonly rustRkp2Stage6Completed: unknown;
  readonly rustS62Started: unknown;
  readonly rustS63Started: unknown;
  readonly rustDefaultRuntime: unknown;
  readonly rustRkp3ThroughRkp9Created: unknown;
  readonly pushAuthorized: unknown;
  readonly officialMeasurementAuthorized: unknown;
  readonly qualificationAuthorized: unknown;
  readonly runtimeSwitchAuthorized: unknown;
  readonly rkp3CreationAuthorized: unknown;
}

function assertStage6CloseoutLifecycleProjection(
  projection: Stage6CloseoutLifecycleProjection,
  phase: Stage6CloseoutPhase,
): void {
  const semanticArchived =
    phase === "semantic-child-archived" ||
    phase === "stage6-archived" ||
    phase === "integrated" ||
    phase === "closeout-archived";
  const stage6Archived =
    phase === "stage6-archived" ||
    phase === "integrated" ||
    phase === "closeout-archived";
  const integrated = phase === "integrated" || phase === "closeout-archived";
  const closeoutArchived = phase === "closeout-archived";
  assert.equal(projection.semanticLocation, semanticArchived ? "archive" : "active");
  assert.equal(projection.semanticStatus, semanticArchived ? "completed" : "in_progress");
  if (semanticArchived) {
    assert.equal(projection.semanticCompletedAt, "2026-09-01");
    assert.equal(
      projection.semanticParent,
      "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
    );
    assert.deepEqual(projection.semanticChildren, []);
    assert.equal(
      projection.semanticImplementationStage,
      "accepted_archived_completed_historical_no_live_gate",
    );
    assert.equal(projection.semanticNextGate, "completed_historical_no_live_gate");
    assert.equal(
      projection.semanticParentOwnership,
      "archived_lineage_evidence_only_stage6_and_semantic_child_completed_historical_no_live_gate",
    );
    assert.equal(projection.semanticCurrentPlanningOwner, null);
    assert.equal(projection.semanticActiveImplementationOwner, null);
    assert.equal(projection.semanticLiveOwner, null);
    assert.equal(projection.semanticActiveAuthorityPresent, false);
    assert.equal(projection.semanticArchiveAuthorityPresent, true);
  }
  assert.equal(projection.stage6Location, stage6Archived ? "archive" : "active");
  assert.equal(projection.stage6Status, stage6Archived ? "completed" : "in_progress");
  if (stage6Archived) {
    assert.equal(projection.stage6CompletedAt, "2026-09-01");
    assert.equal(
      projection.stage6Parent,
      "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
    );
    assert.deepEqual(projection.stage6Children, STAGE_6_ARCHIVED_CHILDREN);
    assert.equal(projection.stage6CurrentPlanningChild, null);
    assert.equal(projection.stage6CurrentImplementationChild, null);
    assert.equal(
      projection.stage6ImplementationStage,
      "accepted_archived_completed_historical_no_live_gate",
    );
    assert.equal(projection.stage6NextGate, "completed_historical_no_live_gate");
    assert.equal(projection.stage6ActiveAuthorityPresent, false);
    assert.equal(projection.stage6ArchiveAuthorityPresent, true);
  }
  assert.equal(projection.closeoutLocation, closeoutArchived ? "archive" : "active");
  assert.equal(
    projection.closeoutStatus,
    phase === "planning" ? "planning" : closeoutArchived ? "completed" : "in_progress",
  );
  if (phase === "integrated") {
    assert.equal(
      projection.closeoutImplementationStage,
      "bounded_PowerShell_preflight_repair_candidate_ready_for_targeted_independent_rereview",
    );
    assert.equal(
      projection.closeoutImplementationReview,
      "passed_dedicated_independent_stage6_archive_candidate_review",
    );
    assert.equal(
      projection.closeoutIntegrationReview,
      "targeted_L6_clock_date_contract_rereview_returned_P0_0_P1_1_P2_0_for_one_bounded_PowerShell_preflight_repair",
    );
    assert.equal(
      projection.closeoutNextGate,
      "targeted_independent_PowerShell_preflight_repair_rereview_pending",
    );
    assert.equal(projection.closeoutL6DateRepairCandidateReady, true);
    assert.equal(
      projection.closeoutL6PowerShellPreflightRepairCandidateReady,
      true,
    );
    assert.equal(
      projection.closeoutL6ExecutionAuthorized,
      false,
      "L6 execution must remain unauthorized during the date repair",
    );
    assert.equal(
      projection.closeoutL6Started,
      false,
      "L6 must remain unstarted during the date repair",
    );
  }
  if (integrated) {
    assert.equal(
      projection.closeoutCurrentAuthorityOwnerBranch,
      STAGE_6_CLOSEOUT_TARGET_BRANCH,
      "integrated authority must belong only to the original RKP-2 branch",
    );
    assert.equal(
      projection.closeoutCurrentAuthorityOwnerWorktree,
      STAGE_6_CLOSEOUT_TARGET_WORKTREE,
      "integrated authority must belong only to the original RKP-2 worktree",
    );
    assert.equal(projection.closeoutFrozenSourceBranch, STAGE_6_CLOSEOUT_SOURCE_BRANCH);
    assert.equal(
      projection.closeoutFrozenSourceWorktree,
      STAGE_6_CLOSEOUT_SOURCE_WORKTREE,
    );
    assert.equal(
      projection.closeoutFrozenSourceHead,
      STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE,
      "the L3 audit source must remain frozen at the exact reviewed candidate",
    );
    assert.equal(
      projection.closeoutIntegrationTargetBranch,
      STAGE_6_CLOSEOUT_TARGET_BRANCH,
    );
    assert.equal(
      projection.closeoutIntegrationTargetWorktree,
      STAGE_6_CLOSEOUT_TARGET_WORKTREE,
    );
    assert.equal(
      projection.closeoutIntegrationTargetPreHead,
      STAGE_6_CLOSEOUT_INTEGRATION_PRE_HEAD,
    );
    assert.equal(
      projection.closeoutIntegrationCandidate,
      STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE,
    );
    assert.equal(projection.closeoutIntegrationMode, "ff-only");
    assert.equal(projection.closeoutL4FastForwardCompleted, true);
    assert.equal(
      projection.closeoutL4NoMergeCommit,
      true,
      "L4 must not create a merge commit",
    );
    assert.equal(
      projection.closeoutL3AuditCandidate,
      STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE,
    );
    assert.equal(projection.closeoutL3AuditP0, 0);
    assert.equal(projection.closeoutL3AuditP1, 0);
    assert.equal(projection.closeoutL3AuditP2, 0);
    assert.equal(
      projection.closeoutL3AuditVerdict,
      "PASS FOR OWNER-AUTHORIZED FF-ONLY INTEGRATION",
    );
    assert.equal(
      projection.closeoutL3AuditTaskId,
      "01a05d4e-5a18-7923-8aae-bcc30ad95c60",
    );
    assert.equal(
      projection.closeoutL3AuditThreadId,
      "01a05d4e-5a18-7923-8aae-bcc30ad95c60",
    );
    assert.equal(
      projection.closeoutL3AuditTurnId,
      "01a05da1-f9dc-7a72-8c11-75985d5a1e19",
    );
    assert.equal(
      projection.closeoutL3AuditReviewGeneratedAuthorization,
      false,
      "the independent PASS must remain evidence only",
    );
    assert.equal(
      projection.closeoutL3AuditAuthorizationSource,
      "prior_scope_limited_user_lifecycle_continuation",
    );
  }
  if (closeoutArchived) {
    assert.equal(projection.closeoutCompletedAt, STAGE_6_CLOSEOUT_ARCHIVE_DATE);
    assert.equal(
      projection.closeoutImplementationStage,
      "accepted_archived_completed_historical_no_live_gate",
    );
    assert.equal(
      projection.closeoutImplementationReview,
      "passed_targeted_independent_PowerShell_preflight_repair_rereview",
    );
    assert.equal(
      projection.closeoutIntegrationReview,
      "passed_targeted_independent_PowerShell_preflight_repair_rereview",
    );
    assert.equal(projection.closeoutNextGate, "completed_historical_no_live_gate");
    assert.equal(projection.closeoutL6DateRepairCandidateReady, true);
    assert.equal(projection.closeoutL6PowerShellPreflightRepairCandidateReady, true);
    assert.equal(projection.closeoutL6ExecutionAuthorized, true);
    assert.equal(projection.closeoutL6Started, true);
    assert.equal(projection.closeoutL6Completed, true);
    assert.equal(
      projection.closeoutTerminalProjectionReview,
      "pending_dedicated_independent_terminal_projection_review",
    );
    assert.equal(projection.closeoutActiveAuthorityPresent, false);
    assert.equal(projection.closeoutArchiveAuthorityPresent, true);
  }
  assert.equal(
    projection.closeoutProductionAuthorized,
    false,
    "closeout production implementation authorization must remain false",
  );
  assert.equal(
    projection.closeoutPlanningAuthority,
    phase === "planning" ? undefined : STAGE_6_CLOSEOUT_PLANNING_AUTHORITY,
  );
  assert.equal(
    projection.closeoutStage6AcceptanceAuthorized,
    stage6Archived || phase === "semantic-child-archived",
  );
  assert.equal(
    projection.closeoutStage6ArchiveAuthorized,
    stage6Archived || phase === "semantic-child-archived",
  );
  assert.equal(projection.closeoutCandidateReady, stage6Archived);
  assert.equal(
    projection.closeoutArchiveCandidateReview,
    stage6Archived
      ? integrated
        ? "passed_dedicated_independent_stage6_archive_candidate_review"
        : "pending_targeted_independent_l3_rereview_after_test_only_P2_negative_matrix_repair"
      : "pending_not_started",
  );
  assert.equal(
    projection.closeoutIntegrationAuthorized,
    integrated,
    "closeout integration authorization must match the lifecycle phase",
  );
  assert.equal(
    projection.closeoutIntegrationCompleted,
    integrated ? true : undefined,
    "closeout integration completion must match the lifecycle phase",
  );
  assert.equal(projection.closeoutAcceptanceAuthorized, closeoutArchived);
  assert.equal(projection.closeoutArchiveAuthorized, closeoutArchived);
  assert.equal(projection.rkp2Status, "in_progress");
  assert.equal(
    projection.rkp2Parent,
    "08-15-core-rust-runtime-performance-remediation",
  );
  assert.deepEqual(projection.rkp2Children, RKP_2_CURRENT_CHILDREN);
  assert.equal(projection.rkp2CurrentPlanningChild, null);
  assert.equal(
    projection.rkp2CurrentImplementationChild,
    closeoutArchived
      ? null
      : stage6Archived
        ? "09-01-rkp-2-stage-6-acceptance-archive-integration-closeout"
        : "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
  );
  if (phase === "stage6-archived") {
    assert.equal(
      projection.rkp2NextGate,
      "targeted_independent_l3_bounded_repair_rereview_pending",
    );
  } else if (phase === "integrated") {
    assert.equal(
      projection.rkp2ImplementationStage,
      "stage_6_closeout_L5_integrated_projection_candidate_ready_for_dedicated_independent_integration_review_rkp2_paused_before_s6_2",
    );
    assert.equal(
      projection.rkp2NextGate,
      "dedicated_independent_integration_projection_review_pending",
    );
    assert.equal(projection.rkp2CloseoutStatus, "in_progress");
    assert.equal(
      projection.rkp2CloseoutImplementationStage,
      "L5_integrated_projection_candidate_ready_for_dedicated_independent_integration_review",
    );
    assert.equal(
      projection.rkp2CloseoutNextGate,
      "dedicated_independent_integration_projection_review_pending",
    );
    assert.equal(projection.rkp2CloseoutIntegrationCompleted, true);
    assert.equal(
      projection.rkp2CloseoutIntegrationReview,
      "pending_dedicated_independent_integration_projection_review",
    );
  } else if (closeoutArchived) {
    assert.equal(
      projection.rkp2ImplementationStage,
      "stage_6_closeout_accepted_archived_completed_rkp2_paused_before_s6_2",
    );
    assert.equal(
      projection.rkp2NextGate,
      "explicit_user_authorization_for_rkp2_s6_2_resume",
    );
    assert.equal(projection.rkp2CloseoutStatus, "completed");
    assert.equal(
      projection.rkp2CloseoutImplementationStage,
      "accepted_archived_completed_historical_no_live_gate",
    );
    assert.equal(projection.rkp2CloseoutNextGate, "completed_historical_no_live_gate");
    assert.equal(projection.rkp2CloseoutIntegrationCompleted, true);
    assert.equal(
      projection.rkp2CloseoutIntegrationReview,
      "passed_targeted_independent_PowerShell_preflight_repair_rereview",
    );
    assert.equal(projection.rkp2CloseoutL6Completed, true);
    assert.equal(
      projection.rkp2CloseoutTerminalProjectionReview,
      "pending_dedicated_independent_terminal_projection_review",
    );
  }
  assert.equal(
    projection.rkp2Stage6Completed,
    false,
    "RKP-2 Stage 6 completion must remain false before qualification",
  );
  assert.equal(projection.s62Started, false);
  assert.equal(projection.s63Started, false);
  assert.equal(
    projection.defaultRuntime,
    "typescript",
    "RKP-2 default runtime must remain TypeScript before cutover",
  );
  assert.equal(projection.rustStatus, "planning");
  assert.equal(
    projection.rustParent,
    "07-29-core-vnext-product-ready-extensible-kernel-completion",
    "Rust parent must remain on the accepted architecture lineage",
  );
  assert.deepEqual(projection.rustChildren, RUST_PARENT_CURRENT_CHILDREN);
  assert.equal(
    projection.rustCurrentPlanningChild,
    null,
    "Rust parent current planning child must remain null",
  );
  assert.equal(
    projection.rustCurrentImplementationChild,
    "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
  );
  assert.equal(
    projection.rustActiveImplementationChild,
    "08-24-rkp-2-indexed-live-score-store-load-encode-parity",
  );
  if (phase === "stage6-archived") {
    assert.equal(
      projection.rustNextGate,
      "stage6_closeout_targeted_independent_l3_bounded_repair_rereview_pending",
    );
  } else if (phase === "integrated") {
    assert.equal(
      projection.rustRkp2Status,
      "in_progress_stage_6_closeout_L5_integrated_projection_candidate_ready_for_dedicated_independent_integration_review",
    );
    assert.equal(
      projection.rustNextGate,
      "stage6_closeout_dedicated_independent_integration_projection_review_pending",
    );
    assert.equal(projection.rustCloseoutStatus, "in_progress");
    assert.equal(
      projection.rustCloseoutImplementationStage,
      "L5_integrated_projection_candidate_ready_for_dedicated_independent_integration_review",
    );
    assert.equal(
      projection.rustCloseoutNextGate,
      "dedicated_independent_integration_projection_review_pending",
    );
    assert.equal(projection.rustCloseoutIntegrationCompleted, true);
    assert.equal(
      projection.rustCloseoutIntegrationReview,
      "pending_dedicated_independent_integration_projection_review",
    );
  } else if (closeoutArchived) {
    assert.equal(
      projection.rustRkp2Status,
      "in_progress_stage_6_closeout_accepted_archived_completed_paused_before_s6_2",
    );
    assert.equal(
      projection.rustNextGate,
      "explicit_user_authorization_for_rkp2_s6_2_resume",
    );
    assert.equal(projection.rustCloseoutStatus, "completed");
    assert.equal(
      projection.rustCloseoutImplementationStage,
      "accepted_archived_completed_historical_no_live_gate",
    );
    assert.equal(projection.rustCloseoutNextGate, "completed_historical_no_live_gate");
    assert.equal(projection.rustCloseoutIntegrationCompleted, true);
    assert.equal(
      projection.rustCloseoutIntegrationReview,
      "passed_targeted_independent_PowerShell_preflight_repair_rereview",
    );
    assert.equal(projection.rustCloseoutL6Completed, true);
    assert.equal(
      projection.rustCloseoutTerminalProjectionReview,
      "pending_dedicated_independent_terminal_projection_review",
    );
  }
  assert.equal(
    projection.rustRkp2Stage6Completed,
    false,
    "Rust parent RKP-2 Stage 6 completion must remain false before qualification",
  );
  assert.equal(projection.rustS62Started, false);
  assert.equal(projection.rustS63Started, false);
  assert.equal(
    projection.rustDefaultRuntime,
    "typescript",
    "Rust parent default runtime projection must remain TypeScript before cutover",
  );
  assert.equal(
    projection.rustRkp3ThroughRkp9Created,
    false,
    "Rust parent must record that RKP-3 through RKP-9 are not created",
  );
  assert.equal(
    projection.pushAuthorized,
    false,
    "closeout push authorization must remain false",
  );
  assert.equal(
    projection.officialMeasurementAuthorized,
    false,
    "closeout official measurement authorization must remain false",
  );
  assert.equal(
    projection.qualificationAuthorized,
    false,
    "closeout qualification authorization must remain false",
  );
  assert.equal(
    projection.runtimeSwitchAuthorized,
    false,
    "closeout runtime switch authorization must remain false",
  );
  assert.equal(
    projection.rkp3CreationAuthorized,
    false,
    "closeout RKP-3 creation authorization must remain false",
  );
}

interface WorkspaceLawJsonlProjectionContract {
  readonly sourceRows: number;
  readonly sourceBytes: number;
  readonly sourceSha256: string;
  readonly successorRows: number;
  readonly successorBytes: number;
  readonly successorSha256: string;
  readonly removedPaths: readonly string[];
}

function projectWorkspaceLawTargetJsonlSuccessor(
  name: "implement.jsonl" | "check.jsonl",
  contract: WorkspaceLawJsonlProjectionContract,
): string {
  const path = `${STAGE_6_E3_LAW_TASK_ROOT}/${name}`;
  const source = gitTextAt(STAGE_6_E3_LAW_CLOSEOUT_BASE, path)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  assert.equal(lines(source).length, contract.sourceRows);
  assert.equal(Buffer.byteLength(source, "utf8"), contract.sourceBytes);
  assert.equal(sha256(source), contract.sourceSha256);
  const removed = new Set(contract.removedPaths);
  assert.equal(removed.size, 3);
  const successorRows = lines(source).filter((line) => {
    const row = JSON.parse(line) as { readonly file?: unknown };
    assert.equal(typeof row.file, "string");
    return !removed.has(row.file as string);
  });
  assert.equal(lines(source).length - successorRows.length, 3);
  const successor = `${successorRows.join("\n")}\n`;
  assert.equal(successorRows.length, contract.successorRows);
  assert.equal(Buffer.byteLength(successor, "utf8"), contract.successorBytes);
  assert.equal(sha256(successor), contract.successorSha256);
  const seen = new Set<string>();
  for (const line of successorRows) {
    const row = JSON.parse(line) as { readonly file?: unknown };
    assert.equal(typeof row.file, "string");
    const rowPath = row.file as string;
    assert.equal(rowPath.startsWith(`${STAGE_6_E3_LAW_TASK_ROOT}/`), false);
    assert.equal(seen.has(rowPath), false, `${name} repeats ${rowPath}`);
    seen.add(rowPath);
    assert.equal(jsonlReferenceExists(rowPath), true, `${name} references ${rowPath}`);
  }
  return successor;
}

function canonicalizeWorkspaceLawCloseoutQ3AuditRecord(
  record: unknown,
  expectedCandidateCommit: string,
  expectedTechnicalCommit: string,
): string {
  assert.ok(record !== null && typeof record === "object");
  assert.equal(Array.isArray(record), false);
  const value = record as Readonly<Record<string, unknown>>;
  assert.deepEqual(Object.keys(value), STAGE_6_E3_LAW_CLOSEOUT_Q3_AUDIT_KEYS);
  assert.equal(value.schemaVersion, 1);
  assert.equal(typeof value.reviewTaskId, "string");
  assert.equal((value.reviewTaskId as string).length > 0, true);
  assert.equal(typeof value.reviewTurnId, "string");
  assert.equal((value.reviewTurnId as string).length > 0, true);
  assert.match(expectedCandidateCommit, /^[0-9a-f]{40}$/u);
  assert.match(expectedTechnicalCommit, /^[0-9a-f]{40}$/u);
  assert.equal(value.candidateCommit, expectedCandidateCommit);
  assert.equal(value.technicalCommit, expectedTechnicalCommit);
  assert.equal(
    value.verdict,
    "PASS_READY_FOR_OWNER_CLOSEOUT_AND_NATIVE_CLOSURE_ARCHIVE",
  );
  assert.equal(value.P0, 0);
  assert.equal(value.P1, 0);
  assert.equal(value.P2, 0);
  return JSON.stringify({
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
}

function assertSingleWorkspaceLawCloseoutQ3AuditRecordOwner(
  records: readonly unknown[],
  expectedCandidateCommit: string,
  expectedTechnicalCommit: string,
): string {
  const owners = records.filter((record) => record !== undefined);
  assert.equal(owners.length, 1, "Q3 audit record must have one structured owner");
  return canonicalizeWorkspaceLawCloseoutQ3AuditRecord(
    owners[0],
    expectedCandidateCommit,
    expectedTechnicalCommit,
  );
}

function assertWorkspaceLawArchiveClockContract(input: {
  readonly month: string;
  readonly date: string;
  readonly time: string;
}): void {
  assert.equal(input.month, "2026-09");
  assert.equal(input.date, "2026-09-01");
  assert.match(input.time, /^\d{2}:\d{2}:\d{2}$/u);
  assert.ok(input.time < "23:50:00", "native archive preflight must retain rollover margin");
}

function assertWorkspaceLawCloseoutLifecycleProjection(
  projection: WorkspaceLawCloseoutLifecycleProjection,
  phase: E3WorkspaceLawCloseoutPhase,
): void {
  const ownerAccepted =
    phase === "owner-acceptance" ||
    phase === "target-archived" ||
    phase === "closure-archived";
  const targetArchived = phase === "target-archived" || phase === "closure-archived";
  const closureArchived = phase === "closure-archived";
  assert.equal(projection.targetLocation, targetArchived ? "archive" : "active");
  assert.equal(projection.targetStatus, targetArchived ? "completed" : "in_progress");
  assert.equal(projection.targetCompletedAt, targetArchived ? "2026-09-01" : null);
  assert.equal(projection.targetImplementationCandidateReady, true);
  assert.equal(
    projection.targetImplementationStage,
    targetArchived
      ? "accepted_archived_completed_historical_no_live_gate"
      : ownerAccepted
        ? "owner_accepted_archive_authorized_clock_preflight_pending"
        : "P4_closure_archived_completed_owner_decision_for_e3_law_parent_pending",
  );
  assert.equal(projection.targetImplementationReview, STAGE_6_E3_AUDIT_BOUND_REVIEW_PASS);
  assert.equal(
    projection.targetNextGate,
    targetArchived
      ? "completed_historical_no_live_gate"
      : ownerAccepted
        ? "native_e3_workspace_law_archive_clock_preflight_required"
        : "explicit_owner_decision_for_e3_law_parent_acceptance_archive",
  );
  assert.equal(projection.targetAcceptanceAuthorized, ownerAccepted);
  assert.equal(projection.targetArchiveAuthorized, ownerAccepted);
  canonicalizeE3AuditRecord(projection.targetAuditRecord);
  assert.equal(projection.targetAuditRecordBytes, STAGE_6_E3_AUDIT_RECORD_BYTES);
  assert.equal(projection.targetAuditRecordSha256, STAGE_6_E3_AUDIT_RECORD_SHA256);
  assert.equal(projection.targetDefaultRuntime, "typescript");
  assert.equal(projection.targetS62Started, false);
  assert.equal(projection.targetS63Started, false);
  assert.equal(projection.targetIntegrationAuthorized, false);
  assert.equal(projection.targetQualificationAuthorized, false);
  assert.equal(projection.targetRuntimeSwitchAuthorized, false);
  assert.equal(projection.targetPushAuthorized, false);
  assert.equal(projection.targetRkp3CreationAuthorized, false);

  assert.equal(projection.closureLocation, closureArchived ? "archive" : "active");
  assert.equal(
    projection.closureStatus,
    phase === "planning" ? "planning" : closureArchived ? "completed" : "in_progress",
  );
  assert.equal(projection.closureCompletedAt, closureArchived ? "2026-09-01" : null);
  assert.equal(projection.closureTaskStartRun, phase !== "planning");
  assert.equal(projection.closureProductionAuthorized, false);
  assert.equal(projection.closureUserAuthorized, phase !== "planning");
  assert.equal(
    projection.closureAcceptedPlanningAuthority,
    phase === "planning" ? undefined : STAGE_6_E3_LAW_CLOSEOUT_PLANNING_AUTHORITY,
  );
  assert.equal(
    projection.closureImplementationCandidateReady,
    phase === "planning" || targetArchived,
  );
  assert.equal(
    projection.closureImplementationReview,
    phase === "planning"
      ? "not_started"
      : phase === "activation"
        ? "pending_not_started"
        : phase === "owner-acceptance"
          ? "pending_Q3_target_archive_candidate_not_frozen"
          : closureArchived
            ? "passed_dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review"
            : "pending_dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review",
  );
  assert.equal(
    projection.closureNextGate,
    phase === "planning"
      ? "separate_user_implementation_authorization_for_bounded_Q0_through_Q3"
      : phase === "activation"
        ? "Q1T_archive_aware_workspace_law_technical_checkpoint"
        : phase === "owner-acceptance"
          ? "native_e3_workspace_law_archive_clock_preflight_required"
          : closureArchived
            ? "completed_historical_no_live_gate"
            : "dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review_pending",
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

  assert.equal(projection.stage6Status, "in_progress");
  assert.equal(
    projection.stage6CurrentPlanningChild,
    phase === "planning"
      ? "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure"
      : null,
  );
  assert.equal(
    projection.stage6CurrentImplementationChild,
    phase === "planning"
      ? "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair"
      : closureArchived
        ? null
        : "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure",
  );
  assert.equal(
    projection.stage6NextGate,
    phase === "planning"
      ? "separate_user_implementation_authorization_for_e3_workspace_law_acceptance_archive_closure"
      : phase === "activation"
        ? "Q1T_archive_aware_workspace_law_technical_checkpoint"
        : phase === "owner-acceptance"
          ? "native_e3_workspace_law_archive_clock_preflight_required"
          : closureArchived
            ? "explicit_owner_decision_for_stage6_parent_acceptance_archive"
            : "dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review_pending",
  );
  assert.equal(projection.stage6Q3AuditRecord, undefined);
  assert.equal(
    projection.stage6Q3AuditOwner,
    phase === "target-archived"
      ? `${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/task.json`
      : closureArchived
        ? `${STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT}/task.json`
        : undefined,
  );
  if (phase === "target-archived") {
    assert.equal(projection.stage6Q3AuditSha256, "pending");
    assert.equal(projection.closureQ3AuditRecord, undefined);
  } else if (!closureArchived) {
    assert.equal(projection.stage6Q3AuditSha256, undefined);
    assert.equal(projection.closureQ3AuditRecord, undefined);
  } else {
    assert.ok(
      projection.closureQ3AuditRecord !== null &&
        typeof projection.closureQ3AuditRecord === "object",
    );
    const record = projection.closureQ3AuditRecord as Readonly<
      Record<string, unknown>
    >;
    assert.equal(typeof record.candidateCommit, "string");
    assert.equal(typeof record.technicalCommit, "string");
    const canonical = assertSingleWorkspaceLawCloseoutQ3AuditRecordOwner(
      [projection.closureQ3AuditRecord, projection.stage6Q3AuditRecord],
      record.candidateCommit as string,
      record.technicalCommit as string,
    );
    assert.equal(projection.stage6Q3AuditSha256, sha256(canonical));
  }
  assert.equal(projection.stage6S61RetainedComplete, true);
  assert.equal(projection.stage6S62Started, false);
  assert.equal(projection.stage6S63Started, false);
  assert.equal(projection.stage6DefaultRuntime, "typescript");
  assert.equal(projection.stage6ArchiveAuthorized, false);
  assert.equal(projection.stage6OfficialMeasurementAuthorized, false);
  assert.equal(projection.stage6RuntimeSwitchAuthorized, false);
  assert.equal(projection.stage6PushAuthorized, false);
  assert.equal(projection.stage6Rkp3CreationAuthorized, false);
}

function assertQ4PrearchiveStatusEntries(
  entries: readonly string[],
  expectedPaths: readonly string[] = STAGE_6_E3_LAW_CLOSEOUT_Q4_STAGED_PATHS,
): void {
  assert.equal(entries.length, 6);
  const actualPaths = entries.map((entry) => {
    assert.equal(entry.startsWith("??"), false, "Q4 must reject untracked paths");
    assert.equal(entry.slice(0, 2), "M ", "Q4 requires staged M with blank worktree");
    assert.ok(entry.length >= 4);
    return entry.slice(3);
  });
  assert.deepEqual([...actualPaths].sort(), [...expectedPaths].sort());
}

function assertQ4ArchiveCommitMembership(
  parents: readonly string[],
  expectedQ3Head: string,
  rows: readonly string[],
): void {
  assert.deepEqual(parents, [expectedQ3Head]);
  const expectedRows = [
    ...STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.flatMap((artifact) => [
      `D\t${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/${artifact}`,
      `A\t${STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT}/${artifact}`,
    ]),
    ...STAGE_6_PARENT_LIFECYCLE_PATHS.map((path) => `M\t${path}`),
  ].sort();
  assert.deepEqual([...rows].sort(), expectedRows);
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
    const source = gitTextAt(STAGE_6_CLOSEOUT_BASE, path)
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
    assert.equal(
      sha256(source),
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
  assert.equal(new Set(implementation).size, 22);
  assert.equal(new Set(coordination).size, 23);

  assert.equal(git(["rev-parse", `${S63_ACTIVATION_HEAD}^`]), S63_PLANNING_HEAD);
  assert.doesNotThrow(() =>
    git(["merge-base", "--is-ancestor", S63_ACTIVATION_HEAD, "HEAD"]),
  );
  assert.equal(
    git(["rev-parse", `${POST_ARCHIVE_REPAIR_ACTIVATION_HEAD}^`]),
    POST_ARCHIVE_REPAIR_PLANNING_HEAD,
  );
  assert.doesNotThrow(() =>
    git([
      "merge-base",
      "--is-ancestor",
      POST_ARCHIVE_REPAIR_ACTIVATION_HEAD,
      "HEAD",
    ]),
  );
  const acceptedBaseline = committedChanges(
    IMPLEMENTATION_BASE,
    POST_ARCHIVE_REPAIR_ACTIVATION_HEAD,
  );

  const allowed = new Set<string>([
    ...implementation,
    ...coordination,
    ...CHILD_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_TECHNICAL_PATHS,
    ...PART_OWNER_REPAIR_LIFECYCLE_PATHS,
    ...RKP1A_TECHNICAL_PATHS,
    ...RKP1A_PLANNING_PATHS,
    ...acceptedBaseline,
    ...S63_AUTHORITY_PATHS,
    ...POST_ARCHIVE_REPAIR_ALLOWED_PATHS,
  ]);
  assert.equal(CHILD_TECHNICAL_PATHS.length, 4);
  assert.equal(CHILD_ACTIVE_LIFECYCLE_PATHS.length, 11);
  for (const path of currentImplementationChanges()) {
    assert.equal(allowed.has(path), true, `unreviewed implementation path: ${path}`);
  }
  assert.equal(allowed.has("src/forbidden-s6-3-drift.ts"), false);
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
      ) &&
      !RKP1A_TECHNICAL_PATHS.includes(
        path as (typeof RKP1A_TECHNICAL_PATHS)[number],
      )
    ) {
      assert.equal(readText(path), gitTextAt(PART_OWNER_REPAIR_ACCEPTED_CANDIDATE, path));
    }
  }
  assert.equal(Object.keys(PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS).length, 6);
  assert.deepEqual(Object.keys(PART_OWNER_REPAIR_ACCEPTED_TECHNICAL_BLOBS), [...PART_OWNER_REPAIR_TECHNICAL_PATHS]);
  const actual = currentPartOwnerRepairChanges();
  const expectedPartOwnerAndAcceptedDescendants = acceptedChangesWithS63Evidence(
    PART_OWNER_REPAIR_ACCEPTED_PLANNING_HEAD,
  );
  for (const path of actual) {
    assert.equal(
      expectedPartOwnerAndAcceptedDescendants.has(path),
      true,
      `unreviewed part-owner descendant path: ${path}`,
    );
  }
  assertExactPathSet(
    actual,
    [...expectedPartOwnerAndAcceptedDescendants],
    "accepted part-owner history plus pinned descendants and bounded S6.3",
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
  const task = JSON.parse(readCurrentRkp2Text(TASK_PATH)) as {
    meta?: { stage_6_completed?: unknown };
  };
  const s63Location = resolveExactlyOneTaskLocation(
    S63_TASK_ROOT,
    S63_ARCHIVE_ROOT,
    S63_TASK_MANIFEST,
  );
  const stage6Changes = currentStage6Changes();
  const allowed = acceptedChangesWithS63Evidence(STAGE_6_PREREQUISITE_HEAD);
  for (const path of stage6Changes) {
    assert.equal(allowed.has(path), true, `unreviewed Stage 6 path: ${path}`);
  }
  assertExactPathSet(
    stage6Changes,
    [...allowed],
    "accepted Stage 6 history plus bounded S6.3",
  );
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
  assert.equal(
    task.meta?.stage_6_completed === true,
    existsSync(resolve(`${s63Location.root}/research/implementation-evidence.md`)),
    "Stage 6 completion requires the frozen S6.3 evidence record",
  );

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

test("Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts", (context) => {
  assertFreshS62FWorkspaceLaw();
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
    gitTextAt(
      STAGE_6_CLOSEOUT_BASE,
      `${STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT}/task.json`,
    ),
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

  const evidenceSource = gitTextAt(STAGE_6_CLOSEOUT_BASE, STAGE_6_E3_EVIDENCE_PATH);
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

  const rkp2Task = JSON.parse(gitTextAt(STAGE_6_CLOSEOUT_BASE, TASK_PATH)) as {
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
  const rustTask = JSON.parse(gitTextAt(STAGE_6_CLOSEOUT_BASE, PARENT_PATH)) as {
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

  const targetLocation = resolveExactlyOneTaskLocation(
    STAGE_6_E3_ACCEPTANCE_TASK_ROOT,
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_ROOT,
    STAGE_6_E3_ACCEPTANCE_TASK_MANIFEST,
  );
  const closureLocation = resolveExactlyOneTaskLocation(
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
    gitTextAt(
      STAGE_6_E3_LAW_CLOSEOUT_BASE,
      `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly status?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveStage6Task = JSON.parse(
    gitTextAt(
      STAGE_6_E3_LAW_CLOSEOUT_BASE,
      `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
    ),
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
    resolveExactlyOneTaskLocation("active", "archive", ["task.json"], {
      activeFiles: ["task.json"],
      archiveFiles: null,
    }),
    { kind: "active", root: "active" },
  );
  assert.deepEqual(
    resolveExactlyOneTaskLocation("active", "archive", ["task.json"], {
      activeFiles: null,
      archiveFiles: ["task.json"],
    }),
    { kind: "archive", root: "archive" },
  );
  assert.deepEqual(
    resolveExactlyOneTaskLocation(
      RKP2_ACTIVE_ROOT,
      RKP2_ARCHIVE_ROOT,
      RKP2_TASK_MANIFEST,
    ),
    { kind: "archive", root: RKP2_ARCHIVE_ROOT },
  );
  const postArchiveRepairLocation = resolveExactlyOneTaskLocation(
    POST_ARCHIVE_REPAIR_TASK_ROOT,
    POST_ARCHIVE_REPAIR_ARCHIVE_ROOT,
    POST_ARCHIVE_REPAIR_TASK_MANIFEST,
  );
  assert.deepEqual(
    postArchiveRepairLocation,
    postArchiveRepairLocation.kind === "active"
      ? { kind: "active", root: POST_ARCHIVE_REPAIR_TASK_ROOT }
      : { kind: "archive", root: POST_ARCHIVE_REPAIR_ARCHIVE_ROOT },
  );
  for (const invalidRkp2Location of [
    {
      activeFiles: [...RKP2_TASK_MANIFEST],
      archiveFiles: [...RKP2_TASK_MANIFEST],
    },
    { activeFiles: null, archiveFiles: null },
    {
      activeFiles: null,
      archiveFiles: [...RKP2_TASK_MANIFEST, "research/forbidden-drift.md"],
    },
  ] as const) {
    assert.throws(() =>
      resolveExactlyOneTaskLocation(
        RKP2_ACTIVE_ROOT,
        RKP2_ARCHIVE_ROOT,
        RKP2_TASK_MANIFEST,
        invalidRkp2Location,
      ),
    );
  }
  for (const invalidLocation of [
    { activeFiles: ["task.json"], archiveFiles: ["task.json"] },
    { activeFiles: null, archiveFiles: null },
    { activeFiles: [], archiveFiles: null },
    { activeFiles: ["task.json", "twelfth.md"], archiveFiles: null },
  ] as const) {
    assert.throws(() =>
      resolveExactlyOneTaskLocation("active", "archive", ["task.json"], invalidLocation),
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
    targetImplementationStage: liveTargetMeta.implementation_stage,
    targetImplementationReview: liveTargetMeta.implementation_review,
    targetNextGate: liveTargetMeta.next_gate,
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
    {
      targetImplementationStage:
        "terminal_candidate_ready_for_dedicated_independent_implementation_review",
    },
    { targetNextGate: "native_target_archive_clock_preflight_required" },
    {
      targetNextGate:
        "dedicated_independent_acceptance_projection_implementation_review_pending",
    },
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

  const workspaceLawTargetLocation = resolveExactlyOneTaskLocation(
    STAGE_6_E3_LAW_TASK_ROOT,
    STAGE_6_E3_LAW_TARGET_ARCHIVE_ROOT,
    STAGE_6_E3_LAW_TARGET_MANIFEST,
  );
  const workspaceLawCloseoutLocation = resolveExactlyOneTaskLocation(
    STAGE_6_E3_LAW_CLOSEOUT_ROOT,
    STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT,
    STAGE_6_E3_LAW_CLOSEOUT_MANIFEST,
  );
  const liveWorkspaceLawTarget = JSON.parse(
    readText(`${workspaceLawTargetLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveWorkspaceLawCloseout = JSON.parse(
    readText(`${workspaceLawCloseoutLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const liveWorkspaceLawStage6 = JSON.parse(
    gitTextAt(
      STAGE_6_E3_LAW_CLOSEOUT_ARCHIVED_HEAD,
      `${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/task.json`,
    ),
  ) as {
    readonly status?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const workspaceLawTargetMeta = liveWorkspaceLawTarget.meta ?? {};
  const workspaceLawCloseoutMeta = liveWorkspaceLawCloseout.meta ?? {};
  const workspaceLawStage6Meta = liveWorkspaceLawStage6.meta ?? {};
  const workspaceLawCloseoutPhase: E3WorkspaceLawCloseoutPhase =
    workspaceLawTargetLocation.kind === "active" &&
    workspaceLawCloseoutLocation.kind === "active"
      ? liveWorkspaceLawCloseout.status === "planning"
        ? "planning"
        : workspaceLawTargetMeta.acceptance_authorized === true
          ? "owner-acceptance"
          : "activation"
      : workspaceLawTargetLocation.kind === "archive" &&
          workspaceLawCloseoutLocation.kind === "active"
        ? "target-archived"
        : workspaceLawTargetLocation.kind === "archive" &&
            workspaceLawCloseoutLocation.kind === "archive"
          ? "closure-archived"
          : assert.fail("Workspace Law closeout archive cannot precede target archive");

  const workspaceLawChanges = currentWorkspaceLawCloseoutChanges();
  assertWorkspaceLawCloseoutPathSet(
    workspaceLawChanges,
    workspaceLawCloseoutPhase,
  );
  for (const phase of [
    "planning",
    "activation",
    "owner-acceptance",
    "target-archived",
    "closure-archived",
  ] as const) {
    assertWorkspaceLawCloseoutPathSet(
      expectedWorkspaceLawCloseoutChanges(phase),
      phase,
    );
  }
  const workspaceLawPathWithoutTechnical = new Map(workspaceLawChanges);
  workspaceLawPathWithoutTechnical.delete(STAGE_6_E3_LAW_CLOSEOUT_TECHNICAL_PATH);
  assert.throws(() =>
    assertWorkspaceLawCloseoutPathSet(
      workspaceLawPathWithoutTechnical,
      workspaceLawCloseoutPhase,
    ),
  );
  const workspaceLawPathWithExtra = new Map(workspaceLawChanges);
  workspaceLawPathWithExtra.set(`${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/extra.md`, "A");
  assert.throws(() =>
    assertWorkspaceLawCloseoutPathSet(
      workspaceLawPathWithExtra,
      workspaceLawCloseoutPhase,
    ),
  );
  const workspaceLawPathWithWrongStatus = new Map(workspaceLawChanges);
  workspaceLawPathWithWrongStatus.set(
    STAGE_6_E3_LAW_CLOSEOUT_TECHNICAL_PATH,
    "A",
  );
  assert.throws(() =>
    assertWorkspaceLawCloseoutPathSet(
      workspaceLawPathWithWrongStatus,
      workspaceLawCloseoutPhase,
    ),
  );

  assert.equal(STAGE_6_E3_LAW_TARGET_MANIFEST.length, 12);
  assert.equal(STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.length, 11);
  assert.deepEqual(
    resolveExactlyOneTaskLocation("active", "archive", STAGE_6_E3_LAW_TARGET_MANIFEST, {
      activeFiles: STAGE_6_E3_LAW_TARGET_MANIFEST,
      archiveFiles: null,
    }),
    { kind: "active", root: "active" },
  );
  assert.deepEqual(
    resolveExactlyOneTaskLocation("active", "archive", STAGE_6_E3_LAW_CLOSEOUT_MANIFEST, {
      activeFiles: null,
      archiveFiles: STAGE_6_E3_LAW_CLOSEOUT_MANIFEST,
    }),
    { kind: "archive", root: "archive" },
  );
  for (const input of [
    {
      activeFiles: STAGE_6_E3_LAW_TARGET_MANIFEST,
      archiveFiles: STAGE_6_E3_LAW_TARGET_MANIFEST,
    },
    { activeFiles: null, archiveFiles: null },
    {
      activeFiles: STAGE_6_E3_LAW_TARGET_MANIFEST.slice(1),
      archiveFiles: null,
    },
    {
      activeFiles: [...STAGE_6_E3_LAW_TARGET_MANIFEST, "extra.md"],
      archiveFiles: null,
    },
    {
      activeFiles: [
        ...STAGE_6_E3_LAW_TARGET_MANIFEST.slice(0, -1),
        "substituted.json",
      ],
      archiveFiles: null,
    },
  ] as const) {
    assert.throws(() =>
      resolveExactlyOneTaskLocation(
        "active",
        "archive",
        STAGE_6_E3_LAW_TARGET_MANIFEST,
        input,
      ),
    );
  }
  for (const input of [
    {
      activeFiles: STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.slice(1),
      archiveFiles: null,
    },
    {
      activeFiles: [...STAGE_6_E3_LAW_CLOSEOUT_MANIFEST, "extra.md"],
      archiveFiles: null,
    },
    {
      activeFiles: [
        ...STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.slice(0, -1),
        "substituted.json",
      ],
      archiveFiles: null,
    },
  ] as const) {
    assert.throws(() =>
      resolveExactlyOneTaskLocation(
        "active",
        "archive",
        STAGE_6_E3_LAW_CLOSEOUT_MANIFEST,
        input,
      ),
    );
  }

  assertWorkspaceLawArchiveClockContract({
    month: "2026-09",
    date: "2026-09-01",
    time: "23:49:59",
  });
  for (const clock of [
    { month: "2026-08", date: "2026-09-01", time: "12:00:00" },
    { month: "2026-09", date: "2026-08-31", time: "12:00:00" },
    { month: "2026-09", date: "2026-09-01", time: "23:50:00" },
    { month: "2026-09", date: "2026-09-01", time: "23:59:59" },
  ] as const) {
    assert.throws(() => assertWorkspaceLawArchiveClockContract(clock));
  }
  assert.match(STAGE_6_E3_ACCEPTANCE_ARCHIVE_ROOT, /archive\/2026-08\//u);
  assert.match(
    STAGE_6_E3_ACCEPTANCE_ARCHIVE_CLOSURE_ARCHIVE_ROOT,
    /archive\/2026-08\//u,
  );

  const projectedTargetImplement = projectWorkspaceLawTargetJsonlSuccessor(
    "implement.jsonl",
    STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT,
  );
  const projectedTargetCheck = projectWorkspaceLawTargetJsonlSuccessor(
    "check.jsonl",
    STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK,
  );
  if (
    workspaceLawCloseoutPhase === "planning" ||
    workspaceLawCloseoutPhase === "activation"
  ) {
    assert.equal(
      sha256(lfNormalizedText(`${workspaceLawTargetLocation.root}/implement.jsonl`)),
      STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT.sourceSha256,
    );
    assert.equal(
      sha256(lfNormalizedText(`${workspaceLawTargetLocation.root}/check.jsonl`)),
      STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK.sourceSha256,
    );
  } else {
    assert.equal(
      lfNormalizedText(`${workspaceLawTargetLocation.root}/implement.jsonl`),
      projectedTargetImplement,
    );
    assert.equal(
      lfNormalizedText(`${workspaceLawTargetLocation.root}/check.jsonl`),
      projectedTargetCheck,
    );
    assertJsonlReferencesExist(workspaceLawTargetLocation.root);
  }
  assertJsonlReferencesExist(workspaceLawCloseoutLocation.root);

  canonicalizeE3AuditRecord(
    workspaceLawTargetMeta.external_independent_implementation_audit_result,
  );
  assert.equal(
    workspaceLawTargetMeta.external_independent_implementation_audit_canonical_bytes,
    STAGE_6_E3_AUDIT_RECORD_BYTES,
  );
  assert.equal(
    workspaceLawTargetMeta.external_independent_implementation_audit_sha256,
    STAGE_6_E3_AUDIT_RECORD_SHA256,
  );
  assertSingleE3AuditRecordOwner([
    workspaceLawTargetMeta.external_independent_implementation_audit_result,
    workspaceLawCloseoutMeta.external_independent_implementation_audit_result,
    workspaceLawStage6Meta.external_independent_implementation_audit_result,
  ]);
  if (
    workspaceLawCloseoutPhase !== "planning" &&
    workspaceLawCloseoutPhase !== "activation"
  ) {
    const historicalTarget = JSON.parse(
      gitTextAt(
        STAGE_6_E3_LAW_CLOSEOUT_BASE,
        `${STAGE_6_E3_LAW_TASK_ROOT}/task.json`,
      ),
    ) as {
      readonly meta?: {
        readonly immutable_planning_authority?: Readonly<Record<string, unknown>>;
      };
    };
    assert.deepEqual(workspaceLawTargetMeta.immutable_planning_authority, {
      ...(historicalTarget.meta?.immutable_planning_authority ?? {}),
      "implement.jsonl": STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT.successorSha256,
      "check.jsonl": STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK.successorSha256,
    });
    const technicalCommit = workspaceLawCloseoutMeta.workspace_law_technical_commit;
    assert.equal(typeof technicalCommit, "string");
    assert.match(technicalCommit as string, /^[0-9a-f]{40}$/u);
    assertExactPathSet(
      new Set(
        lines(
          git([
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            technicalCommit as string,
          ]),
        ),
      ),
      [STAGE_6_E3_LAW_CLOSEOUT_TECHNICAL_PATH],
      "Workspace Law closeout technical commit",
    );
    assert.deepEqual(
      workspaceLawTargetMeta.post_implementation_context_archive_stability_repair,
      {
        schemaVersion: 1,
        authorityTask: "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure",
        sourceHead: technicalCommit,
        implementJsonl: {
          sourceRows: 12,
          sourceBytes: 2129,
          sourceSha256:
            STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT.sourceSha256,
          successorRows: 9,
          successorBytes: 1492,
          successorSha256:
            STAGE_6_E3_LAW_TARGET_SUCCESSOR_IMPLEMENT.successorSha256,
        },
        checkJsonl: {
          sourceRows: 9,
          sourceBytes: 1795,
          sourceSha256: STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK.sourceSha256,
          successorRows: 6,
          successorBytes: 1117,
          successorSha256: STAGE_6_E3_LAW_TARGET_SUCCESSOR_CHECK.successorSha256,
        },
        removedActiveSelfReferenceCount: 6,
        otherRowMutation: false,
        existingAuditRecordMutation: false,
      },
    );
  }

  const workspaceLawLifecycle: WorkspaceLawCloseoutLifecycleProjection = {
    targetLocation: workspaceLawTargetLocation.kind,
    targetStatus: liveWorkspaceLawTarget.status,
    targetCompletedAt: liveWorkspaceLawTarget.completedAt,
    targetImplementationCandidateReady:
      workspaceLawTargetMeta.implementation_candidate_ready,
    targetImplementationStage: workspaceLawTargetMeta.implementation_stage,
    targetImplementationReview: workspaceLawTargetMeta.implementation_review,
    targetNextGate: workspaceLawTargetMeta.next_gate,
    targetAcceptanceAuthorized:
      workspaceLawTargetMeta.acceptance_authorized ?? false,
    targetArchiveAuthorized: workspaceLawTargetMeta.archive_authorized ?? false,
    targetAuditRecord:
      workspaceLawTargetMeta.external_independent_implementation_audit_result,
    targetAuditRecordBytes:
      workspaceLawTargetMeta.external_independent_implementation_audit_canonical_bytes,
    targetAuditRecordSha256:
      workspaceLawTargetMeta.external_independent_implementation_audit_sha256,
    targetDefaultRuntime: workspaceLawTargetMeta.default_runtime,
    targetS62Started: workspaceLawTargetMeta.rkp2_stage6_s6_2_started,
    targetS63Started: workspaceLawTargetMeta.rkp2_stage6_s6_3_started,
    targetIntegrationAuthorized: workspaceLawTargetMeta.integration_authorized,
    targetQualificationAuthorized: workspaceLawTargetMeta.qualification_authorized,
    targetRuntimeSwitchAuthorized:
      workspaceLawTargetMeta.default_runtime_switch_authorized,
    targetPushAuthorized: workspaceLawTargetMeta.push_authorized,
    targetRkp3CreationAuthorized: workspaceLawTargetMeta.rkp3_creation_authorized,
    closureLocation: workspaceLawCloseoutLocation.kind,
    closureStatus: liveWorkspaceLawCloseout.status,
    closureCompletedAt: liveWorkspaceLawCloseout.completedAt,
    closureTaskStartRun: workspaceLawCloseoutMeta.task_start_run,
    closureProductionAuthorized:
      workspaceLawCloseoutMeta.production_implementation_authorized,
    closureUserAuthorized:
      workspaceLawCloseoutMeta.user_implementation_authorization,
    closureAcceptedPlanningAuthority:
      workspaceLawCloseoutMeta.accepted_planning_authority_head,
    closureImplementationCandidateReady:
      workspaceLawCloseoutMeta.implementation_candidate_ready,
    closureImplementationReview: workspaceLawCloseoutMeta.implementation_review,
    closureNextGate: workspaceLawCloseoutMeta.next_gate,
    closureTargetAcceptanceAuthorized:
      workspaceLawCloseoutMeta.target_acceptance_authorized ?? false,
    closureTargetArchiveAuthorized:
      workspaceLawCloseoutMeta.target_archive_authorized ?? false,
    closureAcceptanceAuthorized:
      workspaceLawCloseoutMeta.closure_acceptance_authorized ?? false,
    closureArchiveAuthorized:
      workspaceLawCloseoutMeta.closure_archive_authorized ?? false,
    closureQ3AuditRecord:
      workspaceLawCloseoutMeta.q3_independent_implementation_audit_result,
    closureDefaultRuntime: workspaceLawCloseoutMeta.default_runtime,
    closureS62Started: workspaceLawCloseoutMeta.rkp2_stage6_s6_2_started,
    closureS63Started: workspaceLawCloseoutMeta.rkp2_stage6_s6_3_started,
    closureIntegrationAuthorized: workspaceLawCloseoutMeta.integration_authorized,
    closureQualificationAuthorized:
      workspaceLawCloseoutMeta.qualification_authorized,
    closureRuntimeSwitchAuthorized:
      workspaceLawCloseoutMeta.default_runtime_switch_authorized,
    closurePushAuthorized: workspaceLawCloseoutMeta.push_authorized,
    closureRkp3CreationAuthorized:
      workspaceLawCloseoutMeta.rkp3_creation_authorized,
    closureE3StressRerun: workspaceLawCloseoutMeta.e3_stress_rerun,
    stage6Status: liveWorkspaceLawStage6.status,
    stage6CurrentPlanningChild: workspaceLawStage6Meta.current_planning_child,
    stage6CurrentImplementationChild:
      workspaceLawStage6Meta.current_implementation_child,
    stage6NextGate: workspaceLawStage6Meta.next_gate,
    stage6Q3AuditRecord:
      workspaceLawStage6Meta.e3_workspace_law_acceptance_archive_closure_q3_audit_record,
    stage6Q3AuditOwner:
      workspaceLawStage6Meta.e3_workspace_law_acceptance_archive_closure_q3_audit_record_owner,
    stage6Q3AuditSha256:
      workspaceLawStage6Meta.e3_workspace_law_acceptance_archive_closure_q3_audit_record_sha256,
    stage6S61RetainedComplete:
      workspaceLawStage6Meta.rkp2_stage_6_s6_1_retained_complete,
    stage6S62Started: workspaceLawStage6Meta.rkp2_stage_6_s6_2_started,
    stage6S63Started: workspaceLawStage6Meta.rkp2_stage_6_s6_3_started,
    stage6DefaultRuntime: workspaceLawStage6Meta.default_runtime,
    stage6ArchiveAuthorized: workspaceLawStage6Meta.archive_authorized,
    stage6OfficialMeasurementAuthorized:
      workspaceLawStage6Meta.official_measurement_authorized,
    stage6RuntimeSwitchAuthorized:
      workspaceLawStage6Meta.default_runtime_switch_authorized,
    stage6PushAuthorized: workspaceLawStage6Meta.push_authorized,
    stage6Rkp3CreationAuthorized: workspaceLawStage6Meta.rkp3_creation_authorized,
  };
  assertWorkspaceLawCloseoutLifecycleProjection(
    workspaceLawLifecycle,
    workspaceLawCloseoutPhase,
  );

  const syntheticTechnicalCommit = "1".repeat(40);
  const syntheticQ3Head = "2".repeat(40);
  const syntheticQ3AuditRecord = {
    schemaVersion: 1,
    reviewTaskId: "synthetic-review-task",
    reviewTurnId: "synthetic-review-turn",
    candidateCommit: syntheticQ3Head,
    technicalCommit: syntheticTechnicalCommit,
    verdict: "PASS_READY_FOR_OWNER_CLOSEOUT_AND_NATIVE_CLOSURE_ARCHIVE",
    P0: 0,
    P1: 0,
    P2: 0,
  } as const;
  const syntheticQ3Canonical = canonicalizeWorkspaceLawCloseoutQ3AuditRecord(
    syntheticQ3AuditRecord,
    syntheticQ3Head,
    syntheticTechnicalCommit,
  );
  const syntheticActivationLifecycle: WorkspaceLawCloseoutLifecycleProjection = {
    ...workspaceLawLifecycle,
    targetLocation: "active",
    targetStatus: "in_progress",
    targetCompletedAt: null,
    targetImplementationCandidateReady: true,
    targetImplementationStage:
      "P4_closure_archived_completed_owner_decision_for_e3_law_parent_pending",
    targetNextGate:
      "explicit_owner_decision_for_e3_law_parent_acceptance_archive",
    targetAcceptanceAuthorized: false,
    targetArchiveAuthorized: false,
    closureLocation: "active",
    closureStatus: "in_progress",
    closureCompletedAt: null,
    closureTaskStartRun: true,
    closureUserAuthorized: true,
    closureAcceptedPlanningAuthority:
      STAGE_6_E3_LAW_CLOSEOUT_PLANNING_AUTHORITY,
    closureImplementationCandidateReady: false,
    closureImplementationReview: "pending_not_started",
    closureNextGate: "Q1T_archive_aware_workspace_law_technical_checkpoint",
    closureTargetAcceptanceAuthorized: false,
    closureTargetArchiveAuthorized: false,
    closureAcceptanceAuthorized: false,
    closureArchiveAuthorized: false,
    closureQ3AuditRecord: undefined,
    stage6CurrentPlanningChild: null,
    stage6CurrentImplementationChild:
      "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure",
    stage6NextGate: "Q1T_archive_aware_workspace_law_technical_checkpoint",
    stage6Q3AuditRecord: undefined,
    stage6Q3AuditOwner: undefined,
    stage6Q3AuditSha256: undefined,
  };
  const syntheticFixtures: Readonly<
    Record<E3WorkspaceLawCloseoutPhase, WorkspaceLawCloseoutLifecycleProjection>
  > = {
    planning: {
      ...syntheticActivationLifecycle,
      closureStatus: "planning",
      closureTaskStartRun: false,
      closureUserAuthorized: false,
      closureAcceptedPlanningAuthority: undefined,
      closureImplementationCandidateReady: true,
      closureImplementationReview: "not_started",
      closureNextGate: "separate_user_implementation_authorization_for_bounded_Q0_through_Q3",
      stage6CurrentPlanningChild:
        "08-31-rkp-2-e3-workspace-law-acceptance-archive-closure",
      stage6CurrentImplementationChild:
        "08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair",
      stage6NextGate:
        "separate_user_implementation_authorization_for_e3_workspace_law_acceptance_archive_closure",
    },
    activation: syntheticActivationLifecycle,
    "owner-acceptance": {
      ...syntheticActivationLifecycle,
      targetImplementationStage:
        "owner_accepted_archive_authorized_clock_preflight_pending",
      targetNextGate: "native_e3_workspace_law_archive_clock_preflight_required",
      targetAcceptanceAuthorized: true,
      targetArchiveAuthorized: true,
      closureImplementationReview: "pending_Q3_target_archive_candidate_not_frozen",
      closureNextGate: "native_e3_workspace_law_archive_clock_preflight_required",
      closureTargetAcceptanceAuthorized: true,
      closureTargetArchiveAuthorized: true,
      stage6NextGate: "native_e3_workspace_law_archive_clock_preflight_required",
    },
    "target-archived": {
      ...syntheticActivationLifecycle,
      targetLocation: "archive",
      targetStatus: "completed",
      targetCompletedAt: "2026-09-01",
      targetImplementationStage: "accepted_archived_completed_historical_no_live_gate",
      targetNextGate: "completed_historical_no_live_gate",
      targetAcceptanceAuthorized: true,
      targetArchiveAuthorized: true,
      closureImplementationCandidateReady: true,
      closureImplementationReview:
        "pending_dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review",
      closureNextGate:
        "dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review_pending",
      closureTargetAcceptanceAuthorized: true,
      closureTargetArchiveAuthorized: true,
      stage6NextGate:
        "dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review_pending",
      stage6Q3AuditOwner: `${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/task.json`,
      stage6Q3AuditSha256: "pending",
    },
    "closure-archived": {
      ...syntheticActivationLifecycle,
      targetLocation: "archive",
      targetStatus: "completed",
      targetCompletedAt: "2026-09-01",
      targetImplementationStage: "accepted_archived_completed_historical_no_live_gate",
      targetNextGate: "completed_historical_no_live_gate",
      targetAcceptanceAuthorized: true,
      targetArchiveAuthorized: true,
      closureLocation: "archive",
      closureStatus: "completed",
      closureCompletedAt: "2026-09-01",
      closureImplementationCandidateReady: true,
      closureImplementationReview:
        "passed_dedicated_independent_E3_workspace_law_acceptance_archive_closure_implementation_review",
      closureNextGate: "completed_historical_no_live_gate",
      closureTargetAcceptanceAuthorized: true,
      closureTargetArchiveAuthorized: true,
      closureAcceptanceAuthorized: true,
      closureArchiveAuthorized: true,
      closureQ3AuditRecord: syntheticQ3AuditRecord,
      stage6CurrentImplementationChild: null,
      stage6NextGate: "explicit_owner_decision_for_stage6_parent_acceptance_archive",
      stage6Q3AuditOwner: `${STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT}/task.json`,
      stage6Q3AuditSha256: sha256(syntheticQ3Canonical),
    },
  };
  for (const phase of [
    "planning",
    "activation",
    "owner-acceptance",
    "target-archived",
    "closure-archived",
  ] as const) {
    assertWorkspaceLawCloseoutLifecycleProjection(syntheticFixtures[phase], phase);
  }
  for (const mutation of [
    { targetAuditRecordBytes: STAGE_6_E3_AUDIT_RECORD_BYTES + 1 },
    { targetAuditRecordSha256: "wrong" },
    { closureProductionAuthorized: true },
    { closureE3StressRerun: true },
    { closureS62Started: true },
    { closureS63Started: true },
    { closureDefaultRuntime: "rust" },
    { closureIntegrationAuthorized: true },
    { closureQualificationAuthorized: true },
    { closureRuntimeSwitchAuthorized: true },
    { closurePushAuthorized: true },
    { closureRkp3CreationAuthorized: true },
    { stage6S62Started: true },
    { stage6S63Started: true },
    { stage6DefaultRuntime: "rust" },
    { stage6OfficialMeasurementAuthorized: true },
    { stage6RuntimeSwitchAuthorized: true },
    { stage6PushAuthorized: true },
    { stage6Rkp3CreationAuthorized: true },
    { stage6CurrentImplementationChild: "wrong-child" },
  ] as const) {
    assert.throws(() =>
      assertWorkspaceLawCloseoutLifecycleProjection(
        { ...workspaceLawLifecycle, ...mutation },
        workspaceLawCloseoutPhase,
      ),
    );
  }

  const missingQ3AuditKey = { ...syntheticQ3AuditRecord } as Record<
    string,
    unknown
  >;
  delete missingQ3AuditKey.P2;
  for (const malformed of [
    undefined,
    missingQ3AuditKey,
    { ...syntheticQ3AuditRecord, schemaVersion: 2 },
    { ...syntheticQ3AuditRecord, candidateCommit: "wrong" },
    { ...syntheticQ3AuditRecord, technicalCommit: "wrong" },
    { ...syntheticQ3AuditRecord, verdict: "PASS" },
    { ...syntheticQ3AuditRecord, P0: 1 },
    { ...syntheticQ3AuditRecord, P1: 1 },
    { ...syntheticQ3AuditRecord, P2: 1 },
    { ...syntheticQ3AuditRecord, extra: true },
  ] as const) {
    assert.throws(() =>
      canonicalizeWorkspaceLawCloseoutQ3AuditRecord(
        malformed,
        syntheticQ3Head,
        syntheticTechnicalCommit,
      ),
    );
  }
  assert.throws(() =>
    assertSingleWorkspaceLawCloseoutQ3AuditRecordOwner(
      [syntheticQ3AuditRecord, syntheticQ3AuditRecord],
      syntheticQ3Head,
      syntheticTechnicalCommit,
    ),
  );

  const q4StatusEntries = STAGE_6_E3_LAW_CLOSEOUT_Q4_STAGED_PATHS.map(
    (path) => `M  ${path}`,
  );
  assertQ4PrearchiveStatusEntries(q4StatusEntries);
  for (const invalidEntries of [
    q4StatusEntries.slice(1),
    [...q4StatusEntries, "?? unrelated.txt"],
    ["?? untracked.txt", ...q4StatusEntries.slice(1)],
    [` M ${STAGE_6_E3_LAW_CLOSEOUT_Q4_STAGED_PATHS[0]}`, ...q4StatusEntries.slice(1)],
    [`M  wrong-path`, ...q4StatusEntries.slice(1)],
  ] as const) {
    assert.throws(() => assertQ4PrearchiveStatusEntries(invalidEntries));
  }
  const q4CommitRows = [
    ...STAGE_6_E3_LAW_CLOSEOUT_MANIFEST.flatMap((artifact) => [
      `D\t${STAGE_6_E3_LAW_CLOSEOUT_ROOT}/${artifact}`,
      `A\t${STAGE_6_E3_LAW_CLOSEOUT_ARCHIVE_ROOT}/${artifact}`,
    ]),
    ...STAGE_6_PARENT_LIFECYCLE_PATHS.map((path) => `M\t${path}`),
  ];
  assertQ4ArchiveCommitMembership([syntheticQ3Head], syntheticQ3Head, q4CommitRows);
  assert.throws(() =>
    assertQ4ArchiveCommitMembership(
      [syntheticQ3Head, "3".repeat(40)],
      syntheticQ3Head,
      q4CommitRows,
    ),
  );
  assert.throws(() =>
    assertQ4ArchiveCommitMembership(
      [syntheticQ3Head],
      syntheticQ3Head,
      q4CommitRows.slice(1),
    ),
  );
  assert.throws(() =>
    assertQ4ArchiveCommitMembership(
      [syntheticQ3Head],
      syntheticQ3Head,
      [...q4CommitRows, "A\tunrelated.txt"],
    ),
  );
  if (workspaceLawCloseoutPhase === "closure-archived") {
    const q4ArchiveHead = STAGE_6_E3_LAW_CLOSEOUT_ARCHIVED_HEAD;
    const q3Head = git(["rev-parse", `${q4ArchiveHead}^`]);
    const q3Record = workspaceLawCloseoutMeta.q3_independent_implementation_audit_result as
      | Readonly<Record<string, unknown>>
      | undefined;
    assert.ok(q3Record);
    assert.equal(q3Record.candidateCommit, q3Head);
    assert.equal(
      q3Record.technicalCommit,
      workspaceLawCloseoutMeta.workspace_law_technical_commit,
    );
    const parents = lines(git(["show", "-s", "--format=%P", q4ArchiveHead]));
    const commitRows = lines(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "--no-renames",
        "-r",
        q4ArchiveHead,
      ]),
    );
    assertQ4ArchiveCommitMembership(parents, q3Head, commitRows);
  }

  const semanticLocation = resolveExactlyOneTaskLocation(
    STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT,
    STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT,
    STAGE_6_SEMANTIC_CANONICAL_MANIFEST,
  );
  const stage6Location = resolveExactlyOneTaskLocation(
    STAGE_6_PRIVATE_SCALE_TASK_ROOT,
    STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT,
    STAGE_6_PRIVATE_SCALE_MANIFEST,
  );
  const closeoutLocation = resolveExactlyOneTaskLocation(
    STAGE_6_CLOSEOUT_ROOT,
    STAGE_6_CLOSEOUT_ARCHIVE_ROOT,
    STAGE_6_CLOSEOUT_MANIFEST,
  );
  const semanticTask = JSON.parse(
    readText(`${semanticLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly parent?: unknown;
    readonly children?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const currentStage6Task = JSON.parse(
    readText(`${stage6Location.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly parent?: unknown;
    readonly children?: unknown;
    readonly relatedFiles?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const closeoutTask = JSON.parse(
    readText(`${closeoutLocation.root}/task.json`),
  ) as {
    readonly status?: unknown;
    readonly completedAt?: unknown;
    readonly relatedFiles?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const currentRkp2Task = JSON.parse(readCurrentRkp2Text(TASK_PATH)) as {
    readonly status?: unknown;
    readonly parent?: unknown;
    readonly children?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const currentRustTask = JSON.parse(readText(PARENT_PATH)) as {
    readonly status?: unknown;
    readonly parent?: unknown;
    readonly children?: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  const historicalRkp2Task = JSON.parse(
    gitTextAt(STAGE_6_CLOSEOUT_TERMINAL_PROJECTION_COMMIT, TASK_PATH),
  ) as typeof currentRkp2Task;
  const historicalRustTask = JSON.parse(
    gitTextAt(STAGE_6_CLOSEOUT_TERMINAL_PROJECTION_COMMIT, PARENT_PATH),
  ) as typeof currentRustTask;
  const semanticMeta = semanticTask.meta ?? {};
  const currentStage6Meta = currentStage6Task.meta ?? {};
  const closeoutMeta = closeoutTask.meta ?? {};
  const currentRkp2Meta = currentRkp2Task.meta ?? {};
  const currentRustMeta = currentRustTask.meta ?? {};
  const historicalRkp2Meta = historicalRkp2Task.meta ?? {};
  const historicalRustMeta = historicalRustTask.meta ?? {};
  const stage6CloseoutPhase: Stage6CloseoutPhase =
    closeoutLocation.kind === "archive"
      ? "closeout-archived"
      : stage6Location.kind === "archive"
        ? closeoutMeta.integration_completed === true
          ? "integrated"
          : "stage6-archived"
        : semanticLocation.kind === "archive"
          ? "semantic-child-archived"
          : closeoutTask.status === "planning"
            ? "planning"
            : "activation";
  const stage6CloseoutChanges = currentStage6CloseoutChanges();
  assertStage6CloseoutPathSet(stage6CloseoutChanges, stage6CloseoutPhase);
  for (const phase of [
    "planning",
    "activation",
    "semantic-child-archived",
    "stage6-archived",
    "integrated",
    "closeout-archived",
  ] as const) {
    assertStage6CloseoutPathSet(expectedStage6CloseoutChanges(phase), phase);
  }
  const stage6CloseoutWithExtra = new Map(stage6CloseoutChanges);
  stage6CloseoutWithExtra.set(`${STAGE_6_CLOSEOUT_ROOT}/undeclared.md`, "A");
  assert.throws(() =>
    assertStage6CloseoutPathSet(stage6CloseoutWithExtra, stage6CloseoutPhase),
  );
  assert.equal(STAGE_6_SEMANTIC_CANONICAL_MANIFEST.length, 12);
  assert.equal(STAGE_6_PRIVATE_SCALE_MANIFEST.length, 13);
  assert.equal(STAGE_6_CLOSEOUT_MANIFEST.length, 12);
  assert.equal(
    semanticMeta.native_archive_commit,
    STAGE_6_SEMANTIC_NATIVE_ARCHIVE_COMMIT,
  );
  const semanticNativeArchiveProjection = readCommitProjection(
    STAGE_6_SEMANTIC_NATIVE_ARCHIVE_COMMIT,
  );
  assertNativeTaskArchiveCommitProjection(
    semanticNativeArchiveProjection,
    STAGE_6_SEMANTIC_ACCEPTANCE_COMMIT,
    STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT,
    STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT,
    STAGE_6_SEMANTIC_CANONICAL_MANIFEST,
  );
  for (const variant of [
    { ...semanticNativeArchiveProjection, parents: ["wrong-parent"] },
    {
      ...semanticNativeArchiveProjection,
      rows: semanticNativeArchiveProjection.rows.slice(1),
    },
    {
      ...semanticNativeArchiveProjection,
      rows: [...semanticNativeArchiveProjection.rows, "M\tundeclared-semantic-path"],
    },
  ]) {
    assert.throws(() =>
      assertNativeTaskArchiveCommitProjection(
        variant,
        STAGE_6_SEMANTIC_ACCEPTANCE_COMMIT,
        STAGE_6_SEMANTIC_CANONICAL_TASK_ROOT,
        STAGE_6_SEMANTIC_CANONICAL_ARCHIVE_ROOT,
        STAGE_6_SEMANTIC_CANONICAL_MANIFEST,
      ),
    );
  }
  const stage6NativeArchiveProjection = readCommitProjection(
    STAGE_6_NATIVE_ARCHIVE_COMMIT,
  );
  assertNativeTaskArchiveCommitProjection(
    stage6NativeArchiveProjection,
    STAGE_6_OWNER_ACCEPTANCE_COMMIT,
    STAGE_6_PRIVATE_SCALE_TASK_ROOT,
    STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT,
    STAGE_6_PRIVATE_SCALE_MANIFEST,
  );
  for (const variant of [
    { ...stage6NativeArchiveProjection, parents: ["wrong-parent"] },
    {
      ...stage6NativeArchiveProjection,
      rows: stage6NativeArchiveProjection.rows.slice(1),
    },
    {
      ...stage6NativeArchiveProjection,
      rows: [...stage6NativeArchiveProjection.rows, "M\tundeclared-stage6-path"],
    },
  ]) {
    assert.throws(() =>
      assertNativeTaskArchiveCommitProjection(
        variant,
        STAGE_6_OWNER_ACCEPTANCE_COMMIT,
        STAGE_6_PRIVATE_SCALE_TASK_ROOT,
        STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT,
        STAGE_6_PRIVATE_SCALE_MANIFEST,
      ),
    );
  }
  const closeoutAcceptanceProjection = readCommitProjection(
    STAGE_6_CLOSEOUT_L6_OWNER_ACCEPTANCE_COMMIT,
  );
  assert.deepEqual(closeoutAcceptanceProjection.parents, [
    STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT,
  ]);
  assert.deepEqual(closeoutAcceptanceProjection.rows, [
    `M\t${STAGE_6_CLOSEOUT_ROOT}/task.json`,
  ]);
  const closeoutNativeArchiveProjection = readCommitProjection(
    STAGE_6_CLOSEOUT_L6_NATIVE_ARCHIVE_COMMIT,
  );
  assertNativeTaskArchiveCommitProjection(
    closeoutNativeArchiveProjection,
    STAGE_6_CLOSEOUT_L6_OWNER_ACCEPTANCE_COMMIT,
    STAGE_6_CLOSEOUT_ROOT,
    STAGE_6_CLOSEOUT_ARCHIVE_ROOT,
    STAGE_6_CLOSEOUT_MANIFEST,
  );
  const frozenParentChain = STAGE_6_CLOSEOUT_FROZEN_PARENT_CHAIN.map(
    ({ commit }) => ({ commit, parents: readCommitProjection(commit).parents }),
  );
  assertStage6CloseoutFrozenParentChain(frozenParentChain);
  const brokenParentChain = frozenParentChain.map((entry, index) =>
    index === 3 ? { ...entry, parents: ["wrong-parent"] } : entry,
  );
  assert.throws(() => assertStage6CloseoutFrozenParentChain(brokenParentChain));
  if (stage6Location.kind === "archive") {
    assert.equal(currentStage6Task.completedAt, "2026-09-01");
    assert.ok(Array.isArray(currentStage6Task.relatedFiles));
    const stage6SelfRelatedFiles = currentStage6Task.relatedFiles.filter(
      (path): path is string =>
        typeof path === "string" &&
        path.startsWith(`${STAGE_6_PRIVATE_SCALE_ARCHIVE_ROOT}/`),
    );
    assert.equal(stage6SelfRelatedFiles.length, 12);
    for (const path of stage6SelfRelatedFiles) {
      assert.equal(existsSync(resolve(path)), true, path);
    }
    for (const name of ["implement.jsonl", "check.jsonl"] as const) {
      const source = readText(`${stage6Location.root}/${name}`);
      assert.equal(source.includes(`${STAGE_6_PRIVATE_SCALE_TASK_ROOT}/`), false);
    }
    assertJsonlReferencesExist(stage6Location.root);
    assert.equal(
      currentStage6Task.meta?.native_archive_commit,
      STAGE_6_NATIVE_ARCHIVE_COMMIT,
    );
  }
  if (closeoutLocation.kind === "archive") {
    assert.equal(closeoutTask.completedAt, STAGE_6_CLOSEOUT_ARCHIVE_DATE);
    assert.ok(Array.isArray(closeoutTask.relatedFiles));
    const closeoutSelfRelatedFiles = closeoutTask.relatedFiles.filter(
      (path): path is string =>
        typeof path === "string" &&
        path.startsWith(`${STAGE_6_CLOSEOUT_ARCHIVE_ROOT}/`),
    );
    assert.equal(closeoutSelfRelatedFiles.length, 11);
    for (const path of closeoutSelfRelatedFiles) {
      assert.equal(existsSync(resolve(path)), true, path);
    }
    for (const name of ["implement.jsonl", "check.jsonl"] as const) {
      const source = readText(`${closeoutLocation.root}/${name}`);
      assert.equal(source.includes(`${STAGE_6_CLOSEOUT_ROOT}/`), false);
    }
    assertJsonlReferencesExist(closeoutLocation.root);
    assert.equal(
      closeoutTask.meta?.l6_powershell_preflight_repair_commit,
      STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT,
    );
    assert.equal(
      closeoutTask.meta?.l6_owner_acceptance_commit,
      STAGE_6_CLOSEOUT_L6_OWNER_ACCEPTANCE_COMMIT,
    );
    assert.equal(
      closeoutTask.meta?.l6_native_archive_commit,
      STAGE_6_CLOSEOUT_L6_NATIVE_ARCHIVE_COMMIT,
    );
  }

  const stage6AuditRecord = closeoutMeta.stage6_technical_audit as
    | Readonly<Record<string, unknown>>
    | undefined;
  assert.ok(stage6AuditRecord);
  assert.equal(stage6AuditRecord.candidate_commit, STAGE_6_E3_AUDITED_CANDIDATE);
  assert.equal(stage6AuditRecord.P0, 0);
  assert.equal(stage6AuditRecord.P1, 0);
  assert.equal(stage6AuditRecord.P2, 0);
  assert.equal(stage6AuditRecord.verdict, "passed_external_audit");
  const closeoutL3AuditRecord = closeoutMeta.l3_independent_archive_candidate_review as
    | Readonly<Record<string, unknown>>
    | undefined;
  const closeoutIntegrationReviewRecord = closeoutMeta.independent_integration_review as
    | Readonly<Record<string, unknown>>
    | undefined;
  const closeoutPowerShellPreflightReviewRecord = closeoutMeta
    .targeted_l6_clock_date_contract_rereview as
    | Readonly<Record<string, unknown>>
    | undefined;
  const closeoutFinalPowerShellPreflightReviewRecord = closeoutMeta
    .targeted_powershell_preflight_repair_rereview as
    | Readonly<Record<string, unknown>>
    | undefined;
  const rkp2CloseoutProjection = historicalRkp2Meta
    .stage6_acceptance_archive_integration_closeout as
    | Readonly<Record<string, unknown>>
    | undefined;
  const rustCloseoutProjection = historicalRustMeta
    .stage6_acceptance_archive_integration_closeout as
    | Readonly<Record<string, unknown>>
    | undefined;
  assert.ok(closeoutL3AuditRecord);
  assert.ok(closeoutIntegrationReviewRecord);
  assert.ok(closeoutPowerShellPreflightReviewRecord);
  assert.ok(closeoutFinalPowerShellPreflightReviewRecord);
  assert.ok(rkp2CloseoutProjection);
  assert.ok(rustCloseoutProjection);
  assert.equal(
    closeoutFinalPowerShellPreflightReviewRecord.candidate_commit,
    STAGE_6_CLOSEOUT_POWERSHELL_PREFLIGHT_REPAIR_COMMIT,
  );
  assert.equal(closeoutFinalPowerShellPreflightReviewRecord.P0, 0);
  assert.equal(closeoutFinalPowerShellPreflightReviewRecord.P1, 0);
  assert.equal(closeoutFinalPowerShellPreflightReviewRecord.P2, 0);
  assert.equal(
    closeoutFinalPowerShellPreflightReviewRecord.verdict,
    "PASS FOR OWNER-AUTHORIZED L6 CLOSEOUT ARCHIVE",
  );
  assert.equal(
    closeoutFinalPowerShellPreflightReviewRecord.review_generated_authorization,
    false,
  );
  const integrationReviewProjection: Stage6CloseoutIntegrationReviewProjection = {
    candidateCommit: closeoutIntegrationReviewRecord.candidate_commit,
    P0: closeoutIntegrationReviewRecord.P0,
    P1: closeoutIntegrationReviewRecord.P1,
    P2: closeoutIntegrationReviewRecord.P2,
    verdict: closeoutIntegrationReviewRecord.verdict,
    reviewTaskId: closeoutIntegrationReviewRecord.review_task_id,
    reviewThreadId: closeoutIntegrationReviewRecord.review_thread_id,
    reviewTurnId: closeoutIntegrationReviewRecord.review_turn_id,
    reviewGeneratedAuthorization:
      closeoutIntegrationReviewRecord.review_generated_authorization,
  };
  assertStage6CloseoutIntegrationReviewProjection(integrationReviewProjection);
  for (const variant of [
    { ...integrationReviewProjection, P1: 0 },
    { ...integrationReviewProjection, verdict: "PASS" },
    { ...integrationReviewProjection, reviewGeneratedAuthorization: true },
  ]) {
    assert.throws(() => assertStage6CloseoutIntegrationReviewProjection(variant));
  }
  const powerShellPreflightReviewProjection: Stage6CloseoutPowerShellPreflightReviewProjection = {
    candidateCommit: closeoutPowerShellPreflightReviewRecord.candidate_commit,
    P0: closeoutPowerShellPreflightReviewRecord.P0,
    P1: closeoutPowerShellPreflightReviewRecord.P1,
    P2: closeoutPowerShellPreflightReviewRecord.P2,
    verdict: closeoutPowerShellPreflightReviewRecord.verdict,
    reviewTaskId: closeoutPowerShellPreflightReviewRecord.review_task_id,
    reviewThreadId: closeoutPowerShellPreflightReviewRecord.review_thread_id,
    reviewTurnId: closeoutPowerShellPreflightReviewRecord.review_turn_id,
    finding: closeoutPowerShellPreflightReviewRecord.finding,
    reviewGeneratedAuthorization:
      closeoutPowerShellPreflightReviewRecord.review_generated_authorization,
  };
  assertStage6CloseoutPowerShellPreflightReviewProjection(
    powerShellPreflightReviewProjection,
  );
  for (const variant of [
    {
      ...powerShellPreflightReviewProjection,
      candidateCommit: "wrong-candidate",
    },
    { ...powerShellPreflightReviewProjection, P1: 0 },
    { ...powerShellPreflightReviewProjection, verdict: "PASS" },
    {
      ...powerShellPreflightReviewProjection,
      reviewGeneratedAuthorization: true,
    },
  ]) {
    assert.throws(() =>
      assertStage6CloseoutPowerShellPreflightReviewProjection(variant),
    );
  }

  const closeoutClockProjection: Stage6CloseoutClockProjection = {
    archiveMonth: closeoutMeta.archive_month,
    historicalArchiveDate: closeoutMeta.archive_date,
    historicalArchiveDeadline: closeoutMeta.archive_deadline_local,
    historicalArchiveClockScope: closeoutMeta.archive_clock_scope,
    closeoutArchiveRoot: closeoutMeta.closeout_archive_root,
    closeoutArchiveDate: closeoutMeta.closeout_archive_date,
    closeoutArchiveDeadline: closeoutMeta.closeout_archive_deadline_local,
    closeoutArchiveClockOwner: closeoutMeta.closeout_archive_clock_owner,
    closeoutCompletedAt: closeoutTask.completedAt,
  };
  assertStage6CloseoutClockProjection(
    closeoutClockProjection,
    stage6CloseoutPhase === "closeout-archived",
  );
  const closeoutArchivedClockProjection: Stage6CloseoutClockProjection = {
    ...closeoutClockProjection,
    closeoutCompletedAt: STAGE_6_CLOSEOUT_ARCHIVE_DATE,
  };
  assertStage6CloseoutClockProjection(closeoutArchivedClockProjection, true);
  for (const variant of [
    {
      ...closeoutArchivedClockProjection,
      closeoutCompletedAt: STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DATE,
    },
    {
      ...closeoutArchivedClockProjection,
      closeoutArchiveDate: STAGE_6_CLOSEOUT_HISTORICAL_ARCHIVE_DATE,
    },
    {
      ...closeoutArchivedClockProjection,
      closeoutArchiveDeadline: "2026-09-01T23:50:00+08:00",
    },
    {
      ...closeoutArchivedClockProjection,
      historicalArchiveDate: STAGE_6_CLOSEOUT_ARCHIVE_DATE,
    },
    { ...closeoutArchivedClockProjection, archiveMonth: "2026-10" },
    {
      ...closeoutArchivedClockProjection,
      closeoutArchiveRoot:
        ".trellis/tasks/archive/2026-10/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout",
    },
  ]) {
    assert.throws(() => assertStage6CloseoutClockProjection(variant, true));
  }

  const l6DateRepairProjection: Stage6CloseoutL6DateRepairProjection = {
    parents: currentStage6CloseoutL6DateRepairParents(),
    changes: currentStage6CloseoutL6DateRepairChanges(),
  };
  assertStage6CloseoutL6DateRepairProjection(l6DateRepairProjection);
  assert.throws(() =>
    assertStage6CloseoutL6DateRepairProjection({
      ...l6DateRepairProjection,
      parents: ["wrong-parent"],
    }),
  );
  const l6DateRepairWithExtraPath = new Map(l6DateRepairProjection.changes);
  l6DateRepairWithExtraPath.set("src/forbidden-l6-date-repair.ts", "M");
  assert.throws(() =>
    assertStage6CloseoutL6DateRepairProjection({
      ...l6DateRepairProjection,
      changes: l6DateRepairWithExtraPath,
    }),
  );

  const powerShellPreflightScript = stage6CloseoutPowerShellPreflightScript();
  assert.match(powerShellPreflightScript, /ConvertFrom-Json -DateKind String/u);
  assert.match(powerShellPreflightScript, /DateTimeOffset\]::ParseExact\(/u);
  assert.match(powerShellPreflightScript, /CultureInfo\]::InvariantCulture/u);
  const nowAssignment = "$now = [DateTimeOffset]::Now";
  const historicalReplayPowerShellPreflightScript =
    replaceStage6CloseoutPowerShellPreflightOnce(
      powerShellPreflightScript,
      nowAssignment,
      "$now = [DateTimeOffset]::ParseExact('2026-09-02T12:00:00+08:00', $format, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None)",
    );
  const historicalPowerShellPreflight = executeStage6CloseoutPowerShellPreflight(
    historicalReplayPowerShellPreflightScript,
  );
  assertStage6CloseoutPowerShellPreflightEvidence(historicalPowerShellPreflight);
  context.diagnostic(
    `L6 historical PowerShell preflight replay ${JSON.stringify(historicalPowerShellPreflight)}`,
  );
  for (const culture of ["fr-FR", "zh-CN"] as const) {
    const cultureEvidence = executeStage6CloseoutPowerShellPreflight(
      historicalReplayPowerShellPreflightScript,
      culture,
    );
    assertStage6CloseoutPowerShellPreflightEvidence(cultureEvidence, culture);
  }

  const jsonDecode =
    "$closeout = Get-Content -Raw -LiteralPath $taskPath | ConvertFrom-Json -DateKind String";
  const archiveDateAssignment =
    "$archiveDate = $closeout.meta.closeout_archive_date";
  const deadlineAssignment =
    "$deadlineText = $closeout.meta.closeout_archive_deadline_local";
  const negativePowerShellPreflights = [
    replaceStage6CloseoutPowerShellPreflightOnce(
      historicalReplayPowerShellPreflightScript,
      jsonDecode,
      jsonDecode.replace(" -DateKind String", ""),
    ),
    replaceStage6CloseoutPowerShellPreflightOnce(
      historicalReplayPowerShellPreflightScript,
      deadlineAssignment,
      `${deadlineAssignment}\n    $deadlineText = [DateTime]::Parse('2026-09-02T23:50:00+08:00')`,
    ),
    replaceStage6CloseoutPowerShellPreflightOnce(
      historicalReplayPowerShellPreflightScript,
      deadlineAssignment,
      `${deadlineAssignment}\n    $deadlineText = '2026/09/02 23:50:00 +08:00'`,
    ),
    replaceStage6CloseoutPowerShellPreflightOnce(
      historicalReplayPowerShellPreflightScript,
      archiveDateAssignment,
      `${archiveDateAssignment}\n    $archiveDate = '2026-09-03'`,
    ),
    replaceStage6CloseoutPowerShellPreflightOnce(
      powerShellPreflightScript,
      nowAssignment,
      "$now = [DateTimeOffset]::ParseExact('2026-09-02T12:00:00+09:00', $format, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None)",
    ),
    replaceStage6CloseoutPowerShellPreflightOnce(
      powerShellPreflightScript,
      nowAssignment,
      "$now = [DateTimeOffset]::ParseExact('2026-09-02T23:50:00+08:00', $format, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None)",
    ),
  ];
  for (const negativePowerShellPreflight of negativePowerShellPreflights) {
    assert.throws(() =>
      executeStage6CloseoutPowerShellPreflight(negativePowerShellPreflight),
    );
  }

  const powerShellPreflightRepairProjection: Stage6CloseoutL6DateRepairProjection =
    {
      parents: currentStage6CloseoutPowerShellPreflightRepairParents(),
      changes: currentStage6CloseoutPowerShellPreflightRepairChanges(),
    };
  assertStage6CloseoutPowerShellPreflightRepairProjection(
    powerShellPreflightRepairProjection,
  );
  assert.throws(() =>
    assertStage6CloseoutPowerShellPreflightRepairProjection({
      ...powerShellPreflightRepairProjection,
      parents: ["wrong-parent"],
    }),
  );
  const powerShellPreflightRepairWithExtraPath = new Map(
    powerShellPreflightRepairProjection.changes,
  );
  powerShellPreflightRepairWithExtraPath.set(
    `${STAGE_6_CLOSEOUT_ROOT}/design.md`,
    "M",
  );
  assert.throws(() =>
    assertStage6CloseoutPowerShellPreflightRepairProjection({
      ...powerShellPreflightRepairProjection,
      changes: powerShellPreflightRepairWithExtraPath,
    }),
  );

  const stage6CloseoutLifecycle: Stage6CloseoutLifecycleProjection = {
    semanticLocation: semanticLocation.kind,
    semanticStatus: semanticTask.status,
    semanticCompletedAt: semanticTask.completedAt,
    semanticParent: semanticTask.parent,
    semanticChildren: semanticTask.children,
    semanticImplementationStage: semanticMeta.implementation_stage,
    semanticNextGate: semanticMeta.next_gate,
    semanticParentOwnership: semanticMeta.parent_ownership,
    semanticCurrentPlanningOwner: semanticMeta.current_planning_owner,
    semanticActiveImplementationOwner: semanticMeta.active_implementation_owner,
    semanticLiveOwner: semanticMeta.live_owner,
    semanticActiveAuthorityPresent: semanticMeta.active_authority_present,
    semanticArchiveAuthorityPresent: semanticMeta.archive_authority_present,
    stage6Location: stage6Location.kind,
    stage6Status: currentStage6Task.status,
    stage6CompletedAt: currentStage6Task.completedAt,
    stage6Parent: currentStage6Task.parent,
    stage6Children: currentStage6Task.children,
    stage6CurrentPlanningChild: currentStage6Meta.current_planning_child,
    stage6CurrentImplementationChild:
      currentStage6Meta.current_implementation_child,
    stage6ImplementationStage: currentStage6Meta.implementation_stage,
    stage6NextGate: currentStage6Meta.next_gate,
    stage6ActiveAuthorityPresent: currentStage6Meta.active_authority_present,
    stage6ArchiveAuthorityPresent: currentStage6Meta.archive_authority_present,
    closeoutLocation: closeoutLocation.kind,
    closeoutStatus: closeoutTask.status,
    closeoutCompletedAt: closeoutTask.completedAt,
    closeoutImplementationStage: closeoutMeta.implementation_stage,
    closeoutImplementationReview: closeoutMeta.implementation_review,
    closeoutIntegrationReview: closeoutMeta.integration_review,
    closeoutNextGate: closeoutMeta.next_gate,
    closeoutProductionAuthorized:
      closeoutMeta.production_implementation_authorized,
    closeoutPlanningAuthority: closeoutMeta.accepted_planning_authority_head,
    closeoutStage6AcceptanceAuthorized:
      closeoutMeta.stage6_acceptance_authorized,
    closeoutStage6ArchiveAuthorized: closeoutMeta.stage6_archive_authorized,
    closeoutCandidateReady: closeoutMeta.implementation_candidate_ready,
    closeoutArchiveCandidateReview: closeoutMeta.archive_candidate_review,
    closeoutIntegrationAuthorized: closeoutMeta.integration_authorized,
    closeoutIntegrationCompleted: closeoutMeta.integration_completed,
    closeoutCurrentAuthorityOwnerBranch:
      closeoutMeta.current_authority_owner_branch,
    closeoutCurrentAuthorityOwnerWorktree:
      closeoutMeta.current_authority_owner_worktree,
    closeoutFrozenSourceBranch: closeoutMeta.frozen_source_branch,
    closeoutFrozenSourceWorktree: closeoutMeta.frozen_source_worktree,
    closeoutFrozenSourceHead: closeoutMeta.frozen_source_head,
    closeoutIntegrationTargetBranch: closeoutMeta.integration_target_branch,
    closeoutIntegrationTargetWorktree: closeoutMeta.integration_target_worktree,
    closeoutIntegrationTargetPreHead: closeoutMeta.integration_target_pre_head,
    closeoutIntegrationCandidate: closeoutMeta.integration_candidate,
    closeoutIntegrationMode: closeoutMeta.integration_mode,
    closeoutL4FastForwardCompleted: closeoutMeta.l4_ff_only_integration_completed,
    closeoutL4NoMergeCommit: closeoutMeta.l4_no_merge_commit,
    closeoutL3AuditCandidate: closeoutL3AuditRecord.candidate_commit,
    closeoutL3AuditP0: closeoutL3AuditRecord.P0,
    closeoutL3AuditP1: closeoutL3AuditRecord.P1,
    closeoutL3AuditP2: closeoutL3AuditRecord.P2,
    closeoutL3AuditVerdict: closeoutL3AuditRecord.verdict,
    closeoutL3AuditTaskId: closeoutL3AuditRecord.review_task_id,
    closeoutL3AuditThreadId: closeoutL3AuditRecord.review_thread_id,
    closeoutL3AuditTurnId: closeoutL3AuditRecord.review_turn_id,
    closeoutL3AuditReviewGeneratedAuthorization:
      closeoutL3AuditRecord.review_generated_authorization,
    closeoutL3AuditAuthorizationSource: closeoutL3AuditRecord.authorization_source,
    closeoutL6DateRepairCandidateReady:
      closeoutMeta.l6_date_contract_repair_candidate_ready,
    closeoutL6PowerShellPreflightRepairCandidateReady:
      closeoutMeta.l6_powershell_preflight_repair_candidate_ready,
    closeoutL6ExecutionAuthorized: closeoutMeta.l6_execution_authorized,
    closeoutL6Started: closeoutMeta.l6_started,
    closeoutL6Completed: closeoutMeta.l6_completed,
    closeoutTerminalProjectionReview: closeoutMeta.terminal_projection_review,
    closeoutActiveAuthorityPresent: closeoutMeta.closeout_active_authority_present,
    closeoutArchiveAuthorityPresent: closeoutMeta.closeout_archive_authority_present,
    closeoutAcceptanceAuthorized: closeoutMeta.closeout_acceptance_authorized,
    closeoutArchiveAuthorized: closeoutMeta.closeout_archive_authorized,
    rkp2Status: historicalRkp2Task.status,
    rkp2Parent: historicalRkp2Task.parent,
    rkp2Children: historicalRkp2Task.children,
    rkp2CurrentPlanningChild: historicalRkp2Meta.current_planning_child,
    rkp2CurrentImplementationChild:
      historicalRkp2Meta.current_implementation_child,
    rkp2ImplementationStage: historicalRkp2Meta.implementation_stage,
    rkp2NextGate: historicalRkp2Meta.next_gate,
    rkp2CloseoutStatus: rkp2CloseoutProjection.status,
    rkp2CloseoutImplementationStage: rkp2CloseoutProjection.implementation_stage,
    rkp2CloseoutNextGate: rkp2CloseoutProjection.next_gate,
    rkp2CloseoutIntegrationCompleted: rkp2CloseoutProjection.integration_completed,
    rkp2CloseoutIntegrationReview: rkp2CloseoutProjection.integration_review,
    rkp2CloseoutL6Completed: rkp2CloseoutProjection.l6_completed,
    rkp2CloseoutTerminalProjectionReview:
      rkp2CloseoutProjection.terminal_projection_review,
    rkp2Stage6Completed: historicalRkp2Meta.stage_6_completed,
    s62Started: historicalRkp2Meta.stage_6_s6_2_started,
    s63Started: historicalRkp2Meta.stage_6_s6_3_started,
    defaultRuntime: historicalRkp2Meta.default_runtime,
    rustStatus: historicalRustTask.status,
    rustParent: historicalRustTask.parent,
    rustChildren: historicalRustTask.children,
    rustCurrentPlanningChild: historicalRustMeta.current_planning_child,
    rustCurrentImplementationChild:
      historicalRustMeta.current_implementation_child,
    rustActiveImplementationChild: historicalRustMeta.active_implementation_child,
    rustRkp2Status: historicalRustMeta.rkp2_status,
    rustNextGate: historicalRustMeta.next_gate,
    rustCloseoutStatus: rustCloseoutProjection.status,
    rustCloseoutImplementationStage: rustCloseoutProjection.implementation_stage,
    rustCloseoutNextGate: rustCloseoutProjection.next_gate,
    rustCloseoutIntegrationCompleted: rustCloseoutProjection.integration_completed,
    rustCloseoutIntegrationReview: rustCloseoutProjection.integration_review,
    rustCloseoutL6Completed: rustCloseoutProjection.l6_completed,
    rustCloseoutTerminalProjectionReview:
      rustCloseoutProjection.terminal_projection_review,
    rustRkp2Stage6Completed: historicalRustMeta.rkp2_stage_6_completed,
    rustS62Started: historicalRustMeta.rkp2_stage_6_s6_2_started,
    rustS63Started: historicalRustMeta.rkp2_stage_6_s6_3_started,
    rustDefaultRuntime: historicalRustMeta.rkp2_default_runtime,
    rustRkp3ThroughRkp9Created: historicalRustMeta.rkp3_through_rkp9_created,
    pushAuthorized: closeoutMeta.push_authorized,
    officialMeasurementAuthorized: closeoutMeta.official_measurement_authorized,
    qualificationAuthorized: closeoutMeta.qualification_authorized,
    runtimeSwitchAuthorized: closeoutMeta.default_runtime_switch_authorized,
    rkp3CreationAuthorized: closeoutMeta.rkp3_creation_authorized,
  };
  assertStage6CloseoutLifecycleProjection(
    stage6CloseoutLifecycle,
    stage6CloseoutPhase,
  );
  type Stage6CloseoutLifecycleNegativeVariant =
    Partial<Stage6CloseoutLifecycleProjection> & {
      readonly negativeCase?: string;
      readonly expectedError?: RegExp;
    };
  const stage6CloseoutLifecycleNegativeVariants: readonly Stage6CloseoutLifecycleNegativeVariant[] = [
    {
      semanticParentOwnership:
        "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair_remains_the_only_active_implementation_owner_this_child_is_the_only_current_planning_owner",
    },
    {
      semanticCurrentPlanningOwner:
        "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
    },
    {
      semanticActiveImplementationOwner:
        "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
    },
    { semanticLiveOwner: "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair" },
    { semanticParent: "wrong-semantic-parent" },
    { semanticChildren: ["wrong-semantic-child"] },
    { semanticStatus: "in_progress" },
    { semanticCompletedAt: "2026-09-02" },
    { stage6Parent: "wrong-stage6-parent" },
    { stage6Children: ["wrong-stage6-child"] },
    {
      stage6CurrentImplementationChild:
        "08-30-rkp-2-stage-6-semantic-canonical-authority-amendment",
    },
    { stage6Status: "in_progress" },
    { stage6CompletedAt: "2026-09-02" },
    { rkp2Status: "completed" },
    { rkp2Parent: "wrong-rkp2-parent" },
    { rkp2Children: ["wrong-rkp2-child"] },
    {
      rkp2CurrentPlanningChild:
        "09-01-rkp-2-stage-6-acceptance-archive-integration-closeout",
    },
    {
      rkp2CurrentImplementationChild:
        "08-26-rkp-2-stage-6-private-scale-evidence-seam-repair",
    },
    { rkp2ImplementationStage: "wrong-rkp2-implementation-stage" },
    { rkp2NextGate: "wrong-rkp2-gate" },
    { rkp2CloseoutStatus: "in_progress" },
    { rkp2CloseoutImplementationStage: "wrong-rkp2-closeout-stage" },
    { rkp2CloseoutNextGate: "wrong-rkp2-closeout-gate" },
    { rkp2CloseoutIntegrationCompleted: false },
    { rkp2CloseoutIntegrationReview: "passed_without_independent_review" },
    { rustStatus: "completed" },
    {
      rustParent: "wrong-rust-parent",
      negativeCase: "rust-parent-lineage-drift",
      expectedError: /Rust parent must remain on the accepted architecture lineage/u,
    },
    { rustChildren: ["wrong-rust-child"] },
    {
      rustCurrentPlanningChild: "wrong-rust-planning-child",
      negativeCase: "rust-current-planning-child-drift",
      expectedError: /Rust parent current planning child must remain null/u,
    },
    { rustCurrentImplementationChild: "wrong-rust-child" },
    { rustActiveImplementationChild: "wrong-rust-child" },
    { rustRkp2Status: "wrong-rust-rkp2-status" },
    { rustNextGate: "wrong-rust-gate" },
    { rustCloseoutStatus: "in_progress" },
    { rustCloseoutImplementationStage: "wrong-rust-closeout-stage" },
    { rustCloseoutNextGate: "wrong-rust-closeout-gate" },
    { rustCloseoutIntegrationCompleted: false },
    { rustCloseoutIntegrationReview: "passed_without_independent_review" },
    { closeoutImplementationStage: "wrong-closeout-stage" },
    { closeoutImplementationReview: "pending" },
    { closeoutIntegrationReview: "passed_without_independent_review" },
    { closeoutNextGate: "closeout_archive" },
    {
      closeoutCurrentAuthorityOwnerBranch: STAGE_6_CLOSEOUT_SOURCE_BRANCH,
      negativeCase: "integrated-authority-owner-branch-drift",
      expectedError:
        /integrated authority must belong only to the original RKP-2 branch/u,
    },
    {
      closeoutCurrentAuthorityOwnerWorktree: STAGE_6_CLOSEOUT_SOURCE_WORKTREE,
      negativeCase: "integrated-authority-owner-worktree-drift",
      expectedError:
        /integrated authority must belong only to the original RKP-2 worktree/u,
    },
    { closeoutFrozenSourceBranch: STAGE_6_CLOSEOUT_TARGET_BRANCH },
    { closeoutFrozenSourceWorktree: STAGE_6_CLOSEOUT_TARGET_WORKTREE },
    {
      closeoutFrozenSourceHead: STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT,
      negativeCase: "frozen-source-head-drift",
      expectedError: /the L3 audit source must remain frozen at the exact reviewed candidate/u,
    },
    { closeoutIntegrationTargetBranch: STAGE_6_CLOSEOUT_SOURCE_BRANCH },
    { closeoutIntegrationTargetWorktree: STAGE_6_CLOSEOUT_SOURCE_WORKTREE },
    { closeoutIntegrationTargetPreHead: STAGE_6_CLOSEOUT_L3_AUDITED_CANDIDATE },
    { closeoutIntegrationCandidate: STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT },
    { closeoutIntegrationMode: "merge-commit" },
    { closeoutL6DateRepairCandidateReady: false },
    { closeoutL6PowerShellPreflightRepairCandidateReady: false },
    { closeoutL6ExecutionAuthorized: false },
    { closeoutL6Started: false },
    { closeoutL6Completed: false },
    { closeoutTerminalProjectionReview: "passed_without_independent_review" },
    { closeoutActiveAuthorityPresent: true },
    { closeoutArchiveAuthorityPresent: false },
    { rkp2CloseoutL6Completed: false },
    { rkp2CloseoutTerminalProjectionReview: "passed_without_independent_review" },
    { rustCloseoutL6Completed: false },
    { rustCloseoutTerminalProjectionReview: "passed_without_independent_review" },
    { closeoutL4FastForwardCompleted: false },
    {
      closeoutL4NoMergeCommit: false,
      negativeCase: "l4-merge-commit-drift",
      expectedError: /L4 must not create a merge commit/u,
    },
    { closeoutL3AuditCandidate: STAGE_6_CLOSEOUT_L3_REPAIR_COMMIT },
    { closeoutL3AuditP0: 1 },
    { closeoutL3AuditP1: 1 },
    { closeoutL3AuditP2: 1 },
    { closeoutL3AuditVerdict: "PASS" },
    { closeoutL3AuditTaskId: "wrong-review-task" },
    { closeoutL3AuditThreadId: "wrong-review-thread" },
    { closeoutL3AuditTurnId: "wrong-review-turn" },
    {
      closeoutL3AuditReviewGeneratedAuthorization: true,
      negativeCase: "review-generated-authorization-drift",
      expectedError: /the independent PASS must remain evidence only/u,
    },
    { closeoutL3AuditAuthorizationSource: "independent_review_pass" },
    {
      closeoutProductionAuthorized: true,
      negativeCase: "closeout-production-authorization-drift",
      expectedError:
        /closeout production implementation authorization must remain false/u,
    },
    {
      closeoutIntegrationAuthorized: false,
      negativeCase: "closeout-integration-authorization-drift",
      expectedError:
        /closeout integration authorization must match the lifecycle phase/u,
    },
    {
      closeoutIntegrationCompleted: false,
      negativeCase: "closeout-integration-occurrence-drift",
      expectedError:
        /closeout integration completion must match the lifecycle phase/u,
    },
    {
      pushAuthorized: true,
      negativeCase: "closeout-push-authorization-drift",
      expectedError: /closeout push authorization must remain false/u,
    },
    {
      officialMeasurementAuthorized: true,
      negativeCase: "closeout-official-measurement-authorization-drift",
      expectedError:
        /closeout official measurement authorization must remain false/u,
    },
    {
      qualificationAuthorized: true,
      negativeCase: "closeout-qualification-authorization-drift",
      expectedError: /closeout qualification authorization must remain false/u,
    },
    {
      rkp2Stage6Completed: true,
      negativeCase: "rkp2-qualification-occurrence-drift",
      expectedError:
        /RKP-2 Stage 6 completion must remain false before qualification/u,
    },
    {
      rustRkp2Stage6Completed: true,
      negativeCase: "rust-parent-qualification-occurrence-drift",
      expectedError:
        /Rust parent RKP-2 Stage 6 completion must remain false before qualification/u,
    },
    {
      runtimeSwitchAuthorized: true,
      negativeCase: "closeout-runtime-switch-authorization-drift",
      expectedError: /closeout runtime switch authorization must remain false/u,
    },
    {
      defaultRuntime: "rust",
      negativeCase: "rkp2-runtime-cutover-drift",
      expectedError: /RKP-2 default runtime must remain TypeScript before cutover/u,
    },
    {
      rustDefaultRuntime: "rust",
      negativeCase: "rust-parent-runtime-cutover-drift",
      expectedError:
        /Rust parent default runtime projection must remain TypeScript before cutover/u,
    },
    {
      rkp3CreationAuthorized: true,
      negativeCase: "closeout-rkp3-authorization-drift",
      expectedError: /closeout RKP-3 creation authorization must remain false/u,
    },
    {
      rustRkp3ThroughRkp9Created: true,
      negativeCase: "rust-parent-rkp3-start-drift",
      expectedError:
        /Rust parent must record that RKP-3 through RKP-9 are not created/u,
    },
  ];
  for (const {
    negativeCase,
    expectedError,
    ...mutation
  } of stage6CloseoutLifecycleNegativeVariants) {
    const assertMutation = (): void =>
      assertStage6CloseoutLifecycleProjection(
        { ...stage6CloseoutLifecycle, ...mutation },
        stage6CloseoutPhase,
      );
    if (expectedError === undefined) {
      assert.throws(assertMutation, negativeCase);
    } else {
      assert.throws(assertMutation, expectedError, negativeCase);
    }
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
      assert.equal(jsonlReferenceExists(row.file), true, row.file);
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
    const currentText = readCurrentRkp2Text(projection.path);
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
      assert.equal(jsonlReferenceExists(entry.file), true, entry.file);
    }
  }

  for (const frozen of FROZEN_POST_STAGE_5_AUTHORITY_CONTENT) {
    assert.equal(
      sha256(readCurrentRkp2Text(frozen.path)),
      frozen.sha256,
      frozen.path,
    );
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

  const task = JSON.parse(readCurrentRkp2Text(TASK_PATH)) as {
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
