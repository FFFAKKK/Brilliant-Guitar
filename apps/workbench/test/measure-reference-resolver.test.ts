import assert from "node:assert/strict";
import test from "node:test";

import { resolveMeasureReference } from "../src/agent/measure-reference-resolver.ts";

const index = {
  documentId: "score-1",
  documentVersion: 7,
  measureIds: ["intro-a", "verse-x", "bridge-q", "ending-z"],
} as const;

test("ordinal references resolve through authoritative order instead of synthesizing IDs", () => {
  assert.deepEqual(resolveMeasureReference({
    reference: { kind: "ordinal-range", startOrdinal: 2, endOrdinal: 4 },
    index,
    selection: null,
    rangeBudget: 3,
  }), {
    status: "resolved",
    source: "ordinal-range",
    documentId: "score-1",
    documentVersion: 7,
    startOrdinal: 2,
    endOrdinal: 4,
    measureCount: 3,
    input: {
      startMeasureId: "verse-x",
      endMeasureId: "ending-z",
      maxMeasures: 3,
    },
  });
});

test("reverse stable-ID references normalize in document order", () => {
  const result = resolveMeasureReference({
    reference: {
      kind: "stable-id-range",
      startMeasureId: "ending-z",
      endMeasureId: "verse-x",
    },
    index,
    selection: null,
    rangeBudget: 3,
  });

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.deepEqual(result.input, {
    startMeasureId: "verse-x",
    endMeasureId: "ending-z",
    maxMeasures: 3,
  });
  assert.equal(result.startOrdinal, 2);
  assert.equal(result.endOrdinal, 4);
});

test("current selection must match the same document version", () => {
  assert.deepEqual(resolveMeasureReference({
    reference: { kind: "current-selection" },
    index,
    selection: {
      kind: "measure-range",
      documentId: "score-1",
      documentVersion: 6,
      startMeasureId: "verse-x",
      endMeasureId: "bridge-q",
    },
    rangeBudget: 2,
  }), {
    status: "unresolved",
    code: "selection-stale",
    message: "当前选择区来自其他文档版本",
    retryable: true,
  });
});

test("missing selection and out-of-range ordinals stay explicit", () => {
  const missingSelection = resolveMeasureReference({
    reference: { kind: "current-selection" },
    index,
    selection: null,
    rangeBudget: 4,
  });
  const missingOrdinal = resolveMeasureReference({
    reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 5 },
    index,
    selection: null,
    rangeBudget: 4,
  });

  assert.equal(missingSelection.status, "unresolved");
  assert.equal(missingSelection.status === "unresolved" && missingSelection.code, "selection-unavailable");
  assert.equal(missingOrdinal.status, "unresolved");
  assert.equal(missingOrdinal.status === "unresolved" && missingOrdinal.code, "ordinal-out-of-range");
});

test("resolved range size cannot exceed the control-plane budget", () => {
  assert.deepEqual(resolveMeasureReference({
    reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 4 },
    index,
    selection: null,
    rangeBudget: 3,
  }), {
    status: "unresolved",
    code: "range-budget-exceeded",
    message: "小节范围超出本次任务预算",
    retryable: false,
  });
});

test("duplicate or malformed authoritative indices fail closed", () => {
  const result = resolveMeasureReference({
    reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 1 },
    index: { ...index, measureIds: ["same", "same"] },
    selection: null,
    rangeBudget: 1,
  });

  assert.equal(result.status, "unresolved");
  assert.equal(result.status === "unresolved" && result.code, "invalid-index");
  assert.equal(result.status === "unresolved" && result.retryable, true);
});
