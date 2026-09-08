import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type KernelEvent, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

for (const scenario of [
  { name: "range B keeps C,A", global: ["A", "B", "C"], content: ["C", "B", "A"], range: true, end: "B", expected: ["C", "A"] },
  { name: "single B removal normalizes A,C", global: ["A", "B", "C"], content: ["C", "B", "A"], range: false, end: "B", expected: ["A", "C"] },
  { name: "reversed multi range keeps D,A", global: ["A", "B", "C", "D"], content: ["D", "C", "B", "A"], range: true, end: "C", expected: ["D", "A"] },
  { name: "ordered content multi range keeps A,D", global: ["A", "B", "C", "D"], content: ["A", "B", "C", "D"], range: true, end: "C", expected: ["A", "D"] },
]) test(`native/TS range content order: ${scenario.name}`, () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base,
    measureDefinitions: scenario.global.map(id => ({ ...base.measureDefinitions[0]!, id })),
    parts: base.parts.map((part, index) => ({ ...part, measureContents: scenario.content.map(measureId => ({
      measureId, voices: [{ id: `range-${index}-${measureId}`, defaultStaffId: part.staves[0]!.id,
        sequence: { start: { numerator: 0, denominator: 1 }, events: [] } }],
    })) })),
  };
  const reference = CommandBus.create(document);
  if (!reference.ok) throw new Error("TS create required");
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const native = createRustKernelStage4Session(addon, created.handle);
  const events: KernelEvent[] = [];
  reference.value.subscribe((event: KernelEvent) => { events.push(event); });
  const command = scenario.range ? {
    commandVersion: 1, commandId: "core.range.delete", target: { kind: "document", documentId: document.id },
    payload: { range: { kind: "measure-range", start: { kind: "measure", measureId: scenario.end }, end: { kind: "measure", measureId: "B" } } },
  } : { commandVersion: 1, commandId: "core.measure.remove", target: { kind: "measure", measureId: "B" }, payload: {} };
  for (const [index, action] of [
    () => [reference.value.submit(command), native.submit(command)] as const,
    () => [reference.value.undo(), native.undo()] as const,
    () => [reference.value.redo(), native.redo()] as const,
  ].entries()) {
    events.length = 0;
    const [expected, actual] = action();
    assert.equal(expected.status, "committed");
    assert.equal(actual.status, "committed");
    if (expected.status !== "committed" || actual.status !== "committed") throw new Error("commit required");
    assert.deepEqual(plain(actual.events), plain(events));
    const committed = events.find(event => event.eventType === "core.document.committed");
    if (!committed || committed.eventType !== "core.document.committed") throw new Error("commit event required");
    assert.deepEqual(plain(actual.value.affected), plain(committed.affectedEntities));
    const tsRead = reference.value.read();
    const nativeRead = native.read();
    if (!tsRead.ok || nativeRead.status !== "ok") throw new Error("read required");
    const nativeDocument = nativeRead.value.snapshot.document as ScoreDocument;
    assert.deepEqual(plain(nativeDocument.parts[0]!.measureContents.map(content => content.measureId)), index === 1 ? scenario.content : scenario.expected);
    assert.deepEqual(plain({ snapshot: nativeRead.value.snapshot, history: nativeRead.value.history, dirty: nativeRead.value.dirty }), plain(tsRead.value));
  }
});
