# K1-1 Core Foundation 合同覆盖矩阵

## 判定说明

- **满足**：生产实现、测试与本轮运行证据足以支持合同。
- **过程记录**：只能由历史记录证明，无法在只读验收中重新制造 RED 过程。
- 最终固定基线为 `30894e2f395779f4fff970b458690765d45a393d`；`K1A-FIND-001`～`003` 均已关闭，不存在部分满足项。

## K1C Requirements

| ID | 判定 | 主要证据 | 缺口或说明 |
|---|---|---|---|
| K1C-REQ-001 | 满足 | `domain/score-document.ts`、通用 fixture 与 schema 测试 | `measureDefinitions + parts + extensions` 为持久化主体。 |
| K1C-REQ-002 | 满足 | `domain/musical-time.ts`、顺序无关两小节测试 | 小节顺序与事件位置均由规定数据派生，未发现持久化 tick/slot。 |
| K1C-REQ-003 | 满足 | `domain/pitch.ts`、pitch 测试 | Note 持久化 WrittenPitch，SoundingPitch 由移调派生。 |
| K1C-REQ-004 | 满足 | `domain/fraction.ts`、Fraction/NoteValue 测试 | 规范化、安全整数和中间值溢出均有行为覆盖。 |
| K1C-REQ-005 | 满足 | codec/semantic/profile 分层实现；畸形输入测试 | 结构型 sparse hole 已稳定返回 `decode.json-value`，K1A-FIND-001 已关闭。 |
| K1C-REQ-006 | 满足 | `profiles/score-feature-profile.ts` 与三态测试 | 合法但超范围数据返回 `unsupported`，不与 `invalid` 混淆。 |
| K1C-REQ-007 | 满足 | `domain/extensions.ts`、深层 payload round-trip 测试 | Core 只处理信封与 JsonValue，未解释 Guitar payload。 |
| K1C-REQ-008 | 满足 | `index.ts`、public API 测试、生产目录搜索 | fixture/clone helper/test technique 未从生产入口导出。 |
| K1C-REQ-009 | 满足 | TypeScript AST forbidden-dependency 测试 | 静态、动态、computed、inline import type 和越界路径均被约束，实际 Core 为零 violation。 |
| K1C-REQ-010 | 满足 | 仓库引用核对、固定提交历史 | 未发现真实消费者依赖退役 tick/slot schema。 |
| K1C-REQ-011 | 满足 | `ScoreFeatureProfile` 类型、验证器及 11 个 unsupported code 测试 | 三态结果和首版能力边界均可表达。 |
| K1C-REQ-012 | 过程记录 | 父任务 `Verification Record` 与修复提交历史 | 只读验收不重新制造历史 RED；生产修复保留了可核对的 RED/GREEN 记录。 |
| K1C-REQ-013 | 满足 | 生产入口、依赖与术语搜索 | 未实现 K1-2 command/address/history；旧 timeline/slot 未进入生产模型。 |

## K1C Acceptance Criteria

| ID | 判定 | 主要证据 | 缺口或说明 |
|---|---|---|---|
| K1C-AC-001 | 满足 | 活动 spec 与 `.trellis/archive/core-kernel/` 引用核对 | 退役草案保留为历史，不再充当活动合同。 |
| K1C-AC-002 | 满足 | Fraction/NoteValue 定向测试 | 规范化、附点、time modification、三连音与溢出均覆盖。 |
| K1C-AC-003 | 满足 | schema/fixture/profile 测试 | 能表达吉他、双 Staff 钢琴、多 Part、和弦和未来节奏。 |
| K1C-AC-004 | 满足 | JSON syntax、extra field、union、future schema 与 sparse-array 测试 | strict decode 的稳定 code/path 合同完整。 |
| K1C-AC-005 | 满足 | semantic validator 与闭集负例测试 | Decode 10/10、Semantic 31/31、Unsupported 11/11。 |
| K1C-AC-006 | 满足 | supported/unsupported/invalid 行为测试 | 状态和诊断前缀保持一致。 |
| K1C-AC-007 | 满足 | 深层 ExtensionBlock payload encode/decode 测试 | round-trip 语义等价。 |
| K1C-AC-008 | 满足 | public export 测试、fail-closed AST import 审查 | external/builtin/dynamic/computed/inline type/越界依赖均可失败。 |
| K1C-AC-009 | 满足 | 合入后 fresh typecheck/build/test/diff-check | 49/49 通过；沙箱 EPERM 与实现失败已分离记录。 |
| K1C-AC-010 | 满足 | 本任务变更范围与 Git 状态 | 未创建 Guitar Domain 代码，未执行合并。 |
| K1C-AC-011 | 满足 | 多 Voice、两小节乱序、跨实体 ID、sequence、meter、note-base 测试 | 父任务列明的定向缺口均存在行为测试。 |
| K1C-AC-012 | 满足 | `d85973f`～`30894e2` | 原始三边界与四个独立 P1 修复提交均可审查、可回滚。 |

## 活动 K1-1 质量清单

| 质量项 | 判定 | 证据/缺口 |
|---|---|---|
| Fraction 与 NoteValue | 满足 | 精确运算、canonical form、附点、连音、派生 start 与溢出均有测试。 |
| 通用 ScoreDocument | 满足 | 单 Part、双 Staff、多 Part、和弦和未来节奏 fixture 均可表达。 |
| Written/Sounding Pitch | 满足 | 持久化/派生边界和 E3→E2 示例均有测试。 |
| strict unknown decode | 满足 | malformed、future schema、extra field、union、结构/payload sparse hole 与异常安全均覆盖。 |
| semantic ids/references/time/extensions | 满足 | 31/31 semantic code、完整对象与确定性断言。 |
| ScoreFeatureProfile 三态 | 满足 | 三态和全部 11 个 unsupported code 均有显式断言。 |
| 多 Voice/能力边界 | 满足 | meter、note-base、sequence、dots、time modification 等均覆盖。 |
| 顺序无关与全局 ID | 满足 | 两小节 `measureContents[]` 乱序与跨实体重复 ID 均覆盖。 |
| Extension round-trip | 满足 | 深层 unknown JsonValue 保真。 |
| public export / forbidden dependency | 满足 | export 白名单与 fail-closed AST 依赖扫描器共同约束边界。 |
| RED/GREEN 与完整回归 | 满足 | 修复提交保留 RED/GREEN 证据；合入后 fresh 49/49。 |

## 总结

- 13 项 requirement：12 项满足、1 项过程记录、0 项部分满足。
- 12 项 acceptance criteria：12 项满足、0 项部分满足。
- 三个 P1 全部关闭，没有新的 P0/P1/P2；矩阵支持唯一结论：**通过**。
