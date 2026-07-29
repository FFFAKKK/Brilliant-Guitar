# SPEC-005 Guitar Domain 技巧重规划门

> **状态：GD-0 USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING；GUITAR IMPLEMENTATION BLOCKED。** 领域事务 seam 与 slide/bend/vibrato 首批范围属于待独立验收候选；GuitarExtension schema、技巧 payload 和生产实现仍由 GD-1/GD-3 独立批准。本文件不批准旧 Core 技巧 registry。

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

GuitarExtension 的 Part ownership、ordered variable-length tuning、noteId-to-string/fret placement、首批 slide/bend/vibrato 范围已批准；精确 namespace、payload version、技巧 ID、参数单位和跨 Note 引用仍由 GD-1/GD-3 固定。

## 3. Contracts

- 调弦、弦品映射和吉他技巧属于同一 Part-owned Guitar Domain，不进入 Core Note/Event/metadata。
- 领域模块负责 strict decode、semantic validation、版本兼容和 `guitar.*` diagnostics。
- Core 只验证 ExtensionBlock 信封并保真未知 JsonValue。
- 技巧持久化必须是纯数据，不得包含 callback、class、renderer、player 或模块代码。
- UI 名称、渲染、播放与导出从稳定领域语义派生，不各自维护第二份技巧事实。
- 领域命令通过 GD-0 批准的 startup-frozen official contribution catalog 接入同一个 CommandBus；不得从旧测试 registry 继承技巧定义，也不得使用 runtime registration。
- 设置 string/fret placement 必须在一个事务中同步 Core `WrittenPitch` 与 Part-owned placement；generic Core pitch edit 不推断指法。
- 所有已安装领域 validator 在 Core semantic 成功后按 frozen catalog 顺序运行；unsupported 与 semantic invalid 分离。
- official compatibility requirement 必须声明非空、升序、去重的精确 `supportedSchemaVersions`，并逐 `ExtensionBlock` 判断；missing、unlisted 或 future schema 均不得猜测/降级/隐式迁移。同一 contribution 的 mixed owner/version 输入只把 compatible blocks 以 canonical owner 顺序交给单次 validator/classifier，不兼容 block 的全部 handler 零调用且原 payload 完整保留。
- 缺失/不兼容 validator 时 integrated validation 明确为 `incomplete`，并随 read-only write availability 提供完整稳定 facts；仅 Core validation 通过不等于 Guitar semantic validation complete。mixed unavailable/incompatible facts 在所有写路径以 incompatible code 概括，但 facts 不被过滤。

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

GD-1 必须覆盖 tuning、string/fret、引用、未知/新版 payload、精确 schema-version compatibility、语义 round-trip 与 Core 无解释边界。GD-3/GD-4 必须覆盖 placement/slide/bend/vibrato 的 submit/no-op/reject/undo/redo/replay、一个 transaction/history/event、未知扩展保留，以及 missing/incompatible/future-schema read-only + incomplete-validation degradation。当前 GD-0 只同步候选合同。

## 7. Wrong vs Correct

```typescript
// Wrong: add guitar fields to Core note.
note.fret = 7

// Correct direction: Guitar Domain owns a versioned Part extension.
guitarDomain.updatePlacement(partExtension, noteId, { stringNumber: 2, fret: 7 })
```

## 8. GD-0 Execution Boundary

- CK1.1-0/CK1.1-1 先完成 hostile-input guard 与 official module SDK。
- GD-1 只实现 GuitarExtension 数据、codec、validator/profile，不实现命令。
- GD-2 只实现通用领域 seam，并使用 neutral synthetic contribution，不依赖 Guitar production code。
- GD-3 才实现 Guitar semantic commands；GD-4 才形成四小节 Guitar/Core 集成门禁。
- UI、layout、render、playback、physical `.bgp` IO、Guitar Pro 与第三方插件均不进入上述合同。
