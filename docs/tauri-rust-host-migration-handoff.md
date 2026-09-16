# Tauri 纯 Rust 生产宿主迁移交接方案

日期：2026-09-16

## 当前实施状态

截至 2026-09-16，目标链路 `React -> Tauri invoke -> Rust application service -> Rust Kernel` 已完成代码接线；浏览器的 Vite/Node/N-API 链保留给开发和合同回归。当前仍处于功能闭环与合同验证阶段，不能据此宣称桌面产品或迁移任务已经完成。

已完成并验证：

- Rust 会话所有权、create/read/edit/undo/redo、版本冲突和 requestId 幂等。
- 原生打开、保存、另存为、关闭、恢复文件，以及同目录原子替换。
- Tauri bridge 与 Browser bridge 共用前端合同，UI 不引用 Kernel 私有类型。
- 生产构建关闭 Vite Node 业务插件，静态产物和可执行程序未发现 `/api/workbench`、`node.exe` 或 `brilliant_kernel_node` 标记。
- 最小 capability、生产 CSP 和 release EXE 编译链已打通；安装包改为显式 `desktop:package`，尚未进入发布验收。
- Workbench 113 项测试、desktop Rust 13 项测试、根级 896 项测试以及 Rust workspace 全量测试通过；根级测试结果为 894 通过、2 项按设计跳过、0 失败。
- 桌面工作区身份跨窗口持久保存，前端身份测试与 Rust 跨 `AppState` 恢复测试共同覆盖崩溃重启后的恢复文件发现和导入。

尚缺的关键证据是：真实桌面窗口中的完整业务闭环、双宿主合同等价、取消与失败路径、关闭/恢复行为，以及独立环境验收。以下内容继续作为实施依据和审计记录。

## 1. 目标

把 Brilliant Guitar 桌面版的生产运行链从：

```text
React Workbench
  -> BrowserWorkbenchHostBridge
  -> HTTP / Vite middleware
  -> Node ScoreSessionService
  -> N-API addon
  -> Rust Kernel
```

迁移为：

```text
React Workbench
  -> TauriWorkbenchHostBridge
  -> Tauri commands
  -> Rust desktop application service
  -> Rust Kernel crates
```

最终桌面安装包不携带 Node runtime、不启动本地 HTTP 业务服务、不加载 `.node` addon。React、TypeScript、VexFlow 和 WebView 继续负责界面；权威会话、编辑用例、文件生命周期和 Kernel 调用由 Rust 桌面进程负责。

浏览器/Vite 入口继续保留为开发和组件测试适配器，不要求在本任务内删除。

## 2. 本任务不做什么

- 不重新设计 UI。
- 不改变 Core command、事务、历史、校验或文档语义。
- 不在本任务中删除旧 TS 内核；它属于既有 Rust 迁移计划。
- 不引入插件市场或第三方动态代码加载。
- 不把 UI 插件迁移到 Rust。
- 不为了复用而立即增加新的 Core workspace crate。当前回归会固定七 crate 图，第一阶段应避免无关地改变该边界。
- 不在第一阶段同时实现音频、MIDI、打印或云同步。

## 3. 必须保留的现有边界

### 前端保持不变

- `WorkbenchApp`、WorkbenchRuntime 和 UI 插件体系。
- VexFlow 记谱渲染、布局、选择和输入预览。
- `WorkbenchClient` 面向 `WorkbenchHostBridge` 编程。
- `ScoreSessionRead`、`ScoreEditRequest`、`NewScoreInput` 和 `WorkbenchIssue` 的可观察语义。

### Kernel 保持不变

- Rust 持有唯一可变文档、事务和 undo/redo 历史。
- 所有编辑继续通过公开/已接受的 Core command 路径完成。
- 拒绝、no-op、原子 batch、版本冲突和幂等行为不得弱化。
- 不在 Tauri 层直接修改乐谱 DTO 来绕过 Kernel。

## 4. 建议代码边界

第一阶段在 `apps/desktop/src-tauri` 内建立应用层，避免立即改变已固定的 Core workspace：

```text
apps/desktop/src-tauri/src/
  lib.rs
  commands.rs                 # Tauri command 薄适配器
  state.rs                    # AppState 与 session registry
  dto.rs                      # 前端边界 DTO 与严格反序列化
  error.rs                    # WorkbenchIssue / command error 映射
  application/
    mod.rs
    create_score.rs
    read_score.rs
    edit_score.rs
    document_io.rs
    notation_projection.rs
```

职责约束：

- `commands.rs`：只解析 Tauri 参数、调用应用服务、返回 DTO。
- `application/`：承载创建、编辑、导入导出、投影、幂等和并发用例。
- `state.rs`：管理 `workspaceId -> session`，不实现编辑规则。
- Kernel crates：继续拥有领域规则、事务、历史和校验。
- React：只消费 `ScoreSessionRead`，不接触 Rust 内部文档结构。

桌面路径稳定后，如果确实需要让浏览器宿主复用同一 Rust 应用服务，再将 `application/` 提取为独立的 host workspace crate。不要为未来复用提前破坏当前七 crate 内核门禁。

## 5. 分阶段实施

### 阶段 A：冻结桥接合同和基线

目标：在写 Rust command 前明确兼容标准。

工作项：

1. 盘点 `WorkbenchHostBridge` 的五类能力：read、create、edit、export、import。
2. 固定对应请求、成功响应和失败响应 JSON。
3. 从现有 Node host 提取代表性合同样例：
   - 首次创建和重复创建。
   - append、delete、属性修改、set-title。
   - undo、redo、no-op。
   - requestId 重试。
   - expectedVersion 冲突。
   - 导入、导出和无效文档。
4. 记录当前结构化 `WorkbenchIssue` 的 code、target、status 和 retryable 行为。

验收：合同样例能够独立于 HTTP transport 运行，成为 Node 与 Tauri 两种实现的共同测试输入。

### 阶段 B：Rust 最小编辑闭环

目标：先证明 Tauri 可以直接使用 Rust Kernel，不接文件系统。

工作项：

1. 在 desktop crate 中添加必要的 Kernel path dependencies。
2. 建立 Tauri managed `AppState` 和 session registry。
3. 实现 create/read/edit commands。
4. 覆盖 set-title、append、delete、属性修改、undo、redo。
5. 实现 documentId、documentVersion、requestId 和 expectedVersion 检查。
6. 保留每个 workspace 的有限幂等请求记录，并提供显式 close/dispose。
7. 将 Kernel 结果投影为现有 `ScoreSessionRead`。

验收：在没有 Vite `/api/workbench/*` middleware 和没有 Node 进程的情况下，桌面窗口能完成 create -> edit -> undo -> redo -> read。

### 阶段 C：前端 Tauri Bridge

目标：桌面模式切换到 Tauri invoke，浏览器模式继续使用 HTTP。

工作项：

1. 新增 `TauriWorkbenchHostBridge`。
2. 所有 Tauri API 引用集中在该 adapter，不散落到组件和 hooks。
3. 增加 bridge factory：Tauri 环境选择 Tauri adapter，普通浏览器选择 Browser adapter。
4. 维持 `WorkbenchClient` 和 UI 调用方式不变。
5. 错误适配继续生成 `WorkbenchRequestError` 和 `WorkbenchIssue`。

验收：同一套 React UI 分别连接 Browser bridge 和 Tauri bridge；组件不需要知道当前宿主类型。

### 阶段 D：导入、保存和恢复

目标：让桌面宿主真正拥有文件生命周期。

工作项：

1. 实现 import/export commands。
2. 接入原生打开、保存、另存为对话框。
3. AppState 记录当前文件路径、文档身份、保存版本和 dirty 状态。
4. 使用同目录临时文件、flush/sync 和原子替换完成保存。
5. 保存成功后通过 Kernel checkpoint 标记持久化版本。
6. 实现关闭前未保存确认。
7. 设计最小崩溃恢复：恢复元数据与临时恢复文件不得覆盖用户原文件。

验收：create -> edit -> save -> close -> reopen 后文档、历史基线和 dirty 状态符合合同；写入中断不会破坏原文件。

### 阶段 E：生产打包与安全收口

目标：证明安装包完全脱离 Node/Vite 业务宿主。

工作项：

1. 配置最小 Tauri capabilities。
2. 将生产 CSP 从 `null` 收紧到实际所需范围。
3. 启用正式 bundle 配置和图标/元数据。
4. 确认生产包不包含 Node runtime、Node sidecar 或 `brilliant_kernel_node.node`。
5. 桌面启动不监听业务 HTTP 端口。
6. 增加静态 `frontendDist` 桌面端到端测试。
7. 记录启动、command latency、长谱读取和保存的基线指标。

验收：在没有安装 Node、没有开发服务器、断网的干净环境中完成完整编辑和文件闭环。

### 阶段 F：清理桌面生产依赖

目标：移除只为旧桌面链路保留的接线，不影响浏览器开发入口。

工作项：

1. Desktop scripts 不再自动启动 Workbench API 作为业务宿主。
2. 浏览器模式可以继续使用当前 Node adapter，但必须明确标注 development-only。
3. 删除桌面生产路径对 `.kernel`、`target/integrated-v2/*.node` 和 `/api/workbench/*` 的依赖。
4. 更新 README、架构图、构建说明和故障排查文档。

## 6. 关键技术决策

### 6.1 桌面直接依赖 Rust Kernel

Tauri desktop crate 应通过 Rust path dependency 调用 Kernel crate，不应在 Rust 内再次启动 Node，也不应从 Tauri command 反向调用本地 HTTP。

如果现有 Kernel API 只适用于 N-API adapter，先增加一个最小 Rust host facade；该 facade 只能组合现有能力，不能复制或改变 Kernel 语义。

### 6.2 UI DTO 与 Kernel DTO 分离

前端继续使用稳定、收窄的 `ScoreSessionRead`，不要把完整 Rust Core document 直接暴露给 React。这样可以避免 UI 与持久化模型、插件内部数据和 Kernel 私有结构耦合。

### 6.3 插件策略

- UI 插件继续是 TypeScript/React internal modules。
- Kernel 扩展不依赖 Node 执行任意 JS。
- 后续需要可加载扩展时，优先使用现有受限 WASM 路径和声明式 manifest。
- 不允许 UI 插件直接获得文件系统或可变 Kernel 引用。

### 6.4 浏览器开发模式

浏览器模式不是生产桌面架构的一部分。第一阶段允许继续使用现有 Vite/Node host，以降低迁移风险。后续只有在维护成本值得时，才让浏览器 adapter 复用 Rust application service。

## 7. 风险与控制

### 高风险：TS 应用用例移植产生语义差异

控制：先冻结合同样例；Node 和 Tauri 对同一输入比较完整响应和最终文档；失败必须验证零状态变化。

### 高风险：绕过 Kernel 直接修改 Rust 文档

控制：代码审查禁止 application/commands 层直接写文档集合；所有用户编辑必须转换为现有 Kernel command。

### 中风险：Tauri command 变成新的巨型服务

控制：command 只做 transport，业务编排进入 `application/`，session 生命周期进入 `state.rs`。

### 中风险：Core workspace 门禁被宿主改造打破

控制：第一阶段不新增 Core workspace member；desktop crate 使用路径依赖；现有 Core 测试和七 crate 图必须保持通过。

### 中风险：文件保存破坏用户数据

控制：禁止直接覆盖写；必须临时文件 + flush/sync + 原子替换，并覆盖失败恢复测试。

### 中风险：双宿主行为漂移

控制：建立共享 contract fixtures；每次修改桥接 DTO 或编辑用例时同时运行 Browser 与 Tauri conformance tests。

## 8. 完成定义

只有同时满足以下条件，才能称为“桌面版移除 Node 完成”：

- Tauri 静态生产包可创建、编辑、撤销、重做、保存、关闭和重新打开乐谱。
- 完整流程不需要 Node、Vite dev server、本地业务 HTTP 端口或 `.node` addon。
- React UI 没有直接依赖 Kernel 私有类型。
- Tauri commands 没有复制 Kernel 编辑规则。
- 每个 workspace 只有一个 Rust session 和历史所有者。
- 文件保存采用原子替换并有失败恢复测试。
- Browser bridge 现有测试继续通过。
- Workbench 测试、根目录完整回归、Rust workspace 测试和 desktop crate 测试全部通过。
- 生产 CSP 和 capabilities 已收紧。
- 文档明确区分 browser development adapter 与 desktop production host。

## 9. 推荐提交拆分

1. `test: freeze workbench host contract fixtures`
2. `feat(desktop): add Rust session state and read/create commands`
3. `feat(desktop): port edit use cases to Rust kernel commands`
4. `feat(workbench): add Tauri host bridge`
5. `feat(desktop): add native document open and atomic save`
6. `test(desktop): add static-bundle end-to-end workflow`
7. `build(desktop): remove Node runtime from production path`
8. `docs: record desktop Rust host architecture`

每个提交都应保持现有 Browser Workbench 可运行，不要用一个巨型提交同时完成迁移和清理。

## 10. 可直接交给实现人员的任务说明

```text
目标：将 Brilliant Guitar 桌面生产宿主从 Vite/Node/N-API 链路迁移到 Tauri Rust 直接调用 Rust Kernel。React Workbench 和 Browser 开发入口继续保留。

请先阅读：
- docs/tauri-rust-host-migration-handoff.md
- docs/software-architecture-audit-2026-09-16.md
- docs/desktop-host-plan.md
- apps/workbench/src/services/workbench-host-bridge.ts
- apps/workbench/host/score-session.ts
- apps/desktop/src-tauri/

严格约束：
1. 不改变 Core command、事务、历史和校验语义。
2. 不在本任务中删除旧 TS 内核。
3. 第一阶段不新增 Core workspace member，不破坏七 crate 门禁。
4. 所有用户编辑必须继续经过 Kernel command。
5. Tauri command 只做 transport，应用编排和 session state 分层实现。
6. 使用共享 contract fixtures 比较 Node 与 Tauri 的成功、失败和最终状态。
7. 按阶段提交；先完成 create/read/edit/undo/redo 最小闭环，再做文件和打包。

最终验收：静态 Tauri 安装包在无 Node、无开发服务器、无本地业务 HTTP 服务的环境中完成 create -> edit -> undo -> redo -> save -> close -> reopen，全部现有回归保持通过。
```
