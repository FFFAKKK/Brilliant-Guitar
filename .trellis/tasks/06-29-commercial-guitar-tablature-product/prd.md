# 工业级开源吉他打谱软件需求定义

## 状态

- Trellis task: `06-29-commercial-guitar-tablature-product`
- 当前阶段: Phase 1.1 需求探索
- 创建日期: 2026-06-29
- 负责人: ATOM
- 文档策略: 每个需求先写独立文档，最终再合并为收敛后的 PRD。

## 产品目标

做一款面向吉他手的工业化、开源打谱软件。它需要覆盖 Guitar Pro 8 类产品的核心能力，但在可扩展性、输入效率、文件结构、二次开发和现代工作流上更进一步。项目按商业级软件质量标准建设，但近期不做商业化变现。

一句话目标:

> 为严肃吉他手、教师、编曲者和内容创作者提供一个高效率、可扩展、可长期维护的开源吉他谱创作与练习平台。

## 已确认事实

- 用户要做的是面向吉他手的打谱软件，不是泛音乐社交平台。
- 用户明确希望参考 Guitar Pro 8，但产品要更具扩展性、更方便。
- 用户希望需求文档粒度足够细，保证后续 AI 写代码时结果更确定。
- 当前仓库是新初始化的 Trellis 项目，尚无应用代码。
- 需求阶段采用“每个需求一个文档，最后合并”的方式推进。
- MVP 目标用户已确认: 专业/半专业吉他手、吉他教师、编曲者、内容创作者。
- MVP 主工作流已确认: 先把基础创作、编辑、编曲做好。
- 产品规划必须使用产品经理流程，包括开源产品画布、用户价值、范围边界和长期维护路径。
- 技术规划必须明确技术栈、软件架构、项目架构和细粒度 spec 文档体系。
- 后续所有 PRD、架构、spec 和实现文档都必须以“可控、确定、可验收的 AI 编码输入”为目标。
- 后续每个功能、模块或内核子系统规划都必须包含四个审核视角: 产品视角、业务逻辑视角、技术实现视角和反过度设计视角。
- 用户构想已确认: 软件应相对模块化，并且后续可以支持各种插件。
- 架构原则已确认: 可以按当前产品需求重新设计架构，而不是在旧设计基础上修补；整体采用类似操作系统的微内核式 Core Kernel + 用户态服务模块结构。
- Core Kernel 构想已确认: 内核负责关键谱面能力并对外提供稳定接口，渲染、播放、导入导出、UI、桌面壳、内部扩展和未来插件都以模块形式与内核协作。
- 微内核取舍已确认: 架构可以参照操作系统微内核思想，接受少量性能损耗，以换取更强的架构稳定性、可维护性和扩展性。
- 模块化插件模型已确认: 长期向 VS Code 式插件体验演进，官方模块和未来第三方模块使用同一套启动期注册协议；`origin`、`runtime`、`trustLevel` 和 capability 解耦，第三方模块未来可经启动前授权获得高权限并替换官方 UI、渲染、导入导出等模块。未来公开第三方插件统一采用 TypeScript，发布包可包含编译后的 JavaScript 产物；Pure Core Kernel V1 只实现官方/内置启动期注册基础，不执行任意第三方 TypeScript 插件运行时、编译产物、Lua 或 native 代码。
- MVP 乐器与编辑范围已确认: 先把六线谱、五线谱基础功能和吉他功能做好，再做贝斯、鼓、键盘、复杂编曲和其它生态能力。
- MVP 吉他技巧范围已确认: 技巧必须分类，第一阶段先覆盖 P0 最高频技巧，后续再扩展低频和复杂技巧。
- MVP 技巧范围已确认: 第一条编码闭环先覆盖 3 个 `Core Loop` 技巧: `slide`、`bend`、`vibrato`；`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强，不阻塞第一条闭环。
- 微内核数据结构决策已确认: `ScoreDocument` 顶层收敛为 `metadata + scoreData`；`metadata.music.tuning` 必须保存明确音高，例如标准 6 弦吉他低到高 `E2 A2 D3 G3 B3 E4`，不得把 `EADGBE` 作为核心数据。
- 技巧扩展决策已确认: 微内核保存结构化 `TechniqueData`，技巧通过有序 `targetNoteIds` 作用于一到多个有声音符；后续新增技巧不得散落硬编码到 UI、渲染、播放和导出层。
- 命令系统边界已确认: Core Kernel 对外只暴露语义命令，例如 `insertNote`、`insertRest`、`setNotePitch`、`setDuration`、`addTechnique`；底层 patch、JSON path、字段替换和数组操作只能作为内核内部事务、undo/redo 和回放实现细节，不得成为 UI、插件、导入器或外部 API 的写入入口。弦号/品号输入由后续吉他谱模块处理，不属于 Pure Core Kernel K1 命令。
- undo/redo 粒度已确认: 第一阶段先采用细粒度历史模型，每个成功的可撤销语义命令默认对应一个 `HistoryEntry`；`undo` 和 `redo` 一次只回退或重做一个历史条目，不做复杂智能合并，以优先保证 MVP 基本功能稳定、可测试、可回放。
- 文档地址/范围模型重新设计授权已确认: 用户允许重新设计该内核功能，不必遵守当前可选字段版 `DocumentAddress` 草案；已新增研究文档 `research/document-address-range-design-patterns.md` 对比相关设计模式。
- 谱面数据根本原则已确认: 所有操作都必须服务 `ScoreDocument` 谱面数据；排版、布局坐标、屏幕坐标、播放光标和导出页面坐标都只能从谱面数据派生，不得成为独立事实来源。
- 内核音乐时间模型已确认: 只保存静态谱面数据会让打谱软件停留在静态文档层；Core Kernel 必须拥有乐谱的音乐逻辑时间模型，用整数 tick 表达 beat、duration、小节长度和节奏位置，让编辑、验证、播放事件生成、布局和导出共享同一套节奏真相。真实毫秒调度、Web Audio 时钟、节拍器声音和播放光标高频 tick 属于外部 Playback/UI 模块。
- 坐标解析边界已确认: Core Kernel 不负责屏幕坐标、布局坐标、SVG/VexFlow 坐标或 hit testing；内核只负责谱面语义地址/范围、命令目标校验和谱面数据事务。外部编辑、布局和渲染模块通过公开接口把用户坐标解析为合法语义目标后再调用内核。
- 坐标解析模块化策略已确认: 坐标解析作为外部模块能力；MVP 先不单独拆包，由 `Layout Module + Editor Session Service` 承担，后续在多页、多轨、多声部、复杂选区或多渲染后端复杂度上升后抽出专门 `Positioning Service`。
- 硬一致性验证边界已确认: Core Kernel 第一阶段只保留硬一致性验证和基础 diagnostic；软一致性、可演奏性分析、指法建议、教学提示、风格检查、难度评分和兼容性评分暂不需要，不进入 MVP。
- `.bgp` 语义契约边界已确认: `.bgp` 的包内语义、`manifest.json`、`score.json` schema、schema version、兼容矩阵、迁移入口和 `MigrationReport` 属于 Core Kernel；真实 zip 读写、文件路径、原子保存、自动保存、崩溃恢复和最近文件列表属于外部 `Persistence Service`。
- 内核注册表与 capability 已确认: `KernelRegistry`、module identity、API version、contribution descriptor 和 capability 检查作为独立 Core Kernel 功能继续规划。
- 内核错误、diagnostic 与 report 已确认: `KernelError`、`KernelDiagnostic`、`KernelReport`、`KernelReportIssue`、`ImportReport`、`ExportReport`、`MigrationReport` 和 `ValidationReport` 作为独立 Core Kernel 功能继续规划。
- 国际化范围已确认: 后续要支持语言切换，第一阶段先支持简体中文和英文。
- MVP 导出范围已确认: 第一阶段先做 PDF + PNG，SVG 后置。
- MVP 弦数范围已确认: 第一阶段暂不支持 7 弦吉他，只支持标准 6 弦吉他；7/8 弦吉他进入后续阶段候选。
- 原生文件策略已确认: 选择方案 B，即“GP8 式单文件体验 + 开放包结构”。对用户表现为一个专属扩展名单文件，内部采用 zip + JSON + schema version + 资源目录。
- 产品发布策略已确认: 先全部做开源，商业化遥遥无期且近期不做；不得实现闭源商业版本、商业增强模块、收费功能、许可证校验、订阅或付费插件。
- 开源协议已确认: 第一阶段采用 Apache-2.0。
- 外部贡献治理已确认: 第一阶段采用 DCO，不使用复杂 CLA。
- 项目用途已确认: 用户希望把本项目作为毕业设计，因此后续范围、文档、架构和验收必须兼顾“产品可行性”和“毕业设计可答辩性”。
- 产品长期维护原则已确认: 长期维护是项目原则，必须从始至终一直执行；毕业设计只是第一个里程碑，不代表项目可以随便做。
- 毕业设计外部约束已确认: 暂无学校/学院特殊硬性要求，先按软件工程类毕业设计交付包准备。
- 工程质量定位已确认: 项目先作为开源项目推进，但必须按商业软件流程建设，质量要求覆盖健壮性、安全性、高效性、可靠性、可维护性、可测试性和可发布性。
- 首发平台与质量基准已确认: 第一阶段先做 Windows 桌面，确保 Windows 版本质量达标后再做其它平台。
- 产品名与原生扩展名已确认: 产品名暂定 `Brilliant Guitar`，原生文件扩展名采用 `.bgp`，含义为 `Brilliant Guitar Project`。
- 第一阶段技术栈已确认: Tauri 2 + TypeScript + React + Vite。
- MVP 执行优先级已确认: 先跑通 `Guitar Core Loop` 可运行闭环，再扩展高级功能和生态能力。
- MVP 第一条纵向切片已确认: 以“4 小节标准 6 弦吉他 riff”为第一条可运行闭环。
- MVP 谱面渲染目标已确认: 第一阶段采用自研布局模型 + SVG 首发渲染目标，布局模型必须与渲染后端解耦，后续可补充 Canvas/WebGL。
- MVP 渲染适配器已确认: 第一阶段采用 VexFlow 作为 SVG 渲染适配器，并使用自定义 SVG overlay 补齐编辑辅助和 Core Loop 技巧显示。
- MVP 播放校对范围已确认: 第一阶段只做最基本播放校对，包括合成播放、开始/暂停/继续/停止、播放光标、节拍器、基础速度控制，以及从文档快照生成播放事件；不做真实采样音色、音频轨、混音、导出音频或复杂技巧音色模拟。
- MVP 编辑输入优先级已确认: 第一阶段先做键盘优先输入；MIDI 输入、MIDI 录入、MIDI 导入和其它外部演奏输入后置。
- MVP 键盘输入模型已确认: 采用“谱面光标 + 时值键 + 数字品号输入 + 弦间/拍间方向键移动 + 技巧快捷键/命令面板”的 Guitar Pro 式高效输入模型；自由文本谱解析不作为主输入。
- MVP 节奏与复音复杂度已确认: 第一阶段只支持 4/4、单声部事件流、固定 tempo、基础休止、四分/八分/十六分音符和单音输入；三连音、附点节奏、跨小节延音线、多声部同轨、变拍号、同 beat 多音和复杂节奏谱后置。
- MVP 和弦能力已确认: 第一阶段不做和弦，MVP 只要求单音 + 休止；同 beat 多音、和弦图、和弦名自动识别、和弦库、扫弦/琶音节奏细节和复杂和声分析后置。
- MVP 轨道管理已确认: 第一阶段产品闭环只提供一个默认吉他谱上下文，不暴露轨道添加、删除、重命名、排序 UI；Core Kernel K1 不定义 `Track` 主实体，未来多轨作为外部模块或后续模型演进单独规划。
- MVP 歌词/理论标注范围已确认: 第一阶段不支持歌词、和声分析、罗马数字和简谱；只保留标题、作者、tempo、4/4 拍号和可选的简单段落标记。
- MVP 文件保护范围已确认: 第一阶段不做文件密码锁、加密保存或 DRM；`.bgp` 保持开放包结构，便于开源验证、调试、迁移和测试。
- MVP 默认语言策略已确认: 首次启动跟随系统语言；中文系统使用 `zh-CN`，其它系统使用 `en-US`；用户手动选择后保存偏好并优先于系统语言。
- Core Kernel V1 交付顺序已确认: 先完成纯内核，不碰 UI、Tauri、VexFlow、Web Audio、PDF/PNG 或 Guitar Pro 导入；纯内核必须能在无浏览器、无桌面壳环境下用 TypeScript 测试验证。

## 文档体系

当前阶段使用五类文档，先拆分、再收敛:

- `notes/context-snapshot.md`: 临时上下文快照，防止对话压缩丢失关键意图。
- `product/business-model-canvas.md`: 开源产品画布，约束产品经理层面的取舍。
- `product/product-manager-workflow.md`: 产品经理工作流程，定义从构想到 PRD/spec 的收敛路径。
- `product/value-proposition-canvas.md`: 价值主张画布，映射客户任务、痛点、收益和产品能力。
- `requirements/REQ-xxx.md`: 独立需求文档，每个需求单独探索和验收。
- `technical/*.md`: 技术栈、软件架构、项目架构等技术规划。
- `technical/commercial-quality-gates.md`: 商业级工程流程、质量门禁、验证矩阵和发布准入。
- `specs/*.md`: 细粒度 spec 规划，稳定后同步到 `.trellis/spec` 作为编码规范。
- `technical/modular-plugin-architecture.md`: 模块化和插件系统可行性、风险和分阶段策略。

## 竞品基准

竞品研究用于定义最低商业预期，不代表必须逐项复制。

- Guitar Pro 官方功能页显示其核心包括谱面/六线谱编辑、三类记谱方式、播放练习、节拍器、循环、速度训练、和弦/音阶工具、3 到 10 弦乐器、吉他技巧标记、音频轨、混音、版式、导入导出与教学/创作者场景。
- Guitar Pro 8 新功能页强调命令面板、嵌套连音、音频轨、PNG/SVG 导出、性能与音色改进。
- Guitar Pro 8 的完整技术栈不是官方公开信息；非官方资料称其使用 C++，但本项目不把该信息作为高置信选型依据。
- Soundslice 官方功能页强调网页端交互乐谱、变速、循环、分轨聚焦、真实录音/视频同步、视觉指板、节拍器、横向谱面、波形与分享链接。
- MuseScore 官方手册的插件页说明插件系统能带来扩展能力，但插件代码安全、版本兼容和 API 边界必须被产品化设计约束。

## 需求拆分文档

独立需求文档位于 `requirements/`。这些文档是当前阶段的主工作区，最终会合并回本 PRD。

- `requirements/REQ-001-product-positioning.md`: 产品定位、目标用户、商业切入点
- `requirements/REQ-002-score-document-model.md`: 谱面文档模型与音乐数据契约
- `requirements/REQ-003-guitar-tab-editing.md`: 吉他六线谱编辑能力
- `requirements/REQ-004-standard-notation-sync.md`: 五线谱、六线谱与排版同步
- `requirements/REQ-005-playback-practice.md`: 播放校对、练习与后续音频能力
- `requirements/REQ-006-import-export.md`: 导入导出与格式兼容
- `requirements/REQ-007-extension-system.md`: 扩展系统、插件 API 与安全边界
- `requirements/REQ-008-editor-workflow-ux.md`: 编辑器交互、快捷键与效率工作流
- `requirements/REQ-009-file-storage-versioning.md`: 本地文件、自动保存、版本与迁移
- `requirements/REQ-010-commercial-readiness.md`: 开源发布、安装、质量与支持
- `requirements/REQ-011-mvp-first-stage-scope.md`: MVP 第一实现阶段范围
- `requirements/REQ-012-internationalization-language.md`: 国际化与语言切换
- `requirements/REQ-013-open-source-governance.md`: 开源协议、贡献治理与品牌边界
- `requirements/REQ-014-graduation-project-deliverables.md`: 毕业设计交付边界、论文材料和答辩验收
- `requirements/REQ-015-commercial-quality-attributes.md`: 商业级质量属性、质量门禁和工程验收
- `requirements/REQ-016-long-term-maintenance.md`: 长期维护、版本演进和兼容策略

## 已确认产品与技术约束

以下条目已由用户确认，作为后续 `design.md`、`implement.md` 和细粒度 spec 的输入约束。

- MVP 优先做 Windows 桌面编辑器；macOS、Linux 和移动端后置。
- MVP 优先服务严肃吉他手、吉他教师、编曲者和内容创作者，而不是只面向零基础练琴用户。
- MVP 实现策略以最小可运行闭环优先: 新建标准 6 弦吉他谱 -> 编辑 4 小节 -> 播放校对 -> 保存 `.bgp` -> 重新打开 -> 导出 PDF/PNG。
- 长期维护是不可降级的项目原则，不能因毕业设计进度、MVP 范围或短期演示压力而绕过文件兼容、测试回归、模块边界和发布纪律。
- MVP 以本地文件和离线可用为基础，云同步、谱库、账号体系后置。
- MVP 采用开放、可验证的内部文档模型，避免把核心能力绑定到某个闭源格式。
- 扩展系统从第一天进入架构约束，但插件市场、付费插件和第三方生态不进入第一版交付；近期不规划任何付费插件或商业插件市场。
- 技术栈已确认采用 Tauri 2 + TypeScript + React + Vite。
- 谱面核心默认采用微内核式 Core Kernel，不绑定 UI、渲染、播放、导入导出、文件系统或插件运行时；领域模型只是内核的一部分，内核还必须包含命令事务、验证、schema/迁移、事件、注册表、能力边界和诊断契约。
- 谱面数据是唯一业务真相。UI 坐标、布局坐标、SVG/VexFlow 坐标、PDF/PNG 页面坐标和播放光标都必须通过快照、selector、resolver 或 layout primitives 从 `ScoreDocument` 派生；用户点击或快捷键输入必须先由外部编辑/布局模块转换为 `ScoreAddress | ScorePoint | ScoreRange` 或合法语义命令，再进入内核事务。
- 原生文件扩展名采用 `.bgp`；当前文件策略为“GP8 式单文件体验 + 开放包结构”。
- 第一阶段 `.bgp` 不加密、不做文件密码锁、不做 DRM；核心谱面语义必须保持可审查、可测试和可迁移。
- MVP 默认支持统一注册协议的内核基础和内部扩展点，不开放真实第三方插件安装、manifest 读取或代码执行。
- Tauri/Rust 插件默认只用于系统能力；谱面插件生态未来由产品层插件平台或 Extension Host 在启动前发现、校验、授权并映射到统一注册协议。
- 未来公开第三方谱面插件统一采用 TypeScript 源码、SDK、类型契约、示例和兼容测试；发布包可包含编译后的 JavaScript 产物，但必须通过 TypeScript 类型契约和 manifest 校验。官方与第三方的差异只存在于注册前发现、校验、授权和加载阶段，进入内核后都必须遵守同一套 registry、capability、command、snapshot、event 和 report 契约。
- MVP 第一实现阶段默认只交付吉他核心闭环: 吉他轨道、六线谱、基础五线谱同步、基础排版、P0 高频吉他技巧、播放校对、保存与导出。
- MVP 第一条编码闭环中的技巧实现范围只要求 3 个 `Core Loop` 技巧: `slide`、`bend`、`vibrato`；`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强。
- 架构保留多轨、多乐器和多弦数扩展点，但第一实现阶段 UI、测试和验收只覆盖标准 6 弦吉他；7/8 弦吉他、贝斯、鼓、键盘和完整乐队编曲不作为第一实现阶段的验收门槛。
- 第一实现阶段不暴露轨道管理 UI；用户只能编辑默认标准 6 弦吉他轨道。
- MVP 第一阶段默认支持 `zh-CN` 和 `en-US`，所有用户可见文本必须通过 i18n key 管理。
- 默认语言解析顺序为已保存用户偏好、受支持系统语言、`en-US` fallback；测试和截图必须能显式固定 locale。
- MVP 第一阶段打开能力默认只要求原生 `.bgp` 和自动保存恢复文件；MusicXML、MIDI、文本六线谱、Guitar Pro、PDF/图片识别等外部导入格式后置。
- MVP 第一阶段导出默认支持 PDF 和 PNG；SVG、MusicXML、MIDI、音频、教学网页包和 Guitar Pro 格式后置。
- 第二阶段导入策略已确认: 第二阶段只做 Guitar Pro 导入；MusicXML、MIDI、ASCII tab、PDF/图片识别等其它导入格式继续后置；Guitar Pro 导出长期后置。
- 第二阶段 Guitar Pro 导入范围已确认: 只做用户本地文件 best-effort 导入，不做导出，不碰 mySongBook、云曲库或受保护内容；优先当前 `.gp` 文件以及合法样例中能稳定解析的常见历史 `.gp5`/`.gpx` 子集。
- MVP 谱面视图默认采用 SVG 渲染，但 SVG 导出仍后置；PDF/PNG 导出可以复用布局模型和 SVG 渲染结果。
- MVP 渲染层默认采用 `VexFlowRendererAdapter`，但 VexFlow 对象不得写入 `.bgp`、领域模型、命令系统或 hit testing 唯一真相。
- MVP 播放层默认只读文档快照，从领域模型生成播放事件，驱动基础合成播放、播放光标、节拍器和速度控制；播放不得修改谱面文档。
- MVP 播放校对默认服务“检查节奏、音高和输入错误”，不把练习系统、DAW、真实录音/视频同步作为第一阶段目标。
- MVP 编辑输入默认以键盘为主路径，必须能完成 4 小节 riff 的时值、弦号、品号、休止、移动、删除、撤销/重做和 Core Loop 技巧输入；鼠标选择可作为辅助，虚拟指板和 MIDI 不作为第一阶段阻塞项。
- MVP 键盘输入模型默认采用谱面光标、时值键、数字品号输入、方向键移动弦/拍、技巧快捷键和命令面板；不把自由文本谱解析作为主输入。
- MVP 节奏默认限制为 4/4、固定 tempo、单声部事件流、四分/八分/十六分音符、基础休止和单音输入；领域模型可预留更复杂节奏与和弦能力，但第一阶段验证器、UI、播放和导出不以复杂节奏或同 beat 多音为验收门槛。
- MVP 谱面文字默认只覆盖元数据和可选简单段落标记；歌词、任意文本框、和声分析、罗马数字和简谱后置。
- MVP 即使是开源验证版本，也必须采用商业软件质量门禁: 文档评审、类型检查、自动化测试、文件兼容测试、导入导出回归、安全检查、性能基准、崩溃恢复验证和发布清单。

## 规划验收标准

- [x] 每个 `REQ-xxx` 文档都有用户价值、范围、行为契约、验收标准和后续开放点；当前无阻塞开放问题。
- [x] 每个功能规划都有产品视角、业务逻辑视角、技术实现视角和反过度设计视角。
- [x] 每个需求的 MVP 必须项、后置项、明确不做项分开写清楚。
- [x] 产品决策已收敛为已确认决策，并保留推荐答案、原因、取舍和实现约束。
- [x] 最终 PRD 合并前，所有已回答问题已从开放问题结构中移除。
- [x] 最终 PRD 能直接派生 `design.md`、`implement.md` 和后续实现任务。
- [x] 开源产品画布能解释 MVP 功能为什么值得做。
- [x] 价值主张画布能把客户任务、痛点、收益映射到需求编号。
- [x] 产品经理流程文档能说明从构想到实现计划的收敛路径。
- [x] 技术栈文档明确默认技术路线和不选方案。
- [x] 软件架构文档明确模块边界、依赖方向和验收标准。
- [x] 当前阶段已明确外部工程目录结构、monorepo 方案和 `apps/desktop` / `packages/*` 拆分不属于 Core Kernel 规划阶段，后续工程脚手架阶段再确认。
- [x] spec 规划能覆盖后续编码前必须稳定的领域模型、文件格式、命令系统、渲染、播放、导入导出和扩展 API。
- [x] 模块化插件架构文档明确 MVP 内部扩展点、后续第三方插件路径、权限和风险控制。
- [x] MVP 第一实现阶段范围能明确区分必须做、后置做和明确不做。
- [x] 国际化需求和 spec 能约束 UI 文案、技巧名称、命令、错误提示和插件元数据。
- [x] 商业级质量属性文档能把健壮性、安全性、高效性、可靠性、可维护性、可测试性和发布门禁转化为可验证标准。

## 已确认产品与范围决策

### DEC-P002: MVP 的乐器和轨道范围是什么？

结论: 吉他优先。第一实现阶段先完成六线谱、五线谱基础功能和吉他功能；其它乐器和复杂编曲后置。

原因: 这能先做出一个专业打谱软件最重要的编辑闭环，避免在领域模型、播放、渲染和导入导出还不稳定时扩展到全乐器。

### DEC-P003: MVP 的吉他技巧覆盖深度是什么？

结论: 吉他技巧必须分类；第一阶段先覆盖 P0 最高频技巧，P1/P2 后置。

P0 类别包括连接与连奏、音高变化与表情、延音闷音与噪音、触弦力度与方向、泛音、和弦与节奏动作。

### DEC-P004: 技巧命名和界面语言怎么处理？

结论: 后续要支持语言切换；第一阶段先支持简体中文和英文。技巧名采用可本地化结构，中文界面推荐中文主显示、英文术语辅助显示。

### DEC-P005: 第一阶段导出最低要求是什么？

结论: 第一阶段支持 PDF + PNG；SVG 后置。

原因: 教师和内容创作者最需要 PDF/图片交付；SVG 对后续高质量素材和网页嵌入有价值，但不应阻塞第一阶段核心编辑闭环。

### DEC-P006: 第一阶段是否必须支持 7 弦吉他？

结论: 第一阶段暂不支持 7 弦吉他，只支持标准 6 弦吉他；7/8 弦吉他进入后续阶段候选。

原因: 6 弦吉他覆盖最高频用户和教学场景，能让第一阶段专注六线谱、五线谱同步、P0 技巧、播放校对和导出闭环。7/8 弦会扩大调弦、指板、品位范围、技巧验证、测试谱库和 UI 状态组合。

实现约束: `metadata.music.tuning` 可以保存当前吉他谱默认调弦的明确音高列表，但弦号、品号、`stringCount`、`fretRange` 和指法位置映射不属于 Pure Core Kernel K1 主模型。第一阶段验证器、默认模板、编辑 UI、测试谱库和验收标准只接受标准 6 弦吉他产品上下文；任何 7/8 弦导入、创建或编辑入口都不得作为第一阶段交付项。

### DEC-P007: 原生文件格式采用哪种策略？

用户偏好: 希望原生文件体验类似 Guitar Pro 8。

结论: 采用方案 B，“GP8 式单文件体验 + 开放包结构”。

含义: 对用户表现为一个专属扩展名单文件，内部采用 zip + JSON + schema version + 资源目录。项目先全部开源验证效果，开放包结构更利于社区理解、测试、迁移和插件生态；第一阶段以及近期路线不得为了商业保护把原生文件做成黑盒。

决策材料: `research/native-file-format-comparison.md`。

### DEC-P008: 开源协议和发布治理路径怎么定？

结论: 第一阶段采用 Apache-2.0，并从第一天明确品牌、商标、官网、官方构建和应用商店发布边界。近期不规划闭源商业增强模块。

原因: 宽松协议更利于早期传播、社区试用、插件生态和开发者参与；品牌边界能避免 fork 混淆为官方版本，同时不影响代码和文件格式按 Apache-2.0 开源。

实现约束: 仓库必须包含 Apache-2.0 license、版权声明、第三方依赖许可清单、贡献指南和品牌/商标边界说明。第一阶段不得引入付费功能、许可证校验、订阅、商业插件或闭源增强模块。

### DEC-P009: 外部贡献采用 DCO 还是 CLA？

结论: 第一阶段采用 DCO，不上复杂 CLA。

原因: DCO 更轻，适合早期开源验证和社区贡献；Apache-2.0 已经足够支撑长期开放协作。CLA 适合公司化、双许可或需要统一再授权的阶段，但会抬高早期贡献门槛，当前不采用。

实现约束: 仓库贡献指南必须要求外部提交使用 `Signed-off-by`；CI 或 PR 检查应能发现缺失 DCO sign-off 的提交。CLA 可以后置到公司化、双许可或大型生态阶段。

### DEC-P010: 本项目作为毕业设计的最小可答辩范围是什么？

结论: 暂无学校/学院特殊硬性要求，先按软件工程类毕业设计交付包准备。最小可答辩范围定义为“标准 6 弦吉他谱编辑闭环 + 原生开放文件格式 + 基础五线谱同步 + P0 技巧 + PDF/PNG 导出 + 工程化文档与测试报告”。

原因: 这个范围既能体现软件工程完整性，也能避免毕业设计阶段被 Guitar Pro 全量能力、插件市场、云服务、AI 扒谱和多乐器编曲拖垮。

取舍: 如果范围更大，论文和演示亮点会更多，但实现风险明显上升；如果范围更小，开发更稳，但答辩时产品完整度和创新性会弱。

### DEC-P011: 开源项目是否仍按商业软件质量流程建设？

结论: 是。项目先开源验证效果，但工程流程按商业软件标准执行。

含义: 每个核心模块都必须有明确需求、设计、测试、验收和质量门禁。第一阶段不以“开源实验项目”为借口牺牲文件安全、数据恢复、性能、稳定性、隐私、安全边界和可维护性。

实现约束: 后续实现任务必须从 `REQ-015` 和 `technical/commercial-quality-gates.md` 派生测试、CI、发布检查和回归验证。

### DEC-P012: 第一阶段质量目标应以哪个首发平台作为基准？

结论: Windows 桌面作为第一阶段首发平台和质量基准平台；先把 Windows 版本做好，再做其它平台。

原因: 用户当前在 Windows 本地开发，毕业设计演示和早期测试更容易控制；桌面打谱软件的文件关联、导出、字体、性能和安装包验收都需要明确目标平台。

实现约束: 第一阶段发布门禁必须覆盖 Windows 安装、启动、文件关联、保存、打开、自动保存恢复、PDF/PNG 导出、字体渲染、性能基准和诊断包。macOS、Linux 和移动端不得作为第一阶段验收阻塞项。

### DEC-P013: 原生文件扩展名和品牌命名怎么定？

结论: 第一阶段原生文件扩展名使用 `.bgp`，含义为 `Brilliant Guitar Project`；产品名暂定 `Brilliant Guitar`。

原因: `.bgp` 短、像商业软件工程文件，也符合“类似 Guitar Pro 的单文件体验”。`.bgscore` 更清楚但偏工程化，`.brguitar` 更可读但太长。

实现约束: `.bgp` 只是对用户可见的文件扩展名，内部仍是开放包结构；文件包内必须通过 `manifest.json` 声明格式标识、schema version、应用版本和兼容策略。

### DEC-P014: 第一阶段桌面技术栈是否确认采用 Tauri 2 + TypeScript + React + Vite？

结论: 确认采用 Tauri 2 + TypeScript + React + Vite。

原因: 这个技术栈适合 Windows 桌面首发、开源协作和毕业设计演示；前端工程对 AI 编码友好，Tauri/Rust 能承担文件系统、窗口、打包、诊断和未来高性能模块。

实现约束: React 只负责 UI 和交互组合；谱面领域模型、命令系统、文件格式、播放快照、导入导出契约和插件边界必须独立可测试。Rust/Tauri 只承担原生能力、文件系统、安全边界、打包和未来局部高性能模块，不把所有业务逻辑过早下沉到 Rust。

### DEC-P015: MVP 跑通闭环的第一条纵向切片应该卡到什么粒度？

结论: 以“4 小节标准 6 弦吉他 riff”为第一条纵向切片。

范围: 覆盖新建、六线谱输入、基础五线谱同步、P0 技巧中的少量高频技巧、播放光标、保存 `.bgp`、重新打开、导出 PDF/PNG。

原因: 这条切片最能证明产品真实可用，也最适合毕业设计演示和后续自动化测试；它强迫 UI、领域模型、渲染、播放、文件和导出同时闭合，避免先堆很多不能串起来的局部功能。

实现约束: 后续新增功能不得破坏这条闭环；每次发布前必须能用自动化测试或明确人工脚本重新跑通该切片。

### DEC-P016: 长期维护的版本兼容策略从第一阶段做到什么程度？

结论: 长期维护是项目原则，必须从始至终一直执行；从第一阶段开始采用 SemVer、`.bgp` schema version、文件迁移器、兼容性测试矩阵和变更日志；承诺 1.x 版本能打开所有由 1.x 稳定版保存的 `.bgp` 文件。

原因: 打谱软件保存的是用户作品，长期维护最怕“升级后打不开旧谱”或“模型随便改导致后续扩展困难”。从第一版建立版本和迁移纪律，能保护用户文件，也能让后续 AI 编码有稳定边界。

实现约束: 任何 schema、领域模型、命令系统、文件格式、插件 API 或导出行为变更，都必须说明兼容影响并配套测试、迁移或明确废弃策略。长期维护原则不得被单个功能、单次发布或毕业设计演示目标覆盖。

### DEC-P017: MVP 谱面渲染目标是否确认采用 SVG？

结论: 确认第一阶段采用自研布局模型 + SVG 首发渲染目标，同时保持布局模型与渲染后端解耦，后续可切换或补充 Canvas/WebGL。

原因: SVG 更容易做可读谱面、命中区域、选择高亮、PDF/PNG 导出和测试快照，适合先跑通 4 小节 MVP 闭环。

实现约束: 领域模型不得依赖 SVG DOM；编辑命中、选择、高亮、PDF/PNG 导出和后续 Canvas/WebGL 必须通过稳定布局 primitives 工作。SVG 导出仍是后置能力，不作为第一阶段交付门槛。

### DEC-P018: MVP 纵向切片中 P0 吉他技巧的最小集合是什么？

结论: 已由 DEC-P025 修订。第一条编码闭环先覆盖 3 个高频技巧: `slide`、`bend`、`vibrato`。

原因: 这 3 个技巧能先证明技巧模型、显示、保存、重开和导出链路成立，同时避开 `hammer-on`/`pull-off` 的 note-to-note 关系和 `palm mute` 的范围型语义。

实现约束: `slide`、`bend`、`vibrato` 定义为第一条编码闭环的 `Core Loop` 技巧，必须支持结构化存储、显示、保存、重新打开、撤销/重做、基础导出降级说明和 fixture 测试。`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强；其它常见技巧后置为 `P0 Extended` 或 `P1`，不阻塞第一条 MVP 闭环。

### DEC-P019: MVP 渲染层是否采用 VexFlow 作为第一版渲染适配器？

结论: 采用 VexFlow 作为 MVP 的 SVG 渲染适配器，但保留自研领域模型、自研布局 primitives、自定义 SVG overlay 和后续 Canvas/WebGL 适配空间。

原因: VexFlow 官方支持 TypeScript、Canvas/SVG、music notation 和 guitar tablature，能显著降低第一阶段从零实现谱面渲染的风险；但长期维护原则要求我们不能把 VexFlow API 变成 `.bgp`、领域模型或编辑命令的真相。

实现约束: VexFlow 依赖必须锁定版本并进入渲染回归测试。`VexFlowRendererAdapter` 只消费布局 primitives，不能直接修改谱面文档，不能把 VexFlow 对象序列化进 `.bgp`，不能作为 hit testing 的唯一真相。

决策材料: `research/vexflow-rendering-evaluation.md`。

### DEC-P020: MVP 播放校对能力要做到什么粒度？

结论: 第一阶段只做最基本播放校对，包括合成播放、开始/暂停/继续/停止、播放光标、节拍器、基础速度控制，以及从文档快照生成播放事件；不做真实采样音色、音频轨、混音、导出音频或复杂技巧音色模拟。

原因: 播放校对要服务“写谱后能检查节奏和大致音高”的闭环，不应在 MVP 阶段变成 DAW 或高仿真音源工程。

取舍: 如果播放更简单，MVP 更快但演示感较弱；如果播放更真实，产品吸引力更强，但会显著增加音频引擎、音色资源、许可和性能复杂度。

实现约束: 播放层只读文档快照，播放事件必须从领域模型生成，不得从 SVG/VexFlow/React 状态反推音乐语义。Core Loop 技巧第一阶段可以只做近似或无音色差异播放，但不得丢失技巧数据或修改谱面。

### DEC-P021: MVP 编辑输入方式的第一优先级是什么？

结论: 第一阶段采用键盘优先输入。MIDI 输入、MIDI 录入、MIDI 导入和其它外部演奏输入后置。

原因: 专业打谱软件的核心价值是输入效率和可重复操作。键盘优先更容易形成确定的命令系统、快捷键规范、回放测试和毕业设计演示脚本。

取舍: 如果优先鼠标/虚拟指板，新手更容易上手，界面演示更直观，但输入效率、快捷键体系和自动化测试会变弱；如果键盘优先，学习成本更高，但更符合长期专业工具和可维护实现。

实现约束: 用户必须能只靠键盘完成第一条 4 小节 riff 的时值、弦号、品号、休止、移动、删除、撤销/重做、播放校对和 3 个 Core Loop 技巧输入。鼠标选择可以辅助命中和定位；虚拟指板、MIDI 设备、实时录入和外部 MIDI 文件导入不作为第一阶段验收门槛。

### DEC-P022: MVP 键盘输入模型采用哪一种？

结论: 采用“谱面光标 + 时值键 + 数字品号输入 + 弦间/拍间方向键移动 + 技巧快捷键/命令面板”的 Guitar Pro 式高效输入模型；不做自由文本谱解析作为主输入。

原因: 这种模型最适合桌面专业打谱，能把每个操作落成稳定命令，便于 undo/redo、命令回放、快捷键配置和自动化测试。

取舍: 如果采用自由文本输入，复制粘贴和快速草稿会更方便，但解析、错误恢复、五线谱同步和技巧结构化会复杂；如果采用纯点击输入，新手更直观，但专业效率和测试确定性较弱。

实现约束: 光标必须能定位到小节、beat、弦和音符槽位；时值切换、数字品号输入、方向键移动、技巧添加、删除、撤销/重做和播放校对都必须映射为稳定命令或吉他模块到核心命令的稳定转换。自由文本谱解析、MIDI 输入和虚拟指板输入不作为第一阶段验收门槛。Pure Core Kernel K1 本身只接收绝对音高和音乐时间，不保存弦号/品号。

### DEC-P023: MVP 节奏与复音复杂度第一阶段做到什么程度？

结论: 第一阶段只支持 4/4、单声部事件流、固定 tempo、基础休止、四分/八分/十六分音符和单音输入；三连音、附点节奏、跨小节延音线、多声部同轨、变拍号、同 beat 多音和复杂节奏谱后置。

原因: 这能支撑第一条 4 小节 riff 的编辑、五线谱同步、播放校对和 PDF/PNG 导出，同时把领域模型、布局、VexFlow 适配和播放事件的复杂度控制在可验证范围内。

取舍: 如果第一阶段支持三连音、附点和多声部，谱面表现更接近商业软件，但会明显增加输入、校验、渲染、播放和回归测试复杂度；如果节奏范围过窄，MVP 更稳，但演示谱的音乐表现力会弱。

实现约束: 第一阶段验证器只接受 4/4、固定 tempo、单声部事件流、四分/八分/十六分、基础休止和每 beat 一个 `ScoreEvent`。领域模型可以保留 tick、timeSignature 等扩展字段，但 UI、fixture、播放、VexFlow 适配和 PDF/PNG 验收不得依赖三连音、附点、跨小节延音线、多声部、同 beat 多音或变拍号。

### DEC-P024: MVP 和弦能力第一阶段做到什么程度？

结论: 第一阶段不做和弦，MVP 只要求单音 + 休止。同 beat 多音、和弦图、和弦名自动识别、和弦库、扫弦/琶音节奏细节和复杂和声分析后置。

原因: 即使是简单和弦，也会牵连领域模型、验证器、六线谱纵向排列、五线谱多音显示、播放事件并发、键盘叠音输入和删除语义。第一条 MVP 闭环更需要先证明单音编辑、保存、重开、播放、导出稳定。

取舍: 后置和弦会降低第一版谱例的音乐表现力，但显著降低实现风险；如果第一阶段做和弦，产品更像真实吉他谱，但会扩大模型、渲染、播放和测试复杂度。

实现约束: 第一阶段每个 beat 只能包含一个 `ScoreEvent`，其 `kind` 只能是 `note` 或 `rest`；休止符只是特殊谱面事件，不使用独立 `RestData`。如果输入同一 beat 多个有声 note、和弦图、和弦名或扫弦/琶音细节，验证器和 UI 必须返回明确 unsupported。

### DEC-P025: MVP 第一条闭环的吉他技巧是否继续保留 6 个？

结论: 第一条编码闭环先收缩为 3 个技巧: `slide`、`bend`、`vibrato`；`hammer-on`、`pull-off` 和 `palm mute` 保留在 P0 后续增强。这样仍能验证技巧模型、显示、保存、重开和导出，但减少 note-to-note 关系和范围型技巧复杂度。

原因: 在已经把和弦后置后，下一块主要复杂度是 6 个技巧同时进入 MVP。把第一条闭环压到 3 个，能让领域模型、渲染和命令系统更快稳定。

取舍: 保留 6 个技巧更像真实吉他谱，但开发风险更高；先做 3 个会让 MVP 表现力弱一些，但后续扩展路径清晰。

实现约束: `slide`、`bend`、`vibrato` 是第一条编码闭环验收项；`hammer-on`、`pull-off`、`palm_mute` 不得出现在第一条闭环的必过测试中，但模型与 UI 设计应保留它们的后续扩展位置。

### DEC-P026: MVP 第一阶段是否暴露轨道管理？

结论: 第一阶段不暴露轨道添加、删除、重命名和排序 UI，只保留一个默认吉他谱产品上下文；Core Kernel K1 不定义 `Track` 主实体，也不要求核心 schema 保留 `tracks` 数组。这样能避免把未来多轨提前塞进内核。

原因: 当前文档里 `REQ-008` 仍有轨道添加/删除/重命名/排序能力，但 `REQ-002`、`REQ-011` 已经把第一阶段收敛为一个默认吉他谱上下文。这个问题会影响 UI、命令系统、文件 schema、测试和未来多轨兼容。

取舍: 如果第一阶段做轨道管理，产品更像完整编辑器，但会牵出多轨数据、轨道选择、播放同步和 UI 状态；如果不做，MVP 更稳，但第一版只能编辑一个默认吉他谱上下文。

实现约束: `Guitar Core Loop` 不提供轨道列表 UI、添加轨道、删除轨道、重命名轨道、排序轨道、mute/solo，也不得把这些作为第一阶段可执行命令或验收项。Core Kernel K1 schema 不要求 `tracks` 数组；未来多轨必须作为后续模型演进或外部模块能力单独规划。

### DEC-P027: MVP 第一阶段是否支持歌词、和声分析、罗马数字或简谱？

结论: 第一阶段不支持歌词、和声分析、罗马数字和简谱；只保留标题、作者、tempo、4/4 拍号和可选的简单段落标记。这样能让渲染、文件模型和导出继续围绕吉他核心闭环。

原因: `REQ-004` 曾保留歌词/文本标注相关讨论；这些能力会影响排版模型、编辑选择、文本输入、导出和 i18n。现在第一阶段已经收敛到单轨、单音、3 个技巧，这类排版/理论标注最好明确边界。

取舍: 如果做歌词/和声分析，教学材料更完整，但实现会明显扩展；如果后置，MVP 更稳，但第一版谱面表达会更偏“riff 编辑和导出”，不适合作为完整歌曲排版工具。

实现约束: 第一阶段不得提供歌词输入、自由文本框、和声分析、罗马数字分析、简谱视图或对应导出验收；渲染层只需处理标题、作者、tempo、拍号、小节编号和可选简单段落标记。

### DEC-P028: MVP 第一阶段是否支持文件密码锁或加密保存？

结论: 第一阶段不支持文件密码锁、加密保存或 DRM。`.bgp` 保持开放包结构，依靠本地文件系统权限和用户备份；后续如果出现商业授权、隐私或课程素材保护需求，再单独设计加密层。

原因: 密码锁会影响文件格式、恢复流程、测试、迁移、用户忘记密码后的支持边界和安全责任。当前 MVP 的第一目标是可保存、可重开、可迁移和可调试，过早加密会破坏开放包结构的验证优势。

取舍: 不做密码锁会降低私密谱面保护能力，但显著减少实现和支持风险；如果第一阶段做密码锁，安全卖点更强，但需要严肃处理密钥派生、加密参数、损坏恢复和兼容测试。

实现约束: 第一阶段不得提供文件密码、文件加密、DRM 或只读授权文件能力；核心 `.bgp` 包内容必须能被测试工具解包检查。后续保护层不得替代 `manifest.json`、`score.json`、schema version 和迁移器。

### DEC-P029: 第一阶段默认启动语言怎么选？

结论: 首次启动跟随系统语言；如果系统语言是中文环境则使用 `zh-CN`，否则使用 `en-US`，用户手动选择后保存偏好并优先于系统语言。这样兼顾用户当前中文场景和后续英文用户。

原因: 第一阶段已经确认支持 `zh-CN` 和 `en-US`，且默认启动语言策略已经收敛。这个决定会影响设置存储、首启体验、测试快照、导出文本和缺失翻译 fallback。

取舍: 默认 `zh-CN` 更符合当前开发者和毕业设计演示场景，但国际用户首次体验较弱；跟随系统语言更产品化，但测试和截图需要固定 locale 或显式覆盖。

实现约束: locale 解析顺序必须为 `savedPreference -> supportedSystemLocale -> en-US`。自动化测试、导出 smoke test 和截图验证必须能显式指定 locale，避免系统语言差异导致测试不稳定。

### DEC-P030: 未来第三方插件优先语言采用什么？

结论: 未来公开第三方插件统一采用 TypeScript；插件源码、SDK、类型契约、示例和兼容测试以 TypeScript 为准，发布包可包含编译后的 JavaScript 产物。Pure Core Kernel V1 只做统一注册协议和官方/内置启动期注册基础，不读取真实第三方 `PluginManifest`，也不开放任意第三方代码执行。Lua 和 native 不作为公开插件语言；native 只允许作为官方/内置系统能力或未来单独评审的外部进程能力。

原因: 项目技术栈已是 Tauri + TypeScript/React，统一 TypeScript 插件能最大化复用类型、命令系统、schema、文档和开源社区资源，并降低第三方插件误用 command payload、snapshot、capability 和 report 契约的概率；但安全上仍必须先有权限、隔离和版本边界，不能直接开放无沙箱脚本。

取舍: TypeScript 对开源生态、AI 辅助开发和长期维护最友好，但会要求插件作者进入我们的类型与构建体系；Lua 更轻量但生态和类型契约弱；native 性能强但安全、跨平台和崩溃隔离风险最高。

实现约束: `PluginManifest` 是未来 VS Code 式插件平台的 manifest 草案，不是 Pure Core Kernel V1 的实现项或验收门槛。V1 只支持 `builtin` 与 `internal-module` 运行时；未来 TypeScript 插件必须先完成权限声明、沙箱隔离、API version、异常隔离、启动前授权、禁用配置、兼容测试和统一注册协议映射后才能开放。

### DEC-P031: 开源优先和不商业化路线怎么定？

结论: 先全部做开源，商业化遥遥无期，近期不做。第一阶段保持完整开源免费可用，不实现登录、付费、许可证校验、订阅、闭源授权系统、商业插件或闭源增强模块。

原因: 当前目标同时是毕业设计、开源验证和长期维护产品的第一版。第一阶段最重要的是证明编辑闭环、文件格式、质量门禁和用户价值，过早做收费/授权会拖慢 MVP，并引入法律、支付、账号、安全和支持成本。

取舍: 暂不实现商业收费能让 MVP 更快、更开源友好，也更适合毕业设计答辩；缺点是第一阶段不验证付费转化。这个取舍已经接受，后续如果重新考虑商业化，必须作为独立新阶段重新设计，不能污染当前开源核心。

实现约束: PRD、需求、spec 和实现计划不得把登录、付费、许可证校验、订阅、商业插件市场或闭源增强模块作为第一阶段或近期路线；“商业级”只表示工程质量标准，不表示商业化变现。

### DEC-P032: 第二阶段外部导入格式优先级怎么排？

结论: 第二阶段只做 Guitar Pro 导入。MusicXML、MIDI、ASCII tab、PDF/图片识别等其它导入格式全部放到后续阶段；Guitar Pro 导出长期后置。第一阶段仍只做 `.bgp` 打开保存和 PDF/PNG 导出。

原因: 目标用户很可能已有 Guitar Pro 历史文件，导入能力能降低迁移门槛。把第二阶段只给 Guitar Pro 导入，可以集中处理非开放格式、法律/技术边界、兼容报告、丢失能力说明和 fixture 谱库，而不被 MusicXML、MIDI、ASCII tab 的不同语义拖散。

取舍: 这个选择迁移吸引力最强，但风险和工作量最高；开放格式互操作会延后。MusicXML 更稳但对吉他手迁移吸引力弱一些，MIDI 素材多但谱面编辑语义损失大，ASCII tab 解析不稳定，全部后置。

实现约束: 第二阶段不得把 MusicXML、MIDI、ASCII tab、PDF/图片识别或 Guitar Pro 导出作为同一阶段验收项。Guitar Pro 导入必须输出 `ImportReport`，说明成功项、警告、丢失项、无法识别项和不支持能力。

### DEC-P033: Guitar Pro 导入第二阶段先支持哪些版本和能力范围？

结论: 第二阶段先做用户本地 Guitar Pro 文件的 best-effort 导入，不做导出，不碰 mySongBook、云曲库或受保护内容。兼容范围先以合法样例和可用解析方案为准，优先覆盖当前 `.gp` 文件以及常见历史 `.gp5`/`.gpx` 中能稳定解析的子集；导入后映射到 `.bgp` 领域模型，无法支持的轨道、技巧、排版、音色、自动化和音频轨必须进入 `ImportReport`。

原因: Guitar Pro 格式不是我们控制的开放格式，第二阶段最危险的是把“支持 Guitar Pro 导入”说得过满。先定义文件来源、版本范围、能力映射和降级报告，才能让后续代码实现可控。

取舍: 如果范围更宽，迁移能力更强但解析、测试、法律和兼容风险明显上升；如果范围更窄，第二阶段更稳，但用户可能会遇到部分历史文件导入失败或能力丢失。

实现约束: 第二阶段实现前必须建立合法 fixture 来源、解析可行性研究、能力映射表、降级规则和 `ImportReport` 字段。导入器不得绕过 `.bgp` 领域模型验证器；导入失败必须安全失败并保留可读错误。

### DEC-P034: 项目目录结构是否现在确认？

结论: 当前不确认。当前阶段是 Core Kernel 规划阶段，只确认内核职责、内核协议、谱面数据结构和内核与外部模块的协作边界；外部工程目录结构、monorepo 方案、`apps/desktop` 和 `packages/*` 拆分不属于当前阶段决策。

原因: 目录结构是工程落地形式，应该在内核边界稳定后，由脚手架阶段根据实现包、测试边界、构建方式和发布方式反推，而不是在内核规划阶段提前拍死。现在提前确认外部目录，会把注意力从 `ScoreDocument`、命令、事务、验证、schema、snapshot/event、registry/capability 和 error/report 这些内核机制上移开。

实现约束: `apps/desktop` + `packages/*` 只能作为后续工程脚手架候选，不得作为当前内核规划或实现约束。当前文档如果出现外部目录示例，只能用于说明未来可能的落地方式，不能阻塞 Core Kernel V1 规划，也不能要求当前阶段确认单应用目录、轻量 monorepo、workspace 包拆分或测试目录边界。

### DEC-P035: 第一阶段软件架构原则是否采用“微内核式 Core Kernel + 用户态服务模块”的架构？

结论: 确认采用，并允许按当前需求重新设计架构，而不是在旧设计基础上修补。`Brilliant Guitar` 的核心应是稳定、尽量小的微内核式 Core Kernel，外围能力以用户态服务模块或适配器形式与内核协作。

原因: 本项目的目标是非常模块化、可维护、可扩展，并且需要长期维护。谱面文件、撤销重做、导入导出、播放校对、渲染和插件都依赖同一份音乐语义；如果 UI、渲染库或单个功能模块变成事实来源，后续保存、迁移、测试和插件扩展都会失控。

实现约束: Core Kernel 负责谱面核心对象模型、命令系统调用边界、事务历史、文档地址/范围模型、硬一致性验证、`.bgp` 语义契约/迁移入口、快照、事件、内核注册表、capability 和基础错误/报告类型；React UI、活动光标会话状态、Tauri、VexFlow/SVG、Web Audio、PDF/PNG、导入导出实现和未来插件运行时都只能通过内核公开接口协作，不能直接修改可变谱面对象。导入/导出在内核中最多表现为外部贡献点的抽象 descriptor、capability 和 report 外壳；PDF、PNG、Guitar Pro 和 `.bgp` 物理读写的具体能力必须放在用户态服务模块。

取舍: 这种架构前期会多一些内核 API、命令、注册表、快照和事件设计成本，并可能牺牲少量直接调用性能；但能换来可测试、可迁移、可扩展和长期维护。如果采用 UI 先行的简单架构，MVP 可能更快出现界面，但后续很容易在文件兼容、undo/redo、导入导出和插件生态上返工。

## 已确认 Core Kernel 架构决策

### DEC-K036: 第一阶段 Core Kernel 最小边界采用 9 类机制

结论: 第一阶段 Core Kernel 的最小边界已确认采用 9 类机制。这九类功能目前足够支撑 MVP 内核规划，后续如果要推翻或增减第一版边界，需要作为新的架构决策单独评审。

边界: 第一阶段内核至少包含 `ScoreDocument = metadata + scoreData` 核心对象模型、文档元数据、音乐元数据、明确音高形式的调弦元数据、`ScoreTimeline`、`ScoreEvent`、结构化 `TechniqueData`、`CommandBus`、事务、undo/redo、命令回放、文档地址/范围模型、命令目标校验、硬一致性验证、diagnostic、`.bgp` schema/序列化/迁移入口、快照、事件、内核注册表、capability manifest、外部 import/export 抽象 descriptor、基础错误类型、`ImportReport` 和 `ExportReport` 外壳类型；排除 React UI、活动光标/选区会话状态、弦号/品号/吉他指法映射、具体技巧 UI、VexFlow/SVG 适配器、Web Audio 播放实现、PDF/PNG 具体实现、PDF/PNG 具体 registry handler、Guitar Pro 导入实现、`.bgp` 物理文件 IO、第三方插件运行时和 Tauri 文件系统实现。

9 类机制为: 谱面核心对象模型、命令系统调用边界、事务/历史/一致性边界、文档地址和范围模型、硬一致性验证、`.bgp` 语义契约和迁移入口、快照/事件/模块通信协议、注册表与能力边界、错误/diagnostic/report 契约。

原因: 这个边界能让第一条 4 小节 riff 闭环可运行，同时保护后续插件化、文件兼容和模块替换能力。

取舍: 如果内核更薄，MVP 代码可能更快，但扩展能力容易散落到模块里；如果内核更厚，第一阶段设计成本更高，也可能把本应属于模块的实现细节过早固定。

### DEC-037: Core Kernel V1 首个实现里程碑采用纯内核交付

结论: 第一阶段先把纯 Core Kernel 做好。Pure Kernel V1 必须是纯 TypeScript 内核能力，可在无 UI、无 Tauri、无 VexFlow、无 Web Audio、无 PDF/PNG、无浏览器 DOM 的环境下通过测试；桌面壳、React 工作台、渲染、播放、持久化物理 IO、导出和导入都必须等纯内核验收通过后再进入实现。

边界: Pure Kernel V1 只实现 9 类内核机制: `ScoreDocument` 对象模型、语义命令、事务/undo/redo、地址/范围、硬验证、`.bgp` 语义 schema/迁移入口、snapshot/selector/event、registry/capability、error/diagnostic/report 外壳。它可以定义外部 import/export 抽象 descriptor、`ImportReport`、`ExportReport` 等 report 类型，但不实现、不注册真实 Guitar Pro 导入、PDF/PNG 导出、`.bgp` 物理读写或桌面文件系统能力。

验收: Pure Kernel V1 必须通过 fixture 谱面验证、命令提交与 rollback、细粒度 undo/redo、命令回放、schema round-trip、迁移入口、snapshot/selector 只读性、事件顺序、registry/capability、错误/report 隐私边界和 unsupported feature 测试。

取舍: 先做纯内核会推迟可视化界面，但能最早验证长期资产: 谱面数据、命令事务、验证、文件语义、事件和扩展边界。如果先做 UI，短期更容易演示，但核心模型不稳时会在保存、撤销、导出、插件和迁移上反复返工。

## 已确认 Core Kernel 详细决策

### DEC-K037: Core Kernel 的写入接口采用语义命令还是 patch 命令？

结论: 采用语义命令作为唯一对外写入接口。patch、JSON path、字段替换、数组 splice 等底层变更只能作为 Core Kernel 内部 delta，用于事务、undo/redo、命令回放、调试和性能优化。

原因: 语义命令表达用户或模块意图，例如 `insertNote`、`insertRest`、`setNotePitch`、`setDuration`、`addTechnique`、`transposeRange`。这能让内核集中处理音乐规则、目标校验、权限、错误提示、撤销重做、命令面板、快捷键和插件 API。如果对外暴露 patch 命令，插件和 UI 很容易绕过领域规则，后续 schema 演进、文件兼容和测试回放都会失控。

实现约束: UI、快捷键、导入器、内部模块和未来第三方插件都只能提交已注册的语义命令；Core Kernel 负责把语义命令编译为内部 delta，并在 commit 前运行硬一致性验证。不得实现 `patchDocument`、`replaceJsonPath`、`setField`、`spliceArray`、`runScript` 或任意字段路径写入作为公开命令。

取舍: 语义命令需要前期定义 command id、payload schema、capability、前置条件和错误码，设计成本更高；但它能提供更稳定的长期 API。patch 命令前期更快更灵活，但会把内部数据结构暴露给外部模块，使插件安全、undo/redo、迁移和 schema 重构变得脆弱。

### DEC-K038: 第一阶段 undo/redo 历史粒度怎么定义？

结论: 第一阶段采用细粒度 do/undo 模型。每个成功的可撤销语义命令默认生成一个 `HistoryEntry`；`undo` 一次回退一个 `HistoryEntry`，`redo` 一次重做一个 `HistoryEntry`。MVP 先不做复杂历史合并、宏命令合并、时间窗口合并或跨命令智能压缩。

原因: 当前最重要的是先把 MVP 基本功能做好。细粒度历史最容易实现、最容易测试，也最适合命令回放和错误定位。对于第一条 4 小节 riff 闭环，稳定的 `insertNote -> setNotePitch -> addTechnique -> undo -> redo` 行为比“撤销一步自动猜用户意图”更重要。

实现约束: `insertNote`、`insertRest`、`setNotePitch`、`setDuration`、`addTechnique`、`removeTechnique`、`deleteRange` 等 Core Kernel K1 成功写命令都必须各自生成独立历史条目。失败命令不得产生历史条目。`setString`、`setFret` 属于后续吉他谱模块命令或模块到核心命令的转换，不属于 Pure Core Kernel K1。批量命令只有在命令本身是显式语义动作时才可以作为一个原子 `HistoryEntry`，例如未来 `transposeRange`；不得把多个普通用户操作偷偷合并成一个历史条目。

取舍: 细粒度 undo/redo 会让撤销步数更多，部分连续输入体验不如智能合并顺滑；但它显著降低实现复杂度，减少历史状态歧义，并让 MVP 更快进入稳定闭环。后续如果需要合并规则，必须单独设计可测试的 `historyMergePolicy`，不能在第一阶段隐式加入。

### DEC-K039: Core Kernel 的文档地址/范围模型是否改为“稳定 ID + 强类型目标 + 领域点/范围”？

结论: 采用“谱面数据根本原则 + 稳定 ID + 强类型目标 + 领域点/范围”的混合模型，废弃当前可选字段版 `DocumentAddress`。Core Kernel 只负责 `ScoreAddress`、`ScorePoint`、`ScoreRange`、`CommandTarget`、目标校验和谱面数据事务；UI、布局、渲染和编辑会话模块可以使用临时 `ScoreCoordinate` 表达第几小节、第几拍、第几弦等显示/交互坐标，但必须在外部解析为内核语义目标后再提交命令。布局坐标、屏幕坐标、PDF/PNG 页面坐标和播放光标都只能从 `ScoreDocument` 快照派生，不得反向成为谱面数据。

原因: 研究对比了 JSON Pointer/JSON Patch、Slate Path/Point/Range、ProseMirror position mapping、DOM/LSP Range、Identity Field 和 MusicXML 的标识方式。我们的需求不是纯 JSON patch，也不是纯文本编辑器位置，而是长期可维护的谱面领域引用。稳定 ID 能避免插入、删除、重排导致目标漂移；强类型地址能让 `setNotePitch` 只能指向有声 note、`insertNote` 只能指向 beat/point、`transposeRange` 只能指向 range。把谱面数据放在根本位置，可以避免 UI、渲染、导出或播放模块各自维护一份“看起来正确但语义不一致”的影子状态。

实现约束: 第一阶段内核必须定义 `EntityId`、`ScoreAddress`、`ScorePoint`、`ScoreRange` 和 `CommandTarget`，并实现 `resolveAddress`、`validateTarget`。`ScoreCoordinate`、`ViewCoordinate`、`LayoutCoordinate` 和 hit testing 属于外部编辑/布局模块的临时定位协议，不属于内核写入 API。内部 delta 可以继续使用 `InternalDocumentPath` 或 JSON Pointer，但不得暴露给 UI、插件、导入器或外部 API。旧的 `DocumentAddress { trackId; measureId?; voiceId?; beatId?; noteId? }` 不得作为最终实现输入；K1 地址应围绕 timeline、beat、event 和 technique 等核心实体。点击命中流程必须是 `ViewCoordinate -> LayoutPrimitive hit test -> ScoreAddress/ScorePoint/ScoreRange 或语义 payload -> semantic command -> ScoreDocument transaction`；渲染或布局层不得直接修改谱面文档。

取舍: 该模型比可选字段地址更啰嗦，且需要维护 ID 索引、地址解析和目标类型校验；但它能显著减少歧义，提升命令系统、技巧系统、诊断定位、插件 API、undo/redo 和 AI 编码结果的确定性。若继续使用可选字段模型，MVP 初期代码更短，但后续会更容易出现非法地址组合和命令目标误用。

### DEC-K040: 坐标解析是否应该放进 Core Kernel？

定义: 外部坐标解析是编辑器把用户交互位置转换为谱面语义目标的过程。它处理的是“用户在屏幕上点了哪里、拖了哪一段、当前缩放滚动后命中了哪个谱面元素”，并把结果转换成内核能理解的 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或命令 payload。它不决定音乐规则，也不直接修改谱面数据。

结论: 不把屏幕坐标、布局坐标、SVG/VexFlow 坐标或 hit testing 放进 Core Kernel。Core Kernel 只负责操作和保护谱面数据系统，包括 `ScoreDocument`、语义地址/范围、命令目标校验、事务、验证、schema/迁移、快照和事件。坐标解析作为外部模块能力；MVP 先不单独拆包，由 `Layout Module + Editor Session Service` 承担，外部模块通过内核公开接口读取快照或 selector，并把解析后的语义目标提交给命令系统。后续在多页、多轨、多声部、复杂选区或多渲染后端复杂度上升后，抽出专门 `Positioning Service`。

原因: 这更符合微内核思想。内核应该像操作系统内核一样保留最关键、最稳定、最需要保护的一组机制；屏幕坐标、布局命中、缩放滚动、SVG/VexFlow 坐标和编辑会话状态变化频繁，属于用户态服务模块。把它们放进内核会让内核依赖 UI/渲染细节，削弱模块替换能力。

实现约束: `ViewCoordinate`、`LayoutCoordinate`、临时 `ScoreCoordinate`、hit area、鼠标拖选和缩放滚动状态不得进入内核写入 API，也不得写入 `.bgp` 作为谱面语义。内核命令只接受 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或合法语义 payload。外部模块可以调用内核 selector 或 snapshot 构建布局，但不能直接修改 `ScoreDocument`。MVP 不创建独立 `Positioning Service` 包或目录；但接口命名、测试和文档必须预留未来抽取边界。

取舍: 坐标解析放在外部模块会增加一层转换和测试成本，但能保持内核小、稳定、可测试、可替换。MVP 不单独拆 `Positioning Service` 能减少目录和接口负担，但需要在 `Layout Module` 与 `Editor Session Service` 中保持边界清晰；若把坐标解析放入内核，短期接口可能更集中，但内核会被 UI 和渲染细节污染，后续替换 VexFlow、改布局引擎、做 Canvas/WebGL 或改交互模式都会更痛。

### DEC-K041: Core Kernel 的硬一致性验证应该覆盖哪些内容？

定义: 硬一致性验证是内核的“不可破坏文档正确性”闸门。它不负责判断谱子好不好听、难不难弹、指法是否优秀，也不负责教学建议；它只判断 `ScoreDocument` 是否仍然是结构合法、引用完整、可保存、可回放、可迁移、可被渲染/播放模块消费的谱面数据。

结论: Core Kernel 第一阶段只保留硬一致性验证和基础 diagnostic。硬验证至少覆盖 schema version 合法、稳定 ID 唯一、引用地址存在、`metadata + scoreData` 结构合法、timeline/beat/event/technique 引用合法、明确音高形式的调弦元数据合法、duration/tick 合法、4/4 小节长度合法、每 beat 一个 `ScoreEvent`、单 beat 单有声 note MVP 限制、技巧 `targetNoteIds` 只指向有声 note、命令目标存在、保存前/打开后/命令回放后都能通过验证。弦号、品号和指法可演奏性不属于 Core Kernel K1 硬验证。

不放进内核且不进入 MVP: 软一致性、可演奏性分析、指法建议、难度评分、教学提示、风格检查、编曲建议、导入兼容性评分、UI 是否显示 unsupported 的具体方式。这里列出可演奏性分析是为了明确排除，不是把它纳入内核；后续如果这些能力有价值，可以作为外部 `Analysis Service`、`Teaching Service` 或 UI 能力重新立项；当前阶段不做，也不为第一条 MVP 闭环建立专门软验证服务。

原因: 没有硬一致性验证，语义命令、undo/redo、文件保存、导入导出、插件 API 和未来迁移都会失控。把硬验证放在内核里，可以保证任何模块写入文档后都必须通过同一套最低正确性规则；把音乐质量、教学提示和风格判断放在外部，则能避免内核变成大而全的业务判断层。

实现约束: 所有写命令 commit 前必须运行硬验证；失败必须 rollback，且不得产生 undo stack 条目。`.bgp` 保存前、打开后、自动恢复后、导入映射后和命令回放后也必须运行硬验证。diagnostic 必须结构化，至少包含 `code`、`severity`、`messageKey`、可选 `target`、可选 `details`，用户可见文本通过 i18n key 解析。MVP 不允许外部模块关闭内核硬验证，也不得把软一致性、教学提示或风格分析做成第一阶段阻塞项。

取舍: 内核硬验证会增加实现和测试成本，也会让一些“先临时写进去以后再修”的开发方式不可用；但它能极大提高文件可靠性、撤销重做可靠性和长期维护确定性。如果把验证放到外部模块，短期更自由，但文档可能被不同模块写坏，后续保存、播放、导出和迁移都会更难排查。

### DEC-K042: `.bgp` 语义契约和迁移入口是否属于 Core Kernel？

定义: `.bgp` 语义契约是指文件包内哪些内容代表正式谱面数据、版本字段如何声明、`manifest.json` 和 `score.json` 的语义是什么、旧 schema 如何迁移到当前 schema、未来版本如何安全失败，以及未知扩展数据如何保留。它不是物理文件 IO，不包括打开文件对话框、zip 压缩、文件路径、自动保存目录或原子写入实现。

结论: `.bgp` 语义契约和迁移入口属于 Core Kernel；物理读写属于外部 `Persistence Service`。内核负责 `manifest.json` 语义、`score.json` schema、schema version、兼容矩阵、迁移器注册、`MigrationReport`、未知扩展命名空间保留规则、打开后/保存前验证入口。`Persistence Service` 负责 zip 包读写、文件系统路径、原子保存、备份、自动保存、崩溃恢复、最近文件列表和损坏文件读取保护。

MVP 包结构建议: `.bgp` 是单文件开放 zip 包，至少包含 `manifest.json` 和 `score.json`；`assets/`、`extensions/`、`preview/` 可以作为目录约定保留。`manifest.json` 至少声明格式标识、format/schema version、创建应用版本、最后保存应用版本、资源索引和可选扩展命名空间摘要；`score.json` 承载 `ScoreDocument`，不得包含 VexFlow、SVG DOM、屏幕坐标、播放引擎状态或 UI 会话状态。

原因: 文件格式是用户长期作品资产的核心契约。把语义契约和迁移入口放在内核里，能保证保存、打开、自动恢复、导入映射、命令回放和未来插件都围绕同一份谱面语义演进；把物理 IO 放在 Persistence 外部模块，则能保持内核不依赖 Tauri、文件系统、zip 库和平台路径。

实现约束: `.bgp` 第一阶段保持开放、可解包、可审查，不加密、不做文件密码锁、不做 DRM。保存前、打开后、迁移后必须运行硬一致性验证。遇到未来 schema version 必须安全失败并给出可读错误；遇到旧 schema version 必须通过迁移器或兼容读取路径，且迁移必须输出 `MigrationReport`。未知插件私有数据不得被静默丢弃，必须 round-trip 保留或明确报告无法保留。

取舍: 让内核拥有文件语义契约会增加 schema、fixture、迁移和兼容测试成本，但能保护用户作品和长期维护。若把文件语义完全放到 Persistence，短期实现更快，但文件格式会被 IO 细节污染，后续迁移、插件数据保留和跨模块一致性更难保证。

### DEC-K043: Core Kernel 的快照、事件和模块通信协议应该如何设计？

结论: 确认采用“Snapshot / Selector + Post-Commit Event Bus + Command-only write”的内核通信模型。写入只能通过 `CommandBus.submit`、`CommandBus.undo` 或 `CommandBus.redo`；读取只能通过只读 `DocumentSnapshot` 或受控 selector；通知只发布提交后的事实事件，例如 `kernel.document.loaded`、`kernel.document.changed`、`kernel.command.executed`、`kernel.history.changed`、`kernel.diagnostics.changed`、`kernel.dirty-state.changed`、`kernel.registry.changed` 和 `kernel.migration.completed`。模块之间不得共享可变对象，不得通过事件总线发送自定义写命令，不得把 React、SVG、VexFlow、Web Audio、Tauri 文件对象或 UI 会话状态塞进内核事件。

原因: 这个功能决定外部模块如何围绕同一份谱面真相协作。渲染、播放、导出、自动保存、导入、内部扩展和未来插件都需要读取状态和响应变化；如果它们直接互相调用或共享可变 `ScoreDocument`，微内核边界会很快失效。采用只读快照、受控 selector 和提交后事件，可以让模块缓存、刷新、播放事件重建、保存和诊断都依赖稳定的 `documentVersion` 和 `eventSequence`，同时保持内核小而稳定。

实现约束: `DocumentSnapshot` 必须包含 `documentId`、`schemaVersion`、`documentVersion`、`snapshotId` 和创建时间；selector 必须是纯读操作并返回来源 `documentVersion`；事件必须在事务 commit 后发布，失败或回滚命令不得发布 `kernel.document.changed`；事件 payload 不得包含完整可变文档或内部 delta operation；事件处理器异常不得回滚已提交事务；事件分发期间不得重入提交命令；UI 光标、选区高亮、鼠标拖拽、播放光标 tick、SVG DOM 和 Web Audio 节点事件不属于 Core Kernel，分别属于外部 `Editor Session Service`、`Layout Module`、`Renderer Module` 或 `Playback Module`。

取舍: 这种方案会增加快照、selector、事件 envelope、版本号和缓存失效测试的设计成本，也会有少量对象分配和 API 调用开销；但它能换来模块低耦合、可测试、可替换和插件 API 的长期稳定。如果直接让模块互相调用或共享内部对象，MVP 可能少写一些接口，但后续 VexFlow 替换、播放引擎替换、导出复用、插件权限和文件迁移都会变得脆弱。

### DEC-K044: 是否允许打开文件时复制一份外部可变副本给模块随意操作，保存时再写回 Core Kernel？

结论: 不接受“打开文件时复制一份外部可变 `ScoreDocument` 副本给模块随意操作，保存时再整体写回 Core Kernel”的方案。该方案与微内核设计思路相悖，会制造第二份谱面事实来源。Core Kernel 仍然是唯一权威 `ScoreDocument` 所有者，外部模块只能通过只读 snapshot/selector 读取状态，并通过语义命令、导入映射结果或内核迁移入口提交变化。

原因: 外部可变副本看起来能降低模块开发成本，但它会制造第二份谱面真相。模块在副本上随意操作后，内核无法知道每一步用户意图、命令来源、undo/redo 粒度、诊断位置、插件权限、schema 迁移和事件范围。保存时整体写回会绕过命令系统，导致历史记录、脏状态、插件权限、缓存失效和 `.bgp` 兼容测试都变得不可靠。这不是微内核，而是把核心状态复制到用户态后再尝试合并。

允许场景: 外部模块可以从 snapshot 派生非谱面事实的数据结构，例如 `LayoutPrimitives`、hit areas、`PlaybackEvents`、导出页面模型、缩略图、分析报告或导入中间模型。这些不是 `ScoreDocument` 副本，不能被保存为权威谱面，也不能整体写回内核。如果要改变谱面，必须产出语义命令序列、`ImportResult` 或内核迁移结果，而不是替换整份文档。

实现约束: `DocumentSnapshot` 必须保持只读；Core Kernel 不提供 `getMutableDocumentCopy`、`replaceDocumentFromExternalCopy`、`saveMutableWorkingCopy` 或任意外部整文档覆盖 API。导入器可以生成导入候选结构，迁移器可以生成迁移结果，但它们必须走专门入口、来源标识、硬一致性验证、`ImportReport` 或 `MigrationReport`，并由内核决定如何 commit。普通模块不得持有、修改或提交可变 `ScoreDocument` 副本。

取舍: 拒绝外部可变 `ScoreDocument` 副本会让模块写入路径更严格，模块需要把变化表达成命令、导入结果或迁移结果，开发成本更高；但它能保住微内核边界、undo/redo、插件权限、事件系统、文件兼容和长期维护。如果允许外部模块自由改副本再整体写回，初期编码会快一些，但会把架构退回“多个模块各自维护状态，最后碰运气合并”的模式。

### DEC-K045: 注册表/capability 和错误/diagnostic/report 是否应该拆成两个内核功能？

结论: 已确认拆成两个内核功能，并且两个都属于 Core Kernel。`KernelRegistry`、`KernelCapability`、`KernelModuleIdentity`、API version 和 contribution descriptor 归为“注册表与能力边界”；`KernelError`、`KernelDiagnostic`、`KernelReport`、`KernelReportIssue`、`ImportReport`、`ExportReport`、`MigrationReport` 和 `ValidationReport` 归为“错误、diagnostic 与 report 契约”。

原因: 这两个功能的变化原因不同。注册表/capability 解决“谁能把什么能力接入内核、谁能调用什么能力”；错误/diagnostic/report 解决“失败如何表达、如何定位、如何给 UI/测试/导入导出使用”。它们确实会协作，例如注册失败返回 `KernelError`，但不应该由同一个模块拥有全部职责。

实现约束: 注册表/capability 由 `REQ-018` 和 `SPEC-015` 约束；错误/diagnostic/report 由 `REQ-019` 和 `SPEC-016` 约束。注册表可以依赖 `KernelError` 作为失败返回类型，但不得拥有 report 生成、diagnostic 生命周期或隐私过滤策略。错误系统可以引用 module id、contribution id 和 score target 做归因，但不得执行 capability 授权。

取舍: 拆分会多出一个需求文档和一个 spec，前期文档略多；但职责会更清楚，AI 后续编码时更不容易把 registry 写成万能服务。若合并，短期阅读似乎集中，但后续导入导出报告、命令错误、验证 diagnostic 和插件注册失败会被混在一起。

### DEC-K046: Core Kernel 的注册表和 capability 应该如何设计？

推荐答案: 第一阶段采用“Kernel Registry + Unified Startup Registration + Static Capability”的模型。Core Kernel 保留最小 `KernelRegistry`、`KernelCapability` 和 `KernelModuleIdentity`；命令、selector、hard validator、technique definition、migration、外部 import/export 抽象 descriptor 和 template descriptor 都必须通过 registry 显式注册。所有官方模块和未来第三方模块最终都收敛到 `KernelModuleIdentity + capability + contribution descriptor + handler` 注册协议；第三方插件发现、manifest 文件读取、沙箱、启动前安装/移除/启用/禁用配置、市场、权限 UI、签名和审核不进入 Core Kernel，属于未来插件平台或 `Extension Host`；运行时热插拔、运行中启用/禁用和卸载不作为规划目标。

导入/导出 descriptor 只用于声明外部模块贡献点的格式 id、显示信息、capability、API version 和 unsupported 状态。Pure Core Kernel V1 不注册 PDF、PNG、Guitar Pro 或 `.bgp` 物理 IO 的具体 descriptor/handler，不引入任何格式解析、生成、zip、字体或文件系统依赖。

实现约束: 每个注册项必须声明稳定 `id`、`kind`、`sourceModuleId`、`apiVersion`、`requiredCapabilities`、`status` 和 `titleKey`；每个模块身份必须声明 `origin`、`runtime`、`trustLevel`、`apiVersion` 和 capability。Pure Core Kernel V1 只从静态 `KernelStartupModuleManifest` 接受随应用发布的 `builtin` 与 `internal-module`，拒绝第三方 TypeScript 插件运行时、编译产物、Lua 和 native 运行时；未来第三方模块可在启动前授权后映射进同一注册协议。注册表拒绝重复 ID、未知 contribution kind、不兼容 API version 和缺失 capability；注册表变化必须递增 `registryVersion` 并发布 `kernel.registry.changed`。registry summary 不得泄露 handler、React 组件、VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。

取舍: 该方案会增加注册元数据和权限检查成本；但它能让内置模块和未来插件都通过同一套内核 ABI 扩展系统能力。如果完全不做注册表和 capability，MVP 代码会更快，但后续每个模块都会变成隐式入口。

### DEC-K047: Core Kernel 的错误、diagnostic 和 report 应该如何设计？

推荐答案: 第一阶段采用“Structured Error + Diagnostic + Shared Report Shell”的模型。Core Kernel 保留 `KernelError`、`KernelDiagnostic`、`KernelReport`、`KernelReportIssue`、`ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和恢复报告外壳。

实现约束: 所有用户可见错误、diagnostic 和 report issue 必须使用稳定 code、severity、messageKey、target、source 和结构化 details，不得把中文/英文文案、用户谱面正文、访问令牌、本机隐私路径或第三方密钥硬编码进错误对象。模块异常必须被捕获并转换为 `module-error` diagnostic 或 report issue，不得导致 Core Kernel 崩溃。

取舍: 该方案会增加错误 code、report issue 和隐私边界的设计成本；但它能统一命令、验证、导入、导出、迁移和插件异常的失败表达。如果只用异常或字符串，MVP 更快，但国际化、测试断言、问题定位和长期维护都会变得脆弱。

### DEC-K048: 未来模块化插件如何与 Core Kernel 协作？

结论: 采用“统一注册协议 + 来源与权限解耦”的模块协作模型。官方模块和未来第三方模块最终都以 `KernelModuleIdentity + capability + contribution descriptor + handler` 的形式进入 `KernelRegistry`；差异只存在于启动前发现、校验、授权和加载阶段。Pure Core Kernel V1 使用 `KernelStartupModuleManifest` 和 `CoreModuleRegistration` 直接注册随应用发布的 `builtin/internal-module`；未来第三方插件只能在应用启动前完成安装、移除、启用和禁用配置，再由插件平台或 `Extension Host` 映射进同一注册协议。`PluginKernelFacade` 是未来第三方插件平台的受控 facade 草案，不属于 V1 实现项。

产品视角: 用户需要的是可扩展能力和稳定文件资产。插件可以新增命令、验证器、外部导入/导出贡献点、模板和未来面板，但不能因为一个插件出错就破坏谱面、文件或主程序。

业务逻辑视角: V1 模块必须先出现在静态 `KernelStartupModuleManifest` 中，再在启动期提交 `CoreModuleRegistration`，由 `KernelRegistry` 校验 module identity、origin、runtime、trustLevel、apiVersion、registration capability 和 contribution descriptor，成功后绑定 handler。未来第三方插件集合必须在应用启动前由用户配置或插件管理配置确定，启动时由插件平台或 `Extension Host` 读取 manifest，完成安装来源、apiVersion、runtime、permissions、contributes、签名/开发者模式和用户授权校验，再把第三方模块映射成同一套 `KernelModuleIdentity`、capability 和 contribution descriptor。应用运行中不得新增、卸载、启用、禁用或热插拔第三方插件，相关变更需要重启后生效。插件 manifest、用户配置和运行时模块不得自我声明或提升 trust level。读取谱面只能走 snapshot/selector；修改谱面只能提交已注册语义命令；订阅事件只能拿到按 capability 过滤后的事件；导入、导出、验证和异常必须输出标准 report、diagnostic 或 `KernelError`。

技术实现视角: `KernelModuleIdentity` 必须包含 `origin = "official" | "third-party"`、`runtime`、`trustLevel = "system-trusted" | "sandboxed"`、`apiVersion` 和 capability；`origin`、`runtime`、`trustLevel` 和 capability 独立建模，来源和运行时都不自动获得权限。`KernelStartupModuleManifest` 是 Pure Core Kernel V1 的唯一模块来源，只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不能引用外部路径、URL、脚本字符串或动态 import。`CoreModuleRegistration` 是 V1 的启动期注册形态；未来 `PluginKernelFacade` 至少包含 `read`、`commands`、`registry`、`events` 和 `reports` 五类受控接口，但只是第三方插件平台草案。Kernel Registry 不提供第三方插件运行时 unregister、enable、disable 或 hotplug 入口；应用进入 ready 状态后，插件集合变更只能返回 `unsupported-at-runtime` / `restart-required` 类稳定错误。任何模块都不得暴露可变 `ScoreDocument`、内部 delta、patch、JSON path、React、VexFlow、SVG DOM、Web Audio 或 Tauri 文件对象。注册权限必须与执行权限分离，例如 `command:register` 不等于 `command:execute`。

反过度设计视角: MVP 不做真实第三方 TypeScript 沙箱、插件安装器、插件市场、权限 UI、UI 面板插件、native 动态库插件，也不设计 marketplace-reviewed、partner、semi-trusted 等额外等级。运行时热插拔、运行中启用/禁用和卸载不后置为目标能力，而是稳定性原则上不支持；未来插件配置变更通过重启生效。第一阶段只需要把统一注册协议、静态 capability、启动期模块清单和 `CoreModuleRegistration` 做薄，并证明“读走 snapshot、写走 command、贡献点走 registry、错误走 report”这条链路成立。

### DEC-K049: Core Kernel 是否需要音乐时间模型？

结论: 需要。音乐时间模型属于 `ScoreDocument` 谱面核心对象模型的一部分，不新增第十类内核机制。Core Kernel V1 必须用整数 tick 表示谱面的逻辑时间，至少定义 `ticksPerQuarter = 960`、4/4 小节长度 `3840`、四分/八分/十六分和等长休止 duration、beat 的 `tickOffset` 与 `durationTicks` 校验。这样谱面不只是静态字段集合，而是可以被播放、渲染、导出和后续插件一致解释的时间化音乐数据。

产品视角: 用户写谱后需要播放校对、节拍感、播放光标和导出结果都与谱面节奏一致。没有统一音乐时间模型，软件只能像静态图文编辑器；有统一音乐时间模型，编辑器、播放和导出才能围绕同一首“会动的谱子”工作。

业务逻辑视角: 谱面命令必须能在明确小节、beat 和 duration 上操作；硬验证必须能拒绝小节时值溢出、不完整小节、非法 duration、unsupported tempo map、unsupported time signature 和同一 beat 多音。播放模块只能从 snapshot 派生播放事件，不能反过来把自己的毫秒时钟写回 `ScoreDocument`。

技术实现视角: 内核只拥有音乐逻辑时间，例如 `Tick`、`DurationTicks`、`MusicalTimebase`、小节长度计算和 duration 验证。真实 wall-clock time、Web Audio `currentTime`、节拍器声音调度、播放光标高频 tick、UI 时间线和渲染坐标都属于外部模块。未来 tempo map、变拍号、附点、三连音和多 voice 可以通过扩展字段与迁移演进，但 V1 hard validator 必须明确返回 unsupported。

反过度设计视角: 当前阶段不做完整乐理时间引擎、量化器、swing/humanize、tempo automation、实时录音、MIDI clock、采样级调度或 DAW 式 transport。V1 只需要足够支撑 4 小节标准 6 弦 riff 的确定性 tick 模型和测试，避免把播放引擎复杂度提前塞进内核。

## 当前阻塞开放问题

无。当前 PRD 已完成 Phase 1 收敛，剩余动作是用户审核 `prd.md`、`design.md` 和 `implement.md`，审核通过后才能按 Trellis 流程进入 `task.py start` 和 Pure Core Kernel V1 实现。
