# 动画工具调研与审美复核 · 2026-10-07

后续决策：用户采纳 **Motion** 路线并授权试点。下文 GSAP 优先建议保留为当时的调研结论；当前实施改用本地 Motion 14.0.0，并完成原页面的内容转场与真实拖动。实际接口、409 项测试和28项浏览器断言记录见 [布局动画试点合同](../motion-pilot-contract.md)。这不是正式 SDK 或已批准风格；默认框架仍无动画。

本轮回应：现有动画仍有明显模板感；查阅审美技能，并调研能辅助创作、渲染和验收的动画工具。

范围为备份视觉框架的 `animation-review.html`。本轮仅调研、代码复核和验证，不安装动画库，不增加动画效果，不新建 HTML，不改真实产品 UI。工具推荐是候选方案，尚未接入或验证实际手感。

## 结论

建议先把原测试页的一段完整动作接入 **GSAP + GSDevTools**，用于时间线编排、定位播放时刻、慢放和倒放。不要一次接入多套动画引擎。

如果后续需要直接在页面上编辑关键帧和缓动曲线，考虑 **Motion + Motion Studio**。它更接近可视化创作工具，但当前静态 HTML + Python HTTP 服务需要增加开发构建环境，并改用 Motion 的动画 API。

**Rive** 适合独立的交互矢量图形；**After Effects + Lottie** 适合预先创作的动画素材。二者保留为局部素材制作选项。框架里的真实文字、输入、焦点和布局仍由 DOM 与宿主管理。

工具提高编排和验收精度；风格仍需要明确的动作规则、素材和实际交互场景。

## 审美技能与项目上下文

本轮重新读取：

- `impeccable/SKILL.md` 和其动画参考：动作应表达反馈、状态或关系；一个明确的核心动作胜过堆叠特效。
- `interface-design/SKILL.md`：优先完成操作场景，明确视觉层级与动作辨识度，避免可套用到任何产品的模板。
- `emil-design-eng/SKILL.md`：检查频率、触发来源、连续性和自然响应，而不只检查动画是否能运行。
- `animate/SKILL.md`：按实际需求选择工具，已有方式能满足的动作不必换引擎。
- `review-animations/SKILL.md`：审查可中断性、来源关系、节奏、减少动效和生命周期。

Impeccable context 已执行。项目未建立其约定的 PRODUCT.md / DESIGN.md；本次为现有页面的限定调研，使用用户此前明确的视觉原则、备份框架资料和现有代码作上下文。没有因此开启产品重设计。

审美目标沿用用户要求：动态、连续、优雅、有辨识度；减少无意义文字，图标表达清楚，谱面居中与位置稳定，不出现页面滚动条，不以动效扰乱常用操作。

## 当前问题：代码事实与审美判断

以下基于代码和用户反馈，未冒充浏览器动态视觉验收。

| Before：现状 | After：建议 | Why：原因 |
| --- | --- | --- |
| 五个方向分别展示不同的卡片、排序、吸附和状态效果 | 用同一个真实框架动作比较候选风格；风格还要覆盖同一组配套动作 | 当前展示的是不同动画技巧，尚不能据此判断哪套风格更适合框架 |
| 临时卡片、简化谱面和解释性标记占据演示 | 用已经认可的视觉框架承载同一内容转场；调试信息放在审阅工具里 | 脱离实际场景的漂亮演示不能证明放回框架后自然 |
| 柔性响应通过 Replay 和预设比例关键帧移动 | 真正操控时，读取当前位置、目标和松手速度，再计算回落 | 没有手势输入的预制回弹只能展示轨迹，不能验证响应感 |
| `cancelAnimations()` 清除 transform 等样式后，`replay()` 从预设起点开始 | 真实交互从当前呈现状态继续或反向；明确区分重播与连续交互 | 取消旧动画不等于运动连续，清掉表现再起步可能产生跳变 |
| 流体演示在动画完成后才把新内容写入当前卡片 | 真实内容状态先提交；动画仅表现旧状态到新状态的过渡 | 不能让播放时长成为业务结果或当前页更新的前提 |
| 样式定义 `.motion-fluid-progress`，实际进度节点只声明 `data-fluid-progress` | 后续修订统一样式和节点契约，并检验实际 DOM | 当前轨迹样式不会命中该节点，动画播放代码存在不代表图形能按意图显示 |
| 测试以源码字符串匹配为主 | 补充实际渲染、运动中打断、关闭与最终状态验收 | 代码测试通过不能证明高级感、连续性或像素正确 |

代码位置：`src/fixtures/animation-review.js` 的 `renderDemo`、`replay`、`cancelAnimations` 和 `play`；`styles/animation-review.css` 的进度轨迹样式；`tests/animation-review-contract.test.js`。

不应以更强的发光、更多 3D 翻转、统一弹跳或延长时长作为修复。风格可以有表现力，但必须来自有因果关系的动作设计。

## 工具对照

| 工具 | 能辅助什么 | 当前页面适配与限制 | 建议 |
| --- | --- | --- | --- |
| **GSAP：动画编排引擎 + GSDevTools：可视化播放调试** | 时间线分段、标签、重叠编排；播放、暂停、定位时刻、倒放与慢放 | 可以用于普通 HTML/JS；GSDevTools 只控制 GSAP 动画，不能直接接管现有 WAAPI；它不是关键帧编辑器 | 当前优先试用一段动作；工具仅在审阅模式出现 |
| **Motion：交互动画引擎** | 动画序列、运动值、弹簧、惯性；物理弹簧可结合已有速度 | JavaScript API 不要求 React；需要显式管理动作和状态连续性，不能靠换库自动解决 | 真实手势响应出现需求时，作为 GSAP 的替代候选评估 |
| **Motion Studio：页面内动画创作编辑器** | 时间线拖动、关键帧、缓动/弹簧编辑、预览与撤销 | 支持 Motion API，开发环境需 Vite、Next.js、Nuxt、Astro 或 Webpack；不是当前 Python 静态服务的直接外挂；可视化编辑与自动写回源码的授权条件不同 | 若用户更重视直接编辑动画，可切换到这一创作路线；不必改成 React |
| **Rive：交互矢量动画编辑器 + Web runtime** | 在可视化编辑器里制作图形和动画，用状态机组织交互，再嵌入页面 | 需要实际 `.riv` 素材；Web runtime 涉及 WASM 与 Canvas/WebGL，资源、清晰度、输入同步和销毁都需管理 | 用于局部自定义图形，避免把整个框架改成画布 |
| **After Effects + Lottie：素材创作与导出** | 按时间线制作动画，导出 JSON / dotLottie，在网页中播放和验收 | 导出受特性兼容性限制；预制素材不能自动代替真实 DOM 布局协作 | 保留给低频、独立、需要专门美术制作的动画素材 |
| **Anime.js：SVG 与路径动画工具** | SVG 形变、线条绘制、沿路径运动 | 当前若采用 GSAP，不再为相同功能叠加另一个通用引擎 | SVG 形变成为明确核心需求时再比较 |
| **Chrome DevTools Animations：浏览器动画检查器** | 检查 CSS / WAAPI 等动画；拖动播放头、慢放、修改部分时间参数 | 可用于现有 WAAPI；Animations 面板不提供关键帧值/贝塞尔编辑，也不支持任意 requestAnimationFrame 动画 | 无需改引擎即可先检查当前动作 |

上述特性已核对官方文档；推荐顺序为本项目的适配判断，并非宣称工具已在项目中跑通。没有本轮许可价格比较，亦不引用网络上的旧价格。

## “放进来”应放在哪里

1. **创作与调试工具**：只进入开发或审阅流程。GSDevTools、Motion Studio 的面板不成为框架产品界面的一部分。
2. **播放引擎**：由一个受控的动画执行层适配。框架动作消费语义和权威状态，而不是每个组件随意访问全局时间线。
3. **动画素材**：Rive / Lottie 资源由贡献它们的组件或插件管理；宿主给出范围、动效设置和清理约束。

第三方工具里的“plugin”与本项目的“UI 小插件”不是同一层概念。GSAP 的第三方插件是引擎能力；本项目如正式引入动画提供者，仍需由工程会话按插件设计文档处理身份、版本、贡献权限、生命周期和接口。

本会话负责视觉候选、动作示例与验收要求。正式 SDK、内核事件、插件注册和其他插件的私有动画继续按既定职责交接。

## 建议的下一轮工作

- [ ] 沿用原 `animation-review.html`，选“固定侧栏内内容切换”作为首个统一比较场景。
- [ ] 用真实备份框架内容替换脱离场景的卡片示意，保持已认可的布局、图标和选中态。
- [ ] 先改一段为 GSAP timeline，接入独立 GSDevTools 实例，不接管全局时间线。
- [ ] 统一提供播放/暂停、定位时刻、慢放、倒放和重置，验证工具本身不会抢占框架输入或遮挡工作台。
- [ ] 候选风格比较使用相同输入与结果：区别落在焦点接力、遮挡关系、运动曲线和动作衔接，不能仅换时长和名称。
- [ ] 连续触发、途中反向、关闭动效和区域卸载均检查最终状态；不等待动画结束提交操作。
- [ ] 动态验收后，再决定是否需要 Motion 的真实手势弹簧或 Rive 的独立矢量素材。
- [ ] 用户认可候选后，输出完整风格规则和适配要求，交工程会话实现正式动画贡献合同。

这些是下一轮实施建议，本轮没有提前安装依赖或改变演示。

## 这一阶段的约束

- 所有创作和验证限于备份视觉框架，不读取废案产品 UI 作为设计参考。
- 动画只作用于获准的内部表现节点，谱面和工作台几何保持稳定。
- 区域开合、尺寸输入和布局状态先同步确定；不让真实布局追赶动画。
- 风格未来应允许动作编排/配方差异，不能只是一组不同 duration / distance 的 token；这是设计建议，尚未发布新 SDK。
- 普通操作与动画审阅分开；正式入口继续保持原有无动画基线。
- 停用、减少动效、失败、卸载均应有明确静态结果；插件不得绕过宿主偏好。
- 不出现页面级滚动条；调试 UI 不得遮住谱面工作台。

## 本轮完成与未完成

完成：审美技能复核、现有代码检查、官方工具文档调研、适配成本比较与下一轮顺序整理。

现有修改的验证已重新执行：

- 两个动画 JS 文件的 `node --check` 通过。
- `npm test --prefix design/frame-visual`：394 项通过，0 失败。
- Trellis `task.py validate 10-01-backup-frame-visual-polish` 通过，仅代表上下文清单校验。
- `git diff --check` 无空白错误；已有文件的 LF/CRLF 提示不是测试失败。
- 测试日志：`evidence/animation-validation-20261007.log`。

未完成：动画库接入、实际工具运行、连续性动态验收、风格选择、正式动画接口。

浏览器验收限制：本轮 in-app browser 控制工具初始化时报 `failed to write kernel assets`；5193 本地服务未处于监听状态。没有完成像素或实际手感验收，394 项代码测试不能替代这些验收。

## 官方参考资料

- GSAP Timeline：<https://gsap.com/docs/v3/GSAP/Timeline/>
- GSDevTools：<https://gsap.com/docs/v3/Plugins/GSDevTools/>
- Motion JavaScript animate：<https://motion.dev/docs/animate>
- Motion values：<https://motion.dev/docs/motion-value>
- Motion Studio：<https://motion.dev/docs/studio>
- Rive State Machine Overview：<https://rive.app/docs/editor/state-machine/state-machine>
- Rive Web runtime：<https://rive.app/docs/runtimes/web/web-js>
- LottieFiles for After Effects：<https://lottiefiles.com/plugins/after-effects>
- Lottie 导出流程：<https://docs.lottiefiles.com/en/integrations/after-effects/06_export/exporting-compositions-as-lottie>
- Anime.js SVG utilities：<https://animejs.com/documentation/svg>
- Chrome DevTools Animations：<https://developer.chrome.com/docs/devtools/css/animations>
