# SPEC-003 命令系统、事务与回放重规划门

> **状态：BLOCKED / NOT EXECUTABLE。** K1-2 必须在 K1-1 评审和正式基线完成后建立独立任务。本文件只约束重规划边界，不批准具体命令 API。

## 1. Scope / Trigger

当准备实现任何 ScoreDocument 写入、事务、history、undo/redo 或 replay 时触发本门禁。旧 SPEC-003 已归档，不得直接实现。

## 2. Signatures

最终签名尚未批准。重规划至少需要定义：

```typescript
type ScoreEntityTarget =
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string }
```

该示例只固定目标语言方向，不固定最终 CommandEnvelope、payload 或 public export。

## 3. Contracts

- 所有 Core 写入通过语义命令；公开 API 不接受 patch、JSON path、splice 或任意脚本。
- 命令定位使用 `brilliant-score-1` 的稳定实体 ID，不使用退役 slot/tick 地址。
- 内部 delta 不泄漏，失败命令不改变文档、版本、dirty state、history 或事件。
- 一个成功可撤销命令默认产生一个 HistoryEntry；合并策略不进入首版。
- Core 命令只修改通用谱面事实；调弦、弦品和吉他技巧由 Guitar Domain 命令解释并受控更新其 Part-owned extension。
- 最终 K1-2 必须明确 extension payload 更新如何保持未知 namespace 不变。

## 4. Validation & Error Matrix

| Failure | Required behavior |
|---|---|
| malformed command payload | fail before mutation with stable operation error |
| missing entity target | fail before mutation; preserve all state |
| resulting Core semantic failure | rollback and preserve concrete `semantic.*` diagnostics |
| resulting profile unsupported | task must explicitly decide command policy; never relabel as corrupt |
| Guitar payload failure | return owning `guitar.*` diagnostics; Core does not reinterpret |

## 5. Good / Base / Bad Cases

- Good：按 voice/event/note ID 插入或修改通用事件，并可精确 undo/redo/replay。
- Base：合法但当前 profile 不支持的和弦命令有明确产品策略，且不破坏 schema。
- Bad：命令直接写 `startTick`、替换任意 JSON path 或丢弃未知 ExtensionBlock。

## 6. Tests Required

正式 K1-2 计划必须覆盖 payload 拒绝、事务回滚、history 粒度、undo/redo、确定性 replay、未知扩展保留、公开 patch 拒绝和失败零副作用。

## 7. Wrong vs Correct

```typescript
// Wrong
submit({ op: "replace", path: "/scoreData/timeline/0" })

// Correct direction
submit({ commandId: "core.note.set-written-pitch", target: { kind: "note", noteId }, payload })
```
