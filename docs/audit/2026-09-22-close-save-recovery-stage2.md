# 第二小阶段审计：生产 Command、AppState 与原生关闭时序

日期：2026-09-22（Asia/Shanghai）

范围：延续第一阶段复核，补生产 command/AppState 和关闭时序证据；不修改生产行为，不使用子代理。所有文件故障均发生在本审计 worktree 的合成数据目录，未使用真实用户作品、正式 AppData、系统凭据或 Provider。

## 本阶段结论

1. **新增 P2：同一个 AppState 管理多个 workspace 时，一个 workspace 的恢复写入失败会阻挡另一个 workspace 关闭。** 生产 `workbench_close_v1` 调用全局 `recovery.flush()`，并非只刷新当前 workspace。真实 command 测试已复现；解除另一 workspace 的文件故障后，原关闭请求重试成功。
2. **补强原 P1：真实保存 command 在文件已写入后，仍可因 recovery remove 失败返回普通错误。** 本轮直接调用生产 `workbench_save_file_v1`，不是自行重排 service 调用。错误码为 `file.recovery-unavailable`；文件字节已等于本次导出快照，当前 session 仍在。解除合成故障后重试成功。
3. **补强原关闭问题：close 请求成功不等于窗口已销毁。** 隐藏的真实 Wry/Tao 窗口收到 CloseRequested 并被测试 handler 拦截后仍存活；显式 destroy 才观察到 Destroyed。另用已安装 SDK 的真实 `onCloseRequested` 回调确认：bridge 已成功返回后，独立投递的 close event 仍可在默认 destroy 上失败。
4. **补强原 P2：create/import command 可在恢复目录不可用时返回成功，后续空队列 flush 也返回成功，但根本没有恢复文件。** 失败发生在入队之前，被 `schedule_current_recovery` 静默返回，不能仅以 flush 成功作为“存在恢复副本”的证明。
5. **校正重试边界：** workspace 不存在时真实 close 返回 `false`，不是 `workspace already closed` 异常；remove 失败时 close 尚未删除 session，解除故障后可正常关闭，再次关闭返回 `false`。不能笼统写成“任何关闭错误都会删掉 session”。

**上述测试通过表示基线行为得到确认，不表示产品缺陷已修复。** 第一阶段的保存/替换竞态仍是可控模块交错与 React 分段证据，本轮没有将它提升为完整 IPC 并发端到端。

## 基线与证据范围

- Worktree：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`
- 分支：`codex/audit-close-save-recovery-stage1`
- 本阶段起点：`a25acfc67c8744510c31ac3ddd056ce48f9398f1`
- 生产源码基线：`eae40757681a3aa6810ee63ac70ea8f880687994`
- 证据目录：`docs/audit/evidence/stage2-20260922/`
- 工具沿用 Node `v24.15.0`、Rust/Cargo `1.97.1`、Windows x64。

`host.rs` 直接通过模块路径编译现有 `commands.rs`、`state.rs`、`application`、`document_io` 及其所需模块，没有复制或修改其业务实现。五个用例通过 Tauri MockRuntime 提供 State 管理，**AppState、Mutex、RecoveryManager、command 函数与文件系统操作均为生产实现**。第六个用例使用真实 Wry AppHandle 执行保存，并创建隐藏的原生窗口。它们均直接调用 Rust 函数，未经过生成的 IPC handler/序列化层。

`sdk-close.test.mjs` 使用本 worktree 已安装的 Tauri SDK 与生产 `TauriWorkbenchHostBridge`。仅用官方 mocks 提供 IPC，测试控制事件投递并等待 SDK 注册的真实回调。没有真实 WebView、ACL 拒绝或 OS 销毁发生在这些 Node 测试里。

## 发现 A：恢复故障跨 Workspace 传播

**严重度：P2，条件是同一 AppState 存在多个 workspace。**

位置：

- `apps/desktop/src-tauri/src/commands.rs:716`：close 在删除当前 session 前执行全局 flush。
- `apps/desktop/src-tauri/src/document_io.rs:53`：flush 没有 workspace/path 参数。
- `apps/desktop/src-tauri/src/document_io.rs:94`：worker 刷新全部 pending，任意写失败使总结果失败。

用例 `audit_unrelated_recovery_failure_blocks_close`：

1. 通过真实 create command 创建两个 workspace，并完成正常恢复写入。
2. 仅把 A 的合成恢复文件替换成空目录，再通过真实 edit command 产生待写恢复内容。
3. 调用 B 的 close command，返回 `file.recovery-unavailable`；B 的 session 仍在。
4. 删除本测试创建的空目录后重试 B 的 close，成功；A 的修改仍在。

根因是“当前 workspace 的关闭完成条件”依赖“全部 workspace 的恢复队列成功”。这与静默恢复失败属于同一处理面，应一起分析作用域、完成语义和失败反馈，不因此另建一套 recovery worker 或大型生命周期框架。

## 发现 B：保存已提交但返回失败

**严重度：P1，补强第一阶段发现 3 的 Save 分支。**

位置：`apps/desktop/src-tauri/src/commands.rs:752`。

用例 `audit_native_save_command_and_window_lifecycle` 的保存部分：

- 使用真实 AppState 和 Wry AppHandle；预先绑定合成文件路径，执行 `save_as=false`，因此不打开文件选择框。
- 通过生产 edit command 修改标题，令 recovery 目标为本测试创建的目录。
- 直接执行生产 save command，观察 `file.recovery-unavailable`。
- 读回实际文件，字节已与本次 export 一致；session 仍为编辑后的版本，文件路径绑定保留。
- 删除该空目录，重试同一 save command，返回正确 session/savedVersion；随后 close 成功。

根据 command 中的顺序，recovery 错误返回前 `atomic_write` 与 `mark_saved` 已成功。测试直接验证磁盘内容与 session；没有读取私有 Kernel persisted 字段，不能把这项写成独立 dirty 实测。

前端如何处理该错误仍沿用第一阶段真实 hook/client/bridge 的独立注入证据。本轮没有把 Rust 测试和 React 连接成一次真实 IPC 保存。

## 发现 C：关闭有多个完成点

**严重度：P1，补强第一阶段发现 1。**

本轮真实原生窗口的观察顺序：

```text
close accepted
-> CloseRequested
-> handler prevent_close
-> window remains
-> destroy
-> Destroyed
```

测试窗口隐藏、无 WebView、无 JS listener；拦截由 Rust 测试 handler 实现。因此它证明原生 close 可被取消及 destroy 的实际结果，不证明正式应用里 SDK、ACL 和 WebView 的整体时序。

SDK 的四个独立测试确认：

- 未主动关闭时，业务 guard 返回 false，真实 SDK 不调用 destroy。
- close IPC 拒绝后，生产 bridge 的 `forceClosing` 未复位；下一 close event 跳过业务 guard，SDK 进入默认 destroy。
- 在受控投递顺序下，bridge close 已成功返回；随后事件中的 destroy 拒绝只出现在事件回调 Promise，不会回传给已完成的 close 调用。这是允许出现的顺序，不是所有平台必然相同的顺序。
- 后端 close 返回 false 时，bridge 仍继续调用 SDK window.close。

静态补充：锁定的 Tauri Rust `manager/window.rs` 在存在 JS close listener 时会先阻止原生默认关闭，再发 JS 事件；已安装 SDK `window.js:1632` 等待用户 handler，并在未 preventDefault 时调用 destroy。正式 capability 仍只有 `core:default`，本阶段没有增加 grants、绕过 ACL 或把注入异常称为真实 ACL 实测。

共同根因不是“少一个 catch”这么简单：后端 session/recovery 清理、close 请求返回、close event 和实际销毁分别完成，却用单一 `forceClosing` 和一个 Promise 表示整体成功。应先明确最终完成与失败恢复由谁负责，再统一处理，避免再叠加若干布尔变量。

## 发现 D：恢复排队前失败不可见

**严重度：P2，补强第一阶段发现 4。**

用例 `audit_create_silently_skips_unavailable_recovery` 和 `audit_import_command_succeeds_despite_failed_recovery` 把 recovery root 设置为测试普通文件。真实 create/import command 返回成功且 session 已存在/替换，但没有恢复文件；随后 recovery.flush 返回成功，因为待写内容从未进入队列。

这里的 import 是 `workbench_import_v1`，**不是**含原生文件选择框的 `workbench_open_file_v1`。二者不能混为同一项测试覆盖。

## 应合并处理的修复面

| 处理面 | 局部调整方向 | 复杂度与兼容性约束 |
| --- | --- | --- |
| 保存身份与结果应用 | 快照绑定 document identity，统一前端回执应用和继续条件 | 复用现有前置条件与 Kernel dirty 语义；避免每个按钮各补条件；若扩展 DTO，先明确旧宿主兼容 |
| 关闭完成与重试 | 明确后端清理和窗口最终完成的责任，替换含糊的成功标记 | 不预设必须加两项 grants 或新建状态机；保留取消、失败重试语义 |
| 恢复作用域与失败 | 合并分析全局 flush、排队前失败、过期 Remove 和清理错误 | 先复用现有队列，比较局部作用域/顺序调整；如改磁盘元数据须提供迁移方案 |

主责仍为 Desktop/Workbench 生命周期集成；Score 协助定义身份/持久化回执。窗口权限不归插件平台处理。当前证据没有提出重写 Kernel 历史的要求，也没有据此宣称整个 Kernel 已审计通过。

生产代码本阶段增删均为零，没有增加临时兼容分支；新增复杂度全部位于独立审计证据。真正修复时应把缺陷特征断言转为正确行为的业务回归测试，避免长期保留两套相同测试装配。

## 执行结果与环境差异

- Rust `audit_`：**6 passed / 0 failed / 66 filtered out**，exit 0。被导入的 66 个其他模块测试未执行；没有运行 Provider/凭据测试。
- SDK：**4 passed / 0 failed**，exit 0。
- Rust 格式化后按锁文件复跑仍为 6/6；SDK 复跑仍为 4/4；两个新增 Rust 文件的独立 rustfmt 检查 exit 0。
- 隐藏窗口实际观察到 Destroyed，测试进程正常退出；没有强杀进程。
- 独立审计 crate 额外启用 Tauri `test`、`unstable`，后者用于无 WebView 的 WindowBuilder API；不是生产 release 配置。
- 审计锁以生产 Desktop lock 为种子。最终包版本集合保持一致（本地根包替换除外），但 `quinn-udp` 与 `rustls-platform-verifier` 的 Windows 依赖边从 `windows-sys 0.59.0` 解析为既有 `0.61.2`。因此不能声称整个依赖图与生产完全一致；生产 lock 未改。
- 首次把 dialog 声明下限误固定为 2.7.0，离线缓存缺失而失败；核对生产 lock 后更正为实际锁定的 2.7.3，未下载依赖。
- 初次 Rust 编译遇到子模块路径、原生 WindowBuilder API 可见性等审计接线错误，均只在证据文件修正。
- 首次可执行文件在测试入口前报 `0xc0000139`。PE 导入包含 `TaskDialogIndirect`，却无 manifest/resource；系统默认 comctl32 不导出该入口。生产 tauri-build 的默认 manifest 已选择 Common Controls v6。仅给独立测试 EXE 补相同的依赖声明后，6 个测试正常执行。未改系统 DLL，也不是已证实的产品启动缺陷。

## 剩余边界与阶段停止点

- 未运行正式产品 WebView/完整 UI，未贯通真实 IPC 与 React。
- 未实测生产 ACL 下的 close/destroy 拒绝和用户重试；没有修改权限配置。
- 未执行原生文件选择框下的 Open/Save As、真实 command 并发保存/替换、崩溃断电或多平台验收。
- 未重跑完整 Workbench、三 addon、Desktop release 构建或全仓测试。
- 全面审计尚未完成：启动/DTO、Score ports、Agent、Plugin、Kernel 边界仍须继续。当前确认的局部问题不能代替这些模块的审计结论。

本小阶段到此汇报并停止。后续优先安排完整产品关闭/文件工作流验收，随后继续其余模块审计；在全面审计汇总后再实施限定范围的统一修复。
