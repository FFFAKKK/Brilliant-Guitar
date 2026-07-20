# REQ-019 内核错误、Diagnostic 与 Report 契约

> **状态：K1-5 IMPLEMENTATION CANDIDATE / INDEPENDENT ACCEPTANCE PENDING。**
> 实施候选基线 `171790743450b3a3c0fa1720c847302308c27937` 已通过 159/159 测试；K1-1～K1-4 既有 failure/result 合同保持不变，K1-6 在独立验收前继续阻塞。

## 用户价值

`Brilliant Guitar` 是长期维护的开源打谱软件，失败不能只是抛异常或显示一段不可测试的字符串。用户最终感知到的是:

- 命令失败、文件打开失败、导入失败、导出失败和模块异常都有明确原因。
- UI 能把错误显示成中英文文本，但核心错误对象不硬编码中文或英文。
- 测试能稳定断言错误 code、severity、target 和来源。
- 当前 Core 的验证和迁移能输出一致 report；导入、导出和恢复报告由相应外部模块后续定义。
- 错误和 report 默认不泄露用户谱面正文、访问令牌或本机隐私路径。

## 当前决策状态

- 状态: 已收敛；实现细节以验收标准、对应 spec 和 `implement.md` 为准。
- 推荐方案: 将“错误、diagnostic 与 report”作为独立内核功能，不与注册表/capability 合并。
- 对应 spec: `specs/SPEC-016-kernel-errors-diagnostics-reports.md`。
- 关联注册能力契约: 注册表和 capability 边界由 `REQ-018` / `SPEC-015` 定义。

## 规划审核视角

### 产品视角

这个模块解决“失败可理解、可定位、可修复”的问题。用户最终看到的是清楚的错误提示、导入导出报告、迁移结果和验证问题，而不是崩溃、沉默失败或只能给开发者看的异常字符串。

核心使用场景:

- 输入非法音符、非法节奏或非法技巧参数时，UI 能定位并提示。
- 打开损坏 `.bgp` 或未来版本文件时，用户知道失败原因。
- 导入 Guitar Pro 文件时，用户知道哪些内容成功导入、哪些被跳过。
- 导出 PDF/PNG 失败时，用户知道失败阶段和可尝试的修复方向。
- 内部模块异常时，软件能隔离问题，不让 Core Kernel 崩溃。

MVP 真正必要的功能:

- 稳定错误 code。
- `messageKey` 支持中英文。
- 可定位、深冻结的 `KernelIssue`。
- 只面向当前真实消费者的 `KernelReport<"validation" | "migration">` 外壳。
- report 默认隐私保护。

### 业务逻辑视角

业务流程:

1. 命令、验证、迁移、注册或模块调用发生失败。
2. 既有 failure/diagnostic 通过显式 adapter 转换为 `KernelIssue`；内部错误类不跨公共边界。
3. UI 通过 `messageKey` 和 i18n 字典渲染用户文本。
4. issue 可以使用 diagnostic path、`ScoreAddress`、`ScoreRange` 或已验证 module/contribution source；不包含文件路径或 URL。
5. 当前验证和迁移入口输出统一且确定的 report。

业务规则:

- 用户可见文本不得硬编码在错误对象里。
- `source` 只用于归因，不用于授权。
- fatal 表示当前操作不能安全继续，不等于应用必须退出。
- 模块异常必须转换为结构化问题，不得穿透到 UI 或内核主流程。

边界条件和异常情况:

- payload 无效。
- schema 无效。
- 地址或范围无效。
- MVP 不支持的功能。
- 导入部分成功。
- 导出失败。
- 迁移失败。
- report details 可能携带隐私内容。

### 技术实现视角

模块边界:

- 属于 Core Kernel。
- 可引用 module id、contribution id、`ScoreAddress` 和 `ScoreRange` 做定位。
- 不执行 capability 授权，不管理 registry。
- 不负责诊断包打包、上传、远程错误上报或完整日志系统。

核心数据模型:

- 内部 sealed `KernelError` family（不公开 class）。
- 公共 `KernelIssue`、`KernelIssueLocation` 与 `KernelIssueSource`。
- 公共 `KernelReport<"validation" | "migration">` 与 `MigrationReport`。
- 原 K1-1 `Diagnostic` / `ValidationReport` 保持不变；不增加 `KernelDiagnostic` 别名。

接口契约:

- CommandBus 创建/回放创建、命令、checkpoint、read、event 与 registry 失败保持原 result，并可显式映射为 Issue 数组。
- `createKernelValidationReport` 把 K1-1 diagnostics 投影为新的 validation `KernelReport`。
- `migrateScoreDocument` 只输出 `not-required | rejected` 与 `MigrationReport`。
- 所有用户可见文本通过 `messageKey` 进入 i18n。

可测试性:

- error code 稳定性测试。
- i18n key 存在性测试。
- diagnostic target 定位测试。
- report issue 复用测试。
- module exception 转换测试。
- report 隐私边界测试。

### 反过度设计视角

MVP 不需要完整观测平台。当前阶段应避免:

- 远程错误上报。
- 完整日志产品。
- 崩溃转储采集。
- 诊断包上传。
- 用户谱面全文日志。
- 复杂隐私脱敏 UI。
- 可视化诊断控制台。

推荐 MVP 保持最小机制: 稳定错误对象、可定位 diagnostic、共享 report 外壳、i18n key 和隐私默认保护。诊断包、远程上报、复杂日志检索和用户可配置脱敏策略后置。

## 功能边界

本需求只解决三个问题:

- 失败如何结构化表达。
- 可展示、可测试的问题如何定位到文档、地址、范围、模块或文件。
- 当前验证和迁移如何共享确定、不可伪造 summary/status 的 report 外壳。

本需求不解决:

- 模块如何注册贡献点；这属于 `REQ-018`。
- 插件安装、市场、沙箱或权限 UI。
- 完整诊断包压缩、上传、崩溃收集或隐私过滤实现；这些属于后续 `Diagnostics Package Service`。
- 日志系统全文策略。

## MVP 必须满足

- 所有内核错误使用稳定 `code`、`severity`、`messageKey`、可选 `target`、`source` 和结构化 `details`。
- 所有用户可见文本只通过 i18n key 解析，不在错误对象里硬编码中文或英文。
- `KernelIssueLocation` 只允许 diagnostic path、`ScoreAddress` 或 `ScoreRange`；module/contribution 归因属于独立 source。
- `KernelReport` 只包含 reportVersion、kind、派生 status、派生 summary 和 ordered issues，不含 ID/time/source module 顶层字段。
- 当前只公开 validation 与 migration 两种 report kind；不公开 import/export/recovery 专属类型或第二个 `ValidationReport`。
- 显式 module wrapper 只生成 `module.internal-error` Issue，不保存或返回 raw Error 字段。
- `details` 和 report 默认不得包含用户谱面正文、访问令牌、本机绝对隐私路径或第三方密钥。

## MVP 不做

- 不做诊断包打包和上传。
- 不做远程错误上报。
- 不做用户谱面全文日志。
- 不做崩溃转储采集。
- 不做可视化诊断面板完整产品化。
- 不做隐私脱敏策略 UI。

## 行为契约

- 错误契约: 内核失败只能返回结构化错误或结构化 result，不允许把裸异常穿透给 UI、导出器或插件接口。
- Diagnostic 契约: diagnostic 表示当前文档或模块状态中的可展示问题，不等同于日志。
- Report 契约: 当前 Core report 表示一次验证或迁移的确定结果摘要和问题列表；外部模块可在 Core 结果之外包装自己的资源元数据。
- I18n 契约: `messageKey` 是唯一用户可见文本入口；参数放入结构化 `details`。
- 隐私契约: 默认不包含谱面正文、令牌、密钥、本机隐私路径或完整异常堆栈。
- 归因契约: `source` 只用于诊断和报告，不用于授权；授权属于 `REQ-018`。

## 验收标准

- [ ] AC-019-01: 公共 `KernelIssue` 包含稳定 code、派生 severity、派生 messageKey 与受控 source/location/details。
- [ ] AC-019-02: 用户可见错误文本只使用 i18n key，不硬编码中文或英文。
- [ ] AC-019-03: K1-1 diagnostics 通过 diagnostic-path location 无损映射，且不猜测缺失的地址/范围。
- [ ] AC-019-04: validation 与 migration report 复用同一套 `KernelIssue`、派生 summary/status 和隐私边界。
- [ ] AC-019-05: 显式 module wrapper 把异常边界归一化为 `module.internal-error` Issue，不泄露异常文本。
- [ ] AC-019-06: report 默认不包含用户谱面正文、访问令牌或本机隐私路径。
- [ ] AC-019-07: K1-1 diagnostics、CommandBus create/replay creation failure、command/history、checkpoint/read/event、registry/capability 与 migration 失败都能映射到稳定 code；带 diagnostics 的创建失败必须保留外层 code 和全部 semantic diagnostics 原顺序。

## 已确认决策

- DEC-019-01: “错误、diagnostic 与 report”作为 Core Kernel 功能实现。
- DEC-019-02: 该功能独立规划和实现，不与注册表、module identity、contribution descriptor 或 capability 授权合并。
- DEC-019-03: 该功能可以引用 module id、contribution id、score address 和 score range 做问题归因，但不执行 capability 授权。

## 当前状态

K1-5 implementation candidate `171790743450b3a3c0fa1720c847302308c27937` complete；完整门禁 159/159 tests 通过，独立验收 pending。在正式 accepted baseline 形成前不得启动 K1-6。
