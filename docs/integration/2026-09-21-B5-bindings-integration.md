# B5 宿主接线与组件权限集成收口

日期：2026-09-21，Asia/Shanghai。
本批由总协调直接实施和验证，不创建 Trellis 任务，不派发其他任务或子代理。
完成本批后停止报告，不发布临时开发基线，不推进 main 或重启四线开发。

## 候选与来源

- Worktree：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
- 分支：`codex/integration-candidate-20260921`。
- 起点：B4 收口 `454589d747c60aee5590248be212d7411c744271`。
- 本批实际验证源码：`863e9cb00d7f919f9da3d3ad2267ae043c991a6c`。

| 来源 | 候选提交 | 内容 |
| --- | --- | --- |
| `7d93aa8` 的获审宿主局部增量与身份修复 `4897de0` | `510f968cf5adcc456334e166e5672a3a41374e78` | 显式传入固定 session plan，以 scoped typed facades 解析宿主绑定，禁止调用者覆盖 resolver 身份 |
| `ec85c6b84ddb332985ecb44bcaf9ce5018288d8a` | `863e9cb00d7f919f9da3d3ad2267ae043c991a6c` | 每个 view 只能读取自身声明的投影；命令和扩展仍保留各自插件范围 |

第一项执行 `git cherry-pick -x 4897de0` 时，宿主 adapter 发生一处文件冲突：
来源父提交已有混合交付中的 resolver 接线，而 B4 候选保留 B2 adapter。
手工按已审范围补齐 scoped facades 和 resolver 调用，保留 B2 的显式 provider 参数类型，
并拒绝调用者版本与冻结 grant 不一致。没有整支重放 `7d93aa8`。

因此 `510f968` 的 patch-id **不等于** `4897de0`，不能称为原补丁等价重放。
最终宿主 adapter 和新增测试的 Git blob 均与 `4897de0` 一致；
WorkbenchApp 相对 B4 仅新增传入 `sessionPlan()` 的一行。
第二项无冲突、无手工修改，两份文件和 stable patch-id 均与 `ec85c6b` 一致。

## 防覆盖核验

本批业务差异恰好为五条路径：

- `apps/workbench/src/services/workbench-agent-plugin-host.ts`。
- `apps/workbench/src/workbench-app.tsx`。
- `apps/workbench/src/ui/plugin-manager.ts`。
- `apps/workbench/test/workbench-agent-plugin-host.test.ts`。
- `apps/workbench/test/ui-view-contribution.test.ts`。

其余文件与 B4 起点完全一致，保留 Score 到 `717cdc0` 的全部加固、
Agent 编排及 dispose 修复、完整回归与两份边界文档、Kernel 和 Desktop 源码。
平台边界文档也保留 B2 的 WorkflowRuntimeContext 说明，没有用平台旧文件覆盖它。
源码提交不包含锁文件、历史报告或原工作树的未提交内容。

测试前后核验 11 个受保护引用未移动，四条原交付及 Agent 修复工作树干净。
遗留保全校验仍为 85 文件、1,006,766 bytes，原文件不变、旧暂存区为空。
主目录仍有 21 modified、11 untracked，未清理或覆盖。
这些是文件和引用快照，不代表检查了其他任务的实时运行状态。

## 实际验证

以下结果均新执行于干净源码 `863e9cb`，不是借用独立修复分支的历史结果。
复用候选 B2 的隔离、锁定、离线安装；没有新增依赖安装或修改锁文件。
Node v24.15.0，npm 11.12.1；Workbench TypeScript 7.0.2，根目录 TypeScript 5.9.3。

| 检查 | 本批结果 |
| --- | --- |
| 平台直接回归，7 文件 | 60 passed |
| B3 保护清单扣除重复项，38 文件，含新增 view 范围回归 | 327 passed |
| 平台邻接回归，7 文件 | 26 passed |
| 新宿主绑定回归，1 文件 | 5 passed |
| Workbench 生产类型检查，含本地 TypeScript host build | exit 0 |
| Workbench TS 7.0.2 测试类型检查 | exit 0 |
| 根目录 TS 5.9.3 生产、测试类型检查 | 两项 exit 0 |
| 本批 `git diff --check` | exit 0 |

四份清单互不重复，共 **53 文件、418 passed、0 failed、0 skipped、0 cancelled**。
包括 B4 的全部 52 文件、Score 全部 97 项回归，以及本批新增的
5 项身份/授权回归和 6 项组件投影范围回归；所有测试路径在执行前检查存在。
具体命令、清单、来源适配和日志哈希见 [B5 证据](2026-09-21-B5-bindings-evidence.json)。

宿主测试覆盖冻结身份、typed read、拒绝调用者版本变化、不活跃插件、
contract/grant 版本漂移和缺失授权；组件测试覆盖子集/空权限、同插件兄弟 view、
权限捕获、快照绑定及 SDK 的固定会话行为。
这些单元/服务测试不等于真实 React/Tauri 启动或 GUI/E2E 验收。

## 正式环境剩余门槛

1. 校正并纳入 Kernel 持久化边界文档 `3a7d870`，保持现有桌面 durable save 链路的事实；
   不引入 `9640b6c` 的错误判断。C7 StaffProjection 遗留候选仍待处置决定。
2. 固定受支持的平台与工具版本，补齐完整依赖环境；从最终组合源码重建 native addon，
   记录准确 Git SHA、构建命令、目标平台和产物哈希，再执行全量组合验证。
3. main 晋升前逐项确认原主目录遗留内容的处置；已有备份不等于可以删除。
   技术验证通过后仍须汇总报告并获得晋升决定。
4. 晋升后，四线从同一个批准 SHA 各建独立 worktree 和分支，
   按一致版本准备各自可写依赖与输出，通过开工检查后再开发。

本批未重跑 Rust workspace、Clippy、显式 soak、Desktop Rust，也未重建产品 addon、
运行全量 Workbench 或完成 Desktop CLI 安装、打包、GUI/E2E。
B1/B2 的 Rust/Desktop 结果仅为历史证据，全仓 fmt 既有问题仍未处理。
MSRV、多平台、真实断电和正式性能资格未验收，不因 B5 通过而关闭这些缺口。

## 停止点

最后只新增本批两份报告、更新候选协作索引，作为单独文档提交。
测试结果固定指向 `863e9cb`，不称为在后续文档提交上重新运行。
main 未移动，未 fetch/push、未删除旧目录、未向其他任务发送开工指令。
B5 到此停止；下一阶段是正式环境准备和组合验收，不是恢复四线业务开发。
