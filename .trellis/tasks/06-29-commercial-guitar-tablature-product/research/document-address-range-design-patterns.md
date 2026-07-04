# 文档地址与范围模型设计模式研究

## 状态

- 状态: 研究结论草案，等待用户确认后同步到 `SPEC-001-document-model.md` 和 `SPEC-003-command-system.md`。
- 背景: 用户明确允许重新设计文档地址/范围模型，不必受现有可选字段版 `DocumentAddress` 约束。
- 目标: 为 Core Kernel 的命令目标、技巧目标、诊断定位、复制粘贴、undo/redo、命令回放和未来插件 API 设计稳定、可验证、可扩展的位置模型。

## 设计问题

谱面编辑器需要同时处理两种“位置”:

- 领域引用: 这个命令到底要改哪个 track、measure、beat、note 或 range。
- 用户坐标: 用户看到的是第几小节、第几拍、第几弦、第几品。

如果把两者混在一起，后续会出现严重问题:

- 小节重排或插入后，基于 index 的目标会漂移。
- 插件可能提交不完整地址，例如有 `noteId` 但缺少 `beatId`。
- 技巧、诊断和命令目标难以判断到底指向 note、beat、measure 还是 range。
- AI 写代码时容易把 UI 坐标当作内核真相。

## ScoreDocument-first 坐标原则

当前架构应采用“谱面数据根本原则”: `ScoreDocument` 是唯一业务真相，所有操作都为谱面数据服务。坐标系统不是比谱面数据更高的核心，也不应该整体进入 Core Kernel；它是外部模块围绕谱面数据协作的定位协议。

外部坐标解析的含义是: 编辑器把屏幕坐标、布局坐标、鼠标拖选、缩放滚动和渲染命中结果转换为谱面语义目标。它回答“用户现在想操作哪一个谱面位置”，而不是回答“这个操作在音乐规则上是否合法”。合法性仍由 Core Kernel 的命令目标校验和一致性验证决定。

模块化策略: MVP 阶段先不单独拆 `Positioning Service`，坐标解析由 `Layout Module + Editor Session Service` 协作承担。后续当多页、多轨、多声部、复杂选区、多渲染后端或更复杂导出预览导致定位逻辑膨胀时，再抽取独立外部 `Positioning Service`。这个服务即使独立，也仍然不能进入 Core Kernel。

推荐把坐标分为三层:

1. 谱面语义层: `ScoreDocument`、`ScoreAddress`、`ScorePoint`、`ScoreRange`。这一层属于 Core Kernel，是命令、技巧、诊断、保存、迁移和插件 API 的稳定语义目标。
2. 布局层: `LayoutPrimitive`、布局盒、hit area、分页、系统排布和临时 `ScoreCoordinate`。它从 `ScoreDocument` 快照派生，服务阅读、编辑命中、导出和渲染，但不保存为音乐事实，也不作为内核写入 API。
3. 视图层: 鼠标坐标、屏幕坐标、SVG/VexFlow 内部坐标、缩放滚动偏移和 PDF/PNG 页面坐标。它们只用于输入输出和 hit testing，不得写入 `.bgp` 作为谱面语义。

典型写入链路必须是:

```text
ViewCoordinate -> LayoutPrimitive hit test -> ScoreAddress/ScorePoint/ScoreRange 或 semantic payload -> semantic command -> ScoreDocument transaction
```

典型读取链路必须是:

```text
ScoreDocument snapshot -> selector -> LayoutPrimitive -> Renderer / Export / Playback view
```

这个原则能防止 UI、渲染器、导出器或播放层各自维护一份“看起来正确但语义不一致”的影子状态。

## 参考模式

### 1. JSON Pointer / JSON Patch: 结构路径模型

JSON Pointer 定义了用字符串路径指向 JSON 文档中特定值的语法；JSON Patch 则用 `add`、`remove`、`replace` 等操作描述 JSON 文档修改。

优点:

- 很适合作为内部 delta、调试和低层结构定位。
- 与 `.bgp` 的 JSON 包结构天然兼容。
- 容易序列化和比较。

缺点:

- 暴露的是数据结构路径，不是音乐语义。
- 数组 index 在插入、删除、排序后容易漂移。
- 外部插件如果拿到这种能力，等价于绕过语义命令和验证器。

结论:

- 适合作为 Core Kernel 内部 delta 路径或调试输出。
- 不适合作为对外命令目标、技巧目标或插件 API。

参考:

- https://www.rfc-editor.org/rfc/rfc6901
- https://www.rfc-editor.org/rfc/rfc6902

### 2. Slate Path / Point / Range: 树路径 + 点 + 范围

Slate 用 `Path = number[]` 表示文档树路径，用 `Point` 表示 path + offset，用 `Range` 表示 anchor/focus 两个点。

优点:

- 概念清晰，适合树状编辑器。
- `Range` 的 anchor/focus 模型能表达选择方向。
- 对 UI 选区和编辑器交互友好。

缺点:

- Path 本质仍是 index 路径，结构变化后需要维护 path 转换。
- Slate 主要面向文本树；我们的谱面是音乐领域模型，note/beat/measure 有更强领域身份。
- 仅靠 path 很难直接表达“第 4 弦第 7 品这个吉他事件”的语义。

结论:

- 可以借鉴 `Point` / `Range` 分层思想。
- 不应照搬 index path 作为内核公开地址。

参考:

- https://docs.slatejs.org/concepts/03-locations

### 3. ProseMirror Position / StepMap: 位置映射模型

ProseMirror 用文档内的位置数值表示编辑点，编辑 step 会产生映射，用于把旧位置映射到新文档位置。

优点:

- 对文本/富文本文档变换非常强。
- 适合复杂协同、重排、撤销、变换合并。
- 明确承认位置会随文档变化失效或改变含义，并用 mapping 解决。

缺点:

- 模型复杂，MVP 成本高。
- 偏向文本/富文本，不直接适配谱面领域对象。
- 我们第一阶段没有协同编辑和复杂结构变换，不需要完整 StepMap 体系。

结论:

- 后续如果做协同编辑、复杂粘贴或跨版本命令迁移，可以借鉴位置映射思想。
- MVP 不采用全局 numeric position / StepMap 作为核心地址模型。

参考:

- https://prosemirror.net/docs/guide/#doc.indexing

### 4. DOM Range / LSP Range: 边界点模型

DOM Range 使用 start/end container + offset；LSP 使用 start/end `Position`，并规定 end position 是 exclusive。

优点:

- 范围边界清楚。
- end-exclusive 规则适合避免重叠歧义。
- 非常适合文本和节点树中的选择、诊断、格式化。

缺点:

- 仍需要先定义“点”是什么。
- DOM 节点或文本 line/character 不适合成为我们的谱面语义真相。
- 对吉他谱来说，range 往往要表达 measure、beat、note 或 string lane，而不是字符偏移。

结论:

- 可以采用 start/end boundary 的思想。
- 应定义谱面领域里的 `ScorePoint`，而不是使用 DOM/LSP 的文本位置。
- 范围建议采用 canonical start/end，UI 选择方向另由 Editor Session 保存。

参考:

- https://dom.spec.whatwg.org/#interface-range
- https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#range

### 5. Identity Field / 稳定 ID 模型

Identity Field 模式的核心是把稳定 ID 存进对象，用它维持对象和外部引用之间的身份关系。

优点:

- 适合长期文件格式、插件引用、撤销重做和命令回放。
- 对象重排后 ID 不变，引用不容易漂移。
- 和我们的 `.bgp` 文件、schema 迁移、导入导出报告、diagnostic 定位非常匹配。

缺点:

- 实现需要维护 ID 索引。
- 地址解析需要验证 ID 之间的层级关系。
- 需要明确 ID 生命周期，例如复制粘贴时是否生成新 ID。

结论:

- 这是 Brilliant Guitar 文档地址的基础模式。
- 但只用裸 ID 不够，还需要类型化地址表达目标种类。

参考:

- https://martinfowler.com/eaaCatalog/identityField.html

### 6. MusicXML: part / measure / note 的混合标识

MusicXML 的 partwise measure 使用 `number` 作为必需标识，同时可选 `id` 要求在文档内唯一；note 也有可选 `id`。

优点:

- 说明音乐文档确实需要 measure、note 层级的标识。
- 同时存在“显示/音乐编号”和“文档唯一 ID”的分离。

缺点:

- MusicXML 是交换格式，不是交互式编辑内核。
- 其 measure number 不一定唯一或纯数字，不适合作为内部命令目标的唯一真相。

结论:

- 可以借鉴“显示编号”和“唯一 ID”分离。
- `.bgp` 内核地址应比 MusicXML 更严格，默认使用稳定 ID。

参考:

- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/measure-partwise/
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/

## 推荐方案: 稳定 ID + 强类型目标 + 领域点/范围

推荐把地址系统拆成 4 层:

1. `EntityId`: 文档对象的稳定身份。
2. `ScoreAddress`: 命令和技巧使用的强类型实体地址。
3. `ScorePoint`: 表示可以排序和比较的音乐时间点或插入点。
4. `ScoreRange`: 表示一个规范化的领域范围。

这个方案不是单纯可选字段对象，也不是 JSON Pointer，也不是纯 index path。它是针对谱面微内核的领域地址模型，并且必须服务 `ScoreDocument-first` 原则: 坐标可以帮助定位和命中，但不能替代谱面数据成为事实来源。

## 数据结构草案

```ts
/**
 * 稳定实体 ID。
 *
 * 用途:
 * - 标识文档、轨道、小节、voice、beat、note、rest、technique 等领域实体。
 * - 支持命令目标、技巧绑定、诊断定位、undo/redo、回放和导入导出报告。
 *
 * 规则:
 * - ID 在单个 `.bgp` 文档内必须唯一。
 * - 保存和重新打开后必须保持不变。
 * - 复制粘贴到新位置时必须生成新 ID，除非是在同一次事务内引用原对象。
 */
export type EntityId = string

/**
 * 谱面实体类型。
 *
 * 用途:
 * - 防止把 note id 当成 beat id 使用。
 * - 让命令系统能声明自己接受哪些目标类型。
 */
export type ScoreEntityKind =
  | "document"
  | "track"
  | "measure"
  | "voice"
  | "beat"
  | "note"
  | "rest"
  | "technique"

/**
 * 强类型谱面地址。
 *
 * 用途:
 * - Core Kernel 对外命令、技巧、诊断和插件 API 的主要目标模型。
 * - 通过 `kind` 明确地址指向的实体类型，避免可选字段组合产生歧义。
 *
 * 边界:
 * - 不保存 UI 光标、选区方向或渲染坐标。
 * - 不使用 JSON Pointer 或数组 index 作为公开目标。
 */
export type ScoreAddress =
  | { kind: "document"; documentId: EntityId }
  | { kind: "track"; trackId: EntityId }
  | { kind: "measure"; trackId: EntityId; measureId: EntityId }
  | { kind: "voice"; trackId: EntityId; measureId: EntityId; voiceId: EntityId }
  | { kind: "beat"; trackId: EntityId; measureId: EntityId; voiceId: EntityId; beatId: EntityId }
  | { kind: "note"; trackId: EntityId; measureId: EntityId; voiceId: EntityId; beatId: EntityId; noteId: EntityId }
  | { kind: "rest"; trackId: EntityId; measureId: EntityId; voiceId: EntityId; beatId: EntityId; restId: EntityId }
  | { kind: "technique"; owner: ScoreAddress; techniqueId: EntityId }

/**
 * 谱面坐标。
 *
 * 用途:
 * - 给 UI、输入控制器和查询 API 表达“第几小节、第几拍、第几弦”等用户可理解位置。
* - 可由编辑/布局模块转换为 `ScoreAddress` 或 `ScorePoint`。
 *
 * 边界:
 * - 不能作为保存到 `.bgp` 的主要引用。
 * - 不能作为插件写命令的唯一目标。
 * - 不属于 Core Kernel 的公开写入目标；内核只接受解析后的语义地址、范围或命令 payload。
 */
export interface ScoreCoordinate {
  trackIndex?: number
  measureIndex?: number
  tickOffset?: number
  stringNumber?: number
  voiceIndex?: number
}

/**
 * 谱面点。
 *
 * 用途:
 * - 表示一个可排序、可比较的音乐位置或插入位置。
 * - 支持 range、复制粘贴、诊断定位和未来跨小节编辑。
 */
export interface ScorePoint {
  trackId: EntityId
  measureId: EntityId
  voiceId: EntityId
  tickOffset: number
  affinity?: "before" | "after"
}

/**
 * 谱面范围。
 *
 * 用途:
 * - 表示一段规范化谱面内容，例如从第 1 小节第 2 拍到第 2 小节第 1 拍。
 * - 支持删除、复制、粘贴、批量技巧、批量移调和诊断范围。
 *
 * 规则:
 * - `start` 必须小于或等于 `end`。
 * - MVP 推荐 end-exclusive，避免相邻范围重叠歧义。
 * - UI 选择方向不保存在这里，由 Editor Session 保存 anchor/focus。
 */
export interface ScoreRange {
  kind: "range"
  start: ScorePoint
  end: ScorePoint
  mode: "time-span" | "entity-span"
}

/**
 * 命令目标。
 *
 * 用途:
 * - 给命令 payload 一个统一目标字段。
 * - 命令定义必须声明允许的 target kind。
 */
export type CommandTarget = ScoreAddress | ScoreRange
```

## 命令目标规则

- `setNotePitch`: 只接受 `ScoreAddress.kind = "note"`。
- `setDuration`: 接受 `note` 或 `rest`。
- `insertNote`: 接受 `beat` 或 `ScorePoint`，MVP 可以先用 `beat`。
- `insertRest`: 接受 `beat` 或 `ScorePoint`，MVP 可以先用 `beat`。
- `addTechnique`: MVP 接受 `note`；后续可接受 `range`。
- `deleteRange`: 接受 `ScoreAddress` 或 `ScoreRange`。
- `transposeRange`: 接受 `ScoreRange`。

## 为什么比当前可选字段模型更好

当前草案:

```ts
export interface DocumentAddress {
  trackId: string
  measureId?: string
  voiceId?: string
  beatId?: string
  noteId?: string
}
```

问题:

- 无法从类型上区分 track 地址、measure 地址、beat 地址和 note 地址。
- 可以构造出非法组合，例如只有 `noteId` 没有 `beatId`。
- 命令很难声明“只接受 note target”。
- 插件 API 和 AI 生成代码容易误用。

新方案:

- 用 `kind` 明确目标种类。
- 用稳定 ID 保证引用不随排序漂移。
- 用 `ScoreCoordinate` 满足 UI 显示和定位，但把它限制在编辑/布局模块内，不让它污染内核真相或公开写 API。
- 用 `ScorePoint` / `ScoreRange` 处理跨 beat、跨小节的范围。
- 把 JSON Pointer 留给内部 delta，不成为公开领域 API。
- 把布局坐标和屏幕坐标留给布局/渲染/hit testing，不保存进 `.bgp` 作为音乐语义。

## MVP 收敛

第一阶段不需要一次实现所有地址能力。

MVP 必须实现:

- `EntityId`
- `ScoreAddress`
- `CommandTarget`
- `ScoreRange` 的最小结构
- `resolveAddress(address): ResolvedEntity | AddressDiagnostic`
- `validateTarget(commandId, target): CommandDiagnostic[]`

MVP 可以后置:

- 完整 `ScorePoint` 跨小节比较。
- 复杂 range normalization。
- 位置映射 / StepMap。
- 协同编辑地址转换。
- 多 voice / 多 track range。

## 推荐决策

采用“稳定 ID + 强类型目标 + 领域点/范围”的混合模型:

- 核心命令、技巧、诊断和插件 API 使用 `ScoreAddress | ScoreRange`。
- UI 坐标使用临时 `ScoreCoordinate`，必须在编辑/布局模块中通过 selector 或 resolver 转换为内核目标。
- 内部 delta 可以使用 `InternalDocumentPath` 或 JSON Pointer，但不得暴露给外部模块。
- 当前可选字段版 `DocumentAddress` 应废弃，改名为 `ScoreAddress` 或 `KernelAddress`。

这个设计更贴合微内核思想: 内核掌握稳定身份、目标验证和可比较范围；UI、渲染、播放和插件只通过明确接口协作。
