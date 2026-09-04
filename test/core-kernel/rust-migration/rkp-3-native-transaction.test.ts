import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

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
      "detach_entity",
      "read_order",
      "read_extension",
      "read_reference",
      "list_references_to",
      "read_voice_time",
    ],
  );
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

test("RKP-3 overlay uses discard-only failure and copy-on-first-write orders", () => {
  const source = readText("crates/brilliant-kernel-runtime/src/overlay.rs");

  assert.match(source, /poisoned: bool/u);
  assert.match(source, /self\.poisoned = true;\n        Err\(failure\)/u);
  assert.match(
    source,
    /if self\.orders\.contains_key\(address\) \{\n            return Ok\(\(\)\);\n        \}/u,
  );
  assert.match(
    source,
    /self\.metrics\.order_copies = self\.metrics\.order_copies\.saturating_add\(1\);/u,
  );
  assert.equal(source.includes("clone_from(&self.base"), false);
  assert.equal(source.includes("self.base ="), false);
});

test("RKP-3 Session owns a literal closed catalog and the first twenty-five command routes", () => {
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

  assert.match(runtime, /pub fn begin_stage3_transaction\(/u);
  assert.match(runtime, /pub fn commit_stage3_transaction\(/u);
  assert.match(runtime, /state\.snapshot\.document_version = self\.document_version;/u);
});
