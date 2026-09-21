# 遗留未提交内容归属审计

日期：2026-09-21，Asia/Shanghai。范围：四个旧工作树的 85 条文件记录。
状态：只做证据比对、归属登记和后续处置建议，不提交旧业务源码，不启动下一阶段。
本次复用 `codex/integration-preparation-20260921`，没有增加工作树。
原有 preparation/evidence 文档仍是各自阶段的历史快照，没有改写。

## 结论

**仍有未提交内容，但不等于还有 85 个文件需要补进产品。**
每条记录以“工作树 + 相对路径”计数，不是 85 个不同仓库路径，也不是 85 项新功能。
处置表覆盖全部 85 条，每条只有一个主责；“复核方”是后续建议，未派发任务或声称已完成交叉评审。

| 处置分类 | 条数 | 本阶段结论 |
| --- | ---: | --- |
| 与当前所选责任线版本整文件一致 | 15 | 不重复提交，旧副本仍保留 |
| 已被后续实现取代或加固的旧版本 | 30 | 不回灌，不覆盖现有实现 |
| 仅注释或空行差异 | 4 | 不是功能漏交付，不为此补一批业务提交 |
| 需要单独判断的混合增量 | 6 | `ce04` 的两组意图，只保留定向审查候选 |
| 历史 Kernel 任务及证据 | 8 | 不恢复为活跃任务，不借此重新授权旧阶段 |
| 已标记退役的旧原型 | 21 | 仅考虑历史保全，不恢复旧产品架构或设计 |
| 未提交的协调记录 | 1 | 原文保留，另行核对旧状态后再形成文档提交 |
| 合计 | 85 | 无遗漏、无重复归属 |

“已被取代”是差异审查结论，不等于字节相同，也不是删除许可。
以上没有一类授权 `reset`、`clean`、`stash`、删除工作树或整体暂存。

## 四处工作树

| 工作树 | modified / untracked / staged | 分类概况 |
| --- | --- | --- |
| 根目录 `main` | 21 / 11 / 0 | 14 重复、16 旧版、1 注释、1 协调记录 |
| `C:/Users/ATOM/.codex/worktrees/ce04/brilliant_guitar` | 12 / 12 / 0 | 1 重复、14 旧版、3 注释、6 待审 |
| `.worktrees/rkp-2-stage-6-semantic-canonical-authority-amendment` | 7 / 1 / 0 | 8 条历史证据 |
| `.worktrees/ui-standard-notation-v1` | 3 / 18 / 0 | 21 条退役原型记录 |

四处 HEAD、文件集合、暂存状态和原始字节指纹均以
`3a7d87074d0a833576bd7e908ce26a249682c38c` 中的
`docs/integration/2026-09-21-kernel-boundary-evidence.json` 为保护基准。
本轮开始和收尾按原 PowerShell 排序及 JSON 编码算法核对，不能用 JS 排序替换。
指纹见该证据和本次 comparison JSON，原目录不改动。

## 关键判断

### 根目录混合改动

- Desktop 七个文件及 Workbench client/host bridge 已与 Score `717cdc0` 相同。
  Agent 链已经携带 Score 基础，后续选定交付链一次即可，不能从脏主目录再补一份。
- 三个 Score service 和三个端口测试仍等同 `20bf15d`。
  必须保留 `3d71f63 -> 8ece0f3 -> 717cdc0` 的输入、上下文、结果绑定及异步前快照保护；
  其他分支碰巧匹配这些旧文件，不代表应采用旧版本。
- Agent 的旧 assistant/DirectRead/prepared-mutation/run-controller 不能覆盖 `cb918d0`。
  旧 assistant 使用宽宿主、可选 typed port、捕获异常后省略 prepared port；
  旧 controller 又用通用 capability adapter 补回 prepare。
  当前 Agent 交付采用显式 typed bindings、`UnavailableAgentPreparedMutationPort` 和 action/workflow 编排。
  旧 assistant 还存在删除类型 import 后保留相应类型引用的静态风险。本阶段没有运行其类型检查。
- `agent/score-change-set-port.ts` 本身已与 Agent 交付相同。保留兼容文件与重新启用兼容兜底是两回事，
  不能以“去重”为由顺便删除兼容层，也不能据此恢复生产消费者。
- Platform 的 SDK/platform 四个文件是 grants 初始版本，后续已有 session activation 和固定 contribution capture。
  四个 discovery/security/manifest/diagnostic 文件则已与 Platform 固定版本一致。
- `plugin-security.test.ts` 的独有差异只增加一行解释数组捕获的注释，没有新增断言。
- 旧平台边界文档等同混合提交 `7d93aa8` 的版本，缺 Agent action/workflow 已落地说明。
  文档主责仍为 Platform，Agent 复核事实，不能整篇用旧稿覆盖。
- `docs/repository-workspaces.md` 保留了重要汇报制度，但其中 2026-09-20 的 HEAD、测试数和
  Agent 副本读取限制已旧。保留原文，后续只做专门的文档核对，不连带暂存其余 31 个文件。

### ce04 遗留输入解耦

`ce04` 是 detached HEAD `837a22e`。不能把“没有整文件哈希命中”直接当成未交付功能：
主线已有 `3376d9a` 和 `49c1426` 等后续实现。

- `score-navigation.ts` 与 main `269112b` 整文件相同。
- `input-adapter.ts`、`input-context.ts`、`input-signal.ts` 只比主线少注释或空行。
- 其他旧编辑文件缺少当前 `insert-event/update-event/delete-event` 合同、应用层 intent 转换、
  只读 `NotationInteractionDirectory`、范围删除、组合取消、空小节 End/Shift 导航等后续实现或回归。
  不使用旧文件替换，不把 Score typed-port 任务扩大成整个编辑器负责人。
- 旧插件 Manifest 还是 API 2、`requires.capabilities`，不能覆盖 API 3、
  hostFeatures/hostServices、贡献捕获、扩展点和会话固定装配。

只留下以下两组定向审查候选，不把它们记成已验收修复：

| 组 | 文件数 | 保留的意图 | 处置主责 / 复核 | 停止点 |
| --- | ---: | --- | --- | --- |
| C6 | 2 | `plugin-manager.ts` 的组件级 projection reader 限制及 `ui-view-contribution.test.ts` 对应回归 | Platform / 总协调 | 当前 host 给 view 的是 plugin-scoped reader，SDK adapter 直接转交；现有 scope 测试只证明插件级限制。须先定向复现并确认组件级合同，再适配当前 API；本轮未复现、未修复 |
| C7 | 4 | 单独的 `StaffProjection` data/actions 合同及 StaffView/宿主接线 | 总协调保管 / Platform 评估接线边界 | 是未决架构方案，不自动批准 Projection Composer，也不自动指定实现负责人 |

C6 不能带回旧激活行为、删除 extensions 或整文件替换。
C7 涉及 `contracts/staff-projection.ts`、`components/staff-view.tsx`、
`ui/first-party-plugin-projections.ts`、`workbench-app.tsx`。
当前主线仍将 StaffProjection 别名指向 StaffViewProps，不能声称这个独立合同已被采用；
但旧稿仍引用 React `RefObject`、renderer 和 playback 类型，也不能仅凭注释称其已完成跨层解耦。
其宿主旧文件会丢失当前 Agent projection 和输入偏好，只能保留方案意图，不能搬整文件。

这四个文件由总协调保管待裁决，不代表总协调成为第五个业务实现任务。
用户指定的视觉设计任务不参与本报告，也没有向它索取进度或派发工作。
本节只核对历史工程残留，不评审当前视觉方案。

### Kernel 历史记录

RKP 工作树的八条记录全部是旧 `.trellis/tasks` 元数据或证据，没有待交付运行时代码。
七个文件已在 `f51bcfe` 的同路径树中找到完整相同版本。
剩余 `08-26.../task.json` 相比该重建提交，缺少后续 child/gate 信息，保留较早的待独立审查状态。
主线历史中还有 `bcc1c90` 的该任务归档，不应重新提交旧 active 状态。

历史 E3 规模、时间、内存和协议哈希只是记录中的旧证据，本轮未重新验证。
Kernel 负责解释证据，总协调负责处置；不创建 Trellis，不恢复 E3 或重开历史工作。

### 退役原型

旧 `ui-standard-notation-v1` 的 README 标明实现已于 2026-09-13 退役。
其工程是独立 Native V2 HTTP 宿主、`.score.json` 文件协议、旧浏览器插件和配套构建入口，
不能替换现有 Desktop ScoreSessionService、lossless `.bgp.json` 与恢复链路。
尤其不能把旧根级 `package.json`、lockfile、`.gitignore` 整体搬进主线。

本轮只将 21 条作为完整历史单元登记，未执行旧 UI、读取其视觉方案或开展视觉进度审查。
README 声称已有源码归档，本轮没有独立证明该归档完整性。
同路径 Git 比对未命中，也不能推导“绝无其他路径归档”。
因此继续原地保留，未来清理前必须另行核验可恢复的原始内容备份。

## 证据与限制

- `2026-09-21-legacy-comparison.json`：85 条原始 SHA-256、raw/LF Git blob、基线 blob、
  固定目标及同路径历史命中。仅 raw 或 CRLF-to-LF 全文件一致，不忽略 BOM、空白或注释。
- 机械比对结果：29 条命中固定目标、8 条仅命中同路径可达历史、48 条无上述命中。
  固定目标包含旧基础与混合交付，故这 29 条不等于上表 15 条“当前所选责任线重复”。
- `2026-09-21-legacy-disposition.json`：全部文件的唯一处置分类、主责、复核方、理由、
  候选 hunk 和禁止恢复项。编辑器未授权的新实现归属明确留空，不转嫁给 Kernel/Agent/Score。
- `2026-09-21-compare-legacy.mjs`：只读 Git/旧源码的比对脚本。
  默认输出 JSON，`--write-evidence` 只用 exclusive-create 写当前目录证据，已有文件会拒绝覆盖。
  它本身不替代独立的工作树状态/聚合指纹保护检查。
- 历史搜索限于审计时的可达 `--all` 引用及同路径，不遍历 reflog、悬空对象、其他路径源码副本或所有备份包。
  日后 refs 或旧文件变化可能改变输出，重跑必须与冻结证据比较，不能无条件更新本报告。
- 哈希清单不是内容备份，不能依靠清单恢复被删除的 untracked 文件。

本阶段验证：脚本语法检查；重算结果与冻结 JSON 一致；85/85 分类覆盖与数量检查；
85 条原始 SHA-256 复核；独立读取 `git show` 验证全部 143 次 raw/LF blob 命中；
四个旧工作树前后保护指纹核验；main 与正式交付/修复分支的九个固定引用核验；
七个交付/修复工作树干净状态核验（不包括仍保留混合改动的 main 工作区）；
仅新增审计文件的 staged diff 和 `git diff --check`。
比较命令的 exit 1 表示“有差异”，不当成测试失败或验证通过。

未运行业务测试、TypeScript 检查、Rust/Clippy、Native 构建或 UI/E2E。
没有恢复旧任务、修改交付源码、提交原始遗留文件、stash、清理、合入 main、fetch 或 push。
各模块历史测试数不能转记为本轮测试结果；G5 组合源码、新 addon 来源和全量验收仍未完成。

## 建议的下一小阶段

先对四处遗留内容作可恢复备份核验，再单独处理 C6 的组件级投影隔离判断和协调记录核对。
C7 的架构方案及实现归属继续等待用户决定；退役原型和 RKP 记录不进入业务集成队列。
备份、提取、旧文件处置和后续业务集成都不是本报告自动授权的操作。
本阶段只提交这四份审计文件，完成后停止汇报。
