# SPEC-006 布局与谱面渲染

## 状态

- 状态: 已确认第一阶段方向
- 映射需求: `REQ-004`, `REQ-008`, `REQ-011`, `REQ-015`, `REQ-016`
- 已确认决策: 第一阶段采用自研布局模型 + SVG 首发渲染目标。
- 已确认细化: 第一阶段采用 VexFlow 作为 MVP SVG 渲染适配器。

## 目标

谱面渲染必须同时服务编辑、阅读、命中测试、选择高亮、播放光标、PDF/PNG 导出和长期演进。第一阶段使用 SVG 是为了更快跑通 MVP 闭环，但核心布局模型必须独立，不能把谱面语义绑死在 SVG DOM、React 组件或浏览器事件中。

## 强制规则

- 领域模型只表达音乐事实，不包含 SVG DOM、CSS class、像素坐标或 React 状态。
- 布局层负责把领域模型转换为稳定布局 primitives。
- 布局坐标、屏幕坐标和导出页面坐标必须从 `ScoreDocument` 快照派生，不得保存回领域模型成为谱面事实。
- 布局模块读取谱面必须遵守 `SPEC-014-kernel-snapshot-events.md`，通过只读 snapshot 或 selector 派生布局 primitives。
- SVG 渲染层只消费布局 primitives，不直接推导音乐语义。
- hit testing 必须基于布局 primitives 的稳定 ID 和区域信息。
- hit testing 的写入链路必须是 `ViewCoordinate -> LayoutPrimitive -> ScoreAddress/ScorePoint/ScoreRange 或 semantic payload -> semantic command`。
- MVP hit testing 和临时坐标解析先属于 `Layout Module + Editor Session Service`；后续可抽为独立外部 `Positioning Service`，但不得进入 Core Kernel。
- 选择、高亮、播放光标和编辑命中不得直接依赖 SVG 元素树作为唯一真相。
- PDF/PNG 导出必须复用同一布局模型，避免屏幕显示和导出结果走两套语义。
- Canvas/WebGL 作为后续性能优化目标，必须能复用同一布局 primitives。
- VexFlow 只能位于渲染适配层，不能进入领域模型、`.bgp` 文件格式、命令系统或 hit testing 唯一真相。
- VexFlow 依赖必须锁定版本，并进入渲染回归测试。
- `VexFlowRendererAdapter` 必须只消费布局 primitives。
- 自定义 SVG overlay 可用于 Core Loop 技巧、选区、播放光标和编辑辅助。

## MVP 范围

- 标准 6 弦吉他六线谱渲染。
- 基础五线谱派生显示。
- 4/4 小节线、四分/八分/十六分节奏、单音、基础休止、品号、弦线、标题/作者/tempo/拍号/小节编号和可选简单段落标记。
- 3 个 Core Loop 技巧的显示入口: `slide`、`bend`、`vibrato`。
- 选择框、编辑光标、播放光标和基础 hit testing。
- PDF/PNG 导出所需的页面和缩放信息。

## 第一阶段不做

- 不做 SVG 导出作为独立用户功能。
- 不做出版级雕版排版。
- 不做 Canvas/WebGL 首发渲染。
- 不做完整多乐器复杂排版。
- 不做自动换行、分页和碰撞规避的最终商业级算法。
- 不做附点、三连音、跨小节延音线、多声部同轨、变拍号或复杂节奏谱渲染作为第一阶段验收门槛。
- 不做同 slot 多音、和弦图或和弦名渲染作为第一阶段验收门槛。
- 不做歌词、自由文本框、和声分析、罗马数字或简谱渲染。

## 布局 primitives 要求

每个布局对象必须至少具备:

- 稳定 ID。
- 对应领域实体 ID。
- 类型，例如 `measure`, `stringLine`, `noteHead`, `fretNumber`, `technique`, `cursor`, `text`。
- 位置和尺寸。
- hit testing 区域。
- 可选的导出语义。

## 禁止事项

- 禁止 React 组件直接计算并保存谱面真相。
- 禁止把 SVG 元素 ID 当作唯一领域 ID。
- 禁止在渲染层修改领域模型。
- 禁止把鼠标坐标、SVG 坐标、VexFlow 内部坐标或 PDF/PNG 页面坐标写入 `.bgp` 作为音乐语义。
- 禁止为了导出重新实现一套不同的谱面语义。
- 禁止为了 MVP 演示写死 4 小节固定坐标而绕过布局模型。
- 禁止把 VexFlow 对象序列化进 `.bgp`。
- 禁止 React 组件直接构造 VexFlow 对象并把它当成谱面状态。
- 禁止让业务命令依赖 VexFlow class 或 SVG DOM。

## 测试要求

- 布局层必须能在无 UI 环境下测试。
- 同一 `Guitar Core Loop` fixture 必须能生成稳定布局 primitives。
- 修改六线谱品号后，五线谱派生显示和布局输出必须同步变化。
- 同一点击命中结果必须能稳定解析为 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或合法语义 payload，并通过语义命令修改 `ScoreDocument`。
- SVG 渲染 smoke test 必须能证明主要元素非空。
- VexFlow 渲染 smoke test 必须覆盖标准 6 弦六线谱、基础五线谱和 3 个 Core Loop 技巧 overlay。
- PDF/PNG 导出 smoke test 必须能证明输出可读。
- 大谱性能基准后置，但第一阶段必须记录至少一个扩展性风险。
