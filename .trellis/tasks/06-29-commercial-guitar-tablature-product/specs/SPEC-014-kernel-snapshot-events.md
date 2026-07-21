# SPEC-014 内核地址、快照、Selector、Dirty 与事件合同

> **状态：K1-3 ACCEPTED / ARCHIVED（2026-07-16）。** 详细权威为 `.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`；固定验收基线为 `7369eeac60fecea66c2c9164c04439625c2d78b0`，typecheck、build、102/102 tests、diff check 与 Trellis 校验通过。K1-4、K1-5 均已验收归档；K1-6 候选 `3dffa71c44d0eacb81d391714b855799f9e5cae9` 等待独立验收并未扩大本事件合同。

## 1. Scope / Trigger

当 Core 公开稳定地址/范围、只读状态、保存点或提交后通知时触发。

## 2. Signatures

- `ScoreAddress` 复用 K1-2 七类稳定实体目标。
- `ScorePoint/ScoreRange` 仅包含全局 Measure、Part Measure、Voice Event 三类分层点/闭区间。
- `CommandBus.read()` 返回冻结的 snapshot、history depths 与 dirty。
- snapshot 身份仅为 `documentId + schemaVersion + documentVersion`。
- `CommandBus.markPersisted({ documentId, documentVersion })` 标记实际保存版本。
- 六个 selector：metadata、entity、ownership、range、history、dirty。
- 两个事件：`core.document.committed` 与 `core.session.dirty-state-changed`。

## 3. Contracts

- Snapshot/selector 运行时深冻结、脱离活动文档并保留未知 ExtensionBlock。
- range 反向端点规范化；跨 Part/Voice 伪线性范围拒绝。
- dirty 使用精确历史状态身份，不用单调 `documentVersion` 或整文档哈希判断。
- 成功 submit/undo/redo 发布一个 document fact；dirty 布尔变化才发布 dirty fact。
- 事件同步按注册顺序分发；handler 同步 throw 与返回 Promise/thenable 后的异步 rejection 均被隔离，不回滚已提交状态、不阻止后续 handler、也不产生未处理 rejection；写入/markPersisted 同步重入拒绝。
- event overflow 在接纳 candidate 前拒绝，失败路径所有状态不变。
- payload 只含稳定 ID/版本/原因/命令类型，不泄漏内部 delta、history、文档、handler 或 raw error。

## 4. Validation & Error Matrix

地址/范围/read/checkpoint/event 的 malformed、missing、wrong-owner、reentrant、overflow 与 invariant failure 都返回封闭 code；现有 CommandFailure 只增加 `event.reentrant-write` 和 `event.sequence-overflow`。

## 5. Good / Base / Bad Cases

- Good：异步保存 V1 后当前已到 V2，markPersisted(V1) 保持当前 dirty，undo 回 V1 后 clean。
- Good：提交从 clean 到 dirty，先发 document sequence N，再发 dirty sequence N+1。
- Base：Guitar Domain 从冻结 snapshot 解码自己的 Part extension。
- Bad：snapshot 有随机 ID/时间；事件携带可变 ScoreDocument、内部 delta 或高频播放 tick。

## 6. Tests Required

七类地址、三类范围、反向规范化、不可变性、六 selector 纯度、异步 checkpoint、提交/dirty 顺序、失败零事件、handler 同步 throw/异步 rejection 隔离、无未处理 rejection、订阅快照、重入/overflow、版本关联和未知扩展保留。

## 7. Wrong vs Correct

```typescript
// Wrong
const wrong = { payload: { document: mutableDocument } }

// Correct direction
const correct = {
  eventVersion: 1,
  eventSequence,
  eventType: "core.document.committed",
  documentId,
  documentVersion,
  cause,
  commandId,
  affectedEntities,
}
```
