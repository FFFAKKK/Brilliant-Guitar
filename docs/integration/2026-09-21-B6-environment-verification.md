# B6 正式环境首轮核验

日期：2026-09-21，Asia/Shanghai。状态：首轮构建与测试已收尾，正式环境尚未验收。
验证源码为 `a391a8636d020e02a6bc94c5116adfacaf732e8d`，不是本报告后续提交。
本轮没有修改业务源码、降低断言、创建 Trellis、派发任务或晋升 main。

## 结果

| 检查 | 本轮实际结果 |
| --- | --- |
| Rust workspace，all features，locked/offline | 667 passed，0 failed，2 ignored |
| Workspace Clippy，all targets/features，`-D warnings` | exit 0 |
| release 模式显式 10,000 次 submit/history/checkpoint soak | 1 passed，399 filtered out，测试执行 1.26 秒 |
| Core V1、Integrated V2、Wasm V1 addon | 从同一候选源码分别构建成功，分开保存并核对哈希 |
| Workbench 全量，使用新 Integrated V2 | 615 passed，0 failed/skipped/cancelled |
| Desktop CLI 独立锁定离线安装 | 成功，CLI 2.11.4 可执行 |
| Desktop Rust | 65 passed，0 failed/ignored |
| Tauri release，`--no-bundle --ci -- --locked --offline` | 成功，含 Workbench 类型检查及生产资源构建 |
| 根目录 `npm test`，三种 addon 齐备 | 137 文件；909 passed，14 failed，2 skipped；exit 1 |
| Workspace fmt | exit 1，仅既有 `session.rs:389` import 换行 |
| 用户要求重试的遗留备份复核 | 85 文件、1,006,766 bytes，原文件/备份/恢复副本一致，四处 index 为空 |
| 11 个保护引用 | 全部仍匹配 B1 的固定引用清单 |

不能把这些结果合称“全量通过”。Desktop executable 构建不等于安装包、签名、
真实 GUI/E2E、真实断电、多平台或 MSRV 资格。构建未启动桌面程序。
Workbench 构建仍有大于 500 kB 的 chunk 警告，本轮未改打包策略。

## 环境和产物

- Windows x64，系统版本 `10.0.26200`；Rust host `x86_64-pc-windows-msvc`。
- Node `v24.15.0`，npm `11.12.1`，Rust/Cargo `1.97.1`。
- 根 TypeScript `5.9.3`，Workbench TypeScript `7.0.2`；未统一或升级包版本。
- 根和 Workbench 依赖沿用候选在 B2 的独立锁定离线安装；本轮新增 Desktop 安装。
  三处均禁用 npm install scripts；本轮实际生产构建通过，不据此保证所有其他脚本场景。
- 所有 native 和 Desktop 构建输出均位于本候选自己的 `target/`。
  没有借用其他任务的可写依赖或运行产物。

| 产物 | bytes | SHA-256 |
| --- | ---: | --- |
| `target/rkp-1-node/brilliant_kernel_node.node` | 3,605,504 | `c6ba5579075daecdfdf52a23c4c82b69a8f289e7089430d7f470844736d81f9f` |
| `target/integrated-v2/brilliant_kernel_node.node` | 5,046,784 | `09a2b1a563cd30f1d315e89db91554f965f0b6db29de7a2f2f7311ff4eb3124e` |
| `target/wasm-v1/brilliant_kernel_node.node` | 6,279,680 | `ce88cf155056e4a11ee0cb923e3c3b7d8ad603f49ea895b1cad53158d2a2191b` |
| `target/desktop-formal/release/brilliant-guitar-desktop.exe` | 20,896,256 | `3b203b683532390c43219f58138c178666bc48a7277f696798fb417baf186132` |

Integrated V2 同时保留内容寻址副本。构建顺序为 Integrated、Core、Wasm，
每次在下一种 feature 构建前保存对应副本；测试期间没有覆盖所加载的 addon。
现有自动生成的 addon manifest 仍不包含 Git SHA，本报告和 JSON 只补齐本次运行的来源关联，
**不表示可复用的产物来源检查机制已经实现**。

Tauri 构建后 `Cargo.toml` 出现 stat/EOL 状态提示，但规范化内容 hash 与 HEAD 均为
`ff385c1d8bf2accf22975dab92f452099aa3404a`，`git diff --quiet HEAD --` 为 exit 0。
没有因此回滚文件或把它作为业务改动暂存。

## 失败定位

首次 `test:kernel-commercial` 已成功重建 Integrated V2，但 Core/Wasm 路径缺产物。
首次 Workbench 全量为 555 passed / 60 failed：部分宿主测试在
`apps/workbench/host/score-session.ts` 直接加载固定的 `target/integrated-v2` 路径，
不读取传入的 `BRILLIANT_INTEGRATED_ADDON_PATH`。将本候选同一新产物复制到此前不存在的
默认路径并核对哈希后，Workbench 重跑达到 615/615。两次失败日志均保留。

三种 addon 齐备后的根目录全量仍有 14 项失败，当前报错分布：

| 文件 | 失败项数 | 当前最早失败位置 |
| --- | ---: | --- |
| `cvn-7-contract-trace.test.ts` | 1 | 忽略目录下的 parent feature-contract matrix 缺失 |
| `rust-migration/oracle-manifest.test.ts` | 2 | CVN-7 failure ledger、RKP-0 archive authority 缺失 |
| `rust-migration/rkp-1-workspace-contracts.test.ts` | 1 | RKP-1 archived task.json 缺失 |
| `rust-migration/rkp-2-workspace-contracts.test.ts` | 7 | 历史 active/archive authority 和 repair metadata 缺失 |
| `rust-migration/rkp-3-workspace-contracts.test.ts` | 2 | lifecycle root 缺失；据此退回比较旧 planning HEAD 到当前 HEAD，触发过时 allowlist |
| `rust-migration/rkp-4-workspace-contracts.test.ts` | 1 | 历史 active lifecycle authority 缺失 |

这些报错显示默认测试依赖未随候选检出的历史工作流状态。当前没有观察到剩余业务断言失败，
但前置断言失败后的检查尚未执行，不能宣布除此之外绝无问题。
没有批量复制 `.trellis`、`.agents`、`.codex`，没有复活旧 active 任务、
扩大 allowlist、修改测试发现器或人为跳过失败项。两项 skipped 为现有测试行为。

后续建议单独处理测试可重现性：把确需验证的历史输入绑定到可追溯的固定 Git 快照或版本化
fixture，历史 diff 检查绑定其原验收区间；保持产品回归和历史证据检查均可发现、可失败，
不能用一套隐藏的个人任务目录充当新工作树的公共依赖。本轮尚未实施此调整。

## 保全和审批

前次 Kernel 文档 cherry-pick 的审批服务失败，未执行。
本轮首次备份核验因沙箱身份的 Git ownership 检查受阻，随后审批也返回 403。
用户要求“再试试备份复核”后，相同 `--verify` 在获批身份下成功：
`sourceFilesUnchanged: true`、`indexesEmpty: true`。未修改全局 Git 安全设置。
这份成功结果是本轮实际复核，不是借用 B5 历史记录。

main 和本地 origin/main 仍为 `269112b2d85e01827e8cb81bdcc5b671afde4303`，
未 fetch，不能称服务器最新。主目录仍有 21 modified / 11 untracked，index 为空。
原工作树、分支及保全资料均保留；未合并、变基、清理、推送或发送开工指令。

## 停止点

本轮仅新增核验报告和证据、更新候选协作索引，单独提交文档后停止报告。
测试结果固定在 `a391a86`，不称为在文档提交上重新执行。

正式公共基线仍未发布。余项包括：上述历史测试依赖、既有 fmt、Kernel 持久化校正文档
的获审增量纳入、可重复的环境/产物来源预检、约定范围内的真实启动验证，以及主目录遗留
处置和 main 晋升决定。C7 StaffProjection 继续保管待裁决，不借环境整合采用新架构。
四线下一阶段仍须等统一基线获批，再各自使用独立分支和 Worktree。
