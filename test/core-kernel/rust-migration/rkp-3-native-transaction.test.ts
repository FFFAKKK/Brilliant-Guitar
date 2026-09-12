import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  submitRustKernelSmokeCommand,
  type RustKernelStage3NativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { createRkp3ScaleDocument } from "./rkp-3-transaction-fixtures";

interface RawNativeCreateResult {
  readonly payload: Buffer;
  readonly handle?: object;
}

interface RawNativeAddon extends RustKernelStage3NativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => RawNativeCreateResult;
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
  readonly submitKernelStage3V1: (handle: unknown, requestBytes: unknown) => Buffer;
}

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawNativeAddon;

const CHANGE_OPERATION_VARIANTS = [
  "ReplaceScalar",
  "InsertEntity",
  "RemoveEntity",
  "InsertOrderedChild",
  "RemoveOrderedChild",
  "MoveOrderedChild",
  "ReplaceOrderedChildren",
  "InsertExtensionBlock",
  "ReplaceExtensionBlock",
  "RemoveExtensionBlock",
  "UpdateReference",
] as const;

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

function canonicalCreateBytes(document: unknown): Buffer {
  return Buffer.from(JSON.stringify({ apiVersion: 1, document }), "utf8");
}

function stage3Bytes(command: unknown): Buffer {
  return Buffer.from(JSON.stringify({ apiVersion: 1, command }), "utf8");
}

function createRawSession(document: unknown = createCoreScoreFixture()): object {
  const created = addon.createKernelSessionV1(
    canonicalCreateBytes(document),
  );
  assert.ok(created.handle);
  if (created.handle === undefined) throw new Error("missing native handle");
  return created.handle;
}

function committedMetrics(
  document: unknown,
  command: unknown,
): Readonly<Record<string, number>> {
  const handle = createRawSession(document);
  const result = parsePayload(
    addon.submitKernelStage3V1(handle, stage3Bytes(command)),
  ) as {
    readonly status: string;
    readonly value: { readonly metrics: Readonly<Record<string, number>> };
  };
  assert.equal(result.status, "committed");
  return result.value.metrics;
}

function metadataCommand(title: string): Record<string, unknown> {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
}

function parsePayload(payload: Buffer): Record<string, unknown> {
  return JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor)
      assertDeepFrozen(descriptor.value, seen);
  }
}

test("RKP-3 ChangeSet keeps exactly eleven typed stable-address operations", () => {
  const source = readText("crates/brilliant-kernel-runtime/src/change_set.rs");
  const enumBody = source.match(
    /pub\(crate\) enum ChangeOpV1 \{(?<body>[\s\S]*?)\n\}\n\nimpl ChangeOpV1/u,
  )?.groups?.body;
  if (enumBody === undefined) throw new Error("ChangeOpV1 body missing");

  let previous = -1;
  for (const variant of CHANGE_OPERATION_VARIANTS) {
    const next = enumBody.indexOf(`${variant} {`, previous + 1);
    assert.notEqual(next, -1, `missing or out-of-order ChangeOpV1 variant: ${variant}`);
    previous = next;
  }
  assert.equal(
    [...enumBody.matchAll(/^    [A-Z][A-Za-z]+ \{/gmu)].length,
    CHANGE_OPERATION_VARIANTS.length,
  );
  assert.match(source, /CHANGE_OPERATION_KIND_COUNT_V1: usize = 11;/u);
  assert.match(source, /MAX_CHANGESET_LOGICAL_BYTES_V1: u64 = 268_435_456;/u);
  assert.match(source, /MAX_PREPARED_EFFECTS_V1: u64 = 131_072;/u);
  assert.match(source, /MAX_AFFECTED_ADDRESSES_V1: u64 = 131_072;/u);
});

test("RKP-3 transaction APIs stay restricted and contain no physical identity", () => {
  const changeSet = readText("crates/brilliant-kernel-runtime/src/change_set.rs");
  const overlay = readText("crates/brilliant-kernel-runtime/src/overlay.rs");
  const baseReadBody = overlay.match(
    /pub\(crate\) trait CoreBaseReadV1 \{(?<body>[\s\S]*?)\n\}/u,
  )?.groups?.body;
  if (baseReadBody === undefined) throw new Error("CoreBaseReadV1 body missing");

  assert.deepEqual(
    [...baseReadBody.matchAll(/^    fn (?<name>[a-z_]+)/gmu)].map(
      ({ groups }) => groups?.name,
    ),
    [
      "resolve_entity",
      "read_owner",
      "read_scalar",
      "read_transposition",
      "detach_entity",
      "read_event_content_kind",
      "read_order",
      "visit_order",
      "read_extension",
      "visit_extension_headers",
      "read_reference",
      "list_references_to",
      "read_voice_time",
    ],
  );
  // Commercial completion adds narrow reads while retaining the exact
  // private method set and forbidding mutable storage/physical identities.
  assert.doesNotMatch(baseReadBody, /&mut\s+self/u);
  assert.match(baseReadBody, /fn read_transposition\(&self, part_id: &StableId\) -> Option<TranspositionV1>/u);
  assert.match(baseReadBody, /fn read_event_content_kind\(&self, event_id: &StableId\) -> Option<EventContentKind>/u);
  assert.match(baseReadBody, /fn visit_order\(\s*&self,\s*address: &StableOrderAddressV1,\s*visitor: &mut dyn FnMut\(&StableId\) -> bool,\s*\) -> Option<\(\)>/u);
  assert.match(overlay, /OVERLAY_LOOKUP_LAYER_COUNT_V1: usize = 4;/u);
  for (const token of [
    "entity_states",
    "scalar_replacements",
    "order_tombstones",
    "voice_times",
    "prepared_effect_count",
  ]) {
    assert.ok(
      overlay.includes(token) || changeSet.includes(token),
      `missing private transaction state: ${token}`,
    );
  }
  for (const forbidden of [
    "LiveScoreStore",
    "ScoreDocumentV1",
    "RuntimeHandle",
    "MeasureHandle",
    "PartHandle",
    "export_document",
    "serde_json::Value",
    "SystemTime",
    "Instant",
    "size_of::<",
  ]) {
    assert.equal(
      changeSet.includes(forbidden) || overlay.includes(forbidden),
      false,
      `private transaction boundary leaked forbidden shape: ${forbidden}`,
    );
  }
});

test("RKP-3 logical budget and inverse segment laws are mechanically pinned", () => {
  const source = readText("crates/brilliant-kernel-runtime/src/change_set.rs");

  assert.match(
    source,
    /assert_eq!\(bound, 266_341_506\);[\s\S]*assert_eq!\(MAX_CHANGESET_LOGICAL_BYTES_V1 - bound, 2_093_950\);/u,
  );
  assert.match(source, /self\.inverse_in_forward_order\.reverse\(\);/u);
  assert.equal(source.includes("self.segments.reverse();"), false);
  assert.match(source, /segment\.inverse_start = inverse_count - old_end;/u);
  assert.match(source, /segment\.inverse_end = inverse_count - old_start;/u);
  assert.match(source, /debug_assert!\(change_set\.arena_references_are_well_typed\(\)\);/u);
});

test("RKP-3 overlay uses discard-only failure and copies entity orders on first write", () => {
  const source = readText("crates/brilliant-kernel-runtime/src/overlay.rs");

  assert.match(source, /poisoned: bool/u);
  assert.match(source, /self\.poisoned = true;\n        Err\(failure\)/u);
  assert.match(
    source,
    /let extensions = matches!\(address, StableOrderAddressV1::Extensions \{ \.\. \}\);\n        if !extensions && self\.orders\.contains_key\(address\) \{\n            return Ok\(\(\)\);\n        \}/u,
  );
  // Standalone extension edits also change membership. Their generic-order
  // snapshot must refresh from headers; score-entity orders retain this guard.
  // Rust's extension-order regression checks actual interleaved read/write behavior.
  assert.match(
    source,
    /self\.metrics\.order_copies = self\.metrics\.order_copies\.saturating_add\(1\);/u,
  );
  assert.equal(source.includes("clone_from(&self.base"), false);
  assert.equal(source.includes("self.base ="), false);
});

test("RKP-3 Session owns a literal closed catalog and all twenty-eight command routes", () => {
  const catalog = readText(
    "crates/brilliant-kernel-session/src/commands/catalog.rs",
  );
  const dispatch = readText("crates/brilliant-kernel-session/src/commands/mod.rs");
  const local = readText("crates/brilliant-kernel-session/src/commands/local.rs");
  const measure = readText(
    "crates/brilliant-kernel-session/src/commands/measure.rs",
  );
  const hierarchy = readText(
    "crates/brilliant-kernel-session/src/commands/hierarchy.rs",
  );
  const range = readText("crates/brilliant-kernel-session/src/commands/range.rs");
  const session = readText("crates/brilliant-kernel-session/src/session.rs");
  const runtime = readText("crates/brilliant-kernel-runtime/src/runtime.rs");
  const variants = [
    "DocumentSetMetadata",
    "NoteSetWrittenPitch",
    "EventSetNoteValue",
    "VoiceInsertNotesEvent",
    "VoiceInsertRestEvent",
    "EventRemove",
    "MeasureInsert",
    "MeasureRemove",
    "MeasureMove",
    "MeasureSetDefinition",
    "PartInsert",
    "PartRemove",
    "PartMove",
    "PartSetName",
    "PartSetInstrument",
    "StaffInsert",
    "StaffRemove",
    "StaffMove",
    "StaffSetDefinition",
    "VoiceInsert",
    "VoiceRemove",
    "VoiceMove",
    "VoiceSetDefaultStaff",
    "VoiceSetSequenceStart",
    "EventSetStaffAssignment",
    "RangeDelete",
    "RangeTransposeWrittenPitch",
    "TransactionBatch",
  ] as const;

  let catalogCursor = -1;
  for (const variant of variants) {
    const next = catalog.indexOf(`CoreCommandIdV1::${variant}`, catalogCursor + 1);
    assert.notEqual(next, -1, `missing or out-of-order Session catalog entry: ${variant}`);
    catalogCursor = next;
    assert.ok(
      dispatch.includes(`CoreCommandIdV1::${variant}`),
      `closed dispatcher omits ${variant}`,
    );
  }
  assert.match(
    catalog,
    /SESSION_COMMAND_CATALOG_V1: \[CoreCommandDefinitionV1; CORE_COMMAND_COUNT_V1\]/u,
  );

  for (const method of [
    "set_document_metadata",
    "set_note_written_pitch",
    "set_event_note_value",
    "insert_notes_event",
    "insert_rest_event",
    "remove_event",
  ]) {
    assert.ok(local.includes(method), `local route missing ${method}`);
  }
  for (const forbidden of ["LiveScoreStore", "ScoreDocumentV1", "export_document"])
    assert.equal(local.includes(forbidden), false, `Session handler leaked ${forbidden}`);

  for (const method of [
    "insert_measure",
    "remove_measure",
    "move_measure",
    "set_measure_definition",
  ]) {
    assert.ok(measure.includes(method), `Measure route missing ${method}`);
    assert.match(runtime, new RegExp(`pub fn ${method}\\(`, "u"));
  }
  for (const forbidden of ["LiveScoreStore", "ScoreDocumentV1", "export_document"])
    assert.equal(
      measure.includes(forbidden),
      false,
      `Measure Session handler leaked ${forbidden}`,
    );
  assert.match(runtime, /replace_ordered_children\(/u);
  assert.match(runtime, /record_voice_descendants_affected\(/u);

  for (const method of [
    "insert_part",
    "remove_part",
    "move_part",
    "set_part_name",
    "set_part_instrument",
    "insert_staff",
    "remove_staff",
    "move_staff",
    "set_staff_definition",
    "insert_voice",
    "remove_voice",
    "move_voice",
    "set_voice_default_staff",
    "set_voice_sequence_start",
    "set_event_staff_assignment",
  ]) {
    assert.ok(hierarchy.includes(method), `Hierarchy route missing ${method}`);
    assert.match(runtime, new RegExp(`pub fn ${method}\\(`, "u"));
  }
  for (const forbidden of ["LiveScoreStore", "ScoreDocumentV1", "export_document"])
    assert.equal(
      hierarchy.includes(forbidden),
      false,
      `Hierarchy Session handler leaked ${forbidden}`,
    );
  assert.match(runtime, /ReferenceAddressV1::VoiceDefaultStaff/u);
  assert.match(runtime, /ReferenceAddressV1::EventStaffAssignment/u);

  for (const method of ["delete_range", "transpose_range_written_pitch"]) {
    assert.ok(range.includes(method), `Range route missing ${method}`);
    assert.match(runtime, new RegExp(`pub fn ${method}\\(`, "u"));
  }
  for (const forbidden of ["LiveScoreStore", "ScoreDocumentV1", "export_document"])
    assert.equal(
      range.includes(forbidden),
      false,
      `Range Session handler leaked ${forbidden}`,
    );
  const admission = readText("crates/brilliant-kernel-runtime/src/runtime/admission.rs");
  // Inspect executable function sections, excluding comments and string literals.
  const functionSection = (source: string, name: string): string => {
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"/gu, "");
    const functions = [...code.matchAll(/\bfn\s+([a-zA-Z_][a-zA-Z_0-9]*)\s*(?:<[^{}]*?>)?\s*\(/gu)];
    const index = functions.findIndex((match) => match[1] === name);
    assert.notEqual(index, -1, `missing executable function ${name}`);
    const start = functions[index];
    assert.ok(start);
    return code.slice(start.index, functions[index + 1]?.index);
  };
  const rawSubmit = functionSection(session, "submit_admission_command");
  assert.match(rawSubmit, /\.submit_stage4_admission\(\s*command,\s*commands::dispatch\s*\)/u);
  assert.match(functionSection(session, "submit_stage3_bytes"),
    /decode_admission_submit_request\([\s\S]*self\.submit_admission_command\(request\.command\)/u);
  assert.match(functionSection(session, "submit_stage4_command"),
    /self\.submit_admission_command\(command\.into_admission\(\)\)/u);
  assert.match(functionSection(session, "operate_stage4_bytes"),
    /decode_admission_stage4_operation_request\([\s\S]*Self::submit_admission_command/u);
  assert.match(functionSection(session, "replay_stage4_bytes"),
    /decode_stage4_replay_request\([\s\S]*Self::replay_stage4\(request\)/u);
  assert.match(functionSection(session, "replay_stage4"),
    /decode_captured_admission_replay_command\(captured\)[\s\S]*session\.submit_admission_command\(command\)/u);
  assert.doesNotMatch(session, /\bfn\s+dispatch_batch\s*\(/u);

  const batchDispatch = functionSection(admission, "dispatch");
  assert.match(batchDispatch, /CoreCommandEnvelopeV1::TransactionBatch/u);
  assert.match(batchDispatch,
    /for\s*\(index,\s*captured\)\s+in\s+commands\.iter\(\)\.enumerate\(\)\s*\{\s*let result = decode_captured_admission_command\(captured\)\.and_then\(\|child\|\s*\{\s*self\.dispatch_leaf\(child,\s*Some\(index\),\s*dispatch_typed\)/u);
  assert.match(batchDispatch,
    /if let Err\(failure\) = result\s*\{[\s\S]*return Err\(CommandFailure::BatchChildRejected\s*\{\s*failed_command_index:\s*index as u64/u);
  assert.doesNotMatch(batchDispatch, /\b(?:commit_prepared_mutation|submit_stage4_admission)\s*\(/u);
  const admissionSubmit = functionSection(admission, "submit_stage4_admission");
  const admissionPrepare = functionSection(admission, "prepare_admission");
  assert.match(admissionPrepare,
    /transaction\.dispatch\(command,\s*&dispatch_typed\)\s*\{\s*Ok\(\(\)\)\s*=>\s*transaction\.finish\(\)/u);
  assert.doesNotMatch(admissionPrepare, /\b(?:commit_prepared_mutation|submit_stage4_admission)\s*\(/u);
  assert.match(admissionSubmit, /match self\.prepare_admission\(command,\s*dispatch_typed\)/u);
  assert.equal([...admissionSubmit.matchAll(/\.commit_prepared_mutation\s*\(/gu)].length, 1);
  assert.ok(admissionSubmit.indexOf(".prepare_admission(") <
    admissionSubmit.indexOf(".commit_prepared_mutation("));

  assert.match(runtime, /pub fn begin_stage3_transaction\(/u);
  assert.match(runtime, /pub fn commit_stage4_transaction\(/u);
  assert.match(runtime, /state\.snapshot\.document_version = self\.document_version;/u);
});

test("RKP-3 exports and submit seam survive the Stage-4 successor", () => {
  const exports = Object.keys(addon).sort();
  for (const predecessor of [
    "createKernelSessionV1",
    "readKernelSessionV1",
    "submitKernelStage3V1",
  ]) {
    assert.ok(exports.includes(predecessor), `missing predecessor export ${predecessor}`);
  }
  assert.ok(exports.includes("operateKernelStage4V1"));
  assert.equal(
    exports.every((name) =>
      [
        "createKernelSessionV1",
        "operateKernelStage4V1",
        "readKernelSessionV1",
        "replayKernelStage4V1",
        "submitKernelStage3V1",
      ].includes(name),
    ),
    true,
  );

  const handle = createRawSession();
  const request = stage3Bytes(metadataCommand("Native Stage 3"));
  const response = addon.submitKernelStage3V1(handle, request);
  const submitted = parsePayload(response) as {
    readonly status: string;
    readonly value: {
      readonly documentVersion: number;
      readonly affected: readonly unknown[];
      readonly metrics: Record<string, number>;
    };
  };
  assert.equal(submitted.status, "committed");
  assert.equal(submitted.value.documentVersion, 1);
  assert.deepEqual(submitted.value.affected, [
    { kind: "document", documentId: "score-1" },
  ]);
  assert.equal(submitted.value.metrics.ffiRequestBytes, request.byteLength);
  assert.equal(submitted.value.metrics.ffiResponseBytes, response.byteLength);
  for (const key of [
    "fullDocumentScans",
    "fullDocumentClones",
    "fullSemanticValidations",
    "fullSnapshotMaterializations",
  ])
    assert.equal(submitted.value.metrics[key], 0, key);
  assert.equal("document" in submitted.value, false);
  assert.equal("changeSet" in submitted.value, false);

  const firstRead = addon.readKernelSessionV1(handle);
  const secondRead = addon.readKernelSessionV1(handle);
  assert.deepEqual(firstRead, secondRead);
  const read = parsePayload(firstRead) as {
    readonly value: {
      readonly snapshot: {
        readonly documentVersion: number;
        readonly document: { readonly metadata: { readonly title: string } };
      };
    };
  };
  assert.equal(read.value.snapshot.documentVersion, 1);
  assert.equal(read.value.snapshot.document.metadata.title, "Native Stage 3");

  const noOp = parsePayload(addon.submitKernelStage3V1(handle, request)) as {
    readonly status: string;
    readonly value: { readonly documentVersion: number };
  };
  assert.equal(noOp.status, "no-op");
  assert.equal(noOp.value.documentVersion, 1);
});

test("native submit preserves raw byte, handle, and command rejection boundaries", () => {
  const handle = createRawSession();
  assert.deepEqual(
    parsePayload(addon.submitKernelStage3V1(handle, "not a buffer")),
    {
      apiVersion: 1,
      status: "rejected",
      failure: { failureVersion: 1, code: "bridge.capture-invalid" },
    },
  );
  assert.deepEqual(
    parsePayload(addon.submitKernelStage3V1({}, stage3Bytes(metadataCommand("x")))),
    {
      apiVersion: 1,
      status: "rejected",
      failure: { failureVersion: 1, code: "bridge.handle-unknown" },
    },
  );

  const duplicate = Buffer.from(
    `{"apiVersion":1,"apiVersion":1,"command":${JSON.stringify(metadataCommand("x"))}}`,
    "utf8",
  );
  const duplicateResult = parsePayload(addon.submitKernelStage3V1(handle, duplicate));
  assert.equal(duplicateResult.status, "command-rejected");
  assert.equal(
    (duplicateResult.failure as { readonly code: string }).code,
    "command.invalid-envelope",
  );

  const missingTarget = metadataCommand("Must not commit");
  missingTarget.target = { kind: "document", documentId: "missing" };
  const before = addon.readKernelSessionV1(handle);
  const rejected = parsePayload(
    addon.submitKernelStage3V1(handle, stage3Bytes(missingTarget)),
  ) as {
    readonly status: string;
    readonly value: { readonly documentVersion: number };
    readonly failure: { readonly code: string };
  };
  assert.equal(rejected.status, "command-rejected");
  assert.equal(rejected.value.documentVersion, 0);
  assert.equal(rejected.failure.code, "command.target-not-found");
  assert.deepEqual(addon.readKernelSessionV1(handle), before);
});

test("native submit enforces the 64 MiB request boundary before decoding", () => {
  const handle = createRawSession();
  const limit = 64 * 1024 * 1024;
  const source = Buffer.alloc(limit + 1, 0x20);
  const atLimit = parsePayload(
    addon.submitKernelStage3V1(handle, source.subarray(0, limit)),
  );
  assert.equal(atLimit.status, "rejected");
  assert.equal(
    (atLimit.failure as { readonly code: string }).code,
    "codec.invalid-json",
  );
  assert.deepEqual(parsePayload(addon.submitKernelStage3V1(handle, source)), {
    apiVersion: 1,
    status: "rejected",
    failure: {
      failureVersion: 1,
      code: "bridge.request-too-large",
      limitBytes: limit,
      actualBytes: limit + 1,
    },
  });
});

test("private Stage-3 adapter captures hostile input and freezes detached results", () => {
  const created = createRustKernelSmokeSession(addon, createCoreScoreFixture());
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native create rejected");
  const committed = submitRustKernelSmokeCommand(
    addon,
    created.handle,
    metadataCommand("Adapter Stage 3"),
  );
  assert.equal(committed.status, "committed");
  assertDeepFrozen(committed);

  const read = readRustKernelSmokeSession(addon, created.handle);
  assert.equal(read.status, "ok");
  if (read.status !== "ok") throw new Error("native read rejected");
  assert.equal(read.value.snapshot.documentVersion, 1);
  assertDeepFrozen(read);

  let calls = 0;
  const hostileAddon: RustKernelStage3NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: () => {
      calls += 1;
      throw new Error("must not run");
    },
  };
  const getterCommand = {};
  Object.defineProperty(getterCommand, "commandVersion", {
    enumerable: true,
    get: () => {
      throw new Error("getter must not run");
    },
  });
  const hostileResult = submitRustKernelSmokeCommand(
    hostileAddon,
    created.handle,
    getterCommand,
  );
  assert.equal(hostileResult.status, "rejected");
  assert.equal(calls, 0);
  assertDeepFrozen(hostileResult);

  const malformedAddon: RustKernelStage3NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: () => Buffer.from("{}"),
  };
  const malformed = submitRustKernelSmokeCommand(
    malformedAddon,
    created.handle,
    metadataCommand("ignored"),
  );
  assert.deepEqual(malformed, {
    apiVersion: 1,
    status: "rejected",
    failure: { failureVersion: 1, code: "bridge.internal" },
  });
  assertDeepFrozen(malformed);

  const oversizedResponse = Buffer.alloc(64 * 1024 * 1024 + 1);
  const oversizedAddon: RustKernelStage3NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: () => oversizedResponse,
  };
  const oversized = submitRustKernelSmokeCommand(
    oversizedAddon,
    created.handle,
    metadataCommand("ignored"),
  );
  assert.deepEqual(oversized, {
    apiVersion: 1,
    status: "rejected",
    failure: {
      failureVersion: 1,
      code: "bridge.response-too-large",
      limitBytes: 64 * 1024 * 1024,
      actualBytes: 64 * 1024 * 1024 + 1,
    },
  });
  assertDeepFrozen(oversized);
});

test("local and single-event range work stays constant across unrelated measures", () => {
  const small = createRkp3ScaleDocument(4);
  const large = createRkp3ScaleDocument(256);
  const noteCommand = {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: "scale-note-0" },
    payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
  };
  const rangeCommand = {
    commandVersion: 1,
    commandId: "core.range.transpose-written-pitch",
    target: { kind: "document", documentId: "rkp3-scale" },
    payload: {
      range: {
        kind: "voice-event-range",
        start: { kind: "voice-event", voiceId: "scale-voice-0", eventId: "scale-event-0" },
        end: { kind: "voice-event", voiceId: "scale-voice-0", eventId: "scale-event-0" },
      },
      transposition: { diatonicSteps: 1, chromaticSemitones: 2 },
    },
  };

  const localSmall = committedMetrics(small, noteCommand);
  const localLarge = committedMetrics(large, noteCommand);
  assert.deepEqual(localLarge, localSmall);
  const rangeSmall = committedMetrics(small, rangeCommand);
  const rangeLarge = committedMetrics(large, rangeCommand);
  assert.deepEqual(rangeLarge, rangeSmall);
  for (const metrics of [localSmall, rangeSmall]) {
    for (const key of [
      "fullDocumentScans",
      "fullDocumentClones",
      "fullSemanticValidations",
      "fullSnapshotMaterializations",
    ])
      assert.equal(metrics[key], 0, key);
    assert.ok((metrics.entitiesVisited ?? Number.POSITIVE_INFINITY) <= 16);
  }
});
