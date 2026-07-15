# K1-1 候选实现合同收口实施计划

## Dependency Gate

本任务以父计划 Step 1–9 已形成的候选实现为基准，执行审核后的合同收口与正式验收。Guitar Domain 明确依赖本任务完整通过，不得并行或提前开始。

## Ordered Steps

1. 固定 `ScoreFeatureProfile` 字段和三态 `ScoreSupportResult`，同步父设计、稳定规范、产品需求/规范和本任务合同。
2. 删除产品 PRD 第 540 行的旧 timeline/slot 地址约束，只保留 K1-2 基于新实体与稳定 ID 单独重规划的边界。
3. 先为 `ScoreSupportResult` 写 RED 测试，再做最小生产实现。
4. 在现有测试体系上补充：多 Voice、两小节内容乱序、跨实体 ID 冲突、unsupported sequence start/duration、meter、NoteValue base。
5. 只修复上述 RED 证明的 domain、codec、validator 或 profile 问题；已通过测试的核心模型不做整理式重构。
6. 复核生产公共 API；Profile 文件拆分只在依赖边界明显改善时执行，不作为验收条件。
7. 从新进程运行 typecheck、build、全部测试和 diff check；记录测试数与 LF→CRLF 警告。
8. 分阶段提交并停止等待审核，不进入 Guitar Domain 或 K1-2。

## TDD Gate

每个新增生产行为严格执行：写一个最小测试 → 编译 → 运行目标测试并确认因能力缺失而失败 → 最小实现 → 目标测试通过 → `npm run typecheck` → `npm test` → refactor。

不得把 TypeScript 编译错误冒充行为 RED；测试必须编译并在断言阶段因新能力缺失而失败。

## Commands

```powershell
npm run build
node --test dist/test/core-kernel/fraction.test.js
node --test dist/test/core-kernel/note-value.test.js
node --test dist/test/core-kernel/score-document-model.test.js
node --test dist/test/core-kernel/pitch-transposition.test.js
node --test dist/test/core-kernel/score-document-codec.test.js
node --test dist/test/core-kernel/score-semantics.test.js
node --test dist/test/core-kernel/unknown-extension-roundtrip.test.js
node --test dist/test/core-kernel/score-feature-profile.test.js
node --test dist/test/core-kernel/public-api-boundary.test.js
npm run typecheck
npm run build
npm test
git diff --check
```

Node test runner 在受限沙箱中可能以 `spawn EPERM` 失败；这属于运行环境故障。只有在相同编译产物经允许的非沙箱 `npm test` 全绿后才能作为测试证据。

## Stop Conditions

- 发现旧 schema 存在真实外部消费者或用户文件。
- 批准设计与稳定 spec 无法无损收敛。
- RED 不能证明目标合同，或需要通过削弱验证才能 GREEN。
- 同一阻塞原因连续出现三轮且没有安全替代路径。
- Core 完整验收通过：此时必须停下等待用户审核，不进入 Guitar Domain。

## Commit Boundaries

1. 文档合同同步与旧规范归档。
2. K1-1 候选实现及 `ScoreSupportResult` 必要修正。
3. 缺口测试、公共 API 与最终验收状态。

提交边界用于审查与回滚；发布前是否 squash 另行决定。

## Execution Result

- 文档合同与旧规范归档已独立提交。
- K1-1 候选实现与三态 `ScoreSupportResult` 已独立提交；核心谱面类型未因无失败证据而改写。
- 缺口测试、公共 API 复核与最终验收状态作为第三个提交边界。
- 最终检查：`typecheck` 通过、独立 `build` 通过、完整测试 49/49、diff check 退出码为 0。
- 四个 P1 修复提交已 fast-forward 合入 K1-1 原分支，最终固定基线为 `30894e2`。
- 人工验收已经通过；K1-1 到此关闭，只允许下一独立 Block 进入规划门，不自动进入实现。
