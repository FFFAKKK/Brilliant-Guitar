# 细粒度 Spec 文档规划

## 状态

- 状态: 草案
- 作用: 定义后续 spec 的拆分方式。
- 注意: 当前是任务内规划文档；最终稳定后，需要同步到 `.trellis/spec` 形成真正的编码规范。

## Spec 拆分原则

- 一个 spec 只约束一个稳定主题。
- 每个 spec 必须包含目标、强制规则、禁止事项、接口契约、测试要求。
- 每条规则必须可被代码评审或测试验证。
- 不写“尽量”“最好”这类无法验收的描述，除非同时给出判定标准。

## 计划中的 Spec

- `SPEC-000-documentation-contract.md`: 文档和规格写作契约，约束所有需求、架构和实现计划。
- `SPEC-001-document-model.md`: 谱面领域模型、实体、ID、时间单位、验证规则。
- `SPEC-002-file-format.md`: `.bgp` 原生单文件开放包结构、manifest、schema version、迁移。
- `SPEC-003-command-system.md`: 编辑命令、事务、undo/redo、错误、回放测试。
- `SPEC-004-selection-editing.md`: 光标、选区、键盘优先编辑、多选、复制粘贴、批量编辑。
- `SPEC-005-guitar-techniques.md`: 吉他技巧分类、优先级、结构化字段、互斥规则、显示和播放语义。
- `SPEC-006-layout-rendering.md`: 布局 primitives、SVG 渲染、hit testing、导出一致性。
- `SPEC-007-playback.md`: MVP 播放校对、播放事件、节拍器、基础速度、播放光标同步。
- `SPEC-008-import-export.md`: 导入导出接口、报告、兼容矩阵、golden files。
- `SPEC-009-extension-api.md`: 扩展 API、插件 manifest、权限、命令注册、私有数据。
- `SPEC-010-product-quality.md`: 商业级质量属性、质量门禁、性能、崩溃恢复、诊断、隐私、安全和发布准入。
- `SPEC-011-internationalization.md`: 语言切换、i18n key、翻译资源、fallback 和本地化元数据。
- `SPEC-012-open-source-release.md`: Apache-2.0、DCO、第三方许可、商标边界、开源发布和不商业化约束。
- `SPEC-013-long-term-maintenance.md`: 长期维护原则、版本演进、`.bgp` 兼容、schema 迁移、回归测试和发布纪律。
- `SPEC-014-kernel-snapshot-events.md`: Core Kernel 快照、selector、事件总线和模块通信协议。
- `SPEC-015-kernel-registry-capability.md`: Core Kernel 注册表、模块身份、contribution descriptor 和 capability 边界。
- `SPEC-016-kernel-errors-diagnostics-reports.md`: Core Kernel 错误、diagnostic、report issue 和导入导出/迁移/验证 report 外壳。

## Spec 完成标准

- [ ] 每个 spec 有唯一编号和稳定标题。
- [ ] 每个 spec 有至少一个可运行或可人工复现的验收场景。
- [ ] 每个 spec 明确哪些行为属于 MVP，哪些后置。
- [ ] 每个 spec 能映射到 PRD 中的需求编号。
- [ ] 进入实现前，相关 `.trellis/spec` 不再保留初始化模板。
