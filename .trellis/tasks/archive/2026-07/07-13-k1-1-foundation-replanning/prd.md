# K1-1 最小可扩展谱面地基重新规划

## Status

- 规划已于 2026-07-13 获用户批准，是 K1-1 唯一模型决策源。
- Core 实现子任务 `07-13-k1-1-core-foundation` 已进入 review。
- Guitar Domain、K1-2 及后续机制尚未启动。

## Goal

重新评估并规划 K1-1 谱面核心数据模型，使它同时满足：

- 当前产品以吉他打谱为第一条可交付链路；
- 核心模型不把吉他弦号、品位或具体技巧写死为通用 Note 字段；
- 后续能够扩展到钢琴、多谱表、多声部和多乐器，而不要求破坏性替换整个持久化模型；
- 第一阶段只实现被真实需求要求的最小机制，不提前建设完整插件平台或通用导入导出基础设施；
- 本任务本身只生成经审核的规划；生产源码由独立 Core 子任务执行，且在评审通过前不启动 Guitar Domain 或 K1-2。

## Background

重规划启动时的旧 K1-1 草案使用 `ScoreDocument = metadata + scoreData`，其中 `scoreData = timeline + events + techniques`，并采用固定 tick、`RhythmSlot` 与独立 `events[]` 引用模型。该描述仅是问题背景，已由本任务设计取代。

审计确认了几类真实问题：

- JSON 输入边界从 `JSON.parse()` 直接断言为 `ScoreDocument`，畸形输入可能抛异常或绕过验证；
- 当前模型持久化了可推导的顺序、起始 tick 和 offset，并允许产生 slot/event 断裂等无效状态；
- fixture、测试技巧定义和 JSON clone helper 泄漏到生产公共 API；
- 当前稳定规范、父任务文档和子任务状态存在重复与漂移；
- 现有规划把长期架构关注点写成了第一阶段必须立即实现的基础设施。

后续审计提出了更通用的 `Part / Staff / Measure / Voice / Event`、精确分数时间、三层验证与版本化扩展信封方向。该方向有长期价值，但在重写前必须明确哪些内容属于最小地基，哪些属于后续乐器模块或产品能力。

## Confirmed Requirements

- K1R-REQ-001: `ScoreDocument` 必须继续作为唯一谱面业务真相。
- K1R-REQ-002: 核心模型必须保持纯 TypeScript，不依赖 React、Tauri、VexFlow、Web Audio、物理文件 IO、网络或第三方插件运行时。
- K1R-REQ-003: 持久化结构不得保存能够可靠推导的事件绝对时间、布局坐标、播放状态或 UI 会话状态。
- K1R-REQ-004: 外部 JSON 必须经过 `unknown -> decode -> semantic validation -> supported-feature validation`，任何输入都必须安全返回结果，不得因普通畸形数据抛出未处理异常。
- K1R-REQ-005: 结构合法、音乐语义合法与当前产品版本是否支持必须分开表达；unsupported 不得被误报为 corrupted。
- K1R-REQ-006: 第一阶段必须支持吉他单 Part、单 Staff、单 Voice、固定 4/4、四分/八分/十六分、基础休止和单音输入闭环。
- K1R-REQ-007: 长期模型必须保留多 Part、多 Staff、多 Voice、和弦、附点与连音的非破坏性扩展路径，但第一阶段不要求实现相应编辑能力。
- K1R-REQ-008: 吉他弦号、品位、调弦和吉他专属技巧不得写入通用 Note；如果采用扩展数据，核心只负责稳定信封和保留边界，吉他领域模块负责解释与验证。
- K1R-REQ-009: fixture、测试技巧定义和测试 clone helper 不得从生产公共 API 导出。
- K1R-REQ-010: 规划必须解释每一个新增抽象由哪项已确认需求驱动；没有真实需求支撑的 registry、权限 capability、插件运行时、通用 report 或迁移注册表继续后置。
- K1R-REQ-011: 在用户批准最终 `prd.md`、`design.md` 和 `implement.md` 前，不得修改 K1-1 源码或运行 `task.py start`。

## Confirmed Planning Decisions

### K1R-DEC-001: 现在采用最小通用谱面骨架

结论：K1 持久化 schema 现在就采用 `Part / Staff / Voice / Event` 通用骨架，但第一阶段 `ScoreFeatureProfile` 只允许单 Part、单 Staff、单 Voice、固定 4/4 和基础单音节奏。

原因：项目的长期目标是商业级吉他打谱软件，并保留扩展到钢琴和多乐器的路径。现在命令、UI、物理文件 IO 尚未依赖当前 K1-1 schema，是替换基础结构成本最低的阶段。通用骨架可以避免以后为了多谱表、多声部和多乐器而整体迁移，同时通过第一阶段 profile 阻止未实现能力进入实际产品闭环。

边界：该决定只批准持久化结构具备通用表达能力，不批准现在实现完整钢琴、多乐器、多声部编辑功能，也不批准完整插件基础设施。

取舍：相比保留现有吉他专用结构，本轮规划和验证成本更高；相比直接实现完整通用编辑能力，该方案保留长期结构但限制当前行为，复杂度更可控。

### K1R-DEC-002: Note 持久化书写音高，发声音高派生

结论：通用 Note 只持久化 `WrittenPitch`；Part 的乐器描述保存移调规则；`SoundingPitch` 由书写音高和移调规则派生，不作为 Note 的第二份持久化音高真相。

吉他边界：吉他扩展中的逐弦调弦保存实际发声音高。标准吉他开放低音弦保存为 E2；其标准五线谱书写音高可以是 E3，并通过吉他低八度发声规则派生为 E2。未来弦号/品位校验先从调弦和品位得到实际发声音高，再与核心 Note 派生出的 `SoundingPitch` 比较。

原因：谱面编辑器首先保存用户看到和书写的记谱音高；移调乐器、吉他八度记谱和 concert-pitch 视图都需要明确区分书写与发声。只持久化书写音高可以保留 enharmonic spelling，并避免两套音高发生漂移。

取舍：播放、吉他弦品验证和 concert-pitch 显示都必须经过确定性的移调换算；相比直接保存发声音高，实现链路多一步，但长期记谱语义更稳定。

### K1R-DEC-003: 全谱小节定义是唯一顺序与拍号真相

结论：`ScoreDocument.measureDefinitions[]` 保存全谱小节顺序、小节 ID、有效拍号和可选弱起信息。Part 不保存第二套小节顺序，只保存通过 `measureId` 关联的 `PartMeasureContent`；Staff 是 Part 下的谱表定义，Voice 位于对应的 PartMeasureContent 中，事件可以在需要时覆盖目标 staff。

一致性规则：全局 `MeasureDefinition.id` 必须唯一；每个 Part 在第一阶段必须对每个全局 measure 恰好提供一份内容，不得重复、遗漏或引用不存在的小节；所有 Part 的内容顺序只能从全局 `measureDefinitions[]` 派生。

原因：钢琴双谱表、跨谱表记谱和多乐器总谱必须共享同一套小节时间轴。如果每个 Part 或 Staff 各自拥有小节顺序、拍号和小节线，会产生多个可能漂移的结构真相。

取舍：Part 内容必须通过 ID 关联全局小节，因此 decoder 和语义验证需要额外检查覆盖、重复与断裂引用；相比 Part 内独立小节数组，单乐器文件略复杂，但多谱表和多乐器扩展不需要重构时间骨架。

### K1R-DEC-004: 持久化 NoteValue 与规范化精确分数，不持久化 tick

结论：持久化音乐时间以全音符为 `1/1` 的规范化 `Fraction` 表达。事件保存记谱语义 `NoteValue`，其精确时值由 base、附点和 time modification 规则确定；sequence 只保存相对所属小节起点的 `Fraction` 起点和顺序事件，事件位置由前序时值累计得到。tick、PPQ、毫秒和布局坐标都由播放、MIDI、渲染或导出适配器派生。

基础换算：全音符为 `1/1`、二分音符为 `1/2`、四分音符为 `1/4`、八分音符为 `1/8`、十六分音符为 `1/16`；4/4 小节长度为 `1/1`。例如八分音符三连音的单事件精确时值为 `1/8 * 2/3 = 1/12`，不得使用浮点近似。

Fraction 契约：numerator 和 denominator 必须是 safe integer；denominator 必须大于 0；零必须规范化为 `0/1`；非零值必须按最大公约数约分；符号只允许在 numerator；持续时值和 sequence 起点不得为负；运算在中间结果或最终结果超出 safe integer 时必须返回稳定失败结果，不得舍入或静默溢出。

原因：固定 PPQ 对当前节奏足够，但会把未来连音、互操作和精确比较绑定到整除能力。以 NoteValue 保存记谱语义、以 Fraction 执行精确运算，可以避免同时持久化 offset、tick 和 notation duration 三套时间真相。

取舍：Core Kernel 需要实现并测试一套小型确定性 Fraction 运算；播放和导出适配器必须显式选择量化策略，但持久化谱面本身不会因适配器精度丢失时间语义。

### K1R-DEC-005: Core Kernel 语义保留未知扩展

结论：Core Kernel 持久化版本化 `ExtensionBlock`。每个扩展块包含稳定 namespace、正整数 schema version、明确 owner 和 JSON-compatible payload。核心只验证信封结构、owner 引用和同一 owner 下 namespace 唯一性；已知 payload 的领域语义由对应官方或未来外部领域模块验证。

Owner 边界：K1 扩展 owner 只允许 score 或 part。吉他扩展使用 part owner；需要引用具体 note、event 或 measure 的数据在 payload 内使用稳定 ID，由 Guitar Domain 验证。K1 不为每个 note 建立一个通用扩展容器。

保留承诺：未知扩展必须在 decode、semantic validation 和 semantic JSON round-trip 后保持 JSON 数据意义不变。Core Kernel 不承诺保留空格、对象属性原始顺序、数字文本写法或原始字节；字节级保留属于未来 `.bgp` 物理持久化层。

原因：商业文件不能因为当前应用不认识未来或其它模块的数据就静默丢失用户资产；同时纯语义内核不应承担 zip、原始 JSON 文本或文件字节管理。

取舍：核心 decoder 必须接受并深度保留任意合法 JsonValue，且已知领域模块需要单独执行 payload 验证；相比只支持已知扩展，测试面更大，但向前兼容和模块隔离更可靠。

### K1R-DEC-006: Core Kernel 与 Guitar Domain 分块实施

结论：本次规划描述同一地基替换，但执行时必须分为两个独立验证块。第一块只替换通用 Core Kernel schema、时间、音高、decoder 和三层验证；第二块才定义官方 GuitarExtension、实际发声调弦、弦品映射和吉他领域验证。第一块通过后才能开始第二块。

原因：项目既有工作方式要求一次只推进一个大内核功能。通用谱面结构与吉他领域规则的失败原因、测试资产和回滚边界不同，分块可以避免用吉他特例反向污染核心模型。

### K1R-DEC-007: 第一阶段使用 ScoreFeatureProfile 限制产品能力

结论：通用 schema 可以表达多 Part、多 Staff、多 Voice、和弦、附点和 time modification；第一阶段 `ScoreFeatureProfile` 只接受一个 Part、一个 Staff、每小节一个 Voice、4/4、sequence 从 `0/1` 开始、四分/八分/十六分、无附点、无 time modification、单音或 rest。超出 profile 的谱面如果 decode 和语义验证通过，必须报告 unsupported，而不是 corrupted。

命名边界：这里使用 `ScoreFeatureProfile`，不得与未来权限或模块注册系统的 capability 混用。

### K1R-DEC-008: 直接替换尚未发布的 K1-1 草案

结论：当前 K1-1 schema 尚未发布，也尚未被命令、UI 或物理 `.bgp` 文件格式依赖，因此本次采用受控直接替换，不为旧 `timeline / RhythmSlot / fixed tick` 草案建立兼容层或迁移器。第一份正式持久化合同命名为 `brilliant-score-1`。

保护条件：实施启动前必须再次确认仓库内不存在真实用户文件或外部消费者依赖旧草案。如果发现此假设不成立，立即停止实施并单独规划迁移，不能静默丢弃数据。

原因：为未发布且尚无消费者的草案建设兼容层只会把已知缺陷永久带入第一版合同；现在直接替换的风险和成本都低于后续破坏性迁移。

## Out of Scope

- K1-2 命令系统、undo/redo、snapshot、event bus 的实现。
- React/Tauri UI、渲染、播放和物理 `.bgp` 文件 IO。
- Extension Registry、第三方插件加载、权限 capability、运行时热插拔。
- 完整钢琴编辑器、总谱编辑器、多声部编辑 UI、连音与附点输入 UI。
- MusicXML/Guitar Pro 实际导入导出。
- 为尚未发布的当前 K1-1 草案建立兼容层或迁移器；执行前发现真实外部消费者时必须重新规划。

## Acceptance Criteria

- [x] AC-K1R-001: 形成一个明确推荐方案，并与至少两个备选方案比较复杂度、长期兼容性和第一阶段成本。
- [x] AC-K1R-002: `design.md` 明确 Measure、Part、Staff、Voice、Event 的所有权与引用方向，不存在两个未声明的顺序或时间真相源。
- [x] AC-K1R-003: `design.md` 明确 written/sounding pitch、移调和吉他八度记谱规则。
- [x] AC-K1R-004: `design.md` 给出完整 Fraction 与 NoteValue 契约，包括规范化与溢出行为。
- [x] AC-K1R-005: `design.md` 定义 decode、semantic validation、supported-feature validation 的输入、输出和职责边界。
- [x] AC-K1R-006: 如果保留 ExtensionBlock，设计必须明确未知扩展的保留级别、作用域、版本和验证责任。
- [x] AC-K1R-007: `implement.md` 将 Core Kernel 地基替换与 Guitar Domain 分成独立验证点和回滚点。
- [x] AC-K1R-008: 测试规划至少覆盖吉他单声部有效 fixture、钢琴双谱表语义 fixture、多 Part fixture、畸形 JSON、断裂引用、unsupported profile 和未知扩展 round-trip。
- [x] AC-K1R-009: 规划列出需要更新的稳定规范、父任务摘要和 K1 子任务文档，并指定 `.trellis/spec/core-kernel/` 为编码唯一有效契约。
- [x] AC-K1R-010: 用户已于 2026-07-13 审核并批准最终规划，允许创建并启动 Core Block 实施子任务。
