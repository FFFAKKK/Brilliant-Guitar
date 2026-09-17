import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type Part, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const command = (commandId: string, target: unknown, payload: unknown = {}) => ({ commandVersion: 1, commandId, target, payload });
const batch = (commands: readonly unknown[]) => command("core.transaction.batch", { kind: "document", documentId: "score-1" }, { commands });
const staffLines = (lineCount: number, staffId = "staff-1") => command("core.staff.set-definition", { kind: "staff", staffId }, { lineCount, defaultClef: { sign: "G", line: 2 } });
const removeVoice = () => command("core.voice.remove", { kind: "voice", voiceId: "voice-1" });
const removePart = () => command("core.part.remove", { kind: "part", partId: "part-1" });
const removeMeasure = () => command("core.measure.remove", { kind: "measure", measureId: "measure-1" });
const voiceStaff = (staffId: string) => command("core.voice.set-default-staff", { kind: "voice", voiceId: "voice-1" }, { staffId });
const eventStaff = (staffId: string) => command("core.event.set-staff-assignment", { kind: "event", eventId: "event-1" }, { assignment: { kind: "staff", staffId } });
const insertPart = (part: Part) => command("core.part.insert", { kind: "document", documentId: "score-1" }, { anchor: { kind: "start" }, part });
const retiredTimingCodes = new Set([
  "semantic.sequence-exceeds-measure",
  "semantic.sequence-start-out-of-bounds",
]);

function withoutRetiredTimingDiagnostics<T>(result: T): T | null {
  if (!result || typeof result !== "object") return result;
  const value = result as { readonly status?: unknown; readonly failure?: unknown };
  if (value.status !== "rejected") return result;

  const filterFailure = (failure: unknown): unknown | null => {
    if (!failure || typeof failure !== "object") return failure;
    const candidate = failure as { readonly code?: unknown; readonly diagnostics?: readonly unknown[]; readonly failure?: unknown };
    if (candidate.code === "command.semantic-invalid" && Array.isArray(candidate.diagnostics)) {
      const diagnostics = candidate.diagnostics.filter((diagnostic) => !(
        diagnostic !== null && typeof diagnostic === "object"
        && retiredTimingCodes.has(String((diagnostic as { readonly code?: unknown }).code))
      ));
      if (diagnostics.length === 0) return null;
      return diagnostics.length === candidate.diagnostics.length ? failure : { ...candidate, diagnostics };
    }
    if (candidate.code === "command.batch-child-rejected") {
      const child = filterFailure(candidate.failure);
      return child === null ? null : { ...candidate, failure: child };
    }
    return failure;
  };

  const failure = filterFailure(value.failure);
  return failure === null ? null : { ...value, failure } as T;
}

function fixture(document = createCoreScoreFixture()) {
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const session = createRustKernelStage4Session(addon, created.handle);
  const oracle = CommandBus.create(document);
  if (!oracle.ok) throw new Error("TS oracle required");
  const read = () => {
    const result = session.read();
    if (result.status !== "ok") throw new Error("native read required");
    return result.value;
  };
  return { document, session, ts: oracle.value, read };
}

function rejectLikeTs(input: unknown, document = createCoreScoreFixture(), expectedCode = "command.semantic-invalid") {
  const { session, ts, read } = fixture(document);
  const before = read();
  const expected = withoutRetiredTimingDiagnostics(ts.submit(input));
  const result = session.submit(input);
  if (expected === null) throw new Error(`non-timing rejection required: ${JSON.stringify(input)}`);
  if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error(`rejection required: ${JSON.stringify({ input, expected, result })}`);
  const leaf = expected.failure.code === "command.batch-child-rejected" ? expected.failure.failure : expected.failure;
  assert.equal(leaf.code, expectedCode, JSON.stringify(input));
  assert.deepEqual(plain(result.failure), plain(expected.failure), JSON.stringify(input));
  assert.deepEqual(result.events, []);
  assert.strictEqual(read().snapshot, before.snapshot);
  assert.deepEqual(read().history, before.history);
  assert.equal(read().dirty, before.dirty);
  return result;
}

test("staff definition and required container failures use exact final semantic reports", () => {
  for (const input of [staffLines(0), staffLines(-1), removePart(), removeMeasure(), removeVoice()]) rejectLikeTs(input);
});

test("hierarchy diagnostics aggregate with metadata using final surviving owners", () => {
  const document = createCoreScoreFixture();
  const tempo = command("core.document.set-metadata", { kind: "document", documentId: document.id }, { metadata: { ...document.metadata, tempo: { bpm: 0 } } });
  for (const input of [batch([staffLines(0), removeVoice(), tempo]), batch([staffLines(0), removePart(), tempo])]) rejectLikeTs(input);
});

test("temporary empty containers and invalid staff definitions can be repaired in the same batch", () => {
  const document = createCoreScoreFixture();
  const part = document.parts[0]!;
  const voice = part.measureContents[0]!.voices[0]!;
  for (const input of [
    batch([removeVoice(), command("core.voice.insert", { kind: "part", partId: part.id }, { measureId: "measure-1", anchor: { kind: "start" }, voice })]),
    batch([removePart(), command("core.part.insert", { kind: "document", documentId: document.id }, { anchor: { kind: "start" }, part })]),
    batch([removeMeasure(), command("core.measure.insert", { kind: "document", documentId: document.id }, { anchor: { kind: "start" }, definition: document.measureDefinitions[0], contents: [{ partId: part.id, voices: [voice] }] })]),
    batch([staffLines(0), staffLines(6)]),
  ]) {
    const { session, ts, read } = fixture(document);
    assert.equal(ts.submit(input).status, "committed");
    assert.equal(session.submit(input).status, "committed");
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
    const replayed = replayRustKernelStage4(addon, document, [input]);
    if (replayed.status !== "replayed") throw new Error("hierarchy batch replay required");
    assert.deepEqual(plain(replayed.finalDocument), plain(final));
  }
});

test("voice default staff uses final semantic membership and allows a later inserted target", () => {
  rejectLikeTs(voiceStaff("missing-staff"));
  const { document, session, ts, read } = fixture();
  const before = read();
  const input = batch([voiceStaff("new-staff"), command("core.staff.insert", { kind: "part", partId: "part-1" }, { anchor: { kind: "start" }, staff: { ...document.parts[0]!.staves[0]!, id: "new-staff" } })]);
  assert.equal(ts.submit(input).status, "committed");
  assert.equal(session.submit(input).status, "committed");
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(before.snapshot.document));
});

test("referenced staff removal retains the earlier reference-conflict command failure", () => {
  rejectLikeTs(command("core.staff.remove", { kind: "staff", staffId: "staff-1" }), undefined, "command.reference-conflict");
  rejectLikeTs(batch([staffLines(0), command("core.staff.remove", { kind: "staff", staffId: "staff-1" })]), undefined, "command.reference-conflict");
});

function newPart(suffix: string, staffCount = 1): Part {
  const source = createCoreScoreFixture().parts[0]!;
  return { ...source, id: `part-${suffix}`,
    staves: Array.from({ length: staffCount }, (_, index) => ({ ...source.staves[0]!, id: `staff-${suffix}-${index}` })),
    measureContents: [{ measureId: "measure-1", voices: [{
      id: `voice-${suffix}`, defaultStaffId: `staff-${suffix}-0`, sequence: {
        start: { numerator: 0, denominator: 1 }, events: [{ id: `event-${suffix}`, duration: { base: 4, dots: 0 }, content: { kind: "rest" } }],
      },
    }] }],
  };
}

test("all representable inserted hierarchy shapes receive aggregate final semantics", () => {
  const part = newPart("inserted");
  const emptyNotes = { id: "empty-event", duration: { base: 4, dots: 0 }, content: { kind: "notes", notes: [] } };
  const voice = { id: "inserted-voice", defaultStaffId: "missing-staff", sequence: { start: { numerator: 0, denominator: 1 }, events: [emptyNotes] } };
  const insertVoice = command("core.voice.insert", { kind: "part", partId: "part-1" }, { measureId: "measure-1", anchor: { kind: "start" }, voice });
  for (const input of [
    insertPart({ ...part, staves: [] }),
    insertPart({ ...part, measureContents: [{ measureId: "measure-1", voices: [] }] }),
    insertVoice,
    command("core.voice.insert-notes-event", { kind: "voice", voiceId: "voice-1" }, { anchor: { kind: "start" }, event: emptyNotes }),
    batch([removeVoice(), command("core.staff.remove", { kind: "staff", staffId: "staff-1" })]),
  ]) rejectLikeTs(input);
  // Measure insertion has a stricter envelope than a nested Part component.
  rejectLikeTs(command("core.measure.insert", { kind: "document", documentId: "score-1" }, { anchor: { kind: "start" }, definition: { id: "empty-measure", meter: { numerator: 4, denominator: 4 } }, contents: [{ partId: "part-1", voices: [] }] }), undefined, "command.invalid-envelope");
  // Empty notes are a final-state error: a later child can remove that event.
  const repaired = batch([insertVoice, command("core.event.remove", { kind: "event", eventId: "empty-event" }), command("core.voice.set-default-staff", { kind: "voice", voiceId: "inserted-voice" }, { staffId: "staff-1" })]);
  const { session, ts } = fixture();
  assert.equal(ts.submit(repaired).status, "committed");
  assert.equal(session.submit(repaired).status, "committed");
});

test("staff membership is local to the final Part for both voice and event references", () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base, parts: [...base.parts, newPart("other")] };
  for (const input of [voiceStaff("staff-other-0"), eventStaff("staff-other-0"), eventStaff("missing-staff"), batch([eventStaff("missing-staff"), voiceStaff("staff-other-0"), staffLines(0)])]) rejectLikeTs(input, document);
  for (const setter of [voiceStaff, eventStaff]) {
    const { session, ts, read } = fixture(document);
    const input = batch([setter("new-staff"), command("core.staff.insert", { kind: "part", partId: "part-1" }, { anchor: { kind: "start" }, staff: { ...document.parts[0]!.staves[0]!, id: "new-staff" } })]);
    assert.equal(ts.submit(input).status, "committed");
    assert.equal(session.submit(input).status, "committed");
    const final = read().snapshot.document;
    const expected = ts.read();
    if (!expected.ok) throw new Error("TS read required");
    assert.deepEqual(plain(final), plain(expected.value.snapshot.document));
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
  }
});

test("staff removal sees current batch references and same-ID reconstruction uses final owners", () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base, parts: [{ ...base.parts[0]!, staves: [...base.parts[0]!.staves, { ...base.parts[0]!.staves[0]!, id: "staff-spare" }] }] };
  const { session, ts, read } = fixture(document);
  const input = batch([
    voiceStaff("staff-spare"),
    command("core.staff.remove", { kind: "staff", staffId: "staff-1" }),
    voiceStaff("staff-1"), // Can point to the later reconstructed identity.
    command("core.staff.insert", { kind: "part", partId: "part-1" }, { anchor: { kind: "start" }, staff: { ...document.parts[0]!.staves[0]!, lineCount: 6 } }),
  ]);
  assert.equal(ts.submit(input).status, "committed");
  assert.equal(session.submit(input).status, "committed");
  const final = read().snapshot.document;
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(document));
  assert.equal(session.redo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(final));
  rejectLikeTs(batch([command("core.staff.remove", { kind: "staff", staffId: "staff-1" }), voiceStaff("staff-spare")]), document, "command.reference-conflict");
});

test("staff scalar work stays local while combined hierarchy diagnostics obey the shared cap", () => {
  for (const partCount of [1, 64]) {
    const base = createCoreScoreFixture();
    const { session } = fixture({ ...base, parts: [...base.parts, ...Array.from({ length: partCount - 1 }, (_, index) => newPart(`scale-${index}`))] });
    const result = session.submit(staffLines(6));
    if (result.status !== "committed") throw new Error("staff scalar commit required");
    assert.equal(result.value.metrics.semanticRulesEvaluated, 1);
    assert.equal(result.value.metrics.semanticDependencyReads, 0);
  }
  for (const count of [4096, 4097]) {
    const { document, session, read } = fixture();
    const part = newPart("cap", count - 1);
    const input = batch([insertPart({ ...part, staves: part.staves.map((staff) => ({ ...staff, lineCount: 0 })) }), command("core.document.set-metadata", { kind: "document", documentId: document.id }, { metadata: { ...document.metadata, tempo: { bpm: 0 } } })]);
    const before = read();
    const result = session.submit(input);
    if (result.status !== "command-rejected") throw new Error("combined hierarchy rejection required");
    if (count === 4096) {
      assert.equal(result.failure.code, "command.semantic-invalid");
      const diagnostics = result.failure.diagnostics as readonly { code: string }[];
      assert.equal(diagnostics.length, 4096);
      assert.equal(diagnostics[0]!.code, "semantic.tempo-invalid");
      assert.equal(diagnostics[4095]!.code, "semantic.staff-line-count-invalid");
      assert.ok(result.value.metrics.semanticDependencyReads < count * 4 + 64);
    } else assert.deepEqual(plain(result.failure), { code: "command.resource-limit-exceeded", limitKind: "diagnostics", limit: 4096, actual: 4097 });
    assert.deepEqual(result.events, []);
    assert.strictEqual(read().snapshot, before.snapshot);
  }
});
