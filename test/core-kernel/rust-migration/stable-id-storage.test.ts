import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type Part } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const command = (commandId: string, target: unknown, payload: unknown = {}) => ({ commandVersion: 1, commandId, target, payload });

test("native shared ID storage preserves long Unicode identities through batch history and replay", () => {
  const source = createCoreScoreFixture();
  const document = { ...source, id: "文档/🎼/".repeat(2048) };
  const template = source.parts[0]!;
  const partId = "声部/🎸/".repeat(8192);
  const part: Part = {
    ...template, id: partId,
    staves: Array.from({ length: 256 }, (_, index) => ({ ...template.staves[0]!, id: `新增谱表/🎸/${index}` })),
    measureContents: [{ measureId: "measure-1", voices: [{
      id: "新增声部/🎸", defaultStaffId: "新增谱表/🎸/0", sequence: {
        start: { numerator: 0, denominator: 1 },
        events: [{ id: "新增事件/🎸", duration: { base: 4, dots: 0 }, content: { kind: "rest" } }],
      },
    }] }],
  };
  const insert = command("core.part.insert", { kind: "document", documentId: document.id }, { anchor: { kind: "start" }, part });
  const rename = command("core.part.set-name", { kind: "part", partId }, { name: "共享 ID 声部" });
  const input = command("core.transaction.batch", { kind: "document", documentId: document.id }, { commands: [insert, rename] });
  const oracle = CommandBus.create(document);
  if (!oracle.ok) throw new Error("TS oracle required");
  assert.equal(oracle.value.submit(input).status, "committed");
  const expected = oracle.value.read();
  if (!expected.ok) throw new Error("TS read required");

  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const session = createRustKernelStage4Session(addon, created.handle);
  const read = () => {
    const result = session.read();
    if (result.status !== "ok") throw new Error("native read required");
    return result.value;
  };
  assert.equal(session.submit(input).status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(expected.value.snapshot.document));
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(document));
  const before = read();
  const rejected = session.submit(rename);
  assert.equal(rejected.status, "command-rejected");
  if (rejected.status !== "command-rejected") throw new Error("missing Part rejection required");
  assert.deepEqual(plain(rejected.failure), { code: "command.target-not-found" });
  assert.deepEqual(rejected.events, []);
  assert.strictEqual(read().snapshot, before.snapshot);
  assert.deepEqual(read().history, before.history);
  assert.equal(read().dirty, before.dirty);
  assert.equal(session.redo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(expected.value.snapshot.document));
  const replayed = replayRustKernelStage4(addon, document, [input]);
  if (replayed.status !== "replayed") throw new Error("native replay required");
  assert.deepEqual(plain(replayed.finalDocument), plain(expected.value.snapshot.document));
});
