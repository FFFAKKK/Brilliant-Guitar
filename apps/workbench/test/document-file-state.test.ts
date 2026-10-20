import assert from "node:assert/strict";
import test from "node:test";
import { checkpointMatches, fileStem, hasUnsavedDocument, reconcileSavedSession } from "../src/services/document-file.ts";
import { isScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { unsupportedPlaybackSource } from "./playback-fixture.ts";

const score = (documentVersion: number, title = "未命名乐谱", measureCount = 1): ScoreSessionRead => ({
  documentId: "score-a", documentVersion, title, measureCount, undoDepth: 0, redoDepth: 0,
  notation: { kind: "unsupported", message: "仅测试文件状态" },
  playbackSource: unsupportedPlaybackSource("score-a", documentVersion),
});

test("保存检查点仅匹配同一文档的实际版本；再次编辑与同 ID 重新打开不会混淆", () => {
  const saved = { documentId: "score-a", documentVersion: 3, name: "旋律" };
  assert.equal(checkpointMatches(score(3), saved), true);
  assert.equal(hasUnsavedDocument(score(4), saved), true);
  assert.equal(checkpointMatches({ ...score(3), documentId: "score-b" }, saved), false);
  assert.equal(hasUnsavedDocument(score(0), null), false, "首次自动创建的空白谱无需替换确认");
  assert.equal(hasUnsavedDocument(score(0, "有标题"), null), true, "创建后未保存的作品信息也需要确认");
});

test("项目和 SVG 文件名共用安全文件名，保留作品标题之外的另存为名称", () => {
  assert.equal(fileStem("我的:作品/草稿.bgp.json"), "我的 作品 草稿");
  assert.equal(fileStem("旧文件.svg"), "旧文件");
  assert.equal(fileStem(" .. "), "未命名乐谱");
});

const native = (version: number, sessionId = "session-a", savedVersion: number | null = null,
  dirty = true): ScoreSessionRead => ({
  ...score(version), persistence: { sessionId, savedVersion, dirty },
});

test("native checkpoints use persisted history identity, not version equality", () => {
  const undone = native(5, "session-a", 2, false);
  assert.equal(checkpointMatches(undone, null), true);
  assert.equal(hasUnsavedDocument(undone, null), false);
  assert.equal(hasUnsavedDocument(native(6, "session-a", 2), null), true);
});

test("a late native save never switches a document or a reopened session", () => {
  const saving = native(2);
  const receipt = native(2, "session-a", 2, false);
  assert.equal(reconcileSavedSession(saving, null, receipt), null);
  assert.equal(reconcileSavedSession(saving, { ...saving, documentId: "score-b" }, receipt), null);
  assert.equal(reconcileSavedSession(saving, native(2, "session-reopened"), receipt), null);
  assert.equal(reconcileSavedSession(saving, saving, native(2, "wrong-session", 2, false)), null);
  assert.equal(reconcileSavedSession(saving, saving, { ...receipt, documentId: "score-b" }), null);
});

test("save reconciliation preserves newer edits and their unsaved state", () => {
  const saving = native(2);
  const receipt = native(2, "session-a", 2, false);
  const changed = native(3, "session-a", 2);
  assert.equal(reconcileSavedSession(saving, changed, receipt), changed);
  assert.equal(hasUnsavedDocument(changed, { documentId: "score-a", documentVersion: 2, name: "score" }), true);
  assert.equal(reconcileSavedSession(saving, saving, receipt), receipt);
});

test("native persistence projection rejects missing or contradictory fields", () => {
  assert.equal(isScoreSessionRead(native(2, "session-a", 2, false)), true);
  for (const persistence of [
    null, [], {}, { sessionId: "", savedVersion: 2, dirty: false },
    { sessionId: "session-a", savedVersion: 3, dirty: false },
    { sessionId: "session-a", savedVersion: -1, dirty: false },
    { sessionId: "session-a", savedVersion: 1.5, dirty: false },
    { sessionId: "session-a", savedVersion: 2, dirty: "false" },
  ]) assert.equal(isScoreSessionRead({ ...score(2), persistence }), false);
});

test("session warnings use the shared diagnostic validator and remain optional on older hosts", () => {
  const warning = { code: "file.recovery-unavailable", message: "保存项目文件以保留当前作品",
    severity: "warning", source: "file", target: { scope: "component", componentId: "navigation.file" } };
  assert.equal(isScoreSessionRead({ ...score(2), warnings: [warning] }), true);
  assert.equal(isScoreSessionRead(score(2)), true);
  for (const warnings of [null, {}, [null], [{ ...warning, severity: "error" }],
    [{ ...warning, target: {} }], Array(5).fill(warning)]) {
    assert.equal(isScoreSessionRead({ ...score(2), warnings }), false);
  }
});
