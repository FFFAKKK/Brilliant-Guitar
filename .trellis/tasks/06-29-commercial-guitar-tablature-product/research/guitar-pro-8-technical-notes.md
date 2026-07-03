# Guitar Pro 8 技术观察

## 结论

Guitar Pro 8 的完整技术栈不是公开官方信息。官方能确认的是产品形态和能力边界: 它是 Arobas Music 的闭源商业桌面软件，面向 Windows/macOS，具备谱面编辑、播放、RSE 音源、音频轨、命令面板、导入导出、mySongBook 集成等能力。

公开资料中有非官方信息称 Guitar Pro 使用 C++，但这不是 Arobas 官方工程文档，不能作为高置信事实。我们可以从它的产品表现推断其更接近传统 native 桌面软件架构，而不是简单网页应用，但不能据此要求本项目照抄其技术路线。

## 官方可确认事实

来源:

- https://www.guitar-pro.com/c/14-guitar-pro-features
- https://www.guitar-pro.com/c/10-guitar-pro-new-features

### 产品形态

- Guitar Pro 8 官方产品入口标注为 Win/macOS。
- 产品是音乐记谱软件，不是浏览器优先在线应用。
- 产品生态包含 Guitar Pro 8、Guitar Pro Education、移动 App、mySongBook 曲库。

### 音频与播放

- Guitar Pro 8 新功能页说明吉他和贝斯由 Realistic Sound Engine 播放，声音和鼓可以由 Audio Track 承担。
- 支持音频文件加入谱面。
- 支持 relative tempo、detune mode、音频与谱面同步。
- 支持 focus/unfocus track、视觉节拍器、countdown、固定速度、相对速度变化。
- 支持虚拟效果链、pedalboard、soundbanks、鼓组混音。

### 编辑与排版

- 支持音符 duration、offset、relative velocity 调整。
- 支持 design options、stylesheet options、字体和谱面标记文本定制。
- 支持 3 到 10 弦、最多 24 品的 scale diagrams。
- 支持 nested tuplets。
- 支持 command palette。
- 支持 PNG 透明背景导出和 SVG 导出。

### 维护事实

- 官方 release notes 显示 Guitar Pro 8.1.5 修复 playback、edition、engraving、interface、audio、miscellaneous、crashes。
- release notes 中大量问题涉及 undo/redo、导入导出、音频轨、光标、自动保存、翻译、崩溃，说明这类产品的真实复杂度主要集中在编辑状态、文件兼容、播放同步和稳定性。

## 非官方低置信线索

来源:

- https://en.wikipedia.org/wiki/Guitar_Pro

低置信观察:

- Wikipedia 标注 Guitar Pro 编程语言为 C++。
- 这不是官方工程说明，只能作为“可能是 native/C++ 长期产品”的参考。

使用规则:

- 不能在 PRD 或架构中写“Guitar Pro 8 是 C++/Qt 所以我们也必须用 C++/Qt”。
- 可以在竞品技术分析中写“Guitar Pro 8 看起来是长期演进的 native 桌面产品，本项目需要同等重视性能、文件稳定性、播放同步和崩溃恢复”。

## 对本项目的启发

- 不要把竞品看成一个简单谱面 UI；它是编辑器、音频、文件格式、排版、练习工具、导入导出、商业生态的组合。
- 我们的差异化不应是“重做一个 Guitar Pro”，而应是“更模块化、更开放、更容易扩展、更适合 AI/插件/现代工作流”。
- 技术栈不必照抄。Tauri + TypeScript/React + 独立领域模型可行，但必须把核心模型、命令系统、渲染、播放、导入导出拆开。
- 第一版必须把 undo/redo、文件验证、崩溃恢复、导入导出报告、播放光标同步列为基础能力，而不是后期补丁。

## 需求影响

- REQ-003 六线谱编辑必须覆盖真实吉他技巧，不做文本谱玩具。
- REQ-005 的长期播放练习可覆盖循环、速度、轨道聚焦、节拍器和播放光标；MVP 已收敛为基础播放校对、播放光标、节拍器和基础速度控制。
- REQ-006 导入导出必须有报告机制，不能静默丢失能力。
- REQ-007 扩展系统是主要差异化，必须从架构第一天进入。
- REQ-009 文件格式必须可验证、可迁移、可恢复。
- REQ-010 商业质量必须包含崩溃、自动保存、更新日志、诊断包和用户文件安全。
