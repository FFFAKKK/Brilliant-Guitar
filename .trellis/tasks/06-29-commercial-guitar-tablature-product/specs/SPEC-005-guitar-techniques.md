# SPEC-005 Guitar Domain 技巧重规划门

> **状态：BLOCKED / NOT EXECUTABLE。** 吉他技巧不属于 Core K1-1；须在独立 Guitar Domain / Block 2 任务中设计。本文件不批准旧 Core 技巧 registry。

## 1. Scope / Trigger

当产品准备保存、编辑、验证、渲染或播放 slide、bend、vibrato、hammer-on、pull-off、palm mute 等吉他技巧时触发。

## 2. Signatures

当前只确定承载边界：

```typescript
interface ExtensionBlock {
  readonly namespace: string
  readonly schemaVersion: number
  readonly owner: { readonly kind: "part"; readonly partId: string }
  readonly payload: JsonObject
}
```

GuitarExtension namespace、payload、技巧 ID、参数 schema 与跨 Note 引用尚未批准。

## 3. Contracts

- 调弦、弦品映射和吉他技巧属于同一 Part-owned Guitar Domain，不进入 Core Note/Event/metadata。
- 领域模块负责 strict decode、semantic validation、版本兼容和 `guitar.*` diagnostics。
- Core 只验证 ExtensionBlock 信封并保真未知 JsonValue。
- 技巧持久化必须是纯数据，不得包含 callback、class、renderer、player 或模块代码。
- UI 名称、渲染、播放与导出从稳定领域语义派生，不各自维护第二份技巧事实。
- 是否需要 registry 是 Block 2/K1-4 的独立决策，不能从旧测试定义继承。

## 4. Validation & Error Matrix

| Layer | Owns |
|---|---|
| Core envelope | namespace/version/owner/payload JsonValue |
| Guitar decode | known GuitarExtension shape and version |
| Guitar semantic | tuning, string/fret, Note references, technique params/relations |
| Product profile | first-release supported technique set and UI policy |

## 5. Good / Base / Bad Cases

- Good：已知 GuitarExtension 技巧 round-trip 后 ID、目标 Note 和参数语义不变。
- Base：未知新技巧或新版 payload 可由 Core 保真并由 Guitar Domain 明确降级。
- Bad：Core 直接解析 bend 参数，或渲染层单独持久化 slide 关系。

## 6. Tests Required

Block 2 必须覆盖 tuning、string/fret、技巧引用与参数、未知/新版 payload、语义 round-trip、Core 无解释边界以及保存/重开。命令与 undo/redo 测试待 K1-2 接口批准后补充。

## 7. Wrong vs Correct

```typescript
// Wrong: add guitar fields to Core note.
note.fret = 7

// Correct direction: Guitar Domain owns a versioned Part extension.
guitarDomain.updatePlacement(partExtension, noteId, { stringNumber: 2, fret: 7 })
```
