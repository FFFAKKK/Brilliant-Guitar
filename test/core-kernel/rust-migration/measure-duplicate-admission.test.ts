import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const command = (commandId: string, target: unknown, payload: unknown = {}) => ({ commandVersion: 1, commandId, target, payload });
const batch = (commands: readonly unknown[]) => command("core.transaction.batch", { kind: "document", documentId: "score-1" }, { commands });
const insertion = (id = "measure-1", anchor: unknown = { kind: "start" }) => ({ commandVersion: 1, commandId: "core.measure.insert", target: { kind: "document", documentId: "score-1" }, payload: {
  anchor, definition: { id, meter: { numerator: 4, denominator: 4 } },
  contents: [{ partId: "part-1", voices: [{ id: "inserted-voice", defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 }, events: [] } }] }],
} });

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
  return { session, ts: oracle.value, read };
}

function rejectLikeTs(input: unknown, document = createCoreScoreFixture()) {
  const { session, ts, read } = fixture(document);
  const before = read();
  const expected = ts.submit(input);
  const result = session.submit(input);
  if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error(`rejection required: ${JSON.stringify({ expected, result })}`);
  assert.deepEqual(plain(result.failure), plain(expected.failure), JSON.stringify(input));
  assert.deepEqual(result.events, []);
  assert.strictEqual(read().snapshot, before.snapshot);
  assert.deepEqual(read().history, before.history);
  assert.equal(read().dirty, before.dirty);
  return expected.failure;
}

test("duplicate measure reports the requested numeric insertion index before any candidate adoption", () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base,
    measureDefinitions: Array.from({ length: 13 }, (_, index) => ({ ...base.measureDefinitions[0]!, id: `measure-${index + 1}` })),
    parts: [{ ...base.parts[0]!, measureContents: Array.from({ length: 13 }, (_, index) => ({ measureId: `measure-${index + 1}`, voices: [{ id: `voice-${index + 1}`, defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 }, events: [] } }] })) }],
  };
  for (const index of [0, 1, 10, 13]) {
    const anchor = index === 0 ? { kind: "start" } : { kind: "after-measure", measureId: `measure-${index}` };
    assert.deepEqual(plain(rejectLikeTs(insertion("measure-7", anchor), document)), {
      code: "command.semantic-invalid", diagnostics: [{ code: "semantic.id-duplicate", messageKey: "core.semantic.id-duplicate", path: ["measureDefinitions", index, "id"], details: { id: "measure-7" } }],
    });
  }
});

test("duplicate measure preserves envelope, document, anchor and Part target precedence", () => {
  const valid = insertion();
  const missingAnchor = { kind: "after-measure", measureId: "missing-measure" };
  const missingContents = [{ ...valid.payload.contents[0]!, partId: "missing-part" }];
  for (const [input, code] of [
    [{ ...valid, target: { kind: "document", documentId: "missing-score" }, payload: { ...valid.payload, anchor: missingAnchor, contents: missingContents } }, "command.target-not-found"],
    [{ ...valid, payload: { ...valid.payload, anchor: missingAnchor, contents: missingContents } }, "command.anchor-not-found"],
    [{ ...valid, payload: { ...valid.payload, contents: missingContents } }, "command.target-not-found"],
    [{ ...valid, payload: { ...valid.payload, contents: [] } }, "command.invalid-envelope"],
    [{ ...valid, payload: { ...valid.payload, contents: [{ ...valid.payload.contents[0]!, voices: [] }] } }, "command.invalid-envelope"],
  ] as const) assert.equal(rejectLikeTs(input).code, code);
  // Once preparation reaches duplication, later coverage and musical defects
  // must not replace or aggregate with this single command diagnostic.
  const malformed = { ...valid, payload: { ...valid.payload,
    definition: { ...valid.payload.definition, meter: { numerator: 0, denominator: 4 } },
    contents: [...valid.payload.contents, ...valid.payload.contents],
  } };
  assert.deepEqual(plain(rejectLikeTs(malformed)), plain(rejectLikeTs(valid)));
});

test("duplicate measure stops the batch at that child using the current overlay order", () => {
  const first = insertion("first-measure");
  const duplicate = insertion("measure-1", { kind: "after-measure", measureId: "measure-1" });
  const removal = command("core.measure.remove", { kind: "measure", measureId: "measure-1" });
  const input = batch([first, duplicate, removal]);
  const failure = rejectLikeTs(input);
  assert.deepEqual(plain(failure), { code: "command.batch-child-rejected", failedCommandIndex: 1,
    failure: { code: "command.semantic-invalid", diagnostics: [{ code: "semantic.id-duplicate", messageKey: "core.semantic.id-duplicate", path: ["measureDefinitions", 2, "id"], details: { id: "measure-1" } }] },
  });
  const base = createCoreScoreFixture();
  const badTempo = command("core.document.set-metadata", { kind: "document", documentId: base.id }, { metadata: { ...base.metadata, tempo: { bpm: 0 } } });
  const early = rejectLikeTs(batch([badTempo, insertion(), removal]));
  assert.equal(early.code, "command.batch-child-rejected");
  const replayed = replayRustKernelStage4(addon, base, [input]);
  if (replayed.status !== "rejected") throw new Error("replay rejection required");
  assert.deepEqual(plain(replayed.failure), plain(failure));
  assert.equal(replayed.failedCommandIndex, 0);
  assert.equal(replayed.documentVersion, 0);
  assert.deepEqual(plain(replayed.finalDocument), plain(base));
});

test("duplicate measure rejection preserves a redo branch and later successful identity reuse", () => {
  const base = createCoreScoreFixture();
  const { session, ts, read } = fixture(base);
  const first = insertion("first-measure");
  assert.equal(ts.submit(first).status, "committed");
  assert.equal(session.submit(first).status, "committed");
  assert.equal(ts.undo().status, "committed");
  assert.equal(session.undo().status, "committed");
  const before = read();
  const expected = ts.submit(insertion());
  const rejected = session.submit(insertion());
  if (expected.status !== "rejected" || rejected.status !== "command-rejected") throw new Error("duplicate rejection required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  assert.strictEqual(read().snapshot, before.snapshot);
  assert.deepEqual(read().history, before.history);
  assert.equal(read().dirty, before.dirty);
  assert.deepEqual(rejected.events, []);
  assert.equal(ts.redo().status, "committed");
  assert.equal(session.redo().status, "committed");
  const replacement = batch([command("core.measure.remove", { kind: "measure", measureId: "first-measure" }), first]);
  assert.equal(ts.submit(replacement).status, "committed");
  assert.equal(session.submit(replacement).status, "committed");
  const tsRead = ts.read();
  if (!tsRead.ok) throw new Error("TS read required");
  assert.deepEqual(plain(read().snapshot.document), plain(tsRead.value.snapshot.document));
});
