# 共享记谱模块

唯一源代码从旧工作台提取；旧入口通过 re-export 继续使用，新备份 UI 通过构建脚本生成浏览器模块。禁止维护第二套改写的记谱算法。

包内分为绘制和交互两部分。五线谱已有实际 UI；Tab 已有数字/导航/弦品修改策略和宿主真实投影，
绘制已有共享单音/休止实现，Native和Node宿主已返回同快照双谱；
原typed/Native弦品动作及documentSession窄入口已接通；备份界面消费仍待接入。简谱仍只有协议种类。

- 绘制：`StaffView` 投影 → `layoutScorePages` → `createVexflowRenderer(loadEngine)` → 同次 SVG 和 anchors/events/measures。
  不读应用私有 DOM、React、UI router 或内核写端口。字体加载由入口注入，完成后才绘制。
- 交互：`interaction/` 拥有原输入合同、状态机及五线谱输入、导航、编辑、命中、范围和变音纯规则。
  不依赖工作台目录或具体乐器。旧入口只 re-export 唯一实现。
- 登记：staff/tablature interaction 由正式 `notation.core` 包贡献到同一个 PluginPlatform。
  共享包定义合同与原 registry 实现，实际唯一目录由平台拥有；view 通过限定目录绑定自己的 kind。
- 编辑：策略输出音乐意图，应用补版本/身份并调用原宿主写口。异步提交、回执、历史与作品状态仍由原应用拥有；
  当前协调器仍为 StaffView，不把这一轮称为完整多谱式会话。
- Tab：`tablature-model.ts` 定义只读位置/事件模型；共享数字策略不计算音高。
  可信宿主读取原乐器领域，准备原 set-position 命令；领域原子更新音高与指法，弦数不固定为6。
  当前已验证已有单音的公开编辑、统一历史和guarded物理保存重开，未开放空拍插入、自动计时确认或技巧绘制。
  弦品入口按Tab能力判断，高品位staff无法显示时仍可编辑/撤销，不借五线谱视图限制Tab。
- 品位：数字草稿/公开wire支持非负安全整数，不按物理末品或两位数字设门槛。
  新吉他schema 2初始化fretCount为null，旧物理信息保留，第一次有效编辑原子升级；undo恢复旧版。
  当前Core octave0..8仍限制真实音高；标准第一弦43/44、第六弦67/68为接受/拒绝边界。
  数百/数千品作品尚未支持，不能夹音高或建立虚拟Tab作品。
- 宿主双谱：原`ScoreSessionRead.notation`维持五线谱兼容，新增可选`tablature`；
  当前宿主总返回Tab或明确unsupported，旧宿主缺字段仍兼容。两谱来自一个真实作品快照，
  共用版本、事件ID、节奏和warnings，不是两份文档。Native固定调号/吉他领域在原integrated
  会话执行，领域算法不进入共享绘制/策略。新建仍为通用作品，不推测或自动补弦品。
- Tab绘制：`layoutTablaturePages` → `createTablatureRenderer(loadEngine)`，实际线数来自领域，
  数字墨迹、节奏和弦线同次输出；`composeNotationPages`保留完整页根并同步平移所有几何。
  原staff共用分页/节奏/surface，基线几何、文字坐标和path回归保持。

`notation-model.ts` 校验沿用旧输入合同：单变音、单附点、2–6 组音域；32 分时值仅允许无附点休止符。不支持的输入明确拒绝，不能静默画成其他音符。

备份桌面已接真实文档和基础编辑，普通预览 fixture 留在应用入口。乐器领域负责调弦、弦品、音高映射及技巧，
不复制五线谱或 Tab 渲染器。架构与后续顺序见
[`notation-package-architecture-v0.1.md`](../../design/frame-visual/notation-package-architecture-v0.1.md)，
可执行边界见[记谱策略合同](../../.trellis/spec/frontend/notation-interaction-package-contract.md)。
Tab切片见[弦品合同](../../.trellis/spec/frontend/tablature-position-contract.md)。
绘制和取消签名见[Tab绘制合同](../../.trellis/spec/frontend/tablature-rendering-contract.md)。
真实宿主读取及保护见[Native双谱合同](../../.trellis/spec/frontend/native-dual-notation-contract.md)。
原公开弦品动作与会话保护见[弦品编辑合同](../../.trellis/spec/frontend/score-fretted-position-contract.md)。

规范与制谱惯例见 `docs/notation-engraving-principles.md`。SMuFL 不提供整张乐谱排版的唯一答案，也不能代替音高、时值和连梁测试。

修改后执行 `npm --prefix design/frame-visual run notation:build`，测试会检查生成代码与源代码一致。浏览器回归页为 `design/frame-visual/notation-regression.html`。

## SVG 接入合同

`RenderedNotation.svg` 是完整的绘制结果，根节点上的 `font-family`、`viewBox`、尺寸和内部缩放共同决定字形与坐标。宿主采用完整根节点；多页组合使用外层平移容器，不拆出 `childNodes`，不通过宿主 CSS 单独移动谱号、音符头或休止符。

字体文件加载成功不等于最终字形正确。必须在目标宿主挂载后验证音乐字符的 computed font、真实字形及其谱线位置，并检查 SVG 与 interaction 的页面偏移一致。Node 的 DOM 替身测试不具备字体和浏览器布局能力，不能作为视觉验收依据。

统一范围与旧文件兼容见[品位演进合同](../../.trellis/spec/frontend/fretted-range-evolution-contract.md)。
