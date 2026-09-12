# 旧 TypeScript 事务引擎冻结归档

2026-09-12 用户决定：将当前可用内核成果整合到 master，旧 TS 内核先归档，不再继续其独立功能开发。未来内核能力以 Rust 运行路径为主。

## 已建立的恢复点

- 冻结标签：`archive/2026-09-12/typescript-kernel-frozen`，指向 `f9ec44b`。
- 主线整合前标签：`archive/2026-09-12/master-before-kernel-integration`，指向 `eceec9f`。
- 已验证内核基线：`integration/2026-09-12/kernel-usable-baseline`，指向 `f9ec44b`。
- 本地源码快照：`.repo-archive/2026-09-12/kernel-integration/typescript-kernel-frozen.zip`。
- 完整历史恢复包：同目录的 `kernel-integration.bundle`，已通过 Git 验证。
- 内核原始验证日志：同目录 `kernel-local-evidence.zip`。

源码 ZIP 同时保存 TS 引擎、SDK/适配器、测试和依赖锁文件，便于完整恢复；这不表示这些文件全部停用。快照不含可重建编译缓存。恢复时在新目录或新分支读取，避免覆盖当前工作区。

## 冻结与保留的边界

旧 TS 引擎主要由 `src/core-kernel/commands/runtime.ts`、`batch-runtime.ts` 和 `integrated-runtime.ts` 中的 TS 状态/事务/历史执行路径组成。停止为这些旧执行路径增加独立功能、优化性能或建立新的开发任务。保留它们作为可恢复的兼容实现和行为对照，不为“归档”而机械移动整个目录。

下列内容仍参与 Rust 集成，继续维护：

- `crates/`：Rust 数据、规则、事务、Store、历史、会话和 Node 桥。
- `src/core-kernel/native/`、`src/native-host/`：Rust/WASM 宿主适配。
- TS 数据合同、SDK、catalog/权限和协议编解码，以及 Rust 当前复用的共享校验/视图服务。
- 回归与差分测试、固定 fixture、历史证据、锁文件和恢复资料。

`integrated-runtime.ts` 等文件同时含旧 TS 执行路径和 Native 使用的共享服务；冻结范围按职责判断，不能整文件删除。后续真正移除旧执行路径，需要先完成共享代码分离、默认 Rust 切换和对应验证。

## 当前运行事实

显式选择 `installNativeIntegratedBackendV2` 或 `installNativeWasmIntegratedBackendV1` 后创建的 integrated session 使用 Rust 的唯一 Store、事务和历史。

普通 `CommandBus.create()` 以及未选择 Native 的兼容工厂仍会执行 TS。因此本次完成的是归档保存与停止独立开发，**没有宣称 TS 代码已物理移除、已不再执行或默认引擎已经切换**。默认切换和最终清理列入 Rust 完成路线；不用仓库整理代替该工程步骤。
