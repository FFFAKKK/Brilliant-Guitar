# 仓库维护记录

## 2026-09-12 内核成果整合与 TS 冻结归档

`master` 从 `eceec9f` 快进到 `f9ec44b`，接收内核开发分支的全部 26 个已提交成果，没有分叉冲突或重写历史。随后只追加仓库管理、归档和验证记录；内核开发工作区同步主线管理提交，UI 设计分支保留 `f22d141`，不将未验收设计混作内核运行成果。

建立三个注释标签：`archive/2026-09-12/master-before-kernel-integration`（`eceec9f`）、`archive/2026-09-12/typescript-kernel-frozen`（`f9ec44b`）和 `integration/2026-09-12/kernel-usable-baseline`（`f9ec44b`）。`.repo-archive/2026-09-12/kernel-integration/` 保存完整 Git bundle、TS/SDK/适配源码 ZIP、91 项内核验证日志的 ZIP、整合前 refs/worktree 登记及 SHA-256 清单。Bundle 验证和两个 ZIP 的逐文件 CRC 检查均通过。

仅清理两条已经不存在的临时目录 worktree 登记：`brilliant-guitar-k1-p1-repair`、`rkp0-audit-9bc5390-autocrlf`。先核对 dry-run 恰好包含这两项、目录确实不存在、提交仍是 master 的祖先，再执行 prune。现在有 53 条 worktree 登记；所有实际开发目录、分支、源码、UI、证据和原恢复包均保留。

旧 TS **事务引擎**停止独立功能开发，按 [归档边界](archive/typescript-kernel.md) 保留恢复快照和行为对照。Rust 所需的 TS SDK、共享服务、类型和 Node 适配继续保留。普通默认入口仍运行 TS；此处没有借仓库整理实施未经验证的默认切换，也没有将整份 TS 代码物理删除。

在主线根目录重新构建 V1/V2/WASM 三种 release addon 后，新跑完整回归 **830 passed、2 skipped、0 failed（832 项，49.750 秒）**，构建包含 TypeScript 类型检查。Rust 源码与此前验证版本一致，没有重复全套 Rust 测试；538 passed/1 ignored 与 Clippy/MSRV 结果继承 `6feef80` 的证据，不能当作本次新跑。主线产物、日志与恢复文件标识见 `docs/evidence/master-kernel-integration-2026-09-12.json`。

当前策略：master 作为已整合开发基线，后续功能在内核工作区推进并按验证结果整合；不再扩展旧 TS 引擎。缺失依赖的降级装配、累计资源/长期运行与平台性能资格、Rust 默认切换及旧执行路径清理仍待专门推进。本次仓库任务不自动恢复持续内核功能开发。

## 2026-09-12 整理基线

整理前本地有 57 个分支、54 个 worktree 登记（含两个不存在的目录）。根目录及其子目录共约 26.59 GiB，Rust target 目录合计约 22.45 GiB；不含 C 盘外部 worktree。master 为 d440bc5，内核已提交线为 ca33ade，后者领先 523 个提交且包含原 master。

主线以 ca33ade 为集成基线。尚未提交的扩展 assembly 工作留在内核工作区，没有因仓库整理而被当作完成项纳入主线。旧分叉中的独有规划、审计及测试提交保留在归档标签中，不盲目合并过时的治理状态。

## 实际完成与保留范围

采用用户确认的原地归档方式：所有原有源码工作区、分支和临时独立克隆均保留，没有执行工作区删除、分支删除、worktree prune 或 Git 对象清理。批量删除的自动审批两次因服务连接中断未能执行，之后不再重试删除。

全部 57 个原分支建立归档标签。新增 `codex/ui-design` 工作区，将 16 个 UI 设计文件单独提交为 f22d141；原有维护记录移入恢复包。当前共有 58 个本地分支、55 个 worktree 登记，其中只有主线、内核开发和 UI 三个工作区作为活跃入口。历史目录并未因为标记归档而物理消失，详见 [工作区归档索引](repository-workspaces.md)。

清理仅涉及仓库内部旧工作区的 27 个 Cargo 编译缓存目录；路径来自备份清单中明确排除的 debug/release 等可重建输出，并检查了目录范围与链接。活跃内核缓存、源码、Git、设计稿、测试数据和保留证据未清理。内核 18 个未提交文件已逐个与 ZIP 快照比较，字节完全一致；原先存在的工作区仍全部存在。

主线新增干净 TS 构建入口，清除了四个无对应源码的旧 JS。P3B 测试临时路径改为本工作区 `.tmp/rkp1a-property-cap/p3b`，避免从根目录运行时越出仓库；其 E 盘约束、工作负载和阈值保持不变。

验证：Rust workspace 493 passed、1 ignored；修正临时路径后完整 TS/native 回归 760 passed、0 failed、2 skipped（55.233 秒）。首次完整运行的 P3B 因写入仓库上一级而遇到 EPERM，失败日志保留，未通过放宽测试规避。Git fsck 完整检查返回成功；仍保留其报告的临时对象和悬空对象，未进行破坏性历史清理。以上是本次集成回归，不是商业资格认定。

## 恢复资产

本地 `.repo-archive/2026-09-12/` 保存：

- `refs-before.txt` 与 `worktrees-before.json`：原分支、提交、工作区及未提交状态。
- `repository-history.bundle`：仓库 Git 历史；另有每个临时独立克隆的 history bundle。
- `repository-files.zip`：根目录与内部工作区的文件快照，包含未跟踪文件和保留证据。
- `external-worktree-*.zip`：外部工作区的文件快照。
- `backup-manifest.json`：ZIP 路径、原位置、文件数和 SHA-256，以及排除的可重建缓存目录。
- `nested-history-manifest.json`：临时克隆与对应 bundle 的映射及校验值。

ZIP 已执行完整性检查；bundle 已通过 Git 验证。缓存目录没有全部备份，恢复时按锁文件重新构建。被跳过的依赖目录链接记录在清单中；它们不是未提交源码。此备份位于同一磁盘，只提供本次操作的恢复能力，不替代异地备份。

恢复提交可从 `archive/2026-09-12/<原分支名>` 创建新分支。完整历史也可用 `git clone <bundle路径> <新的空目录>` 恢复。文件快照应先解压至新目录、比较差异，再恢复需要的文件，避免直接覆盖当前工作区。

## 后续约定

1. 通常只保留主线、内核开发及必要的 UI 设计工作区；完成的工作区在成果入库或归档后移除。
2. 日常构建复用活跃工作区的缓存；不为每次只读审计重新复制完整仓库并编译。
3. 可长期依赖的验证报告和产物标识放在独立证据包，不能只藏在可清理的 target 中。
4. 仅在源码变化或失败需要时重跑相关测试；集成候选执行一次完整回归，不为目录整理重复做模型审计。
5. 清理前确认无使用该目录的构建、测试或编辑任务；先检查未提交文件、忽略文件和独有提交，再核对删除路径。
6. `.trellis` 历史、公开合同、冻结 fixture、锁文件和本地恢复包不是缓存。OpenSpec 与技能目录此次保留，不改变工具集成。
