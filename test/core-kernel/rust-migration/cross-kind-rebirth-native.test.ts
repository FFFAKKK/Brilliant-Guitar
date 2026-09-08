import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type KernelEvent } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("native cross-kind ID rebirth commits, undoes and redoes with exact TS state and events", () => {
  const document = createCoreScoreFixture();
  const referenceResult = CommandBus.create(document);
  assert.ok(referenceResult.ok);
  if (!referenceResult.ok) throw new Error("reference create rejected");
  const reference = referenceResult.value;
  const created = createRustKernelSmokeSession(addon, document);
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("create rejected");
  const native = createRustKernelStage4Session(addon, created.handle);
  const events: KernelEvent[] = [];
  reference.subscribe((event: KernelEvent) => { events.push(event); });
  const command = {
    commandVersion: 1, commandId: "core.transaction.batch",
    target: { kind: "document", documentId: document.id }, payload: { commands: [
      { commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId: "event-1" }, payload: {} },
      { commandVersion: 1, commandId: "core.staff.insert", target: { kind: "part", partId: "part-1" }, payload: {
        anchor: { kind: "start" }, staff: { ...document.parts[0]!.staves[0]!, id: "event-1" },
      } },
    ] },
  };
  const actions = [
    () => [reference.submit(command), native.submit(command)] as const,
    () => [reference.undo(), native.undo()] as const,
    () => [reference.redo(), native.redo()] as const,
  ];
  for (const [index, action] of actions.entries()) {
    events.length = 0;
    const [expected, actual] = action();
    assert.equal(expected.status, "committed");
    assert.equal(actual.status, "committed");
    assert.equal(actual.value.documentVersion, index + 1);
    assert.equal(actual.value.documentVersion, expected.documentVersion);
    assert.deepEqual(plain(actual.events), plain(events));
    const expectedRead = reference.read();
    const actualRead = native.read();
    assert.ok(expectedRead.ok);
    assert.equal(actualRead.status, "ok");
    if (!expectedRead.ok || actualRead.status !== "ok") throw new Error("read rejected");
    assert.deepEqual(plain({ snapshot: actualRead.value.snapshot, history: actualRead.value.history, dirty: actualRead.value.dirty }), plain(expectedRead.value));
  }
});
