import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createScoreSession, ScoreSessionService } from "../host/score-session.ts";
import { validateNewScoreInput } from "../src/contracts/new-score.ts";
import type { IntegratedNativeAddonV2 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";

test("new-score input rejects fractional, missing, non-finite and out-of-range measure counts", () => {
  for (const measureCount of [0, -1, 1.5, 129, NaN, Infinity]) {
    assert.ok(validateNewScoreInput({ title: "作品", measureCount }).measureCount);
  }
  assert.ok(validateNewScoreInput({ title: "字".repeat(121), measureCount: 4 }).title);
  assert.deepEqual(validateNewScoreInput({ title: "  ", measureCount: 1 }), {});
});

test("creation crosses the real Rust boundary and starts with the requested measures and clean history", () => {
  const require = createRequire(import.meta.url);
  const addon = require(fileURLToPath(new URL("../../../target/integrated-v2/brilliant_kernel_node.node", import.meta.url))) as IntegratedNativeAddonV2;
  let nativeSessions = 0;
  const operations: string[] = [];
  const traced: IntegratedNativeAddonV2 = {
    createIntegratedKernelSessionV2(bytes, executor) {
      nativeSessions++;
      const operate = addon.createIntegratedKernelSessionV2(bytes, executor);
      return (request) => {
        operations.push(JSON.parse(request.toString("utf8")).operation);
        return operate(request);
      };
    },
  };
  const bus = createScoreSession({ title: "  新作品  ", measureCount: 4 }, traced);
  const state = bus.read();
  assert.ok(state.ok);
  const doc = state.value.snapshot.document;
  assert.equal(doc.metadata.title, "新作品");
  assert.equal(doc.measureDefinitions.length, 4);
  assert.equal(doc.parts.length, 1);
  assert.deepEqual(doc.parts[0]?.staves[0]?.defaultClef, { sign: "G", line: 2 });
  assert.deepEqual(doc.measureDefinitions.map((measure) => measure.meter), Array(4).fill({ numerator: 4, denominator: 4 }));
  assert.equal(doc.parts[0]?.measureContents.length, 4);
  assert.ok(doc.parts[0]?.measureContents.every((measure) => measure.voices.length === 1 && measure.voices[0]?.sequence.events.length === 0));
  assert.equal(state.value.snapshot.documentVersion, 0);
  assert.deepEqual(state.value.history, { undoDepth: 0, redoDepth: 0 });
  assert.equal(nativeSessions, 2);
  assert.ok(operations.includes("submit"));
  assert.ok(operations.includes("read"));
});

test("one and 128 measures create valid independent Native baselines", () => {
  for (const measureCount of [1, 128]) {
    const state = createScoreSession({ title: "", measureCount }).read();
    assert.ok(state.ok);
    assert.equal(state.value.snapshot.document.metadata.title, "未命名乐谱");
    assert.equal(state.value.snapshot.document.measureDefinitions.length, measureCount);
    assert.equal(state.value.history.undoDepth, 0);
  }
});

test("rejected input and stale replacement leave the previous workspace document unchanged", () => {
  const service = new ScoreSessionService();
  const workspaceId = randomUUID();
  const initial = service.create(workspaceId, randomUUID(), null, { title: "保留的作品", measureCount: 2 });
  assert.throws(() => service.create(workspaceId, randomUUID(), initial.documentId, { title: "非法", measureCount: 0 }));
  assert.deepEqual(service.read(workspaceId), initial);
  assert.throws(() => service.create(workspaceId, randomUUID(), null, { title: "过期替换", measureCount: 4 }));
  assert.deepEqual(service.read(workspaceId), initial);
});

test("a retry adopts only once and workspace identities do not overwrite one another", () => {
  const service = new ScoreSessionService();
  const workspaceId = randomUUID(), requestId = randomUUID();
  const input = { title: "重试验证", measureCount: 3 };
  const first = service.create(workspaceId, requestId, null, input);
  assert.deepEqual(service.create(workspaceId, requestId, null, input), first);
  assert.throws(() => service.create(workspaceId, requestId, first.documentId, { ...input, measureCount: 4 }));
  const other = service.create(randomUUID(), randomUUID(), null, input);
  assert.notEqual(other.documentId, first.documentId);
  const replacement = service.create(workspaceId, randomUUID(), first.documentId, { title: "新作品", measureCount: 4 });
  assert.notEqual(replacement.documentId, first.documentId);
  assert.equal(service.read(workspaceId)?.title, "新作品");
});
