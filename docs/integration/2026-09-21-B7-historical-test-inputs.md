# B7 历史测试输入收口

日期：2026-09-21，Asia/Shanghai。状态：本小阶段完成，根目录默认全量通过；
正式共同开发环境仍未验收，不晋升 main，不恢复四线开发。

修复及全量验证源码：`0f9b74a263e5fe633c207e63adb0f9198819e7bc`。
前一报告提交：`a9126582d351b7442ecc04140a81fc4336528638`。
本报告后续单独提交，不能称测试是在文档提交上重新执行。

## 本轮范围

B6 的 14 项失败来自六个测试文件读取未检出的历史工作流输入，
其中 RKP-3 还因本地归档目录不存在而错误地用旧规划 allowlist 检查当前 HEAD。
本轮只修改这六个测试文件，新增一个历史快照读取器及其回归测试，共八个文件。
`src/`、`crates/`、`apps/`、构建脚本、包清单、锁文件及 Rust 工具链文件未改。

- 历史输入从完整 40 位 SHA 指定的 Git commit 读取，不从本地隐藏目录回退。
  Git 查询关闭 replace objects，使用 literal pathspec；缺对象、非法路径、
  非普通文件或目录直接报错，缓存返回值不与调用者共享可变 Buffer/列表。
- 只把历史生命周期、matrix、ledger 等证据转为历史输入。
  当前业务源码、公共 API、原生桥接、fixture 和运行行为仍检查当前版本。
- RKP-3 历史范围检查固定到原验收区间；没有扩大 allowlist，也没有让
  当前工作区的新提交反向改变历史阶段的验收结论。
- RKP-2 PowerShell 历史预检在独立临时目录回放一份 `task.json`，
  保留正负断言并在结束时清理；没有创建、恢复或搬运 `.trellis`。
- 新回归在临时 Git 仓库验证本地修改、untracked 文件及后续提交不改变历史读取，
  并覆盖路径校验、缺对象、文件类型和缓存隔离。

六个原测试文件的 `test(...)` 声明数仍分别为 4、9、6、11、7、8；
部分声明循环生成用例，这些数字不是运行用例总数。
测试发现器和跳过条件未改，新增的读取器回归进入默认全量发现。

## 固定来源

| 历史输入 | 固定提交 |
| --- | --- |
| CVN-7 contract matrix、RKP-0 authority/ledger | `312fde925029a37917cc7465eb5dc56162b0dab6` |
| RKP-1 archived lifecycle 和已同步父状态 | `063b332dd48c05796fb3450a8004f42ff2148b20` |
| RKP-2 lifecycle、repair authority | `6d0956c970f4414cb61e0f3d7148672a6e635032` |
| RKP-3/RKP-4 lifecycle | `902eacd50422994898eca2a0eaaab924595b8ab7` |
| RKP-3 历史实现 diff | `78660bb63e249f7bbfec848b9b19e16d7dc55c25..560fd89d32026cdc41c3cf0df65285e99e015456` |

其他既有 Git 历史断言继续保留。因此环境仍须具备测试引用的历史 Git 对象、
Git 可执行文件和 PowerShell `pwsh`；只有源码文件的压缩包或缺少对象的浅克隆不等价。
本次关闭的是本地隐藏工作流目录依赖，不宣称已经消除全部历史仓库依赖。
可重复的开工预检应显式检查这些前提，不能缺失时静默跳过。

## 验证

执行目录为隔离候选 `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。

| 检查 | 结果和执行时点 |
| --- | --- |
| 首次聚焦七文件 | 提交前 88 passed / 1 failed；失败日志保留 |
| 最终聚焦七文件 | 提交前 89 passed / 0 failed/skipped/cancelled；随后原样提交为 `0f9b74a` |
| `npm.cmd run build` | 提交前 exit 0；全量命令中再次构建成功 |
| `npm.cmd run typecheck` | 提交前 exit 0；在固定提交 `0f9b74a` 上再次执行 exit 0 |
| `npm.cmd test` | 在 `0f9b74a` 上 exit 0；138 文件，926 项：924 passed / 0 failed / 2 skipped / 0 cancelled |
| 全量 test manifest SHA-256 | `1b1de2bf44a3a65c964ab6c17dcc1ceee92d741a959ca120d430487b723979e1` |
| 测试运行器记录耗时 | 212,643.8856 ms，不含外层 npm 构建时间 |
| `git diff --check` | 通过 |
| 业务源码与构建输入对比 B6 | 无差异 |

首次聚焦失败是 RKP-1 来源选在父状态尚未同步的归档时点，实际值仍是
`accepted_archive_pending_same_closeout`。沿历史确认并改用 `063b332`，
保留原 `accepted_archived` 断言，不修改 fixture 内容或放宽状态要求。

两项跳过都是原有行为：未启用 `--expose-gc` 的 FinalizationRegistry 用例，
以及须显式授权 `BRILLIANT_RKP2_RUN_SCALE_E2=1` 的 E2 压测。
本轮未启用它们，也不把普通全量通过称为正式性能资格。

全量命令显式设置候选自己的 Integrated 内容寻址副本：

```powershell
$env:BRILLIANT_INTEGRATED_ADDON_PATH = (Resolve-Path -LiteralPath 'target/kernel-commercial-addons/integrated-v2-09a2b1a563cd30f1d315e89db91554f965f0b6db29de7a2f2f7311ff4eb3124e.node').Path
npm.cmd test
```

三种 addon、Integrated 内容寻址副本及桌面 executable 均沿用 B6 产物，
本轮逐个重验大小和 SHA-256，与 B6 一致；六个锁文件/工具链文件 hash 也一致。
Rust 构建输入未变，但这不是本轮重建或重跑 Rust、Workbench、Desktop 专项测试的声明。
原生成 manifest 的 Git 来源自动记录机制仍待实现。

运行日志及 hash 见配套 JSON。日志保存在候选内忽略目录
`.local-evidence/integration-B7-20260921/`，不是仓库提交内容或异机备份。

## 保全与停止点

本轮重新执行 `node docs/integration/2026-09-21-preserve-legacy.mjs --verify` 成功：
85 文件、1,006,766 bytes，原文件/备份/恢复副本一致，四处 index 为空。
B1 清单中的 11 个保护引用全部匹配。main 和本地 origin/main 仍为
`269112b2d85e01827e8cb81bdcc5b671afde4303`；未 fetch，未核验远端最新状态。
主目录仍是 21 modified / 11 untracked / 0 staged，未清理或覆盖。

本轮没有 merge、rebase、reset、stash、push、清理旧工作树、派发任务或创建 Trellis。
八文件修复与本报告分开提交，完成本小阶段即停止。

正式环境剩余门槛：既有 `session.rs:389` fmt 问题、Kernel 持久化校正文档
`3a7d870` 的获审局部纳入、可重复的工具/历史对象/产物来源预检、约定范围内的
真实启动验证。主目录遗留处置、C7 StaffProjection 裁决与 main 晋升仍需单独决定。
后续四线仍须从同一个已批准 SHA 创建独立分支和 Worktree，不从当前候选自动开工。
