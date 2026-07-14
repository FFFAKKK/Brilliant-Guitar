# K1-1 候选实现合同收口设计

## Authoritative Design

本子任务不另建第二套模型。权威技术设计是 `../07-13-k1-1-foundation-replanning/design.md`；本文件只固定 Block 1 的裁剪边界和依赖。

## Included Architecture

```text
unknown JSON
  -> Core Codec
  -> ScoreDocument
  -> Core Semantic Validator
  -> ScoreFeatureProfile Validator
  -> ScoreSupportResult
```

本任务实现以下 Core 所有权：

- Domain：`Fraction`、`NoteValue`、`WrittenPitch`、`Transposition`、`ScoreDocument`、`ExtensionBlock`。
- Codec：严格从 `unknown` 解码，安全 JSON parse/encode，保留未知扩展 JsonValue。
- Semantic Validation：跨字段不变量、ID/引用/所有权、measure coverage、精确时值与扩展信封。
- Feature Profile：首版产品支持范围，不承担结构或语义损坏判断。
- Public Boundary：只导出正式生产 API，测试资产留在 `test/`。

## Excluded Architecture

- Core 不解释任何 `org.brilliantguitar.guitar` payload。
- Core 不保存 string/fret/tuning/guitar techniques。
- Core 不实现 registry、capability、plugin lifecycle、command、snapshot、event 或物理文件容器。
- tick、毫秒、播放和布局均由未来 adapters 派生。

## Compatibility and Rollback

- 首个正式 schema 是 `brilliant-score-1`；旧未发布 tick/slot 草案无兼容层。
- 每个实现步骤必须先出现针对新合同的 RED 测试，再做最小 GREEN 实现。
- Core Block 可独立回滚；不得以恢复旧 tick/slot 模型作为 Guitar Block 的前提。
- 如果发现旧 schema 已有真实用户资产，停止直接替换并返回父规划阶段。

## Validation Boundary

- `decode.*`：形状、类型、版本、严格字段与 JSON 安全边界。
- `semantic.*`：跨字段音乐/引用不变量。
- `unsupported.*`：当前 `ScoreFeatureProfile` 不支持的合法特征。
- 每条诊断具有稳定 `code`、`messageKey`、结构化 `path` 和可选 `details`。

`ScoreFeatureProfile` 保留当前候选实现中能够显式表达基数上下界、meter、弱起、sequence 起点/完整性、NoteValue 和单事件最大音符数的字段。支持面判断使用独立三态结果：

```typescript
export type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | {
      readonly status: "unsupported"
      readonly diagnostics: readonly UnsupportedDiagnostic[]
    }
  | {
      readonly status: "invalid"
      readonly diagnostics: readonly SemanticDiagnostic[]
    }
```

`unsupported` 表示文档语义合法但当前产品不能编辑；`invalid` 表示前置 Core 语义验证失败。调用者不得通过通用 `ok: false` 猜测两者差异。

## Closure Rule

- 当前 `ScoreDocument`、Fraction/NoteValue、pitch、ExtensionBlock、codec 与 semantic validator 是验收基准，不预设重写。
- 每个新增边界先添加一个能够编译并因目标行为缺失而失败的测试；只有该 RED 才授权最小生产修改。
- Profile 类型、K1 常量和 validator 是否拆文件属于内部组织决定，不是验收项；只有依赖边界明显改善时才做机械拆分。
- K1-2 只记录基于新实体与稳定 ID 重规划的约束，本任务不设计 `ScoreAddress` 最终字段。

## Quality Evidence

Core 验收必须同时提供目标 RED/GREEN 记录、完整 typecheck/build/test 输出、违禁依赖搜索、公共 API 边界测试和 unknown extension round-trip 证据。
