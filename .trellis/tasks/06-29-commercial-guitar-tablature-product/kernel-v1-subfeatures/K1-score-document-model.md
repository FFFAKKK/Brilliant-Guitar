# K1 谱面核心对象模型小功能规划

## 范围

`K1` 定义 Core Kernel 拥有的谱面数据真相。音乐时间模型归属于 `ScoreDocument`，因为节奏位置、时值和小节长度是谱面自身的语义，不是第十类内核机制，也不是播放时钟服务。

K1 不负责命令提交、undo/redo、snapshot API、事件分发、registry 生命周期、真实 `.bgp` 物理 IO、渲染、播放调度或 UI 光标状态。这些内容分别属于其它内核机制或外部模块。

## 来源文档

- `requirements/REQ-002-score-document-model.md`
- `requirements/REQ-003-guitar-tab-editing.md`
- `requirements/REQ-011-mvp-first-stage-scope.md`
- `specs/SPEC-001-document-model.md`
- `specs/SPEC-005-guitar-techniques.md`
- `.trellis/spec/core-kernel/backend/score-document-model.md`
- `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`

## 小功能汇总

| ID | 名称 | 主要契约 | 测试重点 |
|----|------|----------|----------|
| `K1-F001` | `ScoreDocument` 根对象与身份 | 谱面唯一真相、schema 身份 | 新建文档基础结构 |
| `K1-F002` | 元数据与全局谱面设置 | 标题、作者、tempo、拍号 | 元数据 round-trip、unsupported 设置 |
| `K1-F003` | 稳定实体 ID | 文档实体可稳定引用 | ID 在保存、回放、迁移中稳定 |
| `K1-F004` | 单标准吉他轨道 | V1 一个 6 弦吉他轨道 | 单轨有效，多轨/非吉他 unsupported |
| `K1-F005` | 调弦与科学音高 | 逐弦明确音高，不用 `EADGBE` | 标准调弦、非法调弦 |
| `K1-F006` | 小节与声部容器 | 小节顺序、V1 单 voice | 单 voice 有效，多 voice unsupported |
| `K1-F007` | 音乐时间基准与时值常量 | 960 PPQ、3840 tick、三种时值 | 时值常量、非法时值 |
| `K1-F008` | Beat 事件槽位 | tickOffset、duration、note/rest 互斥 | 不重叠、不隐式留空 |
| `K1-F009` | `NoteEvent` 吉他语义 | 弦、品、音高、时值、技巧 | 弦/品/音高一致性 |
| `K1-F010` | `RestEvent` 休止语义 | 显式休止数据 | 休止 round-trip、时值一致 |
| `K1-F011` | `TechniqueAnnotation` 存储 | 结构化技巧注解 | `slide`/`bend`/`vibrato` 参数保留 |
| `K1-F012` | 扩展数据预留 | 命名空间隔离的未来数据 | 未知扩展数据不破坏核心谱面 |
| `K1-F013` | K1 fixture 契约 | 4 小节标准 6 弦 riff | 基准 fixture 与坏例 fixture |

## 小功能细化

### K1-F001: ScoreDocument 根对象与身份

产品视角:
- 用户需要一个可靠的工程文件，能长期保存、重新打开、迁移和测试。
- 根对象是六线谱、五线谱、播放、导出和未来插件读取的共同入口。

业务逻辑视角:
- V1 有且只有一个 `ScoreDocument` 根对象。
- 根对象至少包含 `schemaVersion`、稳定 `id`、`metadata`、`score` 和可选 `extensions`。
- 根对象不得包含 UI 光标、渲染坐标、播放引擎状态、文件路径、自动保存路径或导出结果。

技术实现视角:
- 主要结构遵守 `SPEC-001` 和 `.trellis/spec/core-kernel/backend/score-document-model.md`。
- 即使真实 `.bgp` IO 还没实现，`schemaVersion` 也必须存在。
- `id` 必须在序列化、命令回放、snapshot 读取和未来迁移测试中保持稳定。
- K1 定义结构；K6 负责 schema 兼容和迁移行为。

反过度设计视角:
- V1 不做协作元数据、云同步所有权、嵌入资源、文件锁或发布信息。
- 不得把窗口状态、最近文件、文件系统路径写进 `ScoreDocument`。

验收标准:
- 新建 V1 文档时，根对象字段完整。
- 根对象可以序列化为普通 JSON。
- 根对象不依赖 React、Tauri、VexFlow、Web Audio、DOM、zip 或文件系统 API。

测试要求:
- `K1-F001` 新文档包含 `schemaVersion`、`id`、`metadata`、`score`。
- `K1-F001` JSON round-trip 后根对象身份不丢失。
- `K1-F001` 后续 K5 验证应能拒绝根对象中的 UI/播放/文件系统状态。

### K1-F002: 元数据与全局谱面设置

产品视角:
- 用户需要标题、作者、速度和 4/4 拍号，让谱子能用于练习、教学和导出。
- 这些字段足够支撑第一条 4 小节 riff，不把内核扩展成完整出版系统。

业务逻辑视角:
- V1 元数据至少支持标题、可选作者、创建应用版本、最后保存应用版本、创建时间、更新时间。
- V1 全局设置支持固定 tempo 和全局 4/4 拍号。
- tempo map、小节级 tempo、变拍号、歌词、理论分析和复杂出版元数据不属于 V1。

技术实现视角:
- `DocumentMetadata`、`Score.globalTempo`、`Score.globalTimeSignature` 是数据模型字段。
- tempo 表示每分钟四分音符数，应为可验证数字。
- K5 负责 `unsupported-tempo-map` 和 `unsupported-time-signature`。
- 用户可见文案属于 i18n/UI 层；K1 保存稳定数据，不保存本地化显示字符串。

反过度设计视角:
- 不做 MusicXML 式完整元数据、版权块、多语言标题、排版出版设置或 rehearsal mark 系统。
- 简单段落标记可以后续规划，但不得成为 K1 base fixture 必填项。

验收标准:
- V1 文档可以保存标题、可选作者、固定 tempo、4/4 拍号。
- V1 文档不包含 tempo map 或小节级 tempo 覆盖。
- unsupported 设置通过验证失败表达，而不是静默视为已支持。

测试要求:
- `K1-F002` 元数据 JSON round-trip 不丢失。
- `K1-F002` base fixture 包含固定 tempo 和 4/4。
- `K1-F002` 后续 K5 验证应覆盖 tempo map 和非 4/4 拍号。

### K1-F003: 稳定实体 ID

产品视角:
- 稳定 ID 让撤销、选区、诊断、导入映射和未来插件都能指向同一个谱面元素。
- 用户感知到的是错误定位可靠、保存重开后编辑目标不乱。

业务逻辑视角:
- 文档、轨道、小节、voice、beat、note、rest 和 technique annotation 都需要稳定 ID。
- ID 标识谱面实体，不标识屏幕对象。
- ID 不能只靠数组下标表达，否则后续插入小节或 beat 会破坏引用。

技术实现视角:
- 使用适合测试的确定性 ID 生成策略。
- K1 定义 ID 字段；K3 用于回放/历史；K4 用于地址/范围；K7 通过 snapshot/selector 暴露。
- 测试不应依赖随机 ID。

反过度设计视角:
- V1 不需要云端全局 ID、CRDT actor、账号作用域 ID 或协作时钟。
- 不要把 ID 设计成未来数据库主键的形状。

验收标准:
- 能被命令、diagnostic、snapshot 或技巧目标引用的持久化实体都有 ID。
- ID 在 JSON 序列化前后稳定。
- ID 与 UI 坐标、DOM id 解耦。

测试要求:
- `K1-F003` base fixture 中所有持久实体都有 ID。
- `K1-F003` round-trip 后 ID 不变。
- `K1-F003` 后续命令测试不依赖 DOM 或屏幕坐标。

### K1-F004: 单标准吉他轨道

产品视角:
- 第一条可用路径是标准 6 弦吉他谱，不是完整多乐器工作站。
- 单轨 V1 降低复杂度，同时保留未来多轨数组结构。

业务逻辑视角:
- V1 有效谱面恰好包含一个 track。
- track 的乐器类型是 `guitar`。
- track 使用 `stringCount = 6`、标准调弦、capo 默认为 `0`、合法品位范围。
- V1 不暴露添加、删除、排序、重命名、mute、solo 等轨道管理能力。

技术实现视角:
- `Score.tracks` 可以是数组，为未来多轨迁移保留结构。
- V1 通过 K5 验证拒绝 0 个 track 或超过 1 个 track。
- track 字段至少包含稳定 `id`、instrument descriptor 和 measures。

反过度设计视角:
- 不实现轨道管理 UI、MIDI channel、混音设置、mute/solo、多乐器默认模板。
- 不让贝斯、鼓、键盘或 7/8 弦吉他成为 V1 有效数据。

验收标准:
- base fixture 只有一个标准 6 弦吉他 track。
- 数据结构保留未来多轨可能，但 V1 验证不允许多轨通过。
- unsupported string count 和 unsupported instrument family 有明确验证路径。

测试要求:
- `K1-F004` base fixture 包含一个 guitar track。
- `K1-F004` `stringCount = 7` 后续 K5 返回 `unsupported-string-count`。
- `K1-F004` 多 track 后续 K5 返回 V1 unsupported。

### K1-F005: 调弦与科学音高

产品视角:
- 吉他手编辑的是弦/品，五线谱和播放需要明确音高；调弦必须可靠。
- `EADGBE` 丢失八度信息，不能作为核心数据。

业务逻辑视角:
- 标准 V1 调弦低到高保存为 `E2 A2 D3 G3 B3 E4`。
- 六线谱弦号使用吉他习惯: `6` 是最低音弦，`1` 是最高音弦。
- 每根弦保存 `stringNumber` 和 `openPitch`。
- 音符音高由调弦加品号推导，并作为 `pitch` 保存，用于跨视图一致性。

技术实现视角:
- 使用 `ScientificPitch`，例如 `E2`、`F#3`、`Bb3`。
- 标准调弦常量建议使用稳定 ID: `standard-guitar-e2-a2-d3-g3-b3-e4`。
- K5 验证 `invalid-tuning`、`invalid-string`、`invalid-fret` 和弦/品/音高不一致。
- 音高计算必须是纯 TypeScript，不依赖音频或渲染。

反过度设计视角:
- V1 不做微分音、特殊律制、完整调弦预设库、复杂 capo 记谱规则或移调乐器系统。
- 替代调弦可以后续规划，V1 base fixture 和验证只接受标准 6 弦调弦。

验收标准:
- 标准调弦用 6 个明确音高和弦号表示。
- 核心数据中没有权威 `EADGBE` 字段。
- 弦/品/音高一致性可以在无 UI、无渲染、无播放情况下检查。

测试要求:
- `K1-F005` 标准调弦等于 `6=E2, 5=A2, 4=D3, 3=G3, 2=B3, 1=E4`。
- `K1-F005` 非法调弦后续 K5 产生稳定 diagnostic。
- `K1-F005` 6 弦 0 品音高为 `E2`。

### K1-F006: 小节与声部容器

产品视角:
- 小节和 voice 让谱子成为有节奏结构的音乐，而不是松散品号列表。
- 保留 voice 容器能为未来多声部留下迁移空间，但不增加 V1 编辑复杂度。

业务逻辑视角:
- V1 base fixture 使用 4 个小节。
- 每个小节有稳定 ID、顺序、duration ticks 和恰好一个 voice。
- 每个 V1 voice 拥有有序 beat 序列。
- 一个小节多个 voice 在 V1 中是 unsupported。

技术实现视角:
- 4/4 V1 的 `Measure.durationTicks` 期望为 `3840`。
- `Voice` 是容器，即使 V1 只允许一个 voice，也不应完全删除。
- K5 验证 voice count、小节 duration、beat 顺序、隐式空洞和溢出。

反过度设计视角:
- 不做复调吉他声部编辑、符干方向、voice 冲突排版或多 voice UI。
- 不为了省事删除 voice 层，否则后续多声部迁移会更困难。

验收标准:
- base fixture 有 4 个有序小节。
- 每个 V1 小节恰好一个 voice。
- 多 voice 只作为未来 schema 概念保留，V1 不验证通过。

测试要求:
- `K1-F006` base fixture 有 4 个小节且每小节一个 voice。
- `K1-F006` 双 voice 后续 K5 返回 `unsupported-voice-count`。
- `K1-F006` 小节顺序 round-trip 后稳定。

### K1-F007: 音乐时间基准与时值常量

产品视角:
- 音乐时间让谱面可以被播放、布局和导出一致解释。
- 用户期望同一段节奏在六线谱、五线谱、播放和导出里一致。

业务逻辑视角:
- V1 使用整数 tick。
- `ticksPerQuarter = 960`。
- 4/4 小节长度为 `3840`。
- V1 允许 quarter `960`、eighth `480`、sixteenth `240`。
- 等长休止使用相同 duration 值。

技术实现视角:
- K1 定义 `Tick`、`DurationTicks`、`MusicalTimebase` 和 duration 常量或纯函数。
- K1 不定义真实播放时钟。
- K5 验证 underflow、overflow、unsupported duration、tempo map、time signature 和 note/rest duration mismatch。
- 实现时应考虑 branded type 或构造/校验函数，避免把 tick、duration、fret、string number 混用。

反过度设计视角:
- 不做 tempo automation、swing、humanize、量化器、MIDI clock、DAW transport、附点或三连音。
- 不把毫秒时间或 Web Audio `currentTime` 存入 `ScoreDocument`。

验收标准:
- 时间基准是确定的整数模型。
- 所有 V1 beat、note、rest duration 都来自受支持 tick 值。
- 后续播放、渲染、导出可以从 snapshot 派生时间，不修改文档。

测试要求:
- `K1-F007` base fixture 使用 `ticksPerQuarter = 960`。
- `K1-F007` 支持的 duration 常量能 JSON round-trip。
- `K1-F007` 非法 duration 后续 K5 返回 `unsupported-duration`。

### K1-F008: Beat 事件槽位

产品视角:
- Beat 槽位给键盘优先输入提供稳定网格。
- 显式 note/rest 避免播放和导出对空白位置各自猜测。

业务逻辑视角:
- V1 beat 有 `tickOffset`、`durationTicks` 和一个 event。
- event 要么是 `NoteEvent`，要么是 `RestEvent`，不能同时存在。
- 同一小节内 beat 必须按 `tickOffset` 单调排序。
- V1 不依赖隐式空白时间；静音必须用显式 rest 表达。

技术实现视角:
- K1 拥有 beat 数据结构。
- K5 验证 tickOffset 单调、不重叠、不留隐式空洞、小节不 underflow/overflow。
- K2 命令以后通过语义命令改 beat，不允许暴露数组 splice。

反过度设计视角:
- 不做复杂节奏树、连音组、跨小节延音、嵌套节奏或视觉连桁。
- 连桁和显示分组属于 layout/rendering，不属于 beat 数据模型。

验收标准:
- beat 数据足够重建小节节奏。
- 小节可以完全由 note 和 rest 表示。
- 同 beat 多 note 不是 V1 有效数据。

测试要求:
- `K1-F008` offsets 为 `0, 960, 1920, 2880` 的四个 quarter beat 是有效基础数据。
- `K1-F008` 重叠 beat 后续 K5 验证失败。
- `K1-F008` 没有显式 rest 的隐藏空洞后续 K5 验证失败。

### K1-F009: NoteEvent 吉他语义

产品视角:
- 用户按弦/品编辑吉他谱，而五线谱和播放需要音高，二者必须同时可靠保存。
- 这能避免六线谱看起来对，但五线谱或播放错的情况。

业务逻辑视角:
- V1 note 有稳定 ID、string number、fret、派生 pitch、duration 和技巧注解。
- `stringNumber` 必须属于当前 track 调弦。
- `fret` 必须在 track 品位范围内。
- `pitch` 必须与调弦和 fret 一致。
- 同 beat 多音、和弦和和弦名不属于 V1。

技术实现视角:
- `NoteEvent.durationTicks` 与所属 beat duration 存在重复事实风险，K5 必须验证二者一致。
- 建议写入主事实为 beat duration，note/rest duration 在命令提交后镜像并验证。
- 音高推导必须是纯函数。

反过度设计视角:
- 不做和弦图、自动指法建议、同 beat 多音、复杂 enharmonic spelling 或五线谱编辑反推指法。
- 不把 `pitch` 改成可选字段；显式保存它能保护跨视图一致性和 round-trip 测试。

验收标准:
- note 同时保留六线谱语义和音高语义。
- 非法弦号、非法品号、音高不一致可以被诊断。
- note 数据不包含 UI 坐标或渲染对象。

测试要求:
- `K1-F009` 合法弦/品产生预期 `pitch`。
- `K1-F009` note duration 与 beat duration 不一致时，后续 K5 验证失败。
- `K1-F009` 同 beat 多 note 后续 K5 返回 `unsupported-multiple-notes-in-beat`。

### K1-F010: RestEvent 休止语义

产品视角:
- 用户需要显式静音，让播放、五线谱和导出不猜测空白。
- 显式 rest 让第一条 riff fixture 在高级节奏功能之前也完整。

业务逻辑视角:
- rest 有稳定 ID 和 duration ticks。
- rest duration 必须与所属 beat duration 一致。
- rest 与 note 在同一 beat 中互斥。

技术实现视角:
- `RestEvent` 是 K1 数据结构的一部分。
- K5 验证 duration 一致和小节完整。
- K2 后续决定编辑器如何创建、替换或删除 rest。

反过度设计视角:
- 不做多 voice rest 合并、隐藏 rest、休止符视觉定位或复杂记谱分组。
- V1 有效文档中不要用 `null` 表示空 beat。

验收标准:
- V1 可表达四分、八分、十六分休止。
- rest 能 JSON round-trip。
- rest 不依赖播放或渲染模块。

测试要求:
- `K1-F010` base fixture 至少包含一个显式 rest。
- `K1-F010` rest duration mismatch 后续 K5 验证失败。
- `K1-F010` rest round-trip 保留 ID 和 duration。

### K1-F011: TechniqueAnnotation 存储

产品视角:
- 吉他技巧必须是结构化音乐数据，而不是画在界面上的文本标签。
- 第一条可用吉他闭环需要 `slide`、`bend`、`vibrato`。

业务逻辑视角:
- V1 note event 可以包含技巧注解。
- Core Loop 技巧是 `slide`、`bend`、`vibrato`。
- 技巧至少包含稳定 ID、namespace、typeId、target、params、schemaVersion、可选 sourceModuleId。
- 未知未来技巧不能破坏核心谱面，但 V1 只把 Core Loop 技巧当成 supported。

技术实现视角:
- K1 只存储 `TechniqueAnnotation`。
- K8 registry/capability 负责技巧定义注册。
- K5 验证技巧 target、必要 params、unsupported technique 和已知冲突规则。
- V1 参数最低要求建议:
  - `slide`: direction 或 target relation。
  - `bend`: semitone amount 或 target pitch relation。
  - `vibrato`: style 或 width/speed 占位。

反过度设计视角:
- 不做完整 bend 曲线、whammy bar、复杂 vibrato 音色、真实技巧播放建模或具体 SVG/VexFlow 绘制。
- 不把技巧渲染逻辑硬编码进文档模型。

验收标准:
- `slide`、`bend`、`vibrato` 以结构化注解保存。
- 技巧数据 round-trip 后 target 和 params 不丢失。
- 未知或 unsupported 技巧通过验证/report 表达，不静默丢数据。

测试要求:
- `K1-F011` fixture 包含 `slide`、`bend`、`vibrato`。
- `K1-F011` bend fixture 至少包含音高相关结构化参数，不只是文本标签。
- `K1-F011` technique target 引用稳定 note 或 range 身份。

### K1-F012: 扩展数据预留

产品视角:
- 长期插件能力需要可隔离的未来数据位置，避免插件数据污染核心谱面。
- 用户不应该因为另一台机器缺插件就丢失核心作品。

业务逻辑视角:
- extension data 是可选的、命名空间隔离的。
- 未知 extension data 不能被解释成核心谱面真相。
- 缺少 extension handler 时，已识别的核心谱面仍可打开。
- extension data 不能绕过命令、验证和迁移来改变核心谱面含义。

技术实现视角:
- K1 可以定义 `NamespacedExtensionData` 作为根对象可选字段。
- K6 负责 `.bgp` schema round-trip 和未知数据保留。
- K8 负责未来插件/模块注册。
- K9 负责缺失或 unsupported extension handler 的诊断。

反过度设计视角:
- V1 不做第三方 plugin manifest 加载、插件存储额度、插件沙箱、市场元数据或插件资源打包。
- 不允许 extension data 保存可变 `ScoreDocument` 副本、渲染状态或播放状态。

验收标准:
- extension data 必须有 namespace 和 schemaVersion。
- 未知 extension data 与核心谱面数据隔离。
- base fixture 不依赖 extension data。

测试要求:
- `K1-F012` 未知命名空间数据可序列化，但不成为核心谱面真相。
- `K1-F012` 没有 extension data 时核心谱面仍可读取。
- `K1-F012` extension data 不包含 UI、renderer、playback、file-system 对象。

### K1-F013: K1 fixture 契约

产品视角:
- 共享 fixture 能把规划变成可反复执行的实现目标。
- 它是毕业设计演示和长期回归测试的共同基础。

业务逻辑视角:
- K1 base fixture 是 4 小节标准 6 弦吉他 riff。
- 它包含固定 tempo、4/4、单轨、每小节单 voice、四分/八分/十六分、至少一个 rest，以及 3 个 Core Loop 技巧。
- unsupported fixture variants 用于验证失败路径。

技术实现视角:
- base fixture 应是普通 JSON-compatible TypeScript 数据。
- 测试加载 fixture 不得依赖 React、Tauri、VexFlow、Web Audio、zip 或文件系统。
- K5 坏例 fixture 至少覆盖 unsupported string count、time signature、tempo map、voice count、duration、invalid string、invalid fret、invalid tuning、multiple notes in beat、underflow、overflow。

反过度设计视角:
- 不在 K1 建完整曲库、视觉 demo 曲谱、Guitar Pro 导入样例或 PDF 导出样例。
- fixture 用于验证内核语义，不用于视觉展示。

验收标准:
- base fixture 可作为 K1-K9 测试的共同 happy path。
- bad fixture 尽量一例一错，避免一个 fixture 同时触发多个无关诊断。
- fixture 数据确定，适合 snapshot comparison。

测试要求:
- `K1-F013` base fixture 后续 K5 验证通过。
- `K1-F013` 每个 bad fixture 产生预期稳定 diagnostic。
- `K1-F013` base fixture round-trip 不丢 metadata、ID、timing、string/fret、pitch、rest、technique。

## K1 完成门禁

K1 规划完成必须满足:

- 所有 K1 小功能已由用户审核通过。
- `.trellis/spec/core-kernel/backend/score-document-model.md` 已包含同等可执行契约，或在审核后同步更新。
- `implement.md` 的实现清单足够覆盖 K1 小功能，不需要写代码时猜测。
- K1 测试名和 fixture 名能直接从这些小功能 ID 推导。

