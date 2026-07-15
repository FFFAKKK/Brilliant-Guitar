# K1-1 Core Foundation 人工验收执行计划

## Status

- 当前阶段：最终复验完成；用户已于 2026-07-15 确认“通过”结论。
- 用户已经审核并批准 `prd.md`、`design.md`、`implement.md`；本任务已按只读边界执行，未修改生产源码、测试或稳定规范。
- 最终验收目标固定为 `30894e2f395779f4fff970b458690765d45a393d`。
- 详细证据见 `contract-matrix.md` 与 `acceptance-report.md`；三个 P1 全部关闭，修复分支已 fast-forward 合入 K1-1 原分支。
- 操作者修复交接见 `p1-repair-handoff.md`；该文件作为已执行历史保留，不再表示活动阻断。

## Ordered Steps

### Step 1：固定基线并隔离治理变更

1. 记录 `git rev-parse HEAD`、`git status --short`、`git rev-list --left-right --count master...046f046`。
2. 确认 `src/core-kernel/**` 与 `test/core-kernel/**` 没有相对 `046f046` 的工作区变更。
3. 把当前两份状态同步文档、父任务 child 链接和本验收任务目录列为治理变更，不混入实现结论。
4. 若生产代码或测试基线变化，停止并要求重新批准固定提交。

### Step 2：建立合同覆盖矩阵

1. 展开父任务 K1C-REQ-001～013 与 K1C-AC-001～012。
2. 展开活动 `core-kernel` index、score-document-model、quality-guidelines、pure-kernel-boundary 和 diagnostics 合同。
3. 为每项记录生产证据、测试证据、运行证据和初始 verdict。
4. 标记重复合同，但保留原始 ID，不因合并描述丢失追踪关系。

### Step 3：逐文件审查生产实现

按依赖顺序审查：

1. `domain/fraction.ts`
2. `domain/musical-time.ts`
3. `domain/pitch.ts`
4. `domain/extensions.ts`
5. `domain/score-document.ts`
6. `validation/diagnostics.ts`
7. `codec/decode-score-document.ts`
8. `codec/score-json.ts`
9. `validation/validate-score-semantics.ts`
10. `profiles/score-feature-profile.ts`
11. `index.ts`

每个文件记录职责、依赖、合同满足项、未经测试的分支、异常/溢出/可变性边界和候选发现。只读审查，不做修复。

### Step 4：逐文件审查测试与 fixture

1. 审查 `test/core-kernel/fixtures/core-score.ts` 是否会把错误行为固化为正确 fixture。
2. 审查全部 Core 测试的断言强度、负例、确定性和与生产实现的独立性。
3. 将每个测试映射回合同矩阵，识别只有正例、只断言数量、未验证 path/details、未覆盖组合边界或无法证明目标行为的情况。
4. 不新增或修改测试；缺口按严重度形成发现。

### Step 5：核对公共与依赖边界

1. 复核 `src/core-kernel/index.ts` 的全部导出。
2. 搜索 fixture、clone helper、test technique、tick/slot/timeline、Guitar Domain 和违禁依赖。
3. 确认 K1-1 没有提前暴露 command、snapshot、event、registry、report、migration 或物理 IO API。
4. 把搜索结果与 public-api-boundary 测试交叉验证，不以搜索或测试单独替代另一方。

### Step 6：运行新鲜质量证据

在用户边界允许生成 `dist/` 时，由执行阶段运行：

```powershell
npm run typecheck
npm run build
npm test
git diff --check
```

记录每条命令的退出码、测试通过/失败数量和 LF→CRLF 提示。若不允许规划者生成构建产物，则由执行者在固定提交的干净检出运行相同命令并提供原始结果；没有新鲜证据时不能给出“通过”。

### Step 7：复核提交边界与治理一致性

1. 分别审查 `d85973f`、`7297826`、`046f046` 的职责和交叉污染。
2. 确认活动规范、父任务状态和实现基线没有把归档草案重新当作当前合同。
3. 将本次状态同步文档作为单独治理 diff 记录，不影响实现质量结论。

### Step 8：形成发现和最终报告

1. 对候选发现逐条回到代码和合同复核，剔除推测性或纯风格问题。
2. 使用 K1A-FIND 编号和 P0～P3 严重度记录有效发现。
3. 完成合同覆盖矩阵，所有 `partial` / `violated` 必须关联发现或缺证说明。
4. 输出唯一结论：通过、有条件通过或退回。
5. 明确是否允许合入、是否允许 Guitar Domain 规划，以及 P2 后续处置。
6. 停止等待用户确认，不自动执行 Git、任务状态或下一功能动作。

## Validation Commands

只读基线与范围核对：

```powershell
git rev-parse HEAD
git status --short
git rev-list --left-right --count master...30894e2
git diff --name-only 046f046..30894e2 -- src/core-kernel test/core-kernel
git log --format="%H %s" master..30894e2
rg --files src/core-kernel test/core-kernel
```

合同与边界搜索：

```powershell
rg -n "tick|slot|timeline|TechniqueRegistry|test\.slide|test\.bend|test\.vibrato" src/core-kernel test/core-kernel
rg -n "React|Tauri|VexFlow|Web Audio|node:fs|from ['\"]fs['\"]|guitar-domain" src/core-kernel
rg -n "fixture|cloneCoreScoreFixture" src/core-kernel
```

新鲜质量证据：

```powershell
npm run typecheck
npm run build
npm test
git diff --check
```

## Stop Conditions

- 固定提交与当前生产/测试内容不再一致。
- 活动合同存在无法由批准文档解决的直接冲突。
- 需要修改实现或测试才能继续判断。
- 新鲜验证失败，或没有获准取得新鲜验证证据。
- 发现任意 P0/P1：完成其证据后停止通过路径，输出退回结论，不继续为通过寻找理由。

## Rollback and Safety

- 本任务不修改实现，因此不存在实现回滚。
- 若误产生实现、测试或稳定规范变更，立即停止并报告，不自行覆盖或删除用户文件。
- 规划文档改动保持独立、可审查；不使用 `git reset --hard`、checkout 覆盖或清理用户工作区。
- 验收失败通过新修复任务处理，不在本任务中边审边修。

## Completion Gate

- `prd.md`、`design.md`、`implement.md` 已经用户审核。
- 合同覆盖矩阵完整。
- 全部生产文件和测试文件均已审查。
- 新鲜质量证据完整。
- 每个发现已验证并定级。
- 最终报告给出唯一判定与下一 Gate。
- 用户已经确认最终“通过”结论；允许执行者完成文档提交、任务归档并创建 K1-2 独立规划任务，但不允许直接编写 K1-2 代码。
