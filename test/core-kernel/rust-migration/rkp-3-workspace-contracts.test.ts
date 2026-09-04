import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import {
  RKP3_CORE_COMMAND_IDS,
  createRkp3AtLimitBatchCommand,
  createRkp3OverLimitBatchPayload,
  createRkp3Stage3SubmitRequest,
} from "./rkp-3-transaction-fixtures";

const RKP2_ACCEPTED_BASE = "6d0956c970f4414cb61e0f3d7148672a6e635032";
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
