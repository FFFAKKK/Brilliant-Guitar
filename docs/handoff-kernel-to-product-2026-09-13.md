# 项目状态与产品设计交接 · 2026-09-13

交接整理跨过午夜；最近业务验证记录日期为 2026-09-12。

## 本次交接目的与权限

用户准备在其他会话开始“两个插件”的设计。本记录按当前上下文将它们理解为：

1. **UI／工作台模块**：操作入口、编辑上下文、谱面视图和反馈。
2. **正式吉他业务插件**：弦品、调弦和后续吉他语义，与 Core 编辑共同提交。

这是待设计的职责划分。UI 究竟是宿主内建模块、可替换插件，还是两者组合，
尚未定案；不能把这份交接当作“整个 UI 必须放进 Wasm”的决定。
下一会话先做设计：明确职责、接口、首个切片、验收场景和未决选择。
本轮仅记录状态，不启动这两部分的实现，不恢复无限期内核优化。

## 当前结论

**Rust 微内核已具备进入真实产品集成设计的基础，最小吉他业务流程已实测通过；
尚不具备商业发布资格，也没有完成可供用户操作的最小产品。**

微内核负责基础乐谱数据、增删改查、身份与完整性、原子事务、历史和安全扩展。
技巧、反复结构和乐器特有规则按需由多级插件承担。不要为了“功能全面”继续
把这些业务语义塞入 Core，也不要将所有商业加固都作为开始产品设计的前提。

## Git 与工作区快照

以下是写入本交接文档**之前**的已核实位置；后续文档提交会推进 master。

| 用途 | 路径 | 分支与基线 |
|---|---|---|
| 当前集成基线 | `E:/desktop/brilliant_ideas/brilliant_guitar` | `master`，`3e0148b57711a96ff413f07e544cb1549bd3c264` |
| 内核工作区 | `.worktrees/kernel-commercial-completion` | `codex/kernel-commercial-completion`，`c49827d9fb5bf2b565f161b56441eff455662b9b` |
| UI 历史设计工作区 | `.worktrees/ui-design` | `codex/ui-design`，`f22d141ab332a7036e3c18e296aed6dc7cb7477a` |

三个工作区检查时均干净。内核分支尚未包含 `3e0148b` 的新增业务测试。
UI 与 master 分叉，当前双方独有提交数为 **29 / 1**；UI 的 package 和任务元数据
仍有旧 TS／`codex/learning` 基线信息。新开发以届时最新 master 为基础，
选择性复用 UI 设计资产，不能直接用旧 UI 代码覆盖主线。实际变更前重新检查 Git。
本会话仅作本地提交，没有推送远程。

历史标签、恢复 bundle／ZIP、`.repo-archive/`、`.local-evidence/` 和现有 worktree
均须保留。不要将所有历史目录视为缓存；整理依据见 `repository-maintenance.md`。

## 内核已实现的能力

- 27 个 Core 叶命令与 Batch；基础编辑、查询与快照。
- Rust 持有统一文档、原子事务和历史：拒绝回滚、撤销重做、事件、dirty／保存检查点、重放。
- 插件身份、命名空间、权限和版本检查；Core 与插件效果共同提交、验证和进入历史。
- 插件扩展数据保存与未知数据保留；显式的独立扩展迁移。
- 受限 Wasm 执行和真实贡献者绑定；显式声明的跨插件数据读取。

现有公共合同保持冻结，不因产品接入任意改动：28 个 Core 命令入口、51 个应用运行时导出、
SDK V1 的 8 个运行时导出／34 个类型／9 个 ABI 字段，以及七个 Rust crate 的边界。

### 必须显式启用 Rust

当前默认入口仍有旧 TS 路径。普通 `CommandBus.create()` 不能证明运行了 Rust。
宿主通过 `installNativeIntegratedBackendV2(addon)` 选择后端，在选择期间调用
`CommandBus.createIntegrated(document, catalog)`；恢复选择不会改变已创建会话的后端。
代码入口：`src/core-kernel/native/integrated-command-bus.ts`。

Wasm 的宿主绑定入口为 `src/native-host/wasm-bindings.ts`。
三个 Node addon 必须分别构建和保存：`target/rkp-1-node/`（Core V1，5 入口）、
`target/integrated-v2/`（组合会话／迁移，7 入口）、`target/wasm-v1/`（再加 Wasm，8 入口）。
UI 的最终运行环境及其与 Native 会话的通信方式尚需设计；现有 Node addon 不能直接装进浏览器页面。

### TS 归档的准确含义

旧 TS **事务引擎开发线**已冻结，并有归档标签／恢复包；不是删除全部 TS 代码。
TS SDK、类型、codec、共享校验、Native／Wasm 适配仍是 Rust 路径所需的活跃依赖。
不要恢复旧引擎功能开发，也不要整体删除 `src/core-kernel` 或共享的 `integrated-runtime.ts`。
具体边界见 `archive/typescript-kernel.md`。

## 最近的真实业务验证

提交 **`3e0148b`** 仅新增测试消费者、业务流程测试和说明，没有修改生产内核。

场景：新建四拍空白谱 → 新增音符并写入弦品 → 修改弦品与音高 → 撤销／重做 →
删除并清除插件引用 → 实际保存 `score.json` → 新 Rust 会话重开 → 再编辑／撤销。
测试还验证 8 项非法编辑被拒绝且不改变文档、历史或事件，并保留未知插件数据。

- 严格 TypeScript 构建通过，聚焦业务测试 **1/1** 通过。
- 完整 Node 回归 **833 项：831 通过、2 跳过、0 失败**，耗时 86,492.8376 ms。
- 全量日志：`.local-evidence/minimal-guitar-flow/full-node-tests.log`。
- 该全量运行的保存文件和结果：`.local-evidence/minimal-guitar-flow/run-GFbDVm/`。
- Rust 源码未变，本轮没有重新跑 Rust 单测；此前 Rust 验证来源见既有 evidence，不冒充本轮结果。

测试消费者位于 `test/core-kernel/fixtures/minimal-guitar-module.ts`，只覆盖标准六弦、
0–24 品和吉他八度移调记谱。它不是正式 Guitar Domain 产品，也不是安装式插件包。
文件测试是同一 Node 进程内新建会话，不覆盖进程崩溃恢复、原子覆盖、`.bgp` 包装或持久化撤销历史。
复现命令及完整证据边界见 `kernel-minimal-business-flow.md`。

## 尚未完成的事项

| 范围 | 未完成内容与对下一阶段的影响 |
|---|---|
| 可操作产品 | UI、正式吉他插件、宿主文件服务尚未集成；这是下一阶段的主线 |
| 扩展完整性 | 缺失依赖时自动降级组装、依赖闭包和精确调度仍需完成；当前显式读取 catalog 缺少 provider 会拒绝编译 |
| 商业可靠性 | 整笔事务资源计量、长时／敌对负载、故障验证、跨平台与大文档性能资格尚未完成 |
| 运行路径收口 | Rust 产品入口与默认切换、共享 TS 服务拆分及旧执行路径退役尚未完成 |

下一阶段可先使用明确固定的插件组合。遇到实际集成阻塞时做最小内核修复，
不把下一轮设计扩大成重新审计全部内核或建设完整公共插件市场。

## 已有 UI 材料应如何继承

首先阅读 `.worktrees/ui-design/.trellis/tasks/08-29-ui-design-foundation/` 中的
`prd.md`、`frontend-plan.md`、`user-flows.md` 和 `design.md`。
这些是**设计材料**，不是实现进度或自动获批的完整方案。

现场核实的当前状态：用户否定了旧布局候选，主要反馈是“常用功能不好找”；
新视觉候选仍未接受。当前要求先梳理整体前端框架，再填模块细节，旧图不能作为定稿直接实现。
既有设计强调主流程、功能发现性和扩展位置。下一会话应从当前材料中的确认记录出发，
区分已确认流程、方案建议与未决问题，不逐项重问已有决定。

## 建议的下一轮设计产出

1. 明确 UI／工作台、吉他业务、宿主服务和 Core 的职责图，确定“两个插件”的实际边界。
2. 定义首个用户闭环及各层接口：新建／打开 → 定位 → 写入和修改 → 撤销重做 → 保存重开。
3. 定义正式吉他插件的最小数据和命令合同，包括音高与弦品一致性、调弦、引用生命周期，
   并明确哪些高级业务延后；不能直接把测试夹具命名空间当成生产格式发布。
4. 定义 UI 会话状态和反馈：选区、编辑目标、视口等独立于 `ScoreDocument`；
   乐谱写入统一走 Rust 命令，不在 UI 里建立第二套文档真相或撤销历史。
5. 明确宿主 Native 通信和文件服务接口，分出真实保存与恢复的验收要求。
6. 给出小步实施顺序、每步可运行验收场景和真正需要用户决策的事项，再开始实现。

## 成本与执行习惯

用户要求控制模型成本。默认由主会话直接完成，不自动启动昂贵审计或子代理。
无需重复创建 Trellis 任务，可沿用本交接及现有设计文档；遵守相关代码合同即可。
已通过且源码未变的验证不要为了交接再次全量重跑。授权范围内的小步骤直接推进，
不要反复请求同一项许可；设计讨论本身不等于全部方案已批准实现。

## 推荐阅读顺序

本文件 → `kernel-minimal-business-flow.md` → `kernel-native-integrated-v2.md` →
UI 的 `prd.md`／`frontend-plan.md`／`user-flows.md` → 按设计问题读取
`kernel-contribution-reads-v1.md`、`kernel-wasm-executor-v1.md`、`kernel-extension-completion-plan.md`。
`kernel-commercial-completion.md` 含大量历史阶段记录，查看时必须区分初始诊断与当前进度。

若新会话时源码已经改变，先刷新实际 Git 状态和受影响内容，再使用这里的历史验证结论。
