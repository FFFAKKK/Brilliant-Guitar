import assert from "node:assert/strict";
import test from "node:test";
import { checkpointMatches, fileStem, hasUnsavedDocument } from "../src/services/document-file.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";

const score = (documentVersion: number, title = "未命名乐谱", measureCount = 1): ScoreSessionRead => ({
  documentId: "score-a", documentVersion, title, measureCount, undoDepth: 0, redoDepth: 0,
  notation: { kind: "unsupported", message: "仅测试文件状态" },
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
