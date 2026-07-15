# REQ-017 内核快照、事件与模块通信

## 用户价值

作为一个长期维护的模块化打谱软件，`Brilliant Guitar` 需要让 UI、渲染、播放、导出、导入、自动保存、内部扩展和未来插件围绕同一份谱面真相协作。用户不直接感知“快照”和“事件总线”，但会感知它带来的结果:

- 编辑后六线谱、五线谱、播放和导出一致。
- 保存和重开不会因为某个模块的影子状态丢数据。
- 插件或内部模块出错时不破坏谱面。
- 后续替换渲染、播放或导出实现时不重写核心数据。
- 毕业设计版本之后仍然可维护、可扩展、可测试。

## 当前决策状态

- 状态: K1-3 最终规划候选；外部可变 `ScoreDocument` 副本方案已拒绝，用户已批准五项范围决策。
- 已确认方案: `Snapshot / Selector + Post-Commit Event Bus + Command-only write`。
- 对应 spec: `specs/SPEC-014-kernel-snapshot-events.md`。

## MVP 必须满足

- Core Kernel 通过 `CommandBus.read()` 提供深冻结 `DocumentSnapshot`、history depths 和 dirty。
- Core Kernel 只提供 metadata、entity、ownership、range、history、dirty 六个 selector。
- Core Kernel 通过 `markPersisted(documentId + documentVersion)` 建立精确 clean checkpoint。
- 所有谱面写入仍然只能通过语义命令。
- 成功 submit/undo/redo 发布一个 document-committed；dirty 布尔变化发布一个 dirty-state-changed。
- rejected、no-op 或 rollback 命令不得发布 K1-3 事件；semantic-valid、Profile unsupported 但按 K1-2 合同 committed 的命令必须发布 `core.document.committed`。
- 渲染、播放、导出、自动保存和内部模块只能通过 snapshot/selector 读取谱面状态。
- 事件处理器异常不能回滚已经成功的谱面事务。
- 事件分发期间不能重入提交命令。
- UI 光标、选区高亮、鼠标拖拽和播放光标 tick 不属于 Core Kernel 事件。
- 外部模块可以创建布局缓存、播放队列、导出页面模型、分析报告或导入中间模型等非谱面事实派生数据，但不得创建、持有、修改或提交可变 `ScoreDocument` 副本。

## MVP 不做

- 不做网络 IPC。
- 不做协同编辑。
- 不做持久事件日志。
- 不做事件溯源数据库。
- 不做跨进程事件总线。
- 不开放第三方插件直接订阅裸内核事件总线。
- 不把 React、SVG DOM、VexFlow 对象、Web Audio 节点或 Tauri 文件对象放进事件 payload。
- 不通过 snapshot、selector 或 event 写入谱面。
- 不提供 `getMutableDocumentCopy`、`replaceDocumentFromExternalCopy`、`saveMutableWorkingCopy` 或外部整文档覆盖 API。

## 行为契约

- 读取契约: 模块读取谱面必须调用 `CommandBus.read()` 或六个 selector，不能直接读取可变 `ScoreDocument`。
- 写入契约: 模块修改谱面必须提交已注册语义命令，不能通过事件、snapshot 或内部 delta 写入。
- 事件契约: 内核事件只描述已经发生的事实，不代表请求、命令或待处理任务。
- 版本契约: snapshot 和事件携带 `documentVersion`；selector 结果由其输入 snapshot/read state 的 `documentVersion` 关联，模块缓存以该来源版本失效。
- 异常契约: K1-3 隔离事件订阅者失败并禁止 raw exception 逃逸；结构化模块错误报告由 K1-5 定义。
- 边界契约: UI 会话状态、布局派生模型、播放派生事件和导出页面模型都属于外部模块，不进入 Core Kernel。
- 派生数据契约: 外部派生数据只能用于布局、播放、导出、分析、预览或导入中间处理；最终改变谱面时必须转换为语义命令序列、`ImportResult` 或内核迁移结果，并经过内核验证和事务提交。

## 验收标准

- [ ] AC-017-01: 外部模块拿到 snapshot 后尝试修改对象，不会改变内核 `ScoreDocument`。
- [ ] AC-017-02: 成功插入 Event 后文档版本递增并发布一个 `core.document.committed`，受影响实体使用稳定 ID。
- [ ] AC-017-03: 失败/no-op 命令不发布 K1-3 事件，也不改变 documentVersion/history/dirty。
- [ ] AC-017-04: Persistence 保存明确版本的冻结 snapshot；成功后用该版本调用 markPersisted，不读取 UI/渲染/播放状态。
- [ ] AC-017-05: 事件订阅者抛出异常时，谱面事务保持已提交，后续 handler 继续执行，raw exception 不逃逸。
- [ ] AC-017-06: 事件分发期间 submit/undo/redo/markPersisted 稳定拒绝，不允许同步重入或延迟成隐式事务。
- [ ] AC-017-07: UI 光标或选区变化不会触发 Core Kernel 文档变更事件。
- [ ] AC-017-08: 播放事件可以从 snapshot/selector 重新生成，不依赖 React 或 SVG 状态。
- [ ] AC-017-09: 布局 primitives 可以从 snapshot/selector 重新生成，不依赖可变文档对象。
- [ ] AC-017-10: 第三方插件 manifest 即使声明直接订阅内核事件，MVP 也返回 unsupported 或由 Extension Host 过滤代理。
- [ ] AC-017-11: 外部模块无法通过公开 API 获取可变 `ScoreDocument` 副本。
- [ ] AC-017-12: 导入器或迁移器生成新文档候选时，必须通过专门入口、验证和 report，不能调用外部整文档覆盖 API。

## 已确认决策记录

- DEC-017-01: 采用 `Snapshot / Selector + Post-Commit Event Bus + Command-only write` 作为第一阶段内核模块通信模型。
  - 取舍: 该方案增加 API、事件、版本号和测试成本，但能保护长期模块化和插件扩展；如果改为模块直接互相调用或共享可变对象，MVP 可能更快，但后续维护风险明显更高。

- DEC-017-02: 不接受外部模块随意修改打开文件时复制出的可变副本，保存时再整体写回 Core Kernel。
  - 取舍: 拒绝外部可变谱面副本会增加模块提交变更的规范成本，但能保护 undo/redo、权限、诊断、事件和文件兼容；允许整体写回会短期更快，但会破坏微内核边界。

## 开放问题

- 无。
