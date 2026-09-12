# 工作区归档索引

本次采用原地归档：旧目录和分支保留，不代表仍需继续执行其中的历史任务。完整恢复包位于 `.repo-archive/2026-09-12/`。

2026-09-12 主线再次整合：`master` 已包含内核 `f9ec44b`；保留三处活跃入口，清理了两条已不存在的临时目录登记，现在共有 53 条 worktree 登记。所有实际目录和分支保留，下面的历史表仍用于追溯，不代表当前登记数量。

## 活跃工作区

| 用途 | 分支 | 目录 |
| --- | --- | --- |
| 集成主线 | `master` | 项目根目录 |
| 内核后续开发入口（截至 f9ec44b 已合入主线） | `codex/kernel-commercial-completion` | `.worktrees/kernel-commercial-completion` |
| UI 设计 | `codex/ui-design` | `.worktrees/ui-design` |

## 保留的历史工作区

下表是第一次整理时的归档状态。其两条 `%TEMP%` 失效登记已在后续主线整合时用 `worktree prune` 清理；执行前确认目录不存在、预览仅包含这两项，且对应提交仍是 master 的祖先。清理日志在 `.repo-archive/2026-09-12/kernel-integration/worktree-prune.log`。历史来源行继续保留。

| 原工作区 | 提交 | 原分支/状态 |
| --- | --- | --- |
| `C:/Users/ATOM/.codex/worktrees/03cd/brilliant_guitar` | `1f3f606` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/0589/brilliant_guitar` | `063b332` | `codex/rkp-1-codec-linear-bound-repair` |
| `C:/Users/ATOM/.codex/worktrees/0bf9/brilliant_guitar` | `78ab6cf` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/39b3/brilliant_guitar` | `e81c739` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/3ba1/brilliant_guitar` | `f82fe36` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/3dcf/brilliant_guitar` | `6073b2a` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/439f/brilliant_guitar` | `b393b5b` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/506e/brilliant_guitar` | `7b1c0e3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/6cac/brilliant_guitar` | `0c561d1` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/7082/brilliant_guitar` | `bb292a3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/7970/brilliant_guitar` | `65fef62` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/86cf/brilliant_guitar` | `463c851` | `codex/brilliant-guitar-architecture-v2-authority-sync` |
| `C:/Users/ATOM/.codex/worktrees/c4c3/brilliant_guitar` | `37ac1ad` | `codex/rkp-2-stage-6-eol-audit-return-reentry-planning` |
| `C:/Users/ATOM/.codex/worktrees/d00c/brilliant_guitar` | `0c561d1` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/dcee/brilliant_guitar` | `bb292a3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/eecb/brilliant_guitar` | `b619f24` | `detached` |
| `C:/Users/ATOM/AppData/Local/Temp/brilliant-guitar-k1-p1-repair` | `30894e2` | `codex/k1-1-p1-repair（目录原已不存在）` |
| `C:/Users/ATOM/AppData/Local/Temp/rkp0-audit-9bc5390-autocrlf` | `9bc5390` | `detached（目录原已不存在）` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/brilliant-guitar-architecture-reset-v2` | `ea574ec` | `codex/brilliant-guitar-architecture-reset-v2` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/core-rust-runtime-performance-remediation` | `5e15995` | `codex/core-rust-runtime-performance-remediation` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/core-vnext-extensibility-reservation-review` | `7467a27` | `codex/core-vnext-extensibility-reservation-review` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-2-official-module-sdk-frozen-assembly` | `302dafe` | `codex/cvn-2-official-module-sdk-frozen-assembly` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-4-part-staff-voice-lifecycle` | `7ad1ff1` | `codex/cvn-4-part-staff-voice-lifecycle` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-5-range-atomic-batch-planning-base` | `d22126c` | `codex/cvn-5-range-atomic-batch-planning-base` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-5-range-operations-explicit-atomic-batch` | `38afdc3` | `codex/cvn-5-range-operations-explicit-atomic-batch` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-6-unified-planning-base` | `d521a61` | `codex/cvn-6-unified-planning-base` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-7-accepted-baseline` | `38afdc3` | `detached` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-7-core-vnext-final-qualification` | `b21540f` | `codex/cvn-7-core-vnext-final-qualification` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-acceptance-archive-closure` | `c73e213` | `codex/rkp-2-e3-acceptance-archive-closure` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-acceptance-state-projection` | `f27daf7` | `codex/rkp-2-e3-acceptance-state-projection` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-law` | `0c561d1` | `codex/rkp-2-stage-6-e3-workspace-law-final-state-projection-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-law-acceptance-archive-closure` | `65debd5` | `codex/rkp-2-e3-law-acceptance-archive-closure` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/gd-0-independent-acceptance-review` | `ebd8075` | `codex/gd-0-independent-acceptance-review` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/k1-6-core-kernel-integration-gate` | `4e5612b` | `codex/cvn-3-document-factory-measure-lifecycle` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/post-core-official-plugin-product-roadmap` | `c68fcc6` | `codex/post-core-official-plugin-product-roadmap` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1-post-archive-contract-repair` | `b5d6300` | `codex/rkp-1-post-archive-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout` | `782431d` | `codex/rkp-1a-acceptance-archive-stage6-integration-closeout` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1a-public-json-property-cap-scale-compatibility-repair` | `0837427` | `codex/rkp-1a-public-json-property-cap-scale-compatibility-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-cross-platform-full-test-runner-contract-repair` | `9cdc9d3` | `codex/rkp-2-cross-platform-full-test-runner-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-indexed-live-score-store-implementation` | `6d0956c` | `codex/rkp-2-indexed-live-score-store-implementation` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-indexed-live-score-store-load-encode-parity` | `53646c9` | `codex/rkp-2-indexed-live-score-store-load-encode-parity` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-part-owner-wire-contract-repair` | `1bea1b4` | `codex/rkp-2-part-owner-wire-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-runner-event-coverage-planning-repair` | `c69d7b7` | `codex/rkp-2-runner-event-coverage-planning-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-acceptance-archive-integration-closeout` | `b3850a4` | `codex/rkp-2-stage-6-acceptance-archive-integration-closeout` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-eol-audit-return-planning-repair` | `9da9d03` | `codex/rkp-2-stage-6-eol-audit-return-planning-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-eol-portability-prerequisite` | `1f3f606` | `codex/rkp-2-stage-6-eol-evidence-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair` | `d14d731` | `codex/rkp-2-stage-6-private-scale-evidence-seam-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-s6-2-evidence-consumption` | `c3c4d19` | `codex/rkp-2-stage-6-s6-2-evidence-consumption` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-s6-2-fresh-evidence-consumption` | `51dbabd` | `codex/rkp-2-stage-6-s6-2-fresh-evidence-consumption` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-semantic-canonical-authority-amendment` | `4ad2377` | `codex/rkp-2-stage-6-semantic-canonical-authority-amendment` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-3-transaction-overlay-changeset-planning` | `46a684c` | `codex/rkp-3-transaction-overlay-changeset-planning` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-4-history-snapshots-events-replay-planning` | `902eacd` | `codex/rkp-4-history-snapshots-events-replay-planning` |

每个原本的本地分支均有 `archive/2026-09-12/<原分支名>` 标签。原分支仍保留；独立临时克隆另外保存 history bundle，不合并其过时任务状态。
