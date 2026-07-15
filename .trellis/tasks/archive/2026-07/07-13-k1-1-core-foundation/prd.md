# K1-1 候选实现合同收口与正式验收

## Goal

以当前分支已形成提交序列的 K1-1 候选实现为基准，收口批准设计、稳定规范、产品文档与公开行为合同，补齐已审计确认的边界测试，并且只修改失败测试证明有缺陷的生产代码。

本子任务只交付 Core Kernel。它完成并通过人工验收后，才能另建并启动 Guitar Domain 子任务。

## Source Contract and Dependencies

- 父规划：`../07-13-k1-1-foundation-replanning/prd.md`。
- 批准设计：`../07-13-k1-1-foundation-replanning/design.md`，其中第 3–11、13–14 节是本任务的技术合同。
- 执行顺序：`../07-13-k1-1-foundation-replanning/implement.md` 的 Step 1–9。
- 用户已批准父规划，并进一步批准“候选实现合同收口与正式验收”审核修正版。
- 强依赖：写生产代码前必须先同步 `.trellis/spec/core-kernel/`，使批准设计取代旧 tick/slot 合同。
- 下游依赖：未来 Guitar Domain 子任务必须等待本任务完整验收；父子树本身不代表该依赖，本条文字才是依赖合同。

## Repository Baseline Status

- 任务状态：最终验收通过，进入完成归档；规划父任务的 K1-1 交付目标已经满足。
- 当前分支：`codex/k1-1-core-foundation`。
- 当前分支已按“文档合同与归档”“候选实现及必要修正”“测试/公共 API/最终验收”三个审查边界形成提交序列。
- 修复分支已 fast-forward 合入，当前 K1-1 正式分支基线为 `30894e2f395779f4fff970b458690765d45a393d`；干净检出该分支能够获得完整模型与 49 项测试。
- 最终验收任务 `07-14-k1-1-core-foundation-acceptance` 判定通过，三个 P1 全部关闭。
- 本基线尚未合入 `master` 或发布；“正式基线”指经审核的 K1-1 分支基线，不等同于产品发布。

## Requirements

- K1C-REQ-001: `ScoreDocument` 使用 `measureDefinitions + parts + extensions`，并保持唯一谱面业务真相。
- K1C-REQ-002: 小节顺序只来自 `measureDefinitions[]`；事件位置只由 sequence 起点和前序 `NoteValue` 派生。
- K1C-REQ-003: Core Note 只持久化 `WrittenPitch`；`SoundingPitch` 由 Part 移调规则确定性派生。
- K1C-REQ-004: 精确时间使用规范化、安全整数 `Fraction`；不持久化 tick/PPQ。
- K1C-REQ-005: 外部数据必须经过 `unknown -> decode -> semantic validation -> feature-profile validation`，普通畸形输入不逃逸异常。
- K1C-REQ-006: 语义合法但超出首版单 Part/Staff/Voice、4/4、基础时值范围的文档返回 unsupported，而不是 corrupted。
- K1C-REQ-007: `ExtensionBlock` 只验证版本化信封、owner 和 JsonValue；未知 payload 语义 round-trip 不丢失。
- K1C-REQ-008: fixture、clone helper 和测试 technique 定义不得从生产入口导出。
- K1C-REQ-009: Core Kernel 保持纯 TypeScript，不依赖 UI、渲染、音频、物理文件 IO、Guitar Domain 或插件运行时。
- K1C-REQ-010: 当前未发布旧草案直接替换；实施前若发现真实外部文件/消费者依赖旧 schema，立即停止并重新规划迁移。
- K1C-REQ-011: `ScoreFeatureProfile` 保留当前可表达基数、meter、sequence 完整性、NoteValue 和单事件最大音符数的字段；支持面判断必须返回 `ScoreSupportResult`，显式区分 `supported`、`unsupported` 和 `invalid`，不得以通用 `ok: false` 混淆不支持与无效。
- K1C-REQ-012: 当前核心持久化类型默认冻结；只有先添加并观察到正确 RED 的行为测试，才能对 domain、codec 或 semantic validator 做最小修正。
- K1C-REQ-013: K1-2 本轮只保留重规划约束：未来地址与命令以 measure/part/staff/voice/event/note 和稳定 ID 为基础，旧 timeline/slot 地址退役；本任务不定义最终 `ScoreAddress` 字段。

## Out of Scope

- GuitarExtension、调弦、弦号、品位和吉他技巧验证。
- K1-2 命令、事务、undo/redo、snapshot、selector 和 event bus。
- Registry/capability/plugin runtime、迁移注册表和通用 report 基础设施。
- UI、渲染、播放、MIDI、MusicXML/Guitar Pro、物理 `.bgp` IO。

## Acceptance Criteria

- [x] K1C-AC-001: 稳定 spec 已同步，旧 tick/slot/technique-registry 描述已移出活动规范并保存在明确 archive，不再是 K1-1 有效合同。
- [x] K1C-AC-002: Fraction/NoteValue 测试覆盖规范化、附点、time modification、三连音和 safe-integer 溢出。
- [x] K1C-AC-003: 通用 schema 能表达首版吉他、双 Staff 钢琴、多 Part、和弦、附点和 time modification。
- [x] K1C-AC-004: malformed JSON、错误字段、错误 union kind 和 future schema version 安全返回稳定 decode 诊断。
- [x] K1C-AC-005: Core 语义验证覆盖全局 ID、引用、measure 全覆盖、voice 时值和 extension 信封。
- [x] K1C-AC-006: `ScoreFeatureProfile` 通过 `ScoreSupportResult.status` 明确区分 `supported`、`invalid` 和 `unsupported`，并保持诊断类型与状态一致。
- [x] K1C-AC-007: 未知 ExtensionBlock 深层 payload 经过 encode/decode 后语义等价。
- [x] K1C-AC-008: 生产入口不导出 fixture、clone helper、测试 technique 定义，也没有违禁依赖。
- [x] K1C-AC-009: 从新进程运行 `npm run typecheck`、`npm run build`、`npm test` 与 `git diff --check` 全部通过，并如实记录 LF→CRLF 警告。
- [x] K1C-AC-010: 提交用户 Core Block 验收并停止，不创建或实施 Guitar Domain 代码。
- [x] K1C-AC-011: 补充多 Voice unsupported、两小节内容乱序、跨实体 ID 冲突、sequence start/duration、meter 和 NoteValue base 边界测试；已存在行为不重复建设。
- [x] K1C-AC-012: 变更至少按“文档合同与归档”“候选实现及必要修正”“测试/公共 API/最终验收”三个可审查提交边界组织；是否 squash 留到发布前决定。

## Verification Record

- `ScoreSupportResult` 行为测试先观察到旧 `ok` 合同导致 3 个断言失败，再以最小实现转为 4/4 通过。
- 缺口边界定向测试 15/15 通过；未证明 `ScoreDocument`、codec 或 semantic validator 存在缺陷，因此没有对核心谱面类型做整理式重构。
- 2026-07-15 在修复 fast-forward 后从新进程运行 `npm run typecheck`、`npm run build` 和 `npm test`，全部成功；完整测试为 49/49。
- `git diff --check` 与 `git diff --cached --check` 均以退出码 0 完成。Git 在暂存 LF 文件时报告 LF→CRLF 工作区转换提示，该提示不是 diff check 失败。
- 生产源码未出现旧 tick/slot 持久化路径、调试绕过、Guitar Domain 或 K1-2 实现。
- `score-feature-profile.ts` 保持单文件：公开合同与验证器当前处于同一依赖边界，拆分不构成验收价值。
- `K1A-FIND-001`～`003` 已通过 `ed3605f`、`0bc11e6`、`511e243`、`30894e2` 关闭；没有计划外生产模型修改。
