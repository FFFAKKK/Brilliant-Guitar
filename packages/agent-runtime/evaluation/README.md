# 上下文选择离线评估

此目录不被生产入口导入，也不打包到运行包。它是M3.2b的数据比较，不是已启用的评分器。结论见[评估报告](../../../docs/agent-m3.2b-ranking-evaluation-v1.md)。

## 运行

仓库根目录：

```powershell
node --experimental-strip-types packages/agent-runtime/evaluation/compare-context-selection.mts
node --experimental-strip-types packages/agent-runtime/evaluation/compare-context-selection.mts --output results.json
```

Node>=22.19。仅读取随库固定合成数据，复用现有ContextBuilder验证时间基线；不读取用户文件、密钥、环境模型配置或调用网络。--output明确指定可写的本地结果路径；不提供参数时只输出摘要，不生成文件。

## 数据与断言

context-selection-cases.json v1有20个固定样例，development/holdout各10。样例exact字段：id/category/split/critical/goal/optionalSlots/historyTurnBudget/turns/neededTurnIds/whyNeeded；turn exact id/user/assistant/status。ID唯一、目标源轮必须存在且成功；只比较最近两轮以外的候选。样例与标签先于首次运行冻结，预留复核组并非盲测。

命令内断言真实ContextBuilder的选择和原时间规则一致，近两轮仍保护、预算未穿透、完整user/assistant不截断；评分选中的ID必须来自相同窗口，不能超出槽位。另断言NFKC/中英文词项、重复去重、词项/扫描边界。覆盖率只衡量标注源轮命中，不是回答质量。输出v1包含evaluatorVersion、UTF-8/LF数据摘要、参数、逐例选择/评分、全部/分组指标和门槛结论；同输入可重复生成相同JSON。

## 类型检查

在packages/agent-runtime：

```powershell
npx tsc --ignoreConfig --noEmit --types node --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --allowImportingTsExtensions evaluation/compare-context-selection.mts
```

运行包默认tsconfig只包含src；这条命令明确检查离线入口及其依赖。无需改package.json或增加依赖。输入/参数断言失败返回非零状态，不生成伪造的成功报告。
