# B4 插件平台独有增量集成收口

日期：2026-09-21，Asia/Shanghai。
用户批准继续后，本批由总协调直接实施和检查，只处理已约定的三个平台增量；
不创建 Trellis 任务，不派发其他任务或子代理，不推进 B5 或 main 晋升。

## 候选与范围

- Worktree：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
- 分支：`codex/integration-candidate-20260921`。
- 起点：B3 收口 `0f82dccc471a3e590f87ebfb6d5d262a65c75c6a`。
- 本批验证源码：`afed1d3c7938fc18938c35021f3c4783555d9e33`。
- 平台提取截止：`b23878d2b21833123e0306f1c1576932afef3c25`，
  不整支合并正式交付 `7d93aa81391cca120c5f33e36deb2b86fcc6c071`。

| 原提交 | 候选提交 | 本批内容 |
| --- | --- | --- |
| `1200e2c` | `dcca37c` | 分离本次会话选择、实际激活和下次启动意图，UI Host 使用明确的会话集合 |
| `8ea91f8` | `f55bafd` | 捕获 contribution 描述及回调，避免调用方后续修改改变固定会话 |
| `b23878d` | `afed1d3` | 持久化启动顺序、typed host binding 合同与 resolver、第一方清单和宿主装配入口 |

使用 `git cherry-pick -x` 按上述顺序重放，全部无冲突，无手工业务源码改动。
三个来源 trailer 完整，三对 stable patch-id 一致。

## 防覆盖核验

重放前，19 条目标路径在 B3 候选中与 `1200e2c^` 完全一致。
重放后，本批改动路径恰好是这 19 条，逐文件 Git blob 与 `b23878d` 一致。
这不是把平台正式交付整树复制到候选；混合提交 `7d93aa8` 未重放。

范围外文件均与 B3 起点一致，包括：

- Score 三份加固端口及对应测试，保留到 `717cdc0` 的保护。
- Agent 编排、dispose 修复、回归测试、两份边界文档及已有共享 fixture。
- Kernel、Desktop、公共 contracts、Agent 宿主 adapter、WorkbenchApp。
- 历史证据、manifest 和锁文件；本批新增报告和协作索引单独提交。

Git 比较之外，在组合源码上重新运行平台和消费者回归。
详细提交映射、19 条路径、52 个测试文件和日志哈希见
[B4 证据](2026-09-21-B4-platform-evidence.json)。

## 实际验证

以下均在 `afed1d3` 的干净候选源码上执行，不借用源分支或 B3 的测试结果。
复用候选 B2 按锁文件离线安装的独立依赖，没有新安装、跨工作树依赖复制、
锁文件修改或旧 native addon 复用。
Node v24.15.0，npm 11.12.1，根目录 TypeScript 5.9.3，
Workbench TypeScript 7.0.2。

| 检查 | 本批结果 |
| --- | --- |
| 平台直接修改的 7 个测试文件 | 60 passed，0 failed，0 skipped |
| B3 清单扣除上行重复文件，38 文件 | 321 passed，0 failed，0 skipped |
| 平台包、Kernel catalog/adapter、UI registry/scope 邻接测试，7 文件 | 26 passed，0 failed，0 skipped |
| Workbench 生产类型检查，含本地 TypeScript host build | exit 0 |
| Workbench TS 7.0.2 测试类型检查 | exit 0 |
| 根目录 TS 5.9.3 生产、测试类型检查 | 两项 exit 0 |
| 本批 `git diff --check` | exit 0 |

三份测试清单互不重复，共 52 个文件、407 项测试，0 cancelled。
包含 B3 全部 42 个测试文件和完整 Score 97 项回归；
执行前确认全部文件存在，并检查 12 个直接导入本批修改源码的测试均被覆盖。
这些单元/服务测试没有直接执行 React/Tauri 的真实启动界面。

测试前后均核验 11 个受保护引用未移动，四条原交付和 Agent 修复工作树干净，
85 个遗留文件共 1,006,766 bytes 与备份一致，旧 index 为空。
报告仅描述这些固定快照，没有查询或宣称其他任务的实时运行状态。

## 尚未完成

1. B5：Agent 正式宿主接线仍未切换到本批 resolver。
   `7d93aa8` 中获审的局部增量及身份修复 `4897de0` 仍待整合，
   不能因 resolver 自身测试通过就把完整身份边界视为已闭环。
2. 平台组件投影范围修复 `ec85c6b` 仍待按两文件增量整合。
   本批 scope 测试是当前候选原有用例，不包含该修复新增的六项回归。
3. Kernel 持久化校正文档 `3a7d870` 尚未纳入；
   不引入 `9640b6c` 的错误持久化判断。
4. 组合源码的可追溯 addon 重建、Workbench 全量、
   Desktop 打包和真实 GUI/E2E、完整环境验收仍未完成。

本批没有重跑 Rust workspace、Clippy、soak 或 Desktop Rust；
相关源码和锁文件未变，B1/B2 证据仍仅是历史结果。
全仓 fmt 既有阻挡、MSRV、多平台、真实断电和正式性能资格未处理。
不追认平台旧 `116/116` 回执的运行来源，也不以本批结果替代最终四线组合验收。

## 停止点

最后只新增本批两份报告并更新协作索引，另作纯文档提交。
功能测试固定指向 `afed1d3`，不称为在随后文档提交上重新运行。
main、原分支及旧工作树未修改，未 fetch/push、未清理、未发布共同开工基线。
B4 到此停止。下一批为 B5 的获审共享接线与独立修复，仍禁止整支合并平台旧链。
