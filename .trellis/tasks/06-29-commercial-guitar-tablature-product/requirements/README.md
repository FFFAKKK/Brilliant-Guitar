# 需求拆分索引

本目录用于在需求探索阶段保存细粒度需求。每个需求一个文档，最后由 `prd.md` 做收敛合并。

## 编号规则

- `REQ-001` 到 `REQ-099`: 产品与用户价值层需求
- `REQ-100` 到 `REQ-199`: 数据模型与核心领域需求
- `REQ-200` 到 `REQ-299`: 编辑器和交互需求
- `REQ-300` 到 `REQ-399`: 播放、练习、音频需求
- `REQ-400` 到 `REQ-499`: 导入导出和兼容需求
- `REQ-500` 到 `REQ-599`: 扩展、插件和生态需求
- `REQ-900` 到 `REQ-999`: 开源发布、质量、运营与非功能需求

当前为了阅读方便使用连续编号；最终合并时可以重新映射到上述范围。

## 合并规则

- 每个需求文档先保留草案、假设和开放问题。
- 用户确认后，将决策写回该需求文档。
- 最终 PRD 只保留收敛后的要求，不保留已经解决的讨论痕迹。
- 如果一个需求变得过大，拆成子需求文档，并在原文档中只保留索引与共同约束。

## 功能规划四视角

每个功能、模块或内核子系统规划时必须包含:

- 产品视角: 解决的用户问题、使用场景、真正必要的功能。
- 业务逻辑视角: 业务流程、业务规则、状态变化、边界条件、异常情况。
- 技术实现视角: 模块边界、数据模型、接口契约、依赖关系、可测试性、可维护性。
- 反过度设计视角: 当前阶段是否过度复杂，是否引入不必要抽象、框架、服务、配置或扩展机制。

这四个视角用于用户审核，也用于限制后续 AI 编码的自由发挥。

## 当前需求文档

- `REQ-001-product-positioning.md`
- `REQ-002-score-document-model.md`
- `REQ-003-guitar-tab-editing.md`
- `REQ-004-standard-notation-sync.md`
- `REQ-005-playback-practice.md`
- `REQ-006-import-export.md`
- `REQ-007-extension-system.md`
- `REQ-008-editor-workflow-ux.md`
- `REQ-009-file-storage-versioning.md`
- `REQ-010-commercial-readiness.md`
- `REQ-011-mvp-first-stage-scope.md`
- `REQ-012-internationalization-language.md`
- `REQ-013-open-source-governance.md`
- `REQ-014-graduation-project-deliverables.md`
- `REQ-015-commercial-quality-attributes.md`
- `REQ-016-long-term-maintenance.md`
- `REQ-017-kernel-module-communication.md`
- `REQ-018-kernel-registry-capability.md`
- `REQ-019-kernel-errors-diagnostics-reports.md`
