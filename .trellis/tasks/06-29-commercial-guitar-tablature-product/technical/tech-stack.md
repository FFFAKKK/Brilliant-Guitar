# 技术栈决策

## 状态

- 状态: 已确认第一阶段默认路线
- 作用: 为后续实现提供默认技术路线，避免 AI 在代码阶段自行选型。
- 决策原则: 桌面优先、领域模型可测试、文件格式可验证、扩展系统可控。
- MVP 原则: 先跑通一个可安装、可编辑、可保存、可重新打开、可导出 PDF/PNG 的垂直闭环，再扩展功能广度。
- 详细对比: `../research/tech-stack-comparison.md`

## 已确认技术栈

### 首发平台

- 选择: Windows 桌面。
- 原因: 第一阶段需要先把安装、文件关联、字体渲染、保存打开、PDF/PNG 导出、性能基准、诊断包和毕业设计演示做稳定。
- 约束: macOS、Linux 和移动端只保留架构兼容空间，不作为第一阶段发布阻塞项。

### 桌面壳

- 选择: Tauri 2。
- 原因: 官方定位支持小体积、跨桌面和移动平台，前端可用 Web 技术，后端可用 Rust，并提供安全、权限、插件、文件系统、更新器、窗口状态等能力。
- 约束: Rust 只承担原生能力、文件系统、安全边界、打包和未来高性能模块；不要把所有业务逻辑过早搬到 Rust。
- 备选: Electron。
- 不选 Electron 作为默认的原因: 它成熟且生态强，但默认会绑定 Chromium 和 Node，安装包和资源占用通常更重；本项目更需要可控、轻量、长期安全边界。

### Guitar Pro 8 技术参考边界

- 官方没有公开 Guitar Pro 8 的完整技术栈。
- 非官方资料称 Guitar Pro 使用 C++，但这不能作为本项目选型依据。
- 我们只把 Guitar Pro 8 当作产品复杂度和质量基准，不把它当作必须复制的工程架构。
- 本项目选择 Tauri + TypeScript/React 的前提是领域模型、命令系统、文件格式和插件边界必须独立可测试；如果后续性能验证证明谱面渲染或音频处理不足，再把局部高性能模块下沉到 Rust。

### 前端应用

- 选择: TypeScript + React + Vite。
- 原因: AI 代码生成可控、生态成熟、组件化适合复杂编辑器 UI。
- 约束: 必须开启严格类型；领域模型不得散落在 React 组件里。

### 状态与命令

- 选择: 自研编辑器命令系统 + 文档事务 + undo/redo 栈。
- UI 状态可使用轻量状态库，但谱面文档状态必须由领域层统一管理。
- 每个编辑动作都必须是命令，命令必须可验证、可撤销、可重放。
- MVP 输入: 键盘优先，采用谱面光标、时值键、数字品号输入、方向键移动弦/拍、技巧快捷键和命令面板；所有输入触发命令系统；鼠标只作为定位和选择辅助。
- 后置输入: MIDI 设备输入、实时 MIDI 录入、MIDI 文件导入、虚拟指板点选输入、自由文本谱解析主输入。

### 模块化与插件

- 选择: 产品层自研 Extension Host + Tauri 原生插件分层。
- Tauri 插件用途: 文件系统、窗口、更新器、系统集成等应用壳能力。
- 产品插件用途: 谱面命令、验证器、导入器、导出器、模板、未来 UI 面板和 AI 能力。
- MVP: 支持内部插件注册表，不开放第三方插件安装。
- 后续: 公开第三方插件统一采用 TypeScript；插件发布包可包含编译后的 JavaScript 产物，但源码、SDK、类型契约、示例和兼容测试以 TypeScript 为准。Lua 不作为公开插件语言，native 不作为公开谱面插件机制，只能作为官方/内置系统能力或未来单独评审的外部进程能力。

### 谱面渲染

- 选择: 自研布局模型 + SVG 首发渲染目标。
- 原因: 商业级吉他谱编辑需要 hit testing、选区、排版、导出和插件扩展，不能把核心语义绑死在第三方渲染库。
- 约束: 领域模型不得依赖 SVG DOM；布局模型必须输出稳定 primitives，供 SVG、PDF/PNG 导出和后续 Canvas/WebGL 复用。
- VexFlow 选择: 第一阶段采用 VexFlow 作为 MVP SVG 渲染适配器。VexFlow 官方说明其可渲染 music notation 和 guitar tablature，并输出 Canvas/SVG。
- VexFlow 约束: VexFlow 不得进入领域模型、`.bgp` 文件格式或命令系统；必须通过 `VexFlowRendererAdapter` 消费布局 primitives，并配合自定义 SVG overlay。
- VexFlow 决策材料: `../research/vexflow-rendering-evaluation.md`。
- 后置: Canvas/WebGL 渲染目标用于大谱性能优化。

### 播放与音频

- 选择: Web Audio API + AudioWorklet 可选。
- MVP: 合成播放、开始/暂停/继续/停止、播放光标、节拍器、基础速度控制、从文档快照生成播放事件。
- 后置: 循环、count-in、虚拟指板播放显示、真实采样、音频轨同步、视频同步、导出音频、轨道 mute/solo。
- 约束: 播放层只读文档快照，不得直接修改谱面。

### 文件格式

- 选择: GP8 式单文件体验 + 开放包结构。
- 扩展名: `.bgp`，含义为 `Brilliant Guitar Project`。
- 产品名: `Brilliant Guitar`。
- 包内结构: `manifest.json`、`score.json`、`assets/`、`plugins/`、`preview/`。
- 数据格式: JSON + schema version + 迁移器。
- 校验: 保存前和打开后都必须运行文档验证器。
- 第一阶段不做文件密码锁、加密保存或 DRM；开放包内容必须可被测试工具解包检查。后续签名、授权内容包或商业保护层不得替代核心 `score.json` 语义。

### 导入导出

- MVP 打开/导入: 原生 `.bgp` 文件和自动保存恢复文件；不把外部格式导入作为第一阶段验收门槛。
- 第一阶段导出: 原生文件、PDF、PNG。
- 后置导入: MusicXML、MIDI、基础文本六线谱、Guitar Pro 格式、PDF/图片识别。
- 后置导出: SVG、MusicXML、MIDI、基础文本六线谱、音频和教学网页包。
- Guitar Pro 格式: 作为高价值兼容目标，但必须单独评估格式、法律和实现风险。
- MusicXML 依据: 官方定位为数字乐谱交换开放格式，适合作为互操作目标。

### 测试工具

- 单元测试: Vitest。
- 组件测试: React Testing Library。
- 端到端测试: Playwright。
- 文档模型测试: fixture 谱库 + schema 校验 + 命令回放测试。
- 导入导出测试: golden files + ImportReport/ExportReport 快照。

## 选型来源

- Tauri docs: https://tauri.app/start/
- Electron docs: https://www.electronjs.org/docs/latest/
- VexFlow repository: https://github.com/0xfe/vexflow
- MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MusicXML: https://www.musicxml.com/

## 已确认问题

- 接受 Tauri 2 作为第一版桌面壳。
- 接受 TypeScript + React + Vite 作为第一版前端应用技术栈。
- 接受 Windows 桌面作为第一阶段首发平台和质量基准。
- 接受自研布局模型 + SVG 作为第一版谱面渲染目标。
- 接受 VexFlow 作为 MVP SVG 渲染适配器。
- 接受未来公开第三方插件统一采用 TypeScript；Lua 和 native 不作为公开插件语言。

## 当前开放问题

- 无。
