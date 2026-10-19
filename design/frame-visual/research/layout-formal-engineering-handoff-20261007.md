# 布局正式化工程交接 · 2026-10-07

用户已明确授权创建新工程会话，以 GPT-6.1 Sol / xhigh 补齐布局成为首个完整正式插件的工程缺口。本视觉会话继续现有布局的视觉/作者动画工作。仅在备份 UI 包推进，不参考或修改废弃产品 UI。

会话已创建并启动：**布局插件正式化｜公开接口与动画宿主**，`01a1154a-5b73-72c2-a98c-7d965e781eaa`，Local。下文“已有基础与实际缺口”是创建时快照；共享仓库已开始正式迁移，实时工程进展以同日工程结果文档为准。父视觉接口的 play 返回值必须包含 finished Promise，具体当前说明及14行为/55浏览器验收见视觉集成文档。

## 已有基础与实际缺口

- `src/features/workspace-layout-plugin.js` 已独立声明 frame.layout / frame.layout.page；`src/host/workspace-runtime.js` 通过同一平台装配；区域状态、编辑事务与几何继续由宿主持有。
- 当前备份 `defineUiPlugin` 仍只有 namespace/ui/commands/menuItems/shortcuts，不接收共同名称、版本、兼容声明或 animations；旧 API 事实不能冒充新协议已经完成。
- 布局读 layout/contents/actions/view，通过受限 ctx.execute 修改，但 factory/page 尚导入 host 实现路径的命令符号，需要稳定公开合同。
- `src/fixtures/motion-pilot/layout-motion-definitions.js` 和 coordinator/adapter 已验证实际消费作者定义、空值回退、预算、减少/关闭、中断/释放。版本 motion-review/2 仅审阅合同；动画样稿不是正式布局页面。
- 当前证据 `evidence/layout-motion-definitions-20261007/`：整包462、动画34、浏览器28、拖动专项124、作者/渲染对照53均通过；不可覆写。

## 并发边界

读取应用状态发现现有会话 **UI 插件包边界重构**（01a0f616-385e-7ea3-b9da-5f2ce6b978ac）正在实施统一平台迁移，任务为 `.trellis/tasks/10-05-shared-staff-score-readonly/`。正在修改公共身份/挂载协议、工作区装配、启动配置与相关构建链。这是并发事实，不授权访问或修改废弃 UI，也不授权擅自向该会话发消息。

新工程会话应先阅读当前迁移任务和公开产物，完成增量补齐。公共声明/版本的缺口必须由同一迁移链落实；不要另外建立平台、复制身份/授权/业务状态或并发覆盖其拥有的文件。需要共享接线时先提交可审阅的差异与接入说明到本交接的工程结果文档，待相关文件稳定后再做最小接线。

| 文件/职责 | 当前所有者 |
| --- | --- |
| 统一平台迁移、workspace-runtime / backup-ui-runtime / startup 构建、既有身份/挂载协议 | 现有 UI 插件包边界重构会话；新会话消费其正式公开出口 |
| 新增受限动画公共执行模块、预算/生命周期合同与工程回归；布局公开端口合同/出口 | 新工程会话，优先新增独立模块，避免覆盖迁移源 |
| workspace-layout-plugin.js / workspace-layout-page.js 的正式动画绑定与声明 | 新工程会话在迁移源稳定后最小接线；父视觉会话本轮不编辑两文件 |
| workspace-layout-visual.js、workspace-layout.css、布局私有动作定义/呈现模块、原动画页视觉、视觉证据 | 本视觉会话，工程会话不改外观/节奏/CSS；接入通过明确可选参数 |
| review-only coordinator / definition-contract / adapter | 已验证参考；新会话建立正式实现或复用公开模块；未经交接不修改原审阅链 |
| 正式工程验收说明 | 新会话写 `research/layout-formal-engineering-result-20261007.md` |
| 实际布局目标与视觉验收 | 本会话写 `research/layout-formal-visual-integration-20261007.md` |

你并非独自在仓库中；保留他人修改，不广泛 stage/commit、不撤销并发差异，不将未跟踪 design/ 整包提交。不得向其他会话发消息，除非得到用户直接授权。此新会话由用户明确要求创建，不是子代理。

## 工程完成条件

1. 核验迁移后的单一正式声明能表示共同身份、名称、插件版本与宿主兼容要求；共同必填非法拒绝，可选省略/null为空，有效0/false保留，提供非法条目拒绝。已由迁移完成的内容复用，不另写一份平行协议。
2. 收口布局确实使用的四个读端口与写命令：类型/单位/权限/缺失/拒绝/订阅释放明确，插件不 import host 私有实现文件，不得到 store/router/其他实例。
3. 正式可选动画贡献进入同一登记与生命周期链；宿主从已绑定身份取得定义，不接受作者冒领owner或任意DOM。作者拥有参数/曲线/变体，公共执行只处理许可、预算、系统/用户策略、冲突、取消与释放。完成回调不写业务。
4. 对正式布局页面开放窄执行端口和明确目标绑定；无贡献/无动画提供者时功能静态可用，非法/不兼容定义明确拒绝，失败到已接受结果并经现有诊断路径报告。不要为布局写名称特判或创建第二个动画注册器。
5. 先接布局实际页面存在的动作。原动画页中的两页签/三行排序是样稿，不得整页搬到正式设置或增加无用文字。实际动作/目标以视觉集成文档为准。
6. 通过两实例隔离、权限/版本/空值、共享提供者替换、失败/迟到、隐藏/恢复/释放、启动回滚与布局几何回归；正式预览入口实际装配证明不能用 unit 数量代替。

最终汇报逐项注明完成/待接线/阻塞原因及责任人，公开接口文件、使用示例、运行命令和真实接入证据。尚依赖平台迁移的部分不宣称全部正式化完成。无需扩张所有候选服务、安装发布系统、热重载或真实内核范围。

## 阅读入口

主稿 `plugin-design-v0.1.md` §7/11、当前 `plugin-authoring.md`、`workspace-layout-plugin-interface.md`、`motion-pilot-contract.md`、`research/layout-plugin-motion-next-steps-20261007.md`；窄规范 `.trellis/spec/frontend/ui-plugin-runtime-contract.md` 与 `frame-motion-definition-contract.md`；当前平台迁移任务的 prd/design/implement。
