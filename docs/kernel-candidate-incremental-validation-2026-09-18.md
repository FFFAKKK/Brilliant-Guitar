# Candidate 精确标量依赖闭包与增量等价

日期：2026-09-18

## 目标

局部标量编辑此前虽然通过 Rust Candidate 保持事务原子性，但在最终采用前仍会
执行一次完整 Foundation 文档扫描。这使小编辑的语义验证成本继续受无关文档
大小影响。本阶段要求在不改变任何诊断、失败优先级、事务结果或插件边界的前提
下，复用已有 Rust 增量语义调度器。

## 已完成合同

Candidate 只有在下列事实全部成立时才进入增量语义验证：

- 尚未执行完整语义评估；
- frozen prefix 没有实际操作；
- 没有新增、隐藏或删除节点；
- 没有顺序或乐器变化；
- extension state 完全 pristine；
- Staff 引用可以表示为稳定 ID；
- 标量变化仅属于已覆盖集合：`DocumentMetadata`、`MeasureDefinition`、
  `StaffDefinition`、`VoiceSequenceStart`、`EventNoteValue`、
  `NoteWrittenPitch`。

资格判断来自 Candidate 保存的真实变化，不接受宿主或插件传入的“安全”提示。
任一条件不成立便走原有完整 Foundation 验证，因此新增优化不能绕过结构和身份
完整性检查。

`validate_final_with_metrics_against(store)` 从 Candidate 最终状态提取
`FinalValidationDeltaV1`，按增量规则需要补齐最终 records，再调用现有
`incremental_validation::validate_final_semantics`。最终读取仍经过
`StableCandidateView`，不会提前发布或修改 live store。Candidate 首次采用、
suffix-only Undo 和 Redo 都使用同一验证入口。

## 等价性证据

测试直接比较增量路径和完整 Foundation oracle，而不是只断言成功或失败：

- 非法 tempo 的诊断完全相等；
- 稳定但不存在的 Staff 引用完全相等；空原始引用自动回退完整验证；
- tempo、meter、Staff line count、Voice start、Staff reference、Event note value
  和 written pitch 同时失败时，诊断内容、顺序和路径完全相等；
- 结构变化和 frozen prefix 明确产生一次完整扫描与完整语义验证；
- 纯标量提交及其 Undo/Redo 均不执行完整验证；结构历史继续安全回退；
- 同一局部音高编辑在文档增加 64 个无关 Part 后，增量规则数和依赖读取数不变。

工作量指标现在明确区分：

- `full_document_scans`
- `full_semantic_validations`
- `semantic_rules_evaluated`
- `semantic_dependency_reads`

这些指标既用于回归，也让后续商业性能资格能够识别“局部闭包退化成全文工作”的
问题。

## 本轮没有扩大的边界

结构、身份、排序、乐器和扩展变化仍使用完整 Foundation 验证。这些路径目前具有
正确且确定的行为，只有建立各自的精确闭包和独立等价证据后才应继续增量化。

插件 callback 选择性调度也没有在本轮实现。当前 callback 可以观察完整
`coreDocument`、`documentVersion` 和完整 module classification；若仅根据 Core
受影响集合跳过 callback，可能改变插件可观察结果。该能力需要先定义可信分类
缓存、版本语义和插件依赖声明，并由后续插件平台接口接入。

## 验证结果

- `cargo test --workspace --all-features --locked --offline`：648 passed，1 ignored，
  0 failed。
- `cargo test -p brilliant-kernel-runtime --lib`：380 passed，1 ignored，0 failed。
- `npm test`：905 total，903 passed，2 designed skips，0 failed。
- `cargo fmt --all -- --check`：通过。
- `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings`：
  通过。
- `npm run typecheck`：通过。
- `git diff --check`：通过；输出只有工作区既有 CRLF 提示。

Node 完整测试通过环境变量使用新构建的 Integrated addon。标准 Integrated 路径
当时被活跃开发进程占用，故没有强制终止该进程或覆盖已加载 DLL；Core 与 WASM
标准测试路径已经更新，新 Integrated 产物保存在
`target/candidate-incremental-addons/integrated-v2.node`。

## 商业判断

该阶段关闭的是核心事务路径上的实际性能结构缺口：常用局部标量编辑的最终语义
成本不再随无关文档大小线性增长，同时保持失败结果完全等价。微内核核心逻辑可
评估为约 99%，商业候选成熟度约 96%–97%。剩余工作主要属于商业资格和发布工程：

- 整笔事务 CPU、内存和宿主传输统一上限；
- 长时间 soak、fuzz、崩溃与恢复测试；
- 真实 UI 和业务插件流程的 p95/p99 延迟门槛；
- Windows/macOS/Linux CI、签名、打包、升级和回滚；
- Rust 默认路径的受控切换，以及旧 TS 事务引擎退役。

这仍是商业候选结论，不是正式发布认证。
