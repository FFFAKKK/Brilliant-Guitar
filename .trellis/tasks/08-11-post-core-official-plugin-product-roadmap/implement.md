# Post-Core 官方插件与产品路线执行计划

## 0. 当前交接状态

- 本父任务状态固定为 `planning`。
- 当前直接动作仍是完成 CVN-2 独立实现复审、提交、验收和归档。
- post-Core 生产动作等待 CVN-0 至 CVN-7 全部独立验收归档。
- 本父任务不是实现 target；每个交付物都由未来独立 child task 拥有。

## 1. 当前规划工件收尾

1. 完成 `prd.md`、`design.md`、本文件和三份 research。
2. 窄同步产品父 PRD、产品 task 和 Core VNext durable roadmap。
3. 为 implement/check JSONL 添加真实上下文。
4. 运行 Trellis、JSON/JSONL、引用、保护路径、diff、Core 基线验证。
5. 进行独立规划复审；P0/P1/P2 必须收敛为 `0/0/0`。
6. 创建一个规划提交，不运行 `task.py start`，不归档长期父任务，不推送。

## 2. post-Core 总激活门

操作者在创建第一个 child 前逐项验证：

- [ ] CVN-0～CVN-7 task 均为 `completed_archived`；
- [ ] Core VNext 父任务记录最终 28 命令；
- [ ] CVN-7 兼容、可靠性、性能和规模证据已接受；
- [ ] GD-0 仍是 Guitar Domain 权威架构合同；
- [ ] 本父任务规划复审通过且无后续未解决修订；
- [ ] 用户明确批准创建 Guitar Domain child；
- [ ] 选择的实现基线是最终接受的 CVN-7，而不是本规划分支或历史候选。

任一项未满足时，记录依赖状态并保持 post-Core 任务未激活。

## 3. 子任务创建通用协议

每次只创建一个直接依赖满足的 child：

1. 从最新接受依赖线创建 `codex/<child-slug>` 分支和独立工作树；
2. 使用 `task.py create ... --parent 08-11-post-core-official-plugin-product-roadmap`；
3. task 保持 `planning`；
4. 先完成只读现状/差距审计；
5. 编写收敛的 PRD、design、implement；
6. 在 PRD 和 implement 中写出 commit 级依赖，而不依赖任务树顺序推断；
7. 固定生产/测试/fixture/文档文件白名单；
8. 配置 implement/check JSONL；
9. Trellis validation 和独立规划复审通过；
10. 用户批准后才执行 `task.py start`；
11. 实现、独立检查、接受、归档完成后，再评估下一个 child。

所有 child 必须保持：一个谱面真相、一个 CommandBus/transaction/history/replay/event owner、模块读取冻结数据、模块写入语义化、未知 extension 保真。

## 4. Child 1 — Official Guitar Domain V1

建议 slug：`official-guitar-domain-v1`。

### 实施前研究

- 对照 GD-0、CVN-2/6 最终 API 和 `brilliant-score-1`；
- 固定 Guitar extension namespace/schema；
- 固定标准六弦 tuning、string/fret 到 WrittenPitch 映射；
- 固定首批 slide/bend/vibrato 数据、验证、显示/播放语义接口；
- 确认 score/Part owner 与稳定实体 ID 映射满足第一版规模。

### 交付

- 官方 Guitar contribution；
- 领域命令、decoder/preparer/effects；
- validator/classifier；
- extension codec/migration；
- fixtures、undo/redo/replay/unknown-module tests；
- 无 UI 的官方模块集成证明。

### 退出门

- Guitar 命令与 Core 命令共享一个原子事务；
- WrittenPitch 与 Guitar extension 同步提交和回滚；
- 缺失 Guitar 模块时 extension 数据保持；
- 独立验收归档。

## 5. Child 2 — `.bgp` File Contract and Persistence V1

建议 slug：`bgp-file-contract-persistence-v1`。

依赖：Guitar Domain 数据合同接受；Core codec/migration 已关闭。

交付：manifest/score/extension 物理包合同、原子保存、打开、自动保存、恢复、fixture、版本兼容和文件级 report。保持 Persistence 只拥有 IO，不重定义谱面语义。

退出门：Guitar fixture 可保存、关闭、重开；保存失败保护原文件；未知 extension 和已声明资源有明确保留结果。

## 6. Child 3 — Layout Primitives V1

建议 slug：`layout-primitives-v1`。

依赖：Guitar Domain、Core snapshot/address。

交付：五线谱/六线谱共同布局 primitives、分页/系统/小节/事件/技巧布局、稳定来源地址、hit areas、确定性 golden fixtures。保持布局与具体 DOM/Renderer 解耦。

退出门：同一 snapshot 重复布局深度相等；坐标命中只生成语义目标；布局数据不写回文档。

## 7. Child 4 — SVG Renderer V1

建议 slug：`svg-renderer-v1`。

依赖：Layout、Guitar 显示语义。

交付：SVG 首发 adapter、基础五线谱和六线谱、首批技巧、selection/cursor overlay 接口、视觉 golden。第三方渲染库对象保持在 adapter 内。

退出门：四小节 fixture 可重复渲染；双谱表源自同一事件；视觉对象不进入 Core、文件或命令 payload。

## 8. Child 5 — Playback Validation V1

建议 slug：`playback-validation-v1`。

依赖：Guitar Domain、Core musical time。

交付：播放事件生成、开始/暂停/继续/停止、基础速度、节拍器、播放光标时间源和确定性事件测试。

退出门：事件可从 snapshot 重建；播放状态不修改谱面；四小节 fixture 可完整校对。

## 9. Child 6 — Workbench and Editor Session V1

建议 slug：`workbench-editor-session-v1`。

依赖：File/Persistence、Layout、Renderer、Playback、Guitar Domain、Core commands。

交付：Desktop/Workbench 入口、Editor Session、cursor/selection、Input Controller、命令面板、快捷键、属性检查器、状态栏、打开/保存/恢复绑定、播放 transport/cursor 绑定、未来 Export contribution port、简中/英文和可读错误定位；同时唯一拥有 Application Assembly、官方 Core/Domain/service-provider 目录、稳定 session identity/assembly fingerprint 和原子 `ready | failed` 装配结果。

退出门：用户仅使用键盘可完成四小节核心编辑、保存重开和播放校对；所有谱面改变映射到已注册语义命令；UI 会话状态不持久化到 ScoreDocument；缺失、重复、不兼容或初始化失败的 required provider 发布零会话和零部分目录；成功装配深冻结 provider 集合，ready 后无法改变贡献集合。

## 10. Child 7 — PDF/PNG Export V1

建议 slug：`pdf-png-export-v1`。

依赖：Layout、Renderer、已接受的 Workbench contribution API。

交付：页面模型、PDF/PNG 输出、Workbench 调用 contribution、忙碌/进度/结果、golden fixture 和失败状态隔离。

退出门：代表性 Guitar fixture 生成可读 PDF/PNG；导出失败保持文档、history、dirty 和文件状态。

## 11. Child 8 — Guitar Core Loop Integration V1

建议 slug：`guitar-core-loop-integration-v1`。

依赖：Child 1～7 全部接受归档，其中 Child 6 已提供 accepted Application Assembly，Child 7 已提供 accepted Export provider。

唯一验收旅程：

1. 启动应用；
2. 新建标准六弦吉他谱；
3. 设置标题、作者、固定 tempo 和 4/4；
4. 用键盘输入四小节 riff；
5. 添加首批技巧；
6. 检查六线谱与五线谱同步；
7. 播放校对；
8. 保存 `.bgp`；
9. 关闭并重新打开；
10. 验证数据、技巧、布局和播放一致；
11. 导出 PDF 和 PNG；
12. 重复自动化旅程并比较确定结果。

该 child 只调用 Child 6 已接受的 Application Assembly contract/factory，以 Child 1～7 的 accepted providers 构造新的 ready 产品会话，然后完成产品级 wiring 和纵向旅程；它不修改既有 ready assembly，不重新设计装配机制，也不扩展单模块功能范围。

## 12. Child 9 — Product Release Qualification V1

建议 slug：`product-release-qualification-v1`。

依赖：Guitar Core Loop 接受。

交付：产品级性能/兼容矩阵、Windows 安装/启动/文件关联、开源仓库文件、版本/变更日志、第三方声明、发布清单、已知问题和恢复说明。

退出门：Core、官方模块、文件、视觉、播放、导出和安装证据全部通过；首个产品发布候选可复现。

## 13. Child 10 — Public Extension Platform Planning V1

建议 slug：`public-extension-platform-v1`。

依赖：产品资格门接受，并有官方模块/宿主合同的真实运行证据。

该阶段先规划再决定实施拆分，至少覆盖：

- 普通用户：主题、快捷键、模板和命令配方；
- TypeScript 作者：谱面 overlay、只读分析、语义命令；
- 后续版本：菜单/工具栏/面板、Importer/Exporter、Renderer/Playback Adapter；
- SDK、脚手架、示例、TestKit、版本和兼容矩阵。

该 child 还必须明确 Extension Host 对发现、manifest、授权、事件过滤、异常隔离和贡献映射的唯一所有权；公共插件不直接访问 raw Registry、裸事件总线或可变 ScoreDocument。该 child 只形成可复审的平台规划和后续实施拆分，不在父任务中顺带实现 SDK/runtime。

公共 API 只从已验证的官方合同提取，避免创建与官方模块平行的第二套平台。

## 14. 每个 child 的最低验证集合

- task/parent Trellis validation；
- strict TypeScript typecheck；
- build；
- owned unit/focused tests；
- 完整回归；
- fixture/golden/round-trip（按模块类型）；
- dependency boundary scan；
- `git diff --check`；
- 保护路径核对；
- 独立实现复审；
- 接受、归档和父路线同步。

## 15. 回滚点

- 规划错误：保持 task 为 `planning`，只修正 PRD/design/implement 后重新复审。
- 实现偏离合同：回到最近接受依赖，不吸收未验收 child。
- 模块需要 Core 新能力：停止 child，创建独立 post-CVN-7 Core 演进 gate。
- 集成暴露产品合同缺陷：返回拥有该合同的 child，修复并独立复审，再重新运行集成。

## 16. 当前操作者指令

1. 继续 CVN-2 独立实现复审；
2. CVN-2 接受归档且其工作树干净后，在创建 CVN-6 前准备统一基线：该基线必须同时包含 accepted CVN-2 实现提交和本规划分支 HEAD；不得把本规划分支合入未提交 CVN-2 候选；
3. 在统一基线上验证两条提交祖先、父子引用唯一、规划任务仍为 `planning`、相对 accepted CVN-2 的生产路径零额外差异以及完整 Core 回归；
4. 从该统一基线规划/实施 CVN-6；
5. CVN-6 接受后，与既有 CVN-3/4 一起解锁 CVN-5；
6. CVN-0～6 全部接受后实施 CVN-7；
7. CVN-7 归档后返回本父任务；
8. 用户批准后只创建 `official-guitar-domain-v1`；
9. 不直接启动本父任务或后续公共插件任务。
