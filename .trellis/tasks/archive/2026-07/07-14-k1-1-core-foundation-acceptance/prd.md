# K1-1 Core Foundation 人工验收

## Goal

独立审查 `codex/k1-1-core-foundation` 上的 K1-1 Core Foundation 候选基线，判断它是否完整满足已经批准的谱面模型、Codec、语义验证、Feature Profile、诊断和公共边界合同，并据此给出可追溯的“通过 / 有条件通过 / 退回”结论。

本任务是只读验收任务。它只产出规划与验收报告，不修改生产源码、测试、稳定规范，不执行合并、squash、发布，也不启动 Guitar Domain 或 K1-2。

## Review Baseline

- 最终实现基线固定为 `30894e2f395779f4fff970b458690765d45a393d`（`test(core): close dynamic dependency scanner bypasses`）。
- 审查提交序列为：`d85973f` 文档合同、`7297826` Core 实现、`046f046` 初始测试与验收，以及 `ed3605f`、`0bc11e6`、`511e243`、`30894e2` 四个 P1 修复提交。
- 2026-07-15 fast-forward 与复验后，该分支相对 `master` 为 `0 behind / 7 ahead`。
- 本任务创建前产生的两份规划状态同步，以及 Trellis 为本验收任务生成的任务元数据，不属于 K1-1 实现质量判定对象；它们作为治理变更单独审阅。
- 权威合同依次来自：本任务父级 `prd.md` / `design.md` / `implement.md`、`.trellis/spec/core-kernel/` 活动规范、产品级已同步需求。归档草案只能解释历史，不能推翻活动合同。

## Requirements

- K1A-REQ-001：逐条建立 K1C-REQ-001～013、K1C-AC-001～012、活动 Core 质量清单与生产代码/测试证据的覆盖矩阵，不以测试总数代替合同覆盖。
- K1A-REQ-002：核对 `ScoreDocument`、小节顺序、事件顺序/时间、Written/Sounding Pitch 和 ExtensionBlock 是否保持单一事实源，不持久化可可靠派生数据。
- K1A-REQ-003：核对 Fraction/NoteValue 的规范化、精确运算、safe-integer 中间值与最终值溢出、附点、连音和事件位置派生是否符合活动规范。
- K1A-REQ-004：核对外部输入是否严格执行 `unknown -> decode -> semantic validation -> feature-profile validation`，普通畸形输入是否只返回稳定诊断且不逃逸异常。
- K1A-REQ-005：核对 semantic-invalid、semantic-valid-but-unsupported 与 supported 三种状态是否严格分离，诊断 code、messageKey、path、details 和顺序是否可作为稳定机器合同。
- K1A-REQ-006：核对未知 ExtensionBlock 的信封验证、owner/namespace 约束、有限 JsonValue 和深层语义 round-trip；Core 不得解释 Guitar payload。
- K1A-REQ-007：核对生产公共入口只导出正式 API，fixture、clone helper、测试 technique、Guitar Domain、UI、渲染、音频、物理 IO、插件运行时及后续 K1 机制没有泄漏进 Core。
- K1A-REQ-008：审查测试是否真正约束生产行为，包括断言有效性、负例来源、边界组合、确定性与潜在同源实现/测试盲区；已有 `40/40` 只能作为起点，不能单独证明通过。
- K1A-REQ-009：验收证据必须包含新进程的 `npm run typecheck`、`npm run build`、`npm test`、`git diff --check`，并区分命令失败、测试失败与 LF→CRLF 环境提示。若规划者边界禁止生成构建产物，由执行者运行并提供原始结果，规划者只复核证据。
- K1A-REQ-010：所有发现必须给出严重度、合同依据、准确文件/行号、可复现行为、影响和建议处置；不得仅凭风格偏好阻断验收。
- K1A-REQ-011：验收过程不得修改实现来“边审边修”。阻断问题必须退回独立修复任务，修复后重新对固定新提交执行验收。
- K1A-REQ-012：最终报告必须明确下一 Gate：通过后才允许由执行者处理合入与 Guitar Domain 规划；未通过时禁止进入 Guitar Domain 和 K1-2。

## Severity and Decision Model

- P0：可能破坏谱面真相、静默丢失/篡改数据、普通输入崩溃或完全绕过核心验证；必须退回。
- P1：违反已批准持久化/公共合同、边界泄漏、关键验收场景缺失或测试无法证明核心不变量；必须退回。
- P2：真实但局部的可维护性、诊断完整性或非首版边界问题，不改变当前合同和用户数据；允许有条件通过，但每项必须写明后续处置、责任边界和进入时点。
- P3：命名、组织或可选增强建议，不影响验收结论，记录为后续建议。

最终判定只有三种：

- **通过**：没有 P0/P1/P2，全部验收证据完整。
- **有条件通过**：没有 P0/P1；每个 P2 均已验证、记录并获得明确后续处置，不要求为非阻断问题在本任务内修改实现。
- **退回**：存在任意 P0/P1，或关键合同/新进程验证缺少可信证据。

## Acceptance Criteria

- [x] K1A-AC-001：固定审查提交、工作区治理变更和权威合同来源已清楚分离。
- [x] K1A-AC-002：父任务全部 13 项 requirement、12 项 acceptance criteria 和活动质量清单均有代码/测试/文档证据或明确缺口。
- [x] K1A-AC-003：全部生产 Core 文件和全部 Core 测试文件均完成逐文件审查，没有以抽样代替全范围验收。
- [x] K1A-AC-004：核心数据模型、精确时间、音高、Codec、语义验证、Feature Profile、ExtensionBlock 和公共边界分别形成结论。
- [x] K1A-AC-005：新进程质量命令均有可核对的原始结果；测试通过数量、失败数量、退出码和环境提示被准确记录。
- [x] K1A-AC-006：每个发现都有严重度、证据位置、违反合同、影响和处置建议；不存在未经代码验证的推测性阻断项。
- [x] K1A-AC-007：不存在未处置的 P0/P1；P2/P3 按批准的判定政策处理。
- [x] K1A-AC-008：最终验收报告给出唯一明确结论，并说明是否允许合入、是否允许开始 Guitar Domain 规划，以及仍需执行者完成的动作。
- [x] K1A-AC-009：验收任务没有修改生产源码、测试或稳定规范，也没有越权执行合并、squash、发布或后续功能实施。

## Out of Scope

- 修复验收发现。
- 重新设计已经批准的 K1-1 产品范围。
- GuitarExtension、调弦、弦品和技巧实现。
- K1-2 命令、事务、历史、undo/redo，以及后续 K1 机制。
- Git 合并、squash、提交、推送、发布和任务归档。
