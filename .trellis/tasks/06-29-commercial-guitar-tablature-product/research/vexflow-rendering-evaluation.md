# VexFlow 渲染选型评估

## 结论

VexFlow 适合被提升为 MVP 的候选渲染适配器，而不只是参考库。它可以帮助第一阶段更快获得可读的五线谱、六线谱、节奏和 SVG/PDF/PNG 渲染基础。

但 VexFlow 不应成为产品的领域模型、文件格式、命令系统或长期布局真相。项目仍必须保留自己的 `ScoreDocument`、`.bgp` schema、命令系统、布局 primitives 和渲染适配器接口。

推荐策略:

- MVP 使用 VexFlow 作为 `VexFlowRendererAdapter` 的底层绘制工具。
- 自研领域模型和布局 primitives 仍是应用内部契约。
- VexFlow 对象只在渲染适配层存在，不写入 `.bgp`，不进入命令系统，不作为 hit testing 唯一依据。
- 如果 VexFlow 无法满足某些吉他技巧或编辑命中需求，先通过自定义 overlay 或局部自绘补齐，不立即推翻整体架构。

## 官方事实

- VexFlow 官方 README 说明它是开源乐谱渲染库，使用 TypeScript 编写，可输出到 HTML Canvas 和 SVG，并可在浏览器和 Node.js 项目中运行。来源: https://github.com/vexflow/vexflow
- VexFlow 仓库描述其为 TypeScript library for rendering music notation & guitar tablature。来源: https://github.com/vexflow/vexflow
- VexFlow README 的 Native API 示例展示了使用 `Renderer.Backends.SVG` 进行 SVG 渲染。来源: https://github.com/vexflow/vexflow
- VexFlow README 建议指定版本号以避免未来更新破坏部署。来源: https://github.com/vexflow/vexflow
- VexFlow 源码包含 `TabStave`，默认 6 条线，适合吉他六线谱基础场景。来源: https://github.com/vexflow/vexflow/blob/main/src/tabstave.ts
- VexFlow 源码包含 `TabNote`，支持 `{ str, fret }` 形式的弦号/品号 position。来源: https://github.com/vexflow/vexflow/blob/main/src/tabnote.ts

## 对本项目的优势

### 1. 更快跑通 MVP

我们当前 MVP 是 4 小节标准 6 弦吉他 riff。VexFlow 已经覆盖五线谱、六线谱、SVG/Canvas 输出和基础排版能力，可以减少第一阶段从零实现谱面雕版的风险。

### 2. 更接近商业打谱软件的视觉起点

从零画五线谱、六线谱、节奏、符干、连线和技巧标记很容易在第一阶段变成长期工程。VexFlow 可以先提供可信的乐谱渲染基线，让我们把更多精力放在领域模型、命令系统、`.bgp`、保存重开和导出闭环上。

### 3. 与技术栈匹配

VexFlow 是 TypeScript/JavaScript 生态，能直接进入 Tauri + React + Vite 的前端工程。它支持 SVG，和当前首发渲染目标一致。

### 4. 有利于测试和对照

即使后续部分场景要自绘，VexFlow 也可以作为 golden rendering baseline 或对照渲染器，帮助验证布局结果是否合理。

## 对本项目的风险

### 1. 不能把产品语义绑死到 VexFlow API

`.bgp` 文件必须保存我们的领域模型，而不是 VexFlow 的对象结构。否则后续换渲染器、做插件、迁移 schema、扩展技巧都会被外部库 API 牵制。

### 2. 专业编辑器需要命中测试和编辑状态

VexFlow 更偏渲染库，不是完整交互式打谱编辑器。选区、光标、拖拽、命令、undo/redo、技巧编辑、播放光标和导出报告仍需要我们自己设计。

### 3. 高频吉他技巧可能需要 overlay 或自定义扩展

Core Loop 的 `slide`、`bend`、`vibrato` 以及后续 P0 增强的 `hammer-on`、`pull-off`、`palm mute` 不一定都能用 VexFlow 默认视觉语义直接满足我们的产品需求。第一阶段应允许自定义 overlay 绘制。

### 4. 长期维护要求必须固定版本

VexFlow README 提醒指定版本号可避免未来更新破坏部署。结合我们的长期维护原则，MVP 必须锁定依赖版本，并建立渲染回归测试。

## 推荐架构

```text
ScoreDocument
  -> LayoutEngine
  -> LayoutPrimitives
  -> RenderAdapter
       -> VexFlowRendererAdapter
       -> CustomSvgOverlay
       -> FutureCanvasRenderer
```

规则:

- `ScoreDocument` 不认识 VexFlow。
- `LayoutPrimitives` 不包含 VexFlow class instance。
- `VexFlowRendererAdapter` 可以把 primitives 转成 VexFlow `Stave`、`TabStave`、`StaveNote`、`TabNote` 等对象。
- `CustomSvgOverlay` 用于补齐 VexFlow 不直接支持或不满足产品视觉要求的技巧、选区、播放光标和编辑辅助。
- hit testing 优先来自 `LayoutPrimitives` 的稳定区域，不依赖 SVG DOM ID 作为唯一真相。

## 推荐决策

建议把当前渲染策略从:

> 自研布局模型 + SVG 首发渲染目标

细化为:

> 自研领域模型 + 自研布局 primitives + VexFlow 作为 MVP SVG 渲染适配器 + 自定义 SVG overlay + 后续 Canvas/WebGL 适配空间

这比完全自研渲染更适合先跑通 MVP，也比直接把 VexFlow 当核心模型更适合长期维护。

## 不建议的做法

- 不建议把 `.bgp` 设计成 VexFlow 对象序列化。
- 不建议 UI 组件直接构造 VexFlow 对象并修改谱面。
- 不建议 hit testing 只依赖 SVG DOM。
- 不建议第一阶段为了 VexFlow 适配而牺牲 `P0 Core` 技巧的结构化数据。
- 不建议不锁版本直接跟随 VexFlow 最新版本。
