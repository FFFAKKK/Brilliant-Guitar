import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, replayCoreCommands, type KernelEvent } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, submitRustKernelSmokeCommand, type RustKernelStage4NativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { assertRkp4DeepFrozen, createRkp4MetadataCommand, createRkp4OperationBytes, parseRkp4Payload, type RawRkp4NativeAddon } from "./rkp-4-fixtures";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RawRkp4NativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const command = (commandId: string, target: unknown, payload: unknown = {}) => ({ commandVersion: 1, commandId, target, payload });

function repairedBatch() {
  const document = createCoreScoreFixture();
  const source = document.parts[0]!;
  const part = {
    ...source, id: "temporary-part",
    staves: [source.staves[0]!, source.staves[0]!].map(staff => ({ ...staff, id: "" })),
    measureContents: source.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({
      ...voice, id: "", defaultStaffId: "", sequence: { ...voice.sequence, events: voice.sequence.events.map(event => ({
        ...event, id: "", content: event.content.kind === "rest" ? event.content : { ...event.content, notes: event.content.notes.map(note => ({ ...note, id: "" })) },
      })) },
    })) })),
  };
  const insert = command("core.part.insert", { kind: "document", documentId: document.id }, { anchor: { kind: "start" }, part });
  const remove = command("core.part.remove", { kind: "part", partId: part.id });
  return { document, batch: command("core.transaction.batch", { kind: "document", documentId: document.id }, { commands: [insert, remove] }) };
}

const expectedAffected = [
  { kind: "document", documentId: "score-1" }, { kind: "part", partId: "temporary-part" },
  { kind: "staff", staffId: "" }, { kind: "voice", voiceId: "" },
  { kind: "event", eventId: "" }, { kind: "note", noteId: "" },
];

test("TS repaired candidate journal retains empty affected IDs, committed net-zero history and dirty identity", () => {
  const { document, batch } = repairedBatch();
  const created = CommandBus.create(document);
  if (!created.ok) throw new Error("TS oracle required");
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  for (const [index, action] of [() => bus.submit(batch), () => bus.undo(), () => bus.redo()].entries()) {
    const result = action();
    assert.deepEqual(result, { status: "committed", documentVersion: index + 1, support: { status: "supported", diagnostics: [] }, undoDepth: index === 1 ? 0 : 1, redoDepth: index === 1 ? 1 : 0 });
    const read = bus.read();
    if (!read.ok) throw new Error("TS read required");
    assert.deepEqual(read.value.snapshot.document, document);
    assert.equal(read.value.dirty, index !== 1, "content identity follows history, not document byte equality");
    const committed = events[index * 2];
    assert.equal(committed?.eventType, "core.document.committed");
    if (committed?.eventType !== "core.document.committed") throw new Error("commit event required");
    assert.deepEqual(committed.affectedEntities, expectedAffected);
    assert.equal(committed.eventSequence, index * 2 + 1);
    assert.equal(events[index * 2 + 1]?.eventType, "core.session.dirty-state-changed");
  }
  assert.equal(events.length, 6);
  const replay = replayCoreCommands(document, [batch]);
  assert.equal(replay.status, "replayed");
  if (replay.status !== "replayed") throw new Error("TS replay required");
  assert.deepEqual(replay.finalDocument, document);
  assert.equal(replay.documentVersion, 1);
});

test("native response adapters preserve repaired-candidate affected addresses without relaxing shape checks", () => {
  const created = createRustKernelSmokeSession(addon, createCoreScoreFixture());
  if (!("handle" in created)) throw new Error("native create required");
  const raw = parseRkp4Payload(addon.operateKernelStage4V1(created.handle, createRkp4OperationBytes({ kind: "submit", command: createRkp4MetadataCommand("transport fixture") })));
  assert.equal(raw.status, "committed");
  const value = raw.value as Record<string, unknown>;
  const sourceEvents = raw.events as Array<Record<string, unknown>>;
  const output = { ...raw, value: { ...value, affected: expectedAffected }, events: sourceEvents.map(event => event.eventType === "core.document.committed" ? { ...event, affectedEntities: expectedAffected } : event) };
  const transport: RustKernelStage4NativeAddon = {
    ...addon,
    operateKernelStage4V1: () => Buffer.from(JSON.stringify(output)),
    submitKernelStage3V1: () => Buffer.from(JSON.stringify({ apiVersion: 1, status: "committed", value: { documentVersion: 1, affected: expectedAffected, metrics: value.metrics } })),
  };
  const session = createRustKernelStage4Session(transport, created.handle);
  const delivered: unknown[] = [];
  session.subscribe(event => delivered.push(event));
  const result = session.submit(createRkp4MetadataCommand("transport fixture"));
  assert.equal(result.status, "committed");
  if (result.status !== "committed") throw new Error("candidate affected output required");
  assert.deepEqual(plain(result.value.affected), expectedAffected);
  assert.deepEqual(plain(result.events), output.events);
  assert.deepEqual(plain(delivered), output.events);
  assertRkp4DeepFrozen(result);
  assert.equal(submitRustKernelSmokeCommand(transport, created.handle, createRkp4MetadataCommand("transport fixture")).status, "committed");
  for (const bad of [null, 0, { kind: "staff", staffId: null }, { kind: "staff", staffId: 0 }, { kind: "staff", staffId: "", extra: 1 }, { kind: "unknown", staffId: "" }]) {
    for (const field of ["affected", "affectedEntities"] as const) {
      const malformed = field === "affected" ? { ...output, value: { ...output.value, affected: [bad] } } : { ...output, events: [{ ...output.events[0], affectedEntities: [bad] }] };
      const rejected = createRustKernelStage4Session({ ...transport, operateKernelStage4V1: () => Buffer.from(JSON.stringify(malformed)) }, created.handle).undo();
      assert.equal(rejected.status, "rejected");
      if (rejected.status !== "rejected") throw new Error("malformed boundary rejection required");
      assert.equal(rejected.failure.code, "bridge.internal");
    }
  }
});

test("native input command targets remain nonempty for all seven entity kinds", () => {
  const document = createCoreScoreFixture();
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const session = createRustKernelStage4Session(addon, created.handle);
  for (const [kind, field, commandId, payload] of [
    ["document", "documentId", "core.document.set-metadata", { metadata: document.metadata }],
    ["measure", "measureId", "core.measure.remove", {}],
    ["part", "partId", "core.part.remove", {}],
    ["staff", "staffId", "core.staff.remove", {}],
    ["voice", "voiceId", "core.voice.remove", {}],
    ["event", "eventId", "core.event.remove", {}],
    ["note", "noteId", "core.note.set-written-pitch", { writtenPitch: { step: "C", alter: 0, octave: 4 } }],
  ] as const) {
    const input = command(commandId, { kind, [field]: "" }, payload);
    const rejected = session.submit(input);
    assert.equal(rejected.status, "command-rejected");
    if (rejected.status !== "command-rejected") throw new Error("invalid target rejection required");
    assert.deepEqual(plain(rejected.failure), { code: "command.invalid-envelope" });
    assert.deepEqual(rejected.events, []);
    const stage3 = submitRustKernelSmokeCommand(addon, created.handle, input);
    assert.equal(stage3.status, "command-rejected");
    if (stage3.status !== "command-rejected") throw new Error("Stage 3 invalid target rejection required");
    assert.deepEqual(plain(stage3.failure), { code: "command.invalid-envelope" });
  }
  const read = session.read();
  if (read.status !== "ok") throw new Error("native read required");
  assert.deepEqual(plain(read.value.snapshot.document), document);
  assert.deepEqual(plain(read.value.history), { undoDepth: 0, redoDepth: 0 });
  assert.equal(read.value.snapshot.documentVersion, 0);
});
