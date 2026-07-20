# 细粒度 Spec 文档规划

## 状态

- 状态: K1-1～K1-5 已验收归档；K1-5 实现基线 `51fa2177cbd25dea53f1ebaf23bd8b8426471589` 已于 2026-07-21 在文档基线 `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` 通过独立验收，161/161 测试通过；K1-6 规划已解锁，生产实现尚未授权。
- 作用: 定义后续 spec 的拆分方式。
- 注意: `SPEC-001` 是当前模型的产品投影，字段级契约在 `.trellis/spec/core-kernel/`；`SPEC-003`、`SPEC-014`、`SPEC-015`、`SPEC-016` 已分别由 K1-2/K1-3/K1-4/K1-5 验收合同落实。未验收或标记为未来路线图的段落不能据此实现 API。

## Spec 拆分原则

- 一个 spec 只约束一个稳定主题。
- 每个 spec 必须包含目标、强制规则、禁止事项、接口契约、测试要求。
- 每条规则必须可被代码评审或测试验证。
- 不写“尽量”“最好”这类无法验收的描述，除非同时给出判定标准。

## 计划中的 Spec

- `SPEC-000-documentation-contract.md`: 文档和规格写作契约，约束所有需求、架构和实现计划。
- `SPEC-001-document-model.md`: `brilliant-score-1` 的产品级投影；稳定字段规则由 Core spec 统一管理。
- `SPEC-002-file-format.md`: K1-1/K1-5 已实现内存语义与 current-schema compatibility；物理 `.bgp`、manifest、文件 IO 和真实旧版本迁移仍是后续合同。
- `SPEC-003-command-system.md`: 已验收的 K1-2 命令、事务、undo/redo 与回放合同。
- `SPEC-004-selection-editing.md`: 光标、选区、键盘优先编辑、多选、复制粘贴、批量编辑。
- `SPEC-005-guitar-techniques.md`: Guitar Domain Block 2 重规划门；尚无已批准 payload。
- `SPEC-006-layout-rendering.md`: 布局 primitives、SVG 渲染、hit testing、导出一致性。
- `SPEC-007-playback.md`: MVP 播放校对、播放事件、节拍器、基础速度、播放光标同步。
- `SPEC-008-import-export.md`: 导入导出接口、报告、兼容矩阵、golden files。
- `SPEC-009-extension-api.md`: 扩展 API、插件 manifest、权限、命令注册、私有数据。
- `SPEC-010-product-quality.md`: 商业级质量属性、质量门禁、性能、崩溃恢复、诊断、隐私、安全和发布准入。
- `SPEC-011-internationalization.md`: 语言切换、i18n key、翻译资源、fallback 和本地化元数据。
- `SPEC-012-open-source-release.md`: Apache-2.0、DCO、第三方许可、商标边界、开源发布和不商业化约束。
- `SPEC-013-long-term-maintenance.md`: 长期维护原则、版本演进、`.bgp` 兼容、schema 迁移、回归测试和发布纪律。
- `SPEC-014-kernel-snapshot-events.md`: 已验收的 K1-3 快照、selector 与事件合同。
- `SPEC-015-kernel-registry-capability.md`: 已验收的 K1-4 registry/capability 合同。
- `SPEC-016-kernel-errors-diagnostics-reports.md`: K1-1 diagnostics 与已验收 K1-5 errors/issues/reports/current-schema migration 合同。

## Spec 完成标准

- [ ] 每个 spec 有唯一编号和稳定标题。
- [ ] 每个 spec 有至少一个可运行或可人工复现的验收场景。
- [ ] 每个 spec 明确哪些行为属于 MVP，哪些后置。
- [ ] 每个 spec 能映射到 PRD 中的需求编号。
- [ ] 进入实现前，相关 `.trellis/spec` 不再保留初始化模板。
