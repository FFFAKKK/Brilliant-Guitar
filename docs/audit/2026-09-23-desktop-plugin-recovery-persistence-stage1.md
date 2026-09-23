# Desktop 插件启动恢复持久化阶段报告

日期：2026-09-23（Asia/Shanghai）

阶段：桌面插件启动恢复持久化第一小阶段

## 阶段结论

本阶段完成桌面插件启动恢复标记的最小闭环：

1. 启动前读取持久化恢复标记；
2. 插件平台启动前写入 `launching` 标记；
3. 工作台首帧之后写入 `stable` 或继续保留 `recovery`；
4. 桌面端通过独立的 Tauri 命令和 JSON 文件保存该标记；
5. 浏览器预览使用独立的 `localStorage` 实现，不改变桌面持久化边界。

实现集中在既有 `PluginStartupController`、Workbench host bridge 和 Desktop `AppState`，没有新增生命周期大抽象，也没有修改 Kernel 历史、Score 端口或其他会话的工作范围。

## 审计发现与根因

此前插件启用配置已经持久化，但“本次启动是否完整到达稳定状态”没有跨进程保存。结果是插件启动失败或进程在启动期间退出后，下次启动无法区分：

- 上一次启动正常结束；
- 上一次启动在插件平台启动后、工作台稳定前中断；
- 当前是否应建议 safe 或 last-known-good 启动。

共同根因是启动意图和启动完成状态分属内存对象，没有共享同一份持久化状态边界。该问题适合在已有启动控制器中补齐，而不需要在 Desktop、Workbench 和插件模块之间分别叠加状态判断。

## 合并处理

本阶段将以下问题合并为一个处理面：

- 启动前恢复读取、启动中标记和首帧稳定确认统一由 `PluginStartupController` 管理；
- Desktop 只提供 versioned JSON document storage；
- Workbench 只选择对应 host storage，并把首帧稳定事件接入现有 `main.tsx`；
- 既有 activation/settings 恢复流程保持不变，启动 recovery 失败沿用现有 activation failure 处理路径。

没有引入额外的兼容包装层、重复的启动状态机或新的跨层抽象。

## 实施内容

- `apps/workbench/src/plugins/plugin-startup-recovery.ts`
  - 定义 `plugin-startup-recovery.v1` 文档；
  - 对状态和插件 ID 做边界归一化。
- `apps/workbench/src/plugins/plugin-startup-controller.ts`
  - 读取上次启动状态；
  - 在平台启动前写入 `launching`；
  - 在稳定后写入 `stable` 或保留 `recovery`；
  - 根据 last-known-good 配置计算 safe/last-known-good 建议模式。
- `apps/workbench/src/plugins/plugin-platform-bootstrap.ts`
  - 将恢复存储接入现有 bootstrap，不改变原有 activation/settings 两段职责。
- `apps/workbench/src/services/workbench-host-bridge.ts`
  - 新增 Tauri 和 Browser 两种恢复存储实现。
- `apps/workbench/src/ui/workbench-plugins.ts`
  - 按宿主选择恢复存储；
  - 暴露首帧稳定标记函数。
- `apps/workbench/src/main.tsx`
  - 在挂载 Workbench 后通过 `requestAnimationFrame` 触发稳定标记。
- `apps/desktop/src-tauri/src/state.rs`
  - 为恢复文档分配独立的 `plugin-startup-recovery.v1.json` 文件。
- `apps/desktop/src-tauri/src/commands.rs`、`lib.rs`
  - 注册 versioned read/write Tauri commands。

## 复杂度与兼容性影响

- 生产代码增加的是一个已有启动控制器的持久化端口和两个宿主存储实现，没有复制第二套启动流程。
- 既有插件 activation、settings、session freeze 和 Agent host binding 契约未改变。
- 文件和命令均使用 `v1` 独立命名空间，不读取或覆盖既有插件 activation/settings 文件。
- 未修改外部接口、Kernel 历史或现有文档格式。
- 没有保留临时兼容分支；Browser storage 只是现有浏览器预览的宿主实现，不参与 Desktop 文件迁移。

## 验证

- Workbench 聚焦测试：`29/29` 通过。
- Workbench 全量测试：`626/626` 通过。
- Workbench production typecheck：通过。
- Workbench test typecheck：通过。
- Desktop Rust 全量测试：`70 passed / 0 failed`。
- 本阶段涉及 Rust 文件 `rustfmt --check`：通过。
- `git diff --check`：通过。

## 保留边界与未验证项

- 恢复标记读取失败仍归类为现有 bootstrap 的 activation failure；本阶段不扩展新的错误恢复 UI。
- 首帧稳定以 `requestAnimationFrame` 作为现有启动入口的最小接入；未进行正式 GUI 崩溃注入、真实断电或多平台窗口验收。
- 未执行 Native/N-API/Wasm、Tauri 打包、MSRV、多平台 CI、正式性能或真实断电测试。
- `main` 合并后的全量验证必须重新执行，不能以本 worktree 的验证替代。

## 交付与集成约束

- Worktree：`C:\Users\ATOM\.codex\worktrees\desktop-plugin-recovery-persistence\brilliant_guitar`
- 分支：`codex/desktop-plugin-recovery-persistence`
- 基线：`main` 的 `264168918b046eb14eae9ceb0e2c7a3cf85863de`
- 本阶段只允许通过本阶段提交合并到 `main`。
- 不执行 push、rebase、amend 或修改其他会话分支。
