import assert from "node:assert/strict";
import test from "node:test";
import { documentStatusModel } from "../src/components/document-status-model.ts";

test("document status exposes the current file name and every durable save state", () => {
  const labels = {
    unsaved: "未保存",
    saved: "已保存",
    saving: "保存中…",
    error: "保存失败",
  } as const;

  for (const [state, label] of Object.entries(labels)) {
    const model = documentStatusModel("练习曲", state as keyof typeof labels);
    assert.deepEqual(model, {
      title: "练习曲",
      label,
      ariaLabel: `文档：练习曲，${label}`,
      stateClassName: `document-state document-state-${state}`,
    });
  }
});

test("document status stays absent before a document identity exists", () => {
  assert.equal(documentStatusModel(undefined), null);
});
