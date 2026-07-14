# SPEC-014 内核快照、事件与模块通信重规划门

> **状态：BLOCKED / NOT EXECUTABLE。** K1-3 等待 K1-2 事务边界完成。本文件只保留不可违反的方向。

## 1. Scope / Trigger

当准备公开只读文档、selector 或提交后通知时触发。旧 snapshot/event 细节已归档。

## 2. Signatures

最终 `DocumentSnapshot`、selector 与 event envelope 尚未批准；必须直接承载或引用 `brilliant-score-1`，不能建立平行谱面模型。

## 3. Contracts

- 调用方不得获得能修改内核状态的 ScoreDocument 引用或可回写副本。
- selector 是纯读函数，派生布局、播放、导出和 Guitar 读模型。
- 事件只在事务提交后发布；失败/rollback 不发布 document-changed。
- 事件 payload 使用稳定实体 ID 和版本，不泄漏内部 delta、可变文档或 handler。
- 播放 tick、光标、布局坐标和 Guitar UI 状态属于外部服务事件。
- ExtensionBlock 可以作为文档快照数据保留，但 Core selector 不解释未知 payload。

## 4. Validation & Error Matrix

可变状态泄漏、失败命令发事件、事件重入写入、handler 异常传播和 payload 隐私泄漏都必须有稳定拒绝或隔离行为。

## 5. Good / Base / Bad Cases

- Good：提交成功后 snapshot 版本与 event 版本一致。
- Base：Guitar Domain 从 snapshot 解码自己的 Part extension。
- Bad：事件携带可变 ScoreDocument、内部 delta 或高频播放 tick。

## 6. Tests Required

不可变性、selector 纯度、提交顺序、失败零事件、handler 隔离、重入保护、版本关联和未知扩展保留。

## 7. Wrong vs Correct

```typescript
// Wrong
event.payload.document = mutableDocument

// Correct direction
event.payload = { documentId, documentVersion, changedEntityIds }
```
