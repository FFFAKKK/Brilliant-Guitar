# 项目架构

## 状态

- 状态: 草案
- 作用: 规定仓库未来如何组织产品文档、规格文档、应用代码和测试资产。
- 当前前提: 仓库已初始化 Trellis，但尚未创建应用代码。
- 确认状态: 顶层代码目录结构尚未确认；必须等软件架构原则、模块边界和构建边界确认后再定。

## 顶层结构候选

以下结构只是候选，不是已确认实现约束:

```text
brilliant_guitar/
  .trellis/                         # Trellis 工作流、任务、项目规范
  apps/
    desktop/                        # 桌面应用入口，Tauri + React
  packages/
    core-kernel/                    # 谱面内核: domain, commands, validation, schema, events
    layout/                         # 布局 primitives
    renderer-svg/                   # SVG/VexFlow 渲染适配器
    playback/                       # 播放事件和 Web Audio 适配
    persistence/                    # .bgp 本地读写适配器
    import-export/                  # PDF/PNG 导出和后续外部格式导入
    extension-api/                  # manifest、权限、贡献点和插件 API 类型
    fixtures/                       # 测试谱库、golden files
  docs/
    product/                        # 面向人读的产品文档
    architecture/                   # 面向工程决策的架构文档
    specs/                          # 对外稳定规格，可由 .trellis/spec 派生
```

## Trellis 任务内文档结构

当前任务先在 `.trellis/tasks/06-29-commercial-guitar-tablature-product/` 内推进:

```text
notes/                              # 临时上下文和过程记录
product/                            # 开源产品画布、用户旅程、市场定位
requirements/                       # 每个需求一个 REQ 文档
technical/                          # 技术栈、软件架构、项目架构
specs/                              # 细粒度 spec 草案和索引
research/                           # 竞品和技术研究证据
prd.md                              # 总索引和最终收敛入口
design.md                           # 后续技术设计汇总
implement.md                        # 后续执行计划汇总
```

## 文档流转规则

- `notes/` 只保存临时事实和会话上下文。
- `product/` 保存产品经理视角，不写代码方案。
- `requirements/` 保存用户价值、范围、行为和验收，不写具体框架代码。
- `technical/` 保存技术栈、架构边界、模块依赖和工程约束。
- `specs/` 保存可被实现和测试直接消费的规则。
- `prd.md` 最终只保留收敛后的产品需求，不保留已经解决的讨论过程。
- `.trellis/spec` 只在需求和架构稳定后更新，作为真正编码规范。

## 实现前必须具备

- PRD 已收敛。
- 开源产品画布已说明 MVP 为什么值得做。
- 技术栈已锁定。
- 软件架构已锁定微内核式 Core Kernel、用户态服务模块和模块协作协议。
- 项目目录结构已在架构确认后重新评估并确认。
- 至少核心 spec 已成稿: 文档模型、文件格式、命令系统、渲染、播放、导入导出。
- `design.md` 和 `implement.md` 已写好。

## 项目架构验收标准

- [ ] 任意新功能都能放入一个明确 package 或 app。
- [ ] 任意需求都能追溯到一个 `REQ-xxx` 文档。
- [ ] 任意核心代码约束都能追溯到一个 `SPEC-xxx` 文档。
- [ ] 测试资产和示例谱不混入业务代码目录。
- [ ] 产品文档、技术文档、编码规范各自职责清楚。
