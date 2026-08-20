# Brilliant Guitar Architecture Reset V2 Authority Sync — PRD

## 状态与来源

- 本任务：`.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`
- 分支：`codex/brilliant-guitar-architecture-v2-authority-sync`
- 精确基线/现场 HEAD：`ea574ec4495ac2c82445d1275ad6648035231fc6`
- Architecture Reset V2 内容提交：`e81c739b1452a41a412966ee1f40367476011916`
- Architecture Reset V2 审计记录提交：`ea574ec4495ac2c82445d1275ad6648035231fc6`
- 独立审计任务：`01a01da3-548c-7513-a53c-0e10d1aa7350`
- 独立审计结果：`PASS`，P0/P1/P2=`0/0/0`，清单 `34/34`，typecheck/build/full=`531/531`
- 用户状态：已接受 V2；本同步候选仍等待独立 sync 审计，因此 `review-pending`

## 目标

把已接受的 Architecture Reset V2 从候选架构提升为当前架构权威，并将产品总 PRD、Core 规范索引、Rust remediation parent、post-Core roadmap 和四份旧技术架构文档同步到同一套边界。该任务只更新规划与权威指针，不实现架构。

## 必须同步的权威

1. V2 是 current architecture authority，保留内容提交、审计任务、审计记录提交和 PASS 结果。
2. 产品父任务与 PRD 指向 V2；产品技术架构的旧四份正文保留，但均标注 historical/superseded。
3. `.trellis/spec/core-kernel/index.md` 指向 V2，并明确 active specs 是迁移 oracle 与当前 TypeScript 可观察合同，不再是 Rust 目标架构的唯一 owner。
4. Rust remediation parent 以 V2 为准，精确使用七 crate：`brilliant-core-types`、`brilliant-score-foundation`、`brilliant-extension-protocol`、`brilliant-kernel-contracts`、`brilliant-kernel-runtime`、`brilliant-kernel-session`、`brilliant-kernel-node`；RKP-1 必须消费 V2，且本轮不创建 RKP-1。
5. Post-Core roadmap 明确 Core Platform、Product Host、Product Extension Host 与 equal Instrument Plugin 边界，并保持 RKP-9 后先 Guitar Core Loop。
6. Kernel Runtime、Kernel Session/Composition、Product ApplicationAssembly、Product Extension Host 各有唯一 owner；Kernel private identity 与 Product ApplicationAssembly identity 分离。

## 不得改变的兼容输入与生命周期

- `28/51/8/34/9`、`brilliant-score-1`、command/result/failure/event 事实顺序、unknown ExtensionBlock 保真与 rejection zero-delta 继续是兼容输入。
- CVN 与 archived RKP-0 oracle 保持原状；本任务不改 archived 路径。
- Guitar/Piano/Bass/第三方 Instrument Plugin 平级消费同一公共协议；Guitar Domain 不进入 Rust privileged provider。
- Rust official provider 旧称只作为 TypeScript oracle/history，不作为 V2 current crate 或专属权限。
- 不创建 `crates/`、Cargo 文件、RKP-1 task 或任何 Rust/TypeScript 生产文件；不归档、不推送。

## 验收标准

- [ ] V2 task metadata、product parent/PRD、Core index、Rust parent、post-Core parent 与旧四份文档的 current/historical disposition 与 sync matrix 一致。
- [ ] 新 task 至少包含 `task.json`、`prd.md`、`design.md`、`implement.md`、`implement.jsonl`、`check.jsonl`、`operator-handoff.md`、`review-candidate.md`、`research/authority-sync-matrix.md`。
- [ ] 产品父任务对新 task 的 child 引用精确一次；所有 JSON/JSONL 可解析且路径存在、唯一。
- [ ] 七 crate 名称、唯一 owner、RKP-1 gate、Core Platform/Product Host/Product Extension Host/Instrument Plugin 边界在对应权威文件中可直接检索。
- [ ] 旧文档正文未删除，仅新增清晰 superseded banner 与 V2 链接。
- [ ] `src/**`、`test/**`、`package*.json`、`tsconfig*.json`、`Cargo*`、`crates/**`、archived RKP-0/CVN task 均零差异。
- [ ] Trellis、Markdown/Mermaid、`git diff --check`、typecheck、build、full `531/531`、范围审计与 self-sync P0/P1/P2=`0/0/0` 通过。
- [ ] 形成唯一候选提交 `docs(architecture): synchronize Architecture Reset V2 authority`，提交后 task 保持 `in_progress`/`review-pending`，worktree clean/staged empty。
