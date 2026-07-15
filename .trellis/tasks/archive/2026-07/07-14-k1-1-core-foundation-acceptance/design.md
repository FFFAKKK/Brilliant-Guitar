# K1-1 Core Foundation 人工验收设计

## 1. 验收目标

本任务不是再次实现 K1-1，而是对最终固定提交 `30894e2f395779f4fff970b458690765d45a393d` 做独立、只读、可复现的合同验收。最终输出必须回答三个问题：

1. 候选实现是否满足批准的 K1-1 持久化和公共行为合同；
2. 现有测试是否真正证明这些合同，而不只是与实现同源地自洽；
3. 当前候选基线是否允许合入并进入 Guitar Domain 规划。

## 2. 权威性与证据优先级

证据冲突按以下顺序处理：

1. 固定提交上的实际运行行为；
2. 固定提交上的生产代码和公共导出；
3. 固定提交上的测试断言与 fixture；
4. `.trellis/spec/core-kernel/` 活动规范；
5. 父任务已批准的 `prd.md`、`design.md`、`implement.md`；
6. 产品级已同步需求与规范；
7. 归档草案和历史说明。

若活动规范与批准父任务不一致，先记录治理缺口，不允许用归档草案替代任一当前合同。若代码与活动合同不一致，以合同为验收基准并形成发现；不得在验收中静默改写合同迁就实现。

## 3. 固定基线与工作区隔离

- 最终实现审查对象固定为 `d85973f -> 7297826 -> 046f046 -> ed3605f -> 0bc11e6 -> 511e243 -> 30894e2`，不随后续规划文档变化。
- 当前工作区中的状态同步文档、父任务 child 链接和本验收任务文件属于治理变更，不计入实现 diff。
- 静态审查需要区分 `git show 046f046:<path>` 的固定内容与工作区内容；若生产代码或测试在验收期间发生变化，立即停止并重新固定基线。
- 验收不执行 reset、checkout 覆盖、rebase、merge、squash 或任何实现修改。

## 4. 合同覆盖矩阵

最终报告为每个要求建立一行覆盖记录：

| 字段 | 含义 |
| --- | --- |
| Contract ID | K1C-REQ、K1C-AC 或活动质量清单项 |
| Contract | 被验证的精确行为或边界 |
| Production Evidence | 生产文件与行号 |
| Test Evidence | 测试文件、断言和负例 |
| Runtime Evidence | 命令、退出码和关键结果 |
| Verdict | satisfied / partial / violated / not-applicable |
| Finding | 关联发现编号或无 |

`partial` 不能自动算通过；必须说明缺少的是阻断合同证据还是非阻断补强证据。

## 5. 审查单元

### 5.1 数据真相与所有权

- `ScoreDocument`、measureDefinitions、Part/Staff/Voice/Event/Note 的所有权和引用方向；
- 小节顺序、事件顺序与开始位置是否只有一个事实源；
- 是否混入 tick、PPQ、毫秒、布局、播放、弦品或技巧等派生/领域私有数据；
- 全局 ID、measure coverage、Staff 所有权和 immutable 输入不变量。

### 5.2 精确音乐时间

- Fraction 规范化、负号、零、safe integer、约分、比较、四则运算中间溢出；
- NoteValue base、dots、time modification 和 measure/pickup duration；
- 事件开始位置由 sequence 顺序派生，不持久化第二套 offset。

### 5.3 音高与移调

- Core 只保存 WrittenPitch，SoundingPitch 可确定派生；
- diatonic/chromatic 位移一致性、double accidental 边界和 octave 范围；
- 标准吉他 Written E3 到 Sounding E2 仅作为通用移调验证，不引入 Guitar Domain 所有权。

### 5.4 Codec 与 JSON 边界

- 所有外部输入从 `unknown` 开始；
- JSON 语法、对象/数组/标量、必填字段、严格额外字段、union kind、future version 和 sparse array；
- 普通畸形输入不逃逸异常；诊断顺序与 path 稳定；
- encode/decode 在声明的语义层面等价。

### 5.5 Semantic 与 Feature Profile

- semantic validator 只判断跨字段不变量，不承担产品支持策略；
- profile 先复用 semantic 结果，再严格返回 supported / unsupported / invalid；
- 多 Part/Staff/Voice、和弦、附点、time modification、pickup、meter、note base、sequence start/duration 的合法但不支持边界。

### 5.6 ExtensionBlock 与公共边界

- owner、namespace、schemaVersion、有限 JsonValue、唯一性和未知 payload 深层保真；
- Core 不解释 `org.brilliantguitar.guitar`；
- 生产入口不导出 fixture、clone helper、测试 technique 或后续 K1 API；
- Core 不依赖 UI、Tauri、VexFlow、Web Audio、Node 文件 IO、Guitar Domain 或插件运行时。

### 5.7 测试可信度与提交边界

- 每个测试的断言是否能够在删除目标生产行为时失败，避免恒真或只检查自有常量；
- fixture 是否会掩盖错误、负例是否真正越过目标边界、诊断是否只检查表面数量；
- 三个提交是否保持文档、实现、测试/验收的可审查与可回滚边界；
- 测试通过不覆盖未测试的公共合同，静态审查和负例设计必须独立取证。

## 6. 发现格式与判定

每个发现使用以下合同：

```text
K1A-FIND-### [P0|P1|P2|P3] 标题
Contract: 违反或未证明的合同
Evidence: 文件:行号、命令或可复现输入
Behavior: 实际行为
Impact: 对数据、兼容性、边界或维护性的影响
Disposition: 退回修复 / 有条件通过后续项 / 建议
```

- P0/P1 必须退回，不允许靠文档措辞降级。
- P2 可以有条件通过，但必须有明确后续任务归属；不得把实际合同缺陷误标为 P2。
- P3 不进入阻断计数。
- 没有发现时也必须给出覆盖证据，不能以“测试都绿”作为空报告。

## 7. 运行验证边界

正式验收需要新进程运行：

```powershell
npm run typecheck
npm run build
npm test
git diff --check
```

`npm run build` 和 `npm test` 会生成 `dist/`。规划者不得以此修改受版本控制的实现文件；若用户的“只修改规划文档”边界也禁止生成临时构建产物，则由执行者在固定提交的干净检出中运行，并把完整退出码和测试摘要交给本任务复核。首次验收的 `40/40` 仅是历史起点；最终结论使用合入后的 49/49 新鲜证据。

## 8. 输出与下一 Gate

最终验收报告至少包含：基线、范围、覆盖矩阵、运行证据、发现列表、剩余风险、唯一判定和下一动作。

- 通过：允许执行者处理合入，并开始下一独立 Block 的规划；本轮选择 K1-2 Commands / Transactions / History，只开放规划，不自动开始实现。
- 有条件通过：允许合入与 Guitar Domain 规划，但 P2 必须有已接受的后续处置。
- 退回：禁止合入和后续 Block；创建独立修复任务后在新固定提交上重验。

最终结论为“通过”；三个 P1 已在独立修复提交中关闭，执行者已将修复分支 fast-forward 合入 K1-1 原分支。

本任务自身不修改父任务状态、不合并、不归档；这些动作由验收结论获用户批准后交给执行者完成。
