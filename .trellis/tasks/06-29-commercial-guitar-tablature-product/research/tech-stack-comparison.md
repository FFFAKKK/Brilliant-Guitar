# 技术栈候选对比

## 决策背景

项目当前候选技术栈为:

- Tauri 2
- TypeScript
- React
- Vite

第一阶段已确认:

- 首发平台为 Windows 桌面。
- 项目先开源验证，但按商业软件流程建设。
- 毕业设计需要可演示、可答辩、可写论文。
- 产品核心是吉他谱编辑器，不是 DAW，也不是完整音频工作站。
- 第一阶段先实现标准 6 弦吉他谱闭环、`.bgp` 开放文件包、PDF/PNG 导出。

## 官方资料摘录

- Tauri 官方定位: 用任意能编译到 HTML/JS/CSS 的前端构建体验，用 Rust 等语言处理后端逻辑；主要优势包括安全基础、更小包体和灵活架构。来源: https://tauri.app/start/
- Tauri 架构: 组合 Rust 工具与 WebView，允许 WebView 通过消息与 Rust 后端通信；使用系统 WebView，不把完整运行时随应用一起发。来源: https://v2.tauri.app/concept/architecture/
- Electron 官方定位: 用 JavaScript、HTML、CSS 构建桌面应用，把 Chromium 和 Node.js 嵌入应用二进制，单一 JS 代码库可面向 Windows、macOS、Linux。来源: https://www.electronjs.org/docs/latest/
- Qt 官方定位: 提供跨平台软件开发框架，包含 UI、图形、数据处理、网络、可访问性、安全等组件，强调长期稳定和跨平台扩展。来源: https://www.qt.io/development/qt-framework
- Flutter 官方桌面支持: Flutter 可创建并运行 Windows、macOS、Linux 桌面应用，也支持插件机制。来源: https://docs.flutter.dev/platform-integration/desktop
- JUCE 官方定位: 开源 C++ 应用开发框架，面向高性能应用和音频插件，支持 Windows、macOS、Linux、iOS、Android 以及 VST/AU/AAX/LV2 等插件格式。来源: https://juce.com/
- Vite 官方定位: 通过 native ESM、快速预构建和 HMR 解决大型 Web 应用开发服务器启动慢、热更新慢的问题。来源: https://vite.dev/guide/why.html
- React 官方说明: React 可与 TypeScript 配合，类型能用于正确性检查和编辑器内联文档。来源: https://react.dev/learn/typescript

## 候选方案总览

| 方案 | 优势 | 劣势 | 对本项目判断 |
| --- | --- | --- | --- |
| Tauri 2 + TypeScript + React + Vite | 轻量、安全边界好、开源协作友好、UI 开发快、适合 Windows 首发并保留跨平台 | WebView 差异、Tauri 复杂编辑器案例少、Rust/TS 边界需要设计、高性能渲染/音频后续可能要下沉 | 推荐默认 |
| Electron + TypeScript + React | 成熟、生态大、复杂编辑器先例多、Chromium 行为一致、插件/调试便利 | 包体和内存更重、嵌入 Chromium+Node、安全面更大、商业轻量感弱 | 备选，适合牺牲轻量换成熟 |
| Qt/C++/QML | 桌面成熟、性能强、长期稳定、原生能力强、商业软件感强 | C++/Qt 学习和开发成本高、AI 生成可控性较弱、开源许可/商业许可要更谨慎、前期速度慢 | 若追求传统 native 桌面可选，但不适合当前快速开源验证 |
| Flutter/Dart | 跨平台 UI 一致、渲染性能好、移动端后续自然 | 桌面专业编辑器生态不如 Web/Qt，Dart 团队与 AI 生态相对小，文件/系统集成仍需插件 | 若后续移动端优先可考虑，不是当前最优 |
| WinUI/WPF/.NET | Windows 原生体验强、系统集成好、适合 Windows-only 商业软件 | 跨平台弱、后续 macOS/Linux 成本高、插件生态和 Web/AI 协作不如 TS | 若永远只做 Windows 可选，但与后续跨平台目标冲突 |
| JUCE/C++ | 音频应用和插件领域非常强，高性能、跨平台、音频生态成熟 | 更适合 DAW/插件/实时音频，不适合快速构建复杂谱面编辑 UI 和开源 Web 生态 | 后续音频引擎可参考，不适合作为第一阶段主 UI 栈 |
| Web/PWA | 开发最快、部署简单、分享方便 | 文件系统、离线资产、安装包、文件关联、商业桌面体验弱 | 不符合当前 Windows 桌面商业软件定位 |

## Tauri 2 + TypeScript + React + Vite 的一般优势

### 1. 包体和资源占用更轻

Tauri 使用系统 WebView，不像 Electron 那样把 Chromium 和 Node.js 都嵌进应用二进制。对开源项目、毕业设计演示和未来正式发布来说，安装包体积、启动速度和用户感知都会更友好。

### 2. 安全边界更适合本地文件软件

Tauri 后端是 Rust，能力通过命令、权限和插件暴露给前端。对本项目这种要打开外部 `.bgp` 文件、导入 MusicXML/MIDI、后续支持插件的工具来说，这比把 Node 能力直接放进渲染层更容易做权限边界。

### 3. UI 迭代速度快

React + TypeScript 适合构建复杂编辑器 UI，例如工具栏、属性面板、命令面板、谱面工作区、状态栏、导出对话框、设置面板。Vite 的开发体验和热更新有利于快速打磨交互。

### 4. AI 辅助编码更可控

TypeScript 类型、React 组件边界、schema、命令系统和测试 fixture 都很适合作为 AI 编码输入。相比 C++/Qt，AI 生成前端和领域层代码的可读性、可审查性、重构速度更好。

### 5. 和开放文件格式、插件生态方向一致

项目选择 `.bgp` 开放包、未来插件、开源社区和 DCO。TypeScript/React/Vite 更容易吸引 Web 开发者参与，未来内部插件或脚本能力也更容易先从 TypeScript 生态开始。

## Tauri 2 + TypeScript + React + Vite 的一般劣势

### 1. WebView 一致性不如 Electron

Electron 自带 Chromium，渲染行为更一致。Tauri 使用系统 WebView，Windows 上主要依赖 WebView2，因此需要把 WebView 版本、字体渲染、SVG/Canvas/PDF 截图输出纳入 Windows 质量门禁。

### 2. 复杂编辑器经验少于 Electron/Qt

Electron 有 VS Code 等复杂编辑器先例，Qt 有大量传统桌面商业软件经验。Tauri 适合构建桌面应用，但超复杂编辑器、音频同步和专业排版相关现成案例更少，需要我们自己做好架构分层。

### 3. Rust/TypeScript 边界需要认真设计

文件系统、诊断、打包、未来高性能模块在 Rust；UI、领域模型、命令系统在 TypeScript。边界没设计好会出现双端状态不一致、错误处理混乱、测试困难。

### 4. 高性能渲染和音频能力需要后续验证

第一阶段 SVG 渲染和基础播放可行。但如果未来要做超大谱、出版级排版、实时音频轨、复杂音色和低延迟播放，可能需要 Canvas/WebGL/Rust/Native 音频模块补强。

## 对 Brilliant Guitar 的具体优势

### 1. 和第一阶段目标匹配

第一阶段是 Windows 桌面、标准 6 弦吉他、六线谱编辑、基础五线谱同步、P0 技巧、保存打开、PDF/PNG 导出。这个阶段最需要的是快速构建稳定编辑闭环，而不是一开始就做 native 排版引擎或音频工作站。

### 2. 适合毕业设计

论文里可以清楚解释:

- Tauri 负责桌面壳和系统能力。
- React 负责复杂工作台 UI。
- TypeScript 负责领域模型和命令系统。
- Rust 负责文件、安全、诊断、打包和未来性能模块。
- Vite 负责工程化开发体验。

这个结构很适合写需求分析、总体设计、详细设计、测试报告和演示脚本。

### 3. 适合商业级质量门禁

TypeScript 严格类型、Vitest、Playwright、fixture、golden file、schema 校验都容易建立。Tauri 的权限和 Rust 后端也能支撑“外部文件按不可信输入处理”的安全要求。

### 4. 适合开源社区

Web 技术栈门槛低，潜在贡献者多。未来文件格式工具、谱面模板、导入导出器、内部插件和 UI 面板都更容易被社区理解和参与。

### 5. 适合插件路线

产品层 Extension Host 可以先用 TypeScript 类型定义 API，内部插件先走命令系统、验证器、导入导出和模板扩展点。等边界稳定后，再考虑隔离运行环境。

## 对 Brilliant Guitar 的具体劣势与风险

### 1. 谱面渲染必须自己做边界

React 不能直接承担谱面排版语义。必须坚持:

- 领域模型独立。
- 布局引擎独立。
- Renderer 只渲染 layout primitives。
- UI 不能直接修改文档。

否则后续会变成难维护的“React 组件里塞音乐逻辑”。

### 2. 大谱性能需要早测

SVG 首发适合可读、可调试、可导出，但大谱、多页、复杂技巧密集时可能变慢。第一阶段必须建立性能 fixture，不要等 UI 写完才发现卡顿。

### 3. PDF/PNG 导出链路要谨慎

Web 渲染到 PDF/PNG 比 native 打印排版更容易受字体、缩放、DPI、WebView 差异影响。Windows 质量门禁必须覆盖字体嵌入/加载、页面尺寸、缩放和透明背景。

### 4. Rust/TS 数据模型不能分裂

建议第一阶段领域模型只维护一份权威 TypeScript schema；Rust 只处理文件容器、原子写入、诊断包、路径安全和打包。等性能需求明确后，再把局部下沉到 Rust。

### 5. 不适合一开始做 DAW 级音频

基础播放、节拍器、光标同步可以先做。真实音频轨、低延迟混音、复杂音色和插件音频链路不应进入第一阶段。

## 推荐结论

推荐确认:

> 第一阶段采用 Tauri 2 + TypeScript + React + Vite。  
> 领域模型、命令系统、布局、渲染、播放、文件格式和插件 API 必须分层。  
> Rust 第一阶段只承担桌面壳、文件系统、安全边界、诊断、打包和少量高风险系统能力。  
> 若后续性能验证证明谱面渲染或音频处理不足，再将局部模块下沉到 Rust、Canvas/WebGL 或专用音频技术。

## 决策后必须写入的约束

- 不允许 React 组件直接修改谱面数据。
- 不允许把核心领域模型绑死在 Tauri/Rust 或 UI 框架上。
- `.bgp` 文件读写必须经过文档验证器。
- Windows WebView2、字体渲染、PDF/PNG 导出必须进入质量门禁。
- 插件生态必须先从内部 TypeScript API 和命令系统验证，不开放任意脚本执行。
