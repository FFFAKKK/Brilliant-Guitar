# 第三小阶段审计：隔离构建与跨宿主契约

日期：2026-09-22（Asia/Shanghai）

范围：延续第一、二阶段，核对正式构建产物、Desktop/Workbench 编辑契约、插件启动接线及 workspace 身份恢复。未修改生产源码、依赖锁文件或权限配置；未使用子代理，未访问真实作品、Provider 或系统凭据。

本报告是在前轮写入被工具审批服务阻断后补录。以下明确区分历史执行证据、本轮只读复核和未完成项，不把聊天中的验证记录当作已经提交的回归测试。

## 本阶段结论

1. **P1：Desktop 与 Workbench 的编辑契约不一致。** 前端接受并经真实 ScoreEditClient/TauriWorkbenchHostBridge 发送的八种 action，在 Rust `ScoreEditAction` 中没有对应变体。证据包括前轮受控发送验证和本轮源码复核；尚未执行这些请求的真实原生 IPC 验收。
2. **P2：桌面插件启动没有接上启用状态的持久化控制器。** 桌面入口执行 start 和会话冻结，却不设置 `pluginStartup`；设置 Agent 下一次启动状态时记录 `Plugin activation storage is not connected`。前轮真实入口的内存打包对照已复现，尚非正式 WebView 验收。
3. **P2：存储的附带操作失败会丢弃已读到的有效 workspace 身份。** 已有持久身份可以因无关 legacy 读取或重复写入失败而变成新 ID；恢复文件按该 ID 查找，因此存在恢复入口失联风险。没有观察到恢复文件被删除。
4. **隔离 Desktop smoke 构建成功，但产品界面验收未完成。** 产物来自审计分支的正式构建链，未增加 close/destroy grants；界面工具在初始化阶段失败，未启动产品 GUI，不能据此宣布关闭问题已修复或完整产品测试通过。

上述发现应归并进已有生命周期和宿主适配修复面，不应按按钮逐项增加开关、兼容分支或包装层。当前证据仍不支持重写 Kernel 历史，也不代表 Kernel、Agent 和 Plugin 的全面审计已经完成。

## 基线与来源

- Worktree：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`
- 分支：`codex/audit-close-save-recovery-stage1`
- 报告补录前 HEAD：`b9bbb013dbae7e44066dd045312201a78610d877`
- 生产源码基线：`eae40757681a3aa6810ee63ac70ea8f880687994`
- 前两阶段提交：`a25acfc67c8744510c31ac3ddd056ce48f9398f1`、`b9bbb013dbae7e44066dd045312201a78610d877`
- 前两阶段报告：`docs/audit/2026-09-22-close-save-recovery-stage1.md`、`docs/audit/2026-09-22-close-save-recovery-stage2.md`

报告补录前，审计 worktree 的 Git 状态干净。正式 smoke manifest 的 source.commit 仍为上述审计 HEAD；其来源信息并非报告提交之后重新构建的证据。

## 发现 A：跨宿主编辑契约漂移

**严重度：P1。**

相关实现：

- `apps/workbench/src/contracts/note-input.ts`：前端 `ScoreEditAction` 与请求校验。
- `apps/workbench/src/services/score-edit-port.ts`：类型化编辑端口。
- `apps/workbench/src/services/workbench-host-bridge.ts`：Tauri 编辑请求传输。
- `apps/desktop/src-tauri/src/dto.rs`：Rust `ScoreEditAction`。
- `apps/workbench/host/score-session.ts`：已实现相关操作的 TypeScript 宿主。

前端契约包含而 Rust enum 不包含的 action：

```text
delete-range
paste-fragment
insert-measure
remove-measure
set-measure-meter
set-key-signature
set-staff-clef
set-document-metadata
```

前轮用合成请求通过真实 `ScoreEditClient -> TauriWorkbenchHostBridge` 观察到这八类请求原样发往 `workbench_edit_v1`。Rust enum 使用 tagged enum 和 `deny_unknown_fields`，实际只有 Undo、Redo、DeleteEvent、SetEventProperties、SetTitle、SetTempo、SetMetadata、Append。

**证据边界：** 请求发送已做受控执行验证，接收端变体缺失由源码确认；本阶段没有执行这八类请求的真实 Rust 反序列化或 WebView IPC。不能把既有 TypeScript 宿主业务测试通过，写成 Desktop 也支持这些操作。

共同根因是两套宿主适配及 DTO 演进不同步，且测试主要覆盖 TypeScript 宿主，没有守住跨宿主契约。尚未证明错误来自 Kernel 事务执行。

建议统一核对操作清单、请求和返回投影，以同一组合法/非法输入覆盖两个宿主；在现有 Rust 应用服务中补齐必要适配，复用现有 Kernel 能力。不要为八个 UI 操作分别新增降级开关或第二套编辑引擎。

另有待复核项：Rust `ScoreSessionRead` 缺少 TypeScript 宿主返回的 metadata，而 UI 对 authors 存在空数组回退。本阶段未将其单独提升为已验证缺陷；应与返回投影一起验证，不能直接据此改数据格式。

## 发现 B：桌面插件启动缺少持久化接线

**严重度：P2。**

相关实现：`apps/workbench/src/ui/workbench-plugins.ts` 中的 `initializeWorkbenchPluginPreview`、`setWorkbenchUserPluginEnabled`，以及 `apps/workbench/src/workbench-app.tsx` 的插件启用设置入口。

桌面分支只执行 `workbenchPluginPlatform.start()` 和 `captureFrozenSession()` 后返回；只有浏览器分支调用 `bootstrapPersistedPluginPlatform` 并将其 startup 保存至 `pluginStartup`。随后设置用户插件启用状态时，桌面分支的 `pluginStartup` 仍为 null。

前轮对照使用已安装的 rolldown 1.2.8，将真实入口分别按 Desktop/Browser 编译到内存。通过 VM 注入内存 localStorage、isTauri 和诊断 IPC，不接 Provider、真实存储或 WebView：

| 运行模式 | 启用后的 active | nextLaunchActive | restartRequired | 存储读取/写入 | 诊断 |
| --- | --- | --- | --- | --- | --- |
| Desktop | false | false | false | 0 / 0 | UI-PLG-012 |
| Browser | false | true | true | 2 / 3 | 无 |

两个模式均未产生实际 IPC 调用。结果说明真实启动入口在受控环境下的接线差异，不能代替安装产品中的持久化和重启验收。

审计装配校正：最初直接把 CommonJS 代码作为 VM 全局脚本运行，函数声明污染了注入的 isTauri 值。改用 `vm.compileFunction` 的 CommonJS 参数包装后才得到上述对照结果。这是测试装配问题，不是额外的产品缺陷。

共同根因是两种宿主的启动路径分叉，没有提供一致的持久化控制器。建议保留现有平台 bootstrap、会话冻结和“下次启动生效”语义，统一其装配，明确桌面存储适配的责任。不要在 Agent 面板再新增独立启用状态或绕过 frozen session。

## 发现 C：workspace 身份被存储错误替换

**严重度：P2。**

相关实现：

- `apps/workbench/src/services/workbench-client.ts`：`resolveWorkbenchWorkspaceId`。
- `apps/desktop/src-tauri/src/state.rs`：按 workspace ID 确定恢复文件路径。
- `apps/desktop/src-tauri/src/commands.rs`：`read_or_recover` 按请求的 workspace ID 查找恢复内容。

`resolveWorkbenchWorkspaceId` 将读取身份、读取 legacy 身份及写入存储放在同一个 try/catch 内；任一异常都会调用 `createId()`。即使已读到有效的持久身份，无关 legacy 读取或同值写回失败仍会丢弃它。

前轮以生产函数和注入存储验证四个场景：

| 场景 | 返回值 |
| --- | --- |
| Desktop：已有有效持久身份，存储正常 | 原 ID |
| Desktop：已有有效持久身份，写回失败 | 新 ID |
| Desktop：已有有效持久身份，legacy 读取失败 | 新 ID |
| Browser：已有有效 session 身份，写回失败 | 新 ID |

合成原 ID：`11111111-1111-4111-8111-111111111111`。合成新 ID：`22222222-2222-4222-8222-222222222222`。

**影响边界：** 该结果与后端按 ID 查找恢复文件的实现共同支持“恢复入口可能失联”的判断，不是数据删除实测，也未模拟完整崩溃重启。

应将身份选择与可选持久化分开：有效身份一经确定，不因附带写入失败而失效；已有持久身份时不应依赖不必要的 legacy 读取。归并进已有恢复生命周期修复面，保留既有 key 和 ID 格式，不另建身份管理框架。

## 隔离 Desktop 构建证据

前轮执行：

```powershell
node scripts/development-environment.mjs --prepare-smoke --base eae40757681a3aa6810ee63ac70ea8f880687994
```

Manifest：`target/development-environment/desktop-smoke.json`。本轮已重新读取，并重新计算磁盘上 EXE 的大小与 SHA-256，二者均与 manifest 一致；未重建产物。字段如下：

- source.commit：`b9bbb013dbae7e44066dd045312201a78610d877`
- source.tree：`5519cbe3a57606027eafcf6c3fca57f9ade582a2`
- source.inputSha256：`b46187c5d86ba2c4f0a4f5a86f7ce6e433ef17f05a324ea55aff4cf6f1387db2`
- 产物：`target/development-artifacts/desktop-smoke-bd7b36b1babe5d66e60d96f24f9a9f3c25070bff00382ce09b83bd4b3a199a2e.exe`
- 大小：20,899,328 bytes
- SHA-256：`bd7b36b1babe5d66e60d96f24f9a9f3c25070bff00382ce09b83bd4b3a199a2e`
- identifier：`com.brilliantguitar.baseline.eca6b7a2045a4f4780aa760beee30e55`
- createdAt：`2026-09-22T12:15:50.006Z`，即北京时间 20:15:50。
- 实际构建参数包含 `--no-bundle --ci --locked --offline`，工具链为 Rust/Cargo 1.97.1。

只替换隔离 app identifier 和窗口标题，没有放宽权限。前轮核对实际 build output 与生成 schema 的字节一致：

| 生成文件 | bytes | SHA-256 |
| --- | --- | --- |
| acl-manifests | 68,210 | d3eace193b1e453756736eaf27bb156df62c7a41b2fe101403ee92ef93e69699 |
| capabilities | 165 | f1128cd7fe56244bee30c0e9029bc466df454ff8285063d9402fb4bd775ab0cd |

主窗口仍只配置 `core:default`，没有 close/destroy grants。这是生成配置的静态证据，不是本阶段真实 ACL 拒绝的运行时证据。

首次编译本身成功，用时约 2 分 42 秒；外层 clean gate 因 `apps/desktop/src-tauri/Cargo.toml` 被 Git 标记为修改而失败。前轮核对其文本 diff 为空，当前字节与 HEAD blob 一致，index stat 大小与文件大小不同，仓库 `core.autocrlf=true`。经审批刷新该文件 index stat 后，工作树恢复干净；未修改 blob、模式或暂存业务变化。重跑原构建命令耗时 45.33 秒，外层 exit 0。

这一观察尚未独立复现或定位到具体 Tauri 写入函数，不能写成已查明的产品源码缺陷。

## 验证记录与限制

以下为补录前已执行的历史证据，**不是本次报告写入时重跑**：

```powershell
node --experimental-strip-types --test --test-reporter=spec apps/workbench/test/initial-score.test.ts apps/workbench/test/workbench-host-bridge.test.ts apps/workbench/test/plugin-platform-bootstrap.test.ts apps/workbench/test/plugin-session-activation.test.ts apps/workbench/test/score-read-port.test.ts apps/workbench/test/score-edit-port.test.ts apps/workbench/test/score-change-set-port.test.ts
node node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json
```

- 上述七个测试文件：127/127 通过。
- Workbench 测试 TypeScript 检查通过。
- 另做四例身份、八例请求发送及两种插件启动模式的内存验证；不把这些数量混算进 127 个业务测试。
- 前轮用现有产物验证器复核 smoke manifest 成功，没有再次重建。
- 一次性内存验证脚本未持久化，不是已提交的回归测试；修复前应将其转成可独立重跑的契约和回归用例。
- 127/127 通过说明已有用例无失败，不说明新发现的边界已覆盖，更不表示这些缺陷已修复。

界面工具在导入 `@oai/sky` 前即返回 `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`，重置重试相同。尚未启动或操作产品 GUI，没有强杀产品进程。

未完成：正式 WebView 的关闭/重试、真实 IPC 下的八种编辑、文件选择框 Open/Save As、保存与替换并发、崩溃恢复端到端、多平台测试，以及其余 Agent/Plugin/Kernel 审计范围。不得据本报告宣称“全面审计通过”。

## 合并处理与后续修复边界

| 统一处理面 | 合并的问题 | 建议删除、合并或调整 | 兼容性与测试 |
| --- | --- | --- | --- |
| 保存与关闭生命周期 | 前两阶段保存身份、迟到回执、继续条件和关闭完成点 | 合并结果应用及继续判定，明确 session 清理和窗口销毁的责任，替换含糊的成功标记 | 保留现有取消/重试及 Kernel dirty 语义；补并发与真实窗口验收 |
| 恢复身份与队列 | workspace 身份失联、排队前静默失败、全局 flush、Remove 失败顺序 | 去掉有效身份的无谓写回依赖，局部调整现有队列作用域和错误反馈 | 优先保持存储 key、ID 和文件格式；补多 workspace 和故障重试 |
| 编辑契约与投影 | 八类 action 不对齐、metadata 返回待复核项 | 统一操作清单和宿主适配，删除修复后不再必要的重复转换或不准确回退 | 保留外部功能；任何 DTO 破坏性调整须先说明迁移；同一组契约用例覆盖两端 |
| 插件启动装配 | Desktop 缺持久化控制器、启动路径分叉 | 复用现有 bootstrap 和冻结会话模型，合并重复装配，不另建 Agent 开关状态 | 保留 next-launch 语义；补真实桌面持久化及重启用例 |

职责建议：Desktop/Workbench 负责生命周期及宿主装配；Score 负责编辑契约和投影对齐；Plugin 负责启动控制器及状态存储契约；Kernel 仅按已证实的接口需求协作，不预设历史模型有错。共享文件由一个明确负责人修改，其他任务提供契约/测试，不互相覆盖整个文件。

本阶段只新增报告，生产代码增删均为零，未新增临时兼容逻辑。上述复杂度降低属于下一修复阶段的目标，尚不是已经实现的成果。修复验收应同时记录删除/合并的路径、剩余分支及回归覆盖，不能只统计新增测试通过数。

## 落盘故障记录与阶段停止点

前轮 `apply_patch` 的目标在当前协调任务可写根目录之外，需要工具审批；自动审批服务曾返回 502，后续又在 deadline 前未完成，工具明确表示操作未执行。因此第三阶段文件此前从未成功生成，不是 Git 冲突、写入后丢失，也不是用户未授权。

未通过改 shell 写文件、关闭安全检查、修改权限或把文件搬到 main 绕过审批。审批上游异常的内部原因尚未查明，不把服务错误解释成报告内容被判定不安全。

本轮首次写入仍遇到审批超时，按工具提示原样重试一次后成功。随后已完整读回报告，确认审计工作树只新增本文件、生产目录相对上述基线无差异，main 仍为 `eae40757681a3aa6810ee63ac70ea8f880687994` 且工作区干净。成功仅说明本次写入获准执行，不代表已修复审批服务内部故障。

小阶段在完成报告落盘核对后停止汇报；不以本次补录自动启动业务修复、合并 main 或扩大审计范围。
