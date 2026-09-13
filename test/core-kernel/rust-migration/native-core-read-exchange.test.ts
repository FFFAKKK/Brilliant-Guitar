import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNativeWorkloadScore } from "../fixtures/native-workload";

type Callback = (input: Buffer) => Buffer;
interface Addon {
  createIntegratedKernelSessionV2(input: Buffer, callback: Callback, readProtocol?: number): Callback;
  migrateKernelExtensionV2(input: Buffer, callback: Callback, readProtocol?: number): Buffer;
}
// Use the freshly built Wasm artifact; the shared bridge also exists in V2.
const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as Addon;
const fixture = JSON.parse(readFileSync("crates/brilliant-kernel-session/src/wasm/fixtures/session.json", "utf8"));
const queryPrefix = Buffer.from("BGCR2Q\0");
const replyPrefix = Buffer.from("BGCR2R\0");
const encode = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const decode = (value: Buffer) => JSON.parse(value.toString("utf8"));
const note = (id = "note-1"): Buffer => encode({
  readVersion: 2, selectorId: "core.selector.score-entity", address: { kind: "note", noteId: id },
});
const metadata = encode({ readVersion: 2, selectorId: "core.selector.score-metadata" });
const capturedReply = (input: any): Buffer => Buffer.from(fixture.callbacks[
  input.operation === "assess" ? (input.document.extensions.length ? "assessPopulated" : "assessEmpty") : input.operation
]);

/** Test host with detached data continuations. The generator is never exposed
 * to Rust and receives no callable native reader or candidate handle. */
function exchange(factory: (input: any) => Generator<Buffer, Buffer, Buffer>): Callback {
  let pending: Generator<Buffer, Buffer, Buffer> | undefined;
  return bytes => {
    let next: IteratorResult<Buffer, Buffer>;
    if (bytes.subarray(0, replyPrefix.length).equals(replyPrefix)) {
      assert.ok(pending);
      next = pending.next(bytes.subarray(replyPrefix.length));
    } else {
      pending?.return(Buffer.alloc(0));
      pending = factory(decode(bytes));
      next = pending.next();
    }
    if (next.done) {
      pending = undefined;
      return next.value;
    }
    return Buffer.concat([queryPrefix, next.value]);
  };
}

function batch(commands: unknown[]) {
  return { operation: "submit", command: {
    commandVersion: 1, commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" }, payload: { commands },
  } };
}
const moduleCommand = () => JSON.parse(fixture.journey[1].request).command;
const prefix = () => ({
  commandVersion: 1, commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId: "note-1" },
  payload: { writtenPitch: { step: "E", alter: 0, octave: 4 } },
});
function state(operate: Callback) {
  const value = decode(operate(encode({ operation: "read" })));
  delete value.callbackProjections;
  return value;
}

test("Host transport budget rejects cumulative valid replies before adopting a Batch and resets afterwards", () => {
  let inflate = false, calls = 0, sawPrefix = false;
  const replies = new Map<string, Buffer>();
  const callback: Callback = bytes => {
    const input = decode(bytes), reply = capturedReply(input);
    if (!inflate) return reply;
    calls++;
    sawPrefix ||= input.operation === "prepare"
      && input.document.parts[0].measureContents[0].voices[0].sequence.events[0].content.notes[0].writtenPitch.step === "E";
    const key = reply.toString("utf8");
    if (!replies.has(key)) replies.set(key, Buffer.concat([reply, Buffer.alloc(16 * 1024 * 1024, 32)]));
    return replies.get(key)!;
  };
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  const before = state(operate);
  inflate = true;
  const result = decode(operate(encode(batch([prefix(), ...Array.from({ length: 10 }, moduleCommand)]))));
  assert.equal(result.ok, false);
  assert.equal(result.result?.events, undefined);
  assert.ok(sawPrefix);
  assert.equal(calls, 8, "eight padded replies exceed the shared 128 MiB transport account");
  assert.deepEqual(state(operate), before);
  inflate = false;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
});

test("A swallowed nested legacy-host transport failure still rejects its enclosing V2 operation", () => {
  let nested = false, refused = 0;
  const padded = Buffer.concat([Buffer.from(fixture.callbacks.assessEmpty), Buffer.alloc(32 * 1024 * 1024, 32)]);
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), bytes => {
    const input = decode(bytes);
    if (nested && input.operation === "prepare") {
      for (let i = 0; i < 4; i++) {
        try {
          // Omitting version 2 cannot escape an already active outer account.
          addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), () => padded);
        } catch { refused++; }
      }
    }
    return capturedReply(input);
  }, 2);
  const before = state(operate);
  nested = true;
  assert.equal(decode(operate(encode(batch([prefix(), moduleCommand()])))).ok, false);
  assert.equal(refused, 1);
  assert.deepEqual(state(operate), before);
  nested = false;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
});

test("Core read exchange explicitly opts in and preserves legacy callbacks and captured journey", () => {
  const observations: unknown[] = [];
  const callback = exchange(function* (input) {
    const reply = decode(yield note());
    const expected = input.document.parts[0].measureContents[0].voices[0].sequence.events[0].content.notes[0];
    assert.deepEqual(reply.result.value.value, expected);
    observations.push([input.operation, reply.documentVersion, expected.writtenPitch.step]);
    return capturedReply(input);
  });
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  observations.length = 0;
  for (const step of fixture.journey) {
    assert.deepEqual(decode(operate(Buffer.from(step.request))), JSON.parse(step.response));
  }
  assert.deepEqual(observations.slice(0, 2), [["prepare", 0, "C"], ["transform", 0, "D"]]);
  const legacy = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), bytes => capturedReply(decode(bytes)));
  assert.deepEqual(decode(legacy(Buffer.from(fixture.journey[0].request))), JSON.parse(fixture.journey[0].response));
  assert.throws(() => addon.createIntegratedKernelSessionV2(
    Buffer.from(fixture.initial), () => Buffer.concat([queryPrefix, metadata]),
  ));
  let calls = 0;
  for (const version of [0, 1, 5, 2.5, NaN, Infinity]) {
    assert.throws(() => addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), () => {
      calls++; return Buffer.alloc(0);
    }, version), /unsupported-core-read-protocol/);
  }
  assert.equal(calls, 0);
});

test("Native host reads actual last note of 256-bar candidate through edit and history", () => {
  const initial = JSON.parse(fixture.initial);
  initial.document = createNativeWorkloadScore(256);
  const seen: string[] = [];
  const callback = exchange(function* (input) {
    const bytes = yield note("note-1024");
    assert.ok(bytes.length < 512);
    const result = decode(bytes);
    const expected = input.document.parts[0].measureContents[255].voices[0].sequence.events[3].content.notes[0];
    assert.deepEqual(result.result.value.value, expected);
    seen.push(expected.writtenPitch.step);
    const output = decode(capturedReply(input));
    if (input.operation === "prepare") {
      output.prepared.effectRequests[0].target.noteId = "note-1024";
      output.prepared.affected[1].noteId = "note-1024";
    }
    return encode(output);
  });
  const operate = addon.createIntegratedKernelSessionV2(encode(initial), callback, 2);
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
  const edited = state(operate);
  assert.equal(edited.state.snapshot.document.parts[0].measureContents[255].voices[0].sequence.events[3].content.notes[0].writtenPitch.step, "D");
  assert.equal(decode(operate(encode({ operation: "undo" }))).ok, true);
  assert.equal(decode(operate(encode({ operation: "redo" }))).ok, true);
  const restored = state(operate);
  assert.deepEqual(restored.state.snapshot.document, edited.state.snapshot.document);
  assert.deepEqual(restored.state.history, edited.state.history);
  assert.equal(restored.state.dirty, edited.state.dirty);
  assert.equal(restored.state.snapshot.documentVersion, edited.state.snapshot.documentVersion + 2);
  assert.ok(seen.includes("C") && seen.includes("D"));
});

test("Read exchange rejects malformed and excessive queries with atomic rollback and recovery", () => {
  const badQueries = [
    Buffer.from("not-json"), Buffer.alloc(4097, 32),
    encode({ readVersion: 2, selectorId: "core.selector.score-metadata", documentId: "other" }),
    encode({ readVersion: 2, selectorId: "extensions" }),
  ];
  let bad: Buffer | undefined;
  let exhaust = false;
  let sawPrefix = false;
  const callback = exchange(function* (input) {
    if (input.operation === "prepare") {
      sawPrefix ||= input.document.parts[0].measureContents[0].voices[0].sequence.events[0].content.notes[0].writtenPitch.step === "E";
      if (bad !== undefined) yield bad;
      if (exhaust) for (let i = 0; i < 129; i++) yield metadata;
    }
    return capturedReply(input);
  });
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  const before = state(operate);
  for (const query of badQueries) {
    bad = query;
    const output = decode(operate(encode(batch([prefix(), moduleCommand()]))));
    assert.equal(output.ok, false);
    assert.equal(output.result?.events, undefined);
    assert.deepEqual(state(operate), before);
  }
  bad = undefined;
  exhaust = true;
  assert.equal(decode(operate(encode(batch([prefix(), moduleCommand()])))).ok, false);
  assert.deepEqual(state(operate), before);
  assert.ok(sawPrefix);
  exhaust = false;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
});

test("Fresh host callbacks share the 4096-query operation limit across an effective Batch", () => {
  let many = false;
  let queries = 0;
  const callback = exchange(function* (input) {
    if (many) for (let i = 0; i < 128; i++) {
      yield metadata;
      queries++;
    }
    return capturedReply(input);
  });
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  const before = state(operate);
  many = true;
  const result = decode(operate(encode(batch([prefix(), ...Array.from({ length: 17 }, moduleCommand)]))));
  assert.equal(result.ok, false);
  assert.equal(queries, 4096);
  assert.deepEqual(state(operate), before);
  many = false;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
});

test("Read exchange keeps reentry guarded and saved reply bytes cannot become session authority", () => {
  let operate: Callback | undefined;
  let reenter = false;
  let savedReply: Buffer | undefined;
  let badReturn = false;
  const callback = exchange(function* (input) {
    const response = yield note();
    savedReply = Buffer.concat([replyPrefix, response]);
    if (reenter) {
      assert.ok(operate);
      const rejected = decode(operate(encode({ operation: "read" })));
      assert.equal(rejected.failure.code, "event.reentrant-write");
    }
    if (badReturn) return savedReply;
    return capturedReply(input);
  });
  operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  reenter = true;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
  assert.ok(savedReply);
  const before = state(operate);
  assert.equal(decode(operate(savedReply)).ok, false);
  assert.deepEqual(state(operate), before);
  badReturn = true;
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, false);
  assert.deepEqual(state(operate), before);
  badReturn = false;
  assert.equal(decode(operate(encode({ operation: "undo" }))).ok, true);
});

test("Caught nested-session query exhaustion still rejects the outer callback and later operations recover", () => {
  let nested = false;
  let childReplies = 0;
  let caught = 0;
  const callback = exchange(function* (input) {
    yield metadata;
    if (nested && input.operation === "prepare") {
      nested = false;
      for (let session = 0; session < 32; session++) {
        try {
          addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), exchange(function* (child) {
            for (let i = 0; i < 128; i++) {
              yield metadata;
              childReplies++;
            }
            return capturedReply(child);
          }), 2);
        } catch {
          caught++;
        }
      }
    }
    // A successful ordinary reply cannot clear the nested account's failure.
    return capturedReply(input);
  });
  const operate = addon.createIntegratedKernelSessionV2(Buffer.from(fixture.initial), callback, 2);
  const before = state(operate);
  nested = true;
  assert.equal(decode(operate(encode(batch([prefix(), moduleCommand()])))).ok, false);
  assert.equal(caught, 1);
  assert.equal(childReplies, 4095);
  assert.deepEqual(state(operate), before);
  assert.equal(decode(operate(Buffer.from(fixture.journey[1].request))).ok, true);
});

test("Detached migration uses read exchange with null revision and rejects a bad read in either phase", () => {
  const initial = JSON.parse(fixture.initial);
  delete initial.inventory;
  initial.document.extensions = [{
    namespace: "fixture.score", owner: { kind: "score" }, schemaVersion: 1, payload: { marker: "old" },
  }];
  initial.request = {
    migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
    effectKind: "fixture.score.replace", namespace: "fixture.score", owner: { kind: "score" },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: {},
  };
  for (const fail of [undefined, "migrationPrepare", "migrationValidate"]) {
    const phases: string[] = [];
    const callback = exchange(function* (input) {
      phases.push(input.operation);
      const reply = decode(yield note());
      assert.equal(reply.documentVersion, null);
      assert.equal(reply.result.value.value.id, "note-1");
      if (input.operation === fail) yield Buffer.from("invalid");
      return input.operation === "migrationPrepare"
        ? encode({ ok: true, schemaVersion: 2, payload: { marker: "new" } })
        : encode({ ok: true });
    });
    const result = decode(addon.migrateKernelExtensionV2(encode(initial), callback, 2));
    assert.equal(result.status, fail === undefined ? "migrated" : "rejected");
    if (fail !== undefined) assert.equal(result.document, undefined);
    else assert.equal(result.document.extensions[0].payload.marker, "new");
    assert.equal(phases.length, fail === "migrationPrepare" ? 1 : 2);
  }
});
