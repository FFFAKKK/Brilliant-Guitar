# REQ-002 谱面文档模型与音乐数据契约

## 决策状态

- 状态：已确认，已按 2026-07-13 K1-1 地基重规划换轨。
- 唯一模型决策源：`07-13-k1-1-foundation-replanning/design.md`。
- 唯一活动字段级契约：`.trellis/spec/core-kernel/backend/score-document-model.md`。
- 本文件职责：说明产品为什么需要该模型以及验收什么，不另行定义一套竞争性 schema。
- 旧 tick/slot 需求已移至 `.trellis/archive/core-kernel/`，不得用于实现。

## 用户价值

用户需要长期保存、编辑、回放、导入导出和扩展同一份作品。文档模型必须同时满足通用记谱语义、吉他首发产品、未知扩展数据保真和未来格式演进，不能把当前 UI、播放时钟或吉他指法当成跨领域核心事实。

## 核心需求

### R1 单一业务真相

`ScoreDocument` 是唯一持久化谱面业务真相，固定包含：

- `schemaVersion = "brilliant-score-1"` 与稳定文档 ID。
- 文档元数据 `metadata`。
- 全谱唯一小节顺序与拍号事实 `measureDefinitions`。
- 一个或多个 `parts`。
- 受控的 `extensions` 扩展信封。

布局坐标、DOM ID、播放游标、毫秒时间、渲染缓存、文件路径和 UI 会话状态不得进入该业务真相。

### R2 通用记谱骨架

结构必须表达 `Part -> Staff -> 每小节 Voice -> 有序 RhythmicEvent -> Note`：

- 全谱小节定义只保存一次，每个 Part 对每个全谱小节恰有一个内容映射。
- Staff 归属于 Part；Voice 归属于一个 Part 的一个小节，并只能引用该 Part 的 Staff。
- Event 数组顺序就是 Voice 内的语义顺序，不持久化绝对 offset 或 tick。
- Event 内容区分 rest 与 notes；notes 可包含多个 Note，以便 schema 能表达和弦。
- Measure、Part、Staff、Voice、Event、Note 使用非空且文档内全局唯一的稳定 ID。

### R3 精确音乐时间

- 持久化时间使用规范化 `Fraction` 与语义 `NoteValue`。
- `NoteValue` 表达基本时值、附点和 time modification；事件起点由序列起点与前序事件时值精确推导。
- 小节有效时长由拍号或弱起时长表达。
- PPQ、tick、毫秒、播放调度时间和布局时间是适配层派生值，不是文档 schema 字段。
- 所有分数运算必须保持整数精确性，并在安全整数溢出时稳定失败，禁止静默浮点舍入。

### R4 书写音高与移调

- Note 只持久化 `WrittenPitch`。
- Part 的乐器描述持久化书写音高到实际音高的移调关系。
- `SoundingPitch` 必须确定性派生，不能作为第二份可漂移事实持久化。
- 吉他首发配置使用书写到实际 `-7 / -12`；具体调弦不属于 Core，后续由 Part 所有的 GuitarExtension 表达。

### R5 可保真的扩展信封

- `ScoreDocument.extensions` 必须存在，K1-1 支持 score owner 和 part owner。
- 每个 `ExtensionBlock` 包含 namespace、正整数 schemaVersion、owner 与 JSON-compatible payload。
- Core 只验证信封、owner 引用、唯一性与有限 JsonValue，不解释领域 payload。
- 未知扩展在 decode/encode 语义往返后必须保留 JSON 类型、键值含义与数组顺序。
- 不承诺原始空白、对象键顺序、数字文本拼写、zip entry 或字节级身份。

### R6 三层验证

输入边界必须严格分离：

1. `unknown -> decode`：形状、类型、版本、额外字段和联合类型错误产生 `decode.*`。
2. Core semantic validation：ID、引用、所有权、覆盖、时间、音高与扩展信封错误产生 `semantic.*`。
3. `ScoreFeatureProfile`：返回三态 `ScoreSupportResult`；语义合法且支持为 `supported`，语义合法但当前产品暂不支持为 `unsupported` 并携带 `unsupported.*`，语义无效为 `invalid` 并携带 `semantic.*`。

任何普通畸形输入都不得泄漏未分类异常。诊断必须有稳定 code、messageKey、结构化路径、可选隐私安全 details 和确定顺序。

### R7 Schema 与首发能力分离

通用 schema 应能表达多 Part、多 Staff、多 Voice、和弦、附点、连音比例和弱起；首个 `ScoreFeatureProfile` 可以更窄。当前 K1 profile 只支持：

- 一个 Part、一个 Staff、每小节一个 Voice。
- 4/4、无弱起、序列从 `0/1` 开始并恰好填满小节。
- 四分、八分、十六分时值，无附点、无 time modification。
- rest 或单 Note event。

超出 profile 不等于文档损坏，必须返回 `status: "unsupported"` 和 `unsupported.*`；语义损坏必须返回 `status: "invalid"` 和 `semantic.*`。不得用通用 `ok: false` 混淆两者，也不得把通用 schema 收窄为吉他 MVP 的偶然限制。

### R8 吉他领域边界

Core K1-1 不保存调弦、弦号、品位、把位或吉他技巧语义。后续 Guitar Domain 必须在 Part-owned `ExtensionBlock` 中定义 `GuitarExtension`，并独立完成 decode、语义验证和领域诊断。Core 负责未知 payload 保真，但不负责解释它。

## 验收标准

- AC-REQ-002-01：产品文档不再把旧 tick/slot 模型描述为现行契约。
- AC-REQ-002-02：活动规范、当前源码和行为测试共享 `brilliant-score-1` 字段与边界。
- AC-REQ-002-03：合法通用谱面可以通过语义验证，即使被当前 profile 标记为 unsupported。
- AC-REQ-002-04：未知 score/part 扩展 payload 通过语义 JSON 往返保持不变。
- AC-REQ-002-05：吉他领域数据不进入 Core Note/Event/metadata 字段。
- AC-REQ-002-06：未来发现真实旧格式消费者时停止兼容实现，先建立独立迁移计划；未发布草案不获得隐式兼容层。

## 非目标

- 本需求不定义物理 `.bgp` zip IO、自动保存、最近文件或平台文件系统。
- 本需求不定义命令、历史、selector、事件总线、registry 或 capability。
- 本需求不实现 GuitarExtension；它属于后续 Block 2。
- 本需求不保证排版、播放或导出结果，只保证它们有稳定、无重复事实的语义输入。
