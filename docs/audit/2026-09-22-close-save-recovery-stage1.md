# Brilliant Guitar 第一小阶段审计复核稿：关闭、保存、恢复与并发

日期：2026-09-22（Asia/Shanghai）

审计类型：普通软件质量、可靠性与可维护性审计。仅使用本 worktree、合成数据和源码证据；未触碰真实用户作品、正式 AppData、Provider、其他任务进程或安全机制。

## 结论摘要

本阶段确认四个相互关联的风险。共同问题是文档状态变更、恢复文件副作用、物理文件写入和最终窗口操作各有局部完成点，跨步骤的身份绑定、继续条件和失败结果没有保持一致。现有全局 service Mutex 与 RecoveryManager 单线程队列提供局部串行化；是否需要新的生命周期协调机制，应由后续生产路径验证决定。

1. **P1，bridge 级合成复现：最终窗口 close Promise 拒绝后，后端 cleanup mock 已返回成功，`forceClosing` 却保持为 `true`。** 同一 workspace 的重复 close 也可同时进入 bridge 后端调用。真实 Tauri command、`onCloseRequested -> destroy` 事件时序和窗口实际销毁均未验证；mock 的第二次调用报错不等同于生产重试结果。
2. **P1，生产 Rust 模块与真实 React hook 分段复现，未贯通原生 IPC：** 新增 Rust 测试通过真实 `atomic_write` 确认磁盘旧快照与当前 session 交错，并确认旧快照可以错误地标记到替换后的新文档。浏览器中直接运行 `useDocumentFiles -> WorkbenchClient -> TauriWorkbenchHostBridge`，确认仍有未保存内容时 Save and Continue 仍打开新建窗口，以及迟到的保存回执覆盖已切换文档。只有原生宿主边界为注入；未验证完整 Tauri command 调度。
3. **P1，源码及分段模块证据确认：** 打开或物理保存已经提交后，恢复文件清理失败会返回错误。Rust 测试用真实文件和 `RecoveryManager` 删除失败确认既有提交仍保留；浏览器测试确认对应 IPC 拒绝时 hook 不同步 session/checkpoint。两段证据彼此独立，尚不是 Rust/AppState 与 React 贯通的故障注入。
4. **P2，源码确认并由 RecoveryManager 模块级 probe 补强：** 恢复写入失败被静默吞掉，且 close/edit/save 的恢复操作没有版本或序列门；同路径 `Persist -> Remove` 会取消待写副作用，缺目录写入由 `schedule` 接受、到 `flush` 才报错。崩溃前无法证明最新恢复副本已落盘，但尚未完成真实断电/原生崩溃场景。

成功保存、关闭、重开以及进程重启恢复的正常路径在现有 Rust 测试中通过；这些通过项不能覆盖上述失败顺序。

## 证据等级校正

本阶段复核稿不把合成路径或说明性模型写成端到端实测：

- **L1 源码/契约确认：** `workbench_close_v1`、`workbench_open_file_v1`、`workbench_save_file_v1` 的调用顺序；`ScoreSessionService` 的锁边界、`NativeFileResult` 字段和 `mark_persisted` 调用；`RecoveryManager` 的单线程队列、同路径 coalescing、`Persist/Remove/Flush` 行为；Tauri capability 清单与已安装 SDK 的 close/destroy 命令名。
- **L2 模块级合成探针：** `.local-evidence/close-bridge-repro.test.ts` 和 `.local-evidence/stage1-close-save-recovery-repro.test.ts` 的前两例直接实例化生产 bridge，但后端/窗口均为 mock；`.local-evidence/save-race/src/main.rs` 直接复用 `ScoreSessionService`；`.local-evidence/recovery-order-probe/src/main.rs` 直接复用生产 `document_io.rs`。这些结果不覆盖原生 GUI、完整 command 调度、真实 `atomic_write` 保存竞态或 React hook。
- **L2 新增生产模块证据：** `docs/audit/evidence/stage1-20260922/production.rs` 原样编译生产 Rust 模块，7 个新增用例覆盖真实文件写入、替换文档错绑、清理失败和 Kernel undo/dirty；另运行被导入模块的 18 个既有测试。交错顺序由测试明确安排，不是 Tauri command/AppState 并发端到端。
- **L2 新增生产前端链路证据：** 同目录 `browser.ts` 使用真实 React/ReactDOM、`useDocumentFiles`、`WorkbenchClient` 和 `TauriWorkbenchHostBridge`，只注入 IPC/window 边界。4 个用例在浏览器执行且刷新后复跑一致；Open/Save 的“宿主已提交”在该测试内为注入条件，真实 Rust 模块行为由上一项独立验证。
- **说明性模型，不计入产品复现：** `.local-evidence/stage1-close-save-recovery-repro.test.ts` 的后三例只在测试内自行模拟 save-and-continue、open/remove 和 save/remove 顺序；其通过不能视为补齐对应测试缺口，也不能提升发现 2/3 的证据等级。
- **L3 未验证端到端场景：** 原生窗口实际 close/destroy ACL 拒绝后的重试；真实 `atomic_write` 与编辑/替换并发穿过 Tauri command；真实 AppState 下 open/save 的 recovery remove 失败与前端同步；断电/崩溃时恢复副本可见性；多平台窗口行为。
- **环境阻挡：** Workbench 完整测试曾为 557 passed / 60 failed，失败均为当前 worktree 缺失 `target/integrated-v2/brilliant_kernel_node.node` 的 `MODULE_NOT_FOUND`；未借用其他 worktree 产物。该阻挡不改变本阶段已通过的聚焦测试和独立 probe 结果。

## 跨层契约核对

- **Kernel：** `mark_persisted` 校验传入 checkpoint 的 document identity，并按历史 identity 找到 checkpoint；dirty 取决于当前历史 identity 与 persisted identity，而不是简单的版本号相等。undo 后即使版本值不同，也可能回到已持久化内容身份。本阶段证据没有提出必须修改 Kernel 的要求，但也不预先排除后续 Kernel 审计可能提出的改动。
- **ScoreSessionService：** `AppState.service` 是一个覆盖整个 `ScoreSessionService` 的全局 Mutex，不是 workspace 级锁。`export_snapshot` 在一次锁持有期间只返回 `(JSON, documentVersion)`，随后保存 command 在 `atomic_write` 期间释放全局锁；`mark_saved` 只接收 workspace、path、savedVersion，并从届时的当前 session 重新取得 document identity。新增模块测试确认两个文档的版本同为 0 时，旧文档磁盘字节与新文档成功保存回执可以错绑；具体 command 调度仍需端到端验证。
- **NativeFileResult / Workbench：** DTO 同时携带 `session`、`name`、`savedVersion`；`useDocumentFiles.saveDocument` 目前把 `savedVersion` 写入 checkpoint 后无条件 `onSession(result.session)`，`saveAndContinue` 只判断 Promise 成功，不比较回执版本与当前 session。Open/Save 在 command 返回错误时也不会应用已提交的 authoritative session。
- **RecoveryManager：** 已有单线程队列和路径级 pending coalescing；问题不是缺少线程安全，而是业务状态与恢复副作用之间没有 document identity/version/提交约束，且 `schedule_current_recovery` 静默丢弃 schedule/prepare/export 错误。
- **Tauri close/destroy：** capability 与最终窗口生命周期属于 Desktop 宿主职责；不应转嫁给插件平台。Workbench 只需要消费宿主提供的可重试、可判定结果。

## 共同根因与可合并处理项

可合并处理的根因是：局部成功被误用为整个操作完成、跨异步步骤缺少快照身份绑定，以及业务状态与恢复副作用的顺序不一致。operation lease、单调序列和部分提交回执是可能的实现选项，不是本阶段已经确定必须增加的抽象。

可合并为三个处理面：

1. **Workspace 生命周期门候选：** 现有全局 service Mutex 只串行单次 service 调用，不能覆盖释放锁后的文件 I/O 和窗口生命周期。后续方案可评估 workspace operation lease/单飞，但具体 close cleanup 时点必须先验证 Tauri `close -> onCloseRequested -> destroy` 时序，不能把 close Promise 返回等同于窗口已销毁。
2. **提交回执：** 保存/打开返回明确的 authoritative session、snapshot version、checkpoint 状态和 cleanup 状态；前端按结果分支更新 checkpoint/继续动作，不把“Promise resolved”当成“可安全替换文档”。
3. **恢复副作用顺序：** 优先复用现有单线程 RecoveryManager，评估在调用顺序或队列项中表达 identity/序列约束，并让 schedule/flush 失败可观察；旧操作的 Remove 不得抵消新修改。是否需要新增元数据及其具体层次，由贯通验证与方案比较确定。

可复用机制包括：全局 `Mutex<ScoreSessionService>` 对单次 service 调用的串行化、已有 document identity/version 前置条件、Kernel 的 checkpoint rejection/历史身份 dirty 语义、RecoveryManager 的原子写和损坏隔离、Workbench 的 dirty close guard/operation runtime、`NativeFileResult` 的 session 与 savedVersion 字段。建议评估替换孤立布尔 `forceClosing`、合并 Open/Save 的结果应用逻辑、替换 `let _ = state.recovery.schedule(...)` 的静默丢错，并为保存快照增加 identity 绑定。本阶段证据未要求删除、保留或重写 Kernel 历史实现，留待后续审计决定；Tauri grants 归 Desktop 宿主负责。

## 最小修复候选与影响

- **Close（待验证方案，不是实现结论）：** 评估 bridge 单飞、可复位关闭状态和宿主侧 lifecycle finalization；在决定 cleanup 位置前，必须先验证 SDK `window.close()`、`onCloseRequested`、默认 `destroy`、ACL 拒绝及 Promise 完成的实际时序。不能假定 close Promise resolve 表示窗口已销毁，也不能把需要执行的 cleanup 安排在窗口销毁后并假定前端仍可运行。Desktop 宿主负责使最小权限与最终选定的调用路径匹配，不预设必须同时增加两项 JS 窗口权限。
- **Save and Continue：** 保存回执应绑定 snapshot document identity 和 persisted checkpoint 语义；继续动作的安全条件是不会丢弃尚未持久化的内容，而不是简单比较两个版本号。应依据 authoritative session 的 document identity、Kernel 历史身份/dirty 状态及持久化 checkpoint 判断；若保存期间发生文档替换或当前内容身份未持久化，则不得继续替换/关闭。当前证据未要求 Kernel 改动，后续审计再定。
- **Open/Save 部分提交：** 采用可区分的 committed-with-cleanup-warning 结果，或将 cleanup 变为可补偿、可观察的后续步骤；前端先同步 authoritative session/checkpoint，再报告 recovery 清理失败。需要更新 DTO/错误兼容和重试语义，测试覆盖 session replacement、physical write、remove failure 三段状态。
- **Recovery：** 比较调整调用顺序与给排队项附带身份/序列两类方案，继续复用现有单线程 worker 和 atomic write。若新增元数据，会增加状态及兼容成本；应优先选择能统一顺序、减少分支的局部方案，验证 stale Remove、write failure、flush/restart。并非所有失败都必须保留 pending；关键是不能取消仍需恢复的新内容，且失败可观察、可重试。

## 验收不变量

1. 同一 workspace 的重复或交错 close/open/save/edit 请求不得丢失未持久化内容、把旧回执应用到新文档，或重复执行不可重复的副作用；每个请求的完成、取消和重试结果可判定。单飞、串行化、前置条件校验或其他方案均须用该业务结果验收，不预先规定其中一种。
2. close Promise、close-request event 和实际 destroy 的每个失败/取消点都有明确定义；窗口仍存活时不得同时出现 session 已不可恢复且 close guard 已放行。cleanup 的执行方和时点须由验证后的宿主事件时序决定，不能假定前端在 destroy 后继续运行。
3. Save and Continue 不得丢弃任何尚未持久化的新内容。安全判断必须绑定保存快照与当前文档 identity，并遵循 Kernel 历史身份/undo/dirty 语义；不得仅凭 `savedVersion != currentVersion` 永久断言 dirty，也不得在保存期间文档已替换时把旧快照标记到新文档。
4. 任何物理写入或 session replacement 后的 cleanup 失败，都返回可识别的部分提交状态，并让 TS 与 Rust 最终收敛到同一 authoritative identity/version。
5. Recovery Remove 不能删除比其操作序列更新的 Persist；写入失败必须可观察且可重试。
6. 修复必须尊重 document identity、历史身份、undo 和 persisted checkpoint 的可观察语义；本阶段不决定 Kernel 是否需要改动，由后续 Kernel 审计给出结论。
7. Desktop 宿主的最小权限必须与最终选定的关闭调用路径一致，正常关闭、权限拒绝和失败重试在支持的平台得到验证；不以增加某两项权限本身作为验收结果。

## 基线与隔离核对

- Worktree：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`
- 生产源码基线：`eae40757681a3aa6810ee63ac70ea8f880687994`
- 期望基线：同一 SHA，已核对一致；从原 detached HEAD 建立 `codex/audit-close-save-recovery-stage1`，仅收口审计文档与证据。
- 初始工作树：无跟踪改动。
- 工具：Node `v24.15.0`、npm `11.12.1`、PowerShell `7.6.5`、Cargo/Rust `1.97.1`。
- `node scripts/development-environment.mjs --check-tools --base eae40757681a3aa6810ee63ac70ea8f880687994`：退出 0；三处 lock metadata、历史 Git 对象和工具版本均通过。
- 依赖：根目录、Workbench、Desktop 均在本 worktree 以 `npm ci --offline --ignore-scripts --no-audit --no-fund` 安装；未借用其他 worktree 的依赖、target、addon 或运行数据。
- 前轮结束时，报告之外仅保留 4 个小型源码探针和 2 个对应 `Cargo.toml` 于被忽略的 `.local-evidence/`；新增验证未改写这些历史探针。新增构建缓存与合成数据放在独立 `.local-evidence/coordinator-stage1/`；被导入的原模块测试仍使用其既有临时测试目录，不接触正式 AppData。

## 发现 1：最终 close 失败破坏可重试性

**严重度：P1**

**状态：bridge 级合成复现；ACL 缺口为源码/生成清单确认；本阶段未重新启动原生 GUI。**

**位置**

- `apps/workbench/src/services/workbench-host-bridge.ts:233-244`
- `apps/desktop/src-tauri/src/commands.rs:716-724`
- `apps/desktop/src-tauri/capabilities/default.json:1-7`
- Tauri SDK close/destroy 调用由已安装 `apps/workbench/node_modules/@tauri-apps/api/window.js:944-962` 提供。

**触发条件与证据**

1. `closeNativeWindow` 先调用 `workbench_close_v1`，该 command flush/remove recovery 后删除 Rust session；随后才设置 `forceClosing = true` 并调用 `Window.close()`。
2. `default.json` 只授予 `core:default`；生成 ACL 的 `core:window:default` 不含 `allow-close` 或 `allow-destroy`，而安装的 SDK `close()` 发送 `plugin:window|close`，`onCloseRequested` 的默认放行路径发送 `plugin:window|destroy`。
3. `.local-evidence/close-bridge-repro.test.ts` 注入最终 `window.close()` rejection：调用顺序为 `workbench_close_v1 -> window.close`；拒绝后第二次 close event 的 `preventDefault` 次数为 0，证明 guard 没有复位。
4. 原 `.local-evidence/close-bridge-repro.test.ts` 的并发用例使用两个随机 workspace，只能证明 bridge 没有全局串行化；补充的 `.local-evidence/stage1-close-save-recovery-repro.test.ts` 使用固定的同一 `workspaceId`，两次 `closeNativeWindow` 在任一完成前都进入 `workbench_close_v1`，证明同 workspace 也没有单飞/去重。两者后端均为 mock。
5. 补充 probe 的重试 mock 在“session 已不存在”时主动抛出 `workspace already closed`；这与生产 `workbench_close_v1` 不同。生产 `read` 在 workspace 不存在时返回 `None`，command 仍会继续 flush/remove，随后 `close` 返回 `false`，bridge 仍可能继续调用 `window.close()`。因此 probe 只证明 bridge guard 未复位，不能证明生产重试会报错或其最终窗口结果。

**影响**

源码顺序允许出现“cleanup command 已完成、窗口 close Promise 随后拒绝”的状态；bridge 的 `forceClosing` 在该拒绝后不会复位。窗口是否仍可见、`onCloseRequested` 是否触发默认 destroy、close Promise 与实际销毁的先后关系，以及生产重试最终行为均未做原生验证，不能从 mock 推导。没有把真实用户文件丢失或生产重试失败写成已观察事实。

**现有测试缺口**

`apps/workbench/test/workbench-host-bridge.test.ts:415-444` 只把 `window.close()` stub 成始终成功，并且只检查 happy path；没有覆盖最终 close rejection、ACL denial、guard reset、同 workspace 重复 close，或生产 command 返回 `false` 后 bridge/窗口的真实行为。现有 mock 也没有覆盖 SDK `onCloseRequested -> destroy` 时序。

**建议主责**

主责：Desktop/Workbench 生命周期集成；Tauri close/destroy grants 属于 Desktop 宿主内部职责。Score 评审 session/recovery 清理语义。具体 cleanup 时点、关闭状态机和请求去重方案必须在验证 SDK 事件与实际销毁时序后决定，本阶段不下实现结论。

## 发现 2：保存快照错绑、过期回执覆盖与继续条件缺失

**严重度：P1**

**状态：生产 ScoreSessionService/atomic_write 与 React hook/client/bridge 已分别复现；原生 IPC/GUI 端到端未执行。历史 Node 顺序模型仍不计为产品证据。**

**位置**

- `apps/desktop/src-tauri/src/commands.rs:752-790`
- `apps/desktop/src-tauri/src/application/mod.rs:553-580`
- `apps/workbench/src/workbench/use-document-files.ts:40-66`
- `apps/workbench/src/workbench/use-document-files.ts:158-164,201-202`

**触发条件与证据**

`workbench_save_file_v1` 先在一次锁保护下取得 `export_snapshot`，释放锁后执行 `atomic_write`，再重新加锁 `mark_saved`。`.local-evidence/save-race` 直接复用了生产 `ScoreSessionService`：

```text
saved_version=0 receipt_session_version=1 receipt_title=edited-during-save reopened_title=before-save
```

也就是说，历史 probe 捕获的待写 JSON 是版本 0；期间编辑已把内存 session 推到版本 1；`mark_saved` 返回当前 session 版本 1 与 `savedVersion=0`。该历史 probe 没有调用生产 `atomic_write`，其 close/re-import 只证明该 JSON 对应旧标题。旧 Node 顺序模型也不能代替产品 hook 验证。

新增 `production.rs` 与 `browser.ts` 补充了四条独立证据：

1. `audit_physical_save_keeps_old_snapshot_while_session_advances`：真实 `atomic_write` 写旧快照，真实文件读回旧标题，而 `mark_saved` 回执包含已编辑的新标题和旧 savedVersion。
2. `audit_old_snapshot_is_marked_on_replacement_document`：导出旧文档后 create 替换文档，写盘旧字节，再 `mark_saved`；磁盘 documentId 是旧值，成功回执 documentId 和路径绑定却属于新文档，两个文档版本同为 0。
3. 浏览器 `save-and-continue opens New despite a newer unsaved session`：真实 hook 在 deferred 保存期间接收版本 2，宿主回执为 session 2/savedVersion 1。最终 `state=unsaved`，checkpoint 为 1，但 `newScoreOpen=true`。只证明继续动作已放行，未在测试中真正创建新文档或丢失用户文件。
4. 浏览器 `late save receipt replaces a newer document in the hook`：保存未返回时切换文档，旧文档回执随后到达，真实 `onSession` 将前端重新改回旧文档。这与 Rust 的快照错绑是不同交错，都需 identity 绑定处理。

`export_snapshot` 只返回 JSON 与版本，`mark_saved` 不接收快照 document identity；前端也无迟到回执的当前 identity 校验。这些模块证据确认各自行为，但没有证明真实 Tauri 调度出现这些交错的概率或贯通结果。

**影响**

风险集中在保存期间继续发生编辑或文档替换，而 Save and Continue 只消费布尔成功。不能仅由版本不相等断言当前内容永久 dirty：Kernel dirty 依赖历史 identity，undo 可能回到已持久化身份。真正需要保护的是任何尚未持久化的新内容不得被后续 New/Open/Close 丢弃，并且保存回执必须对应同一 document identity。

**现有测试缺口**

原业务测试 `apps/desktop/src-tauri/src/application/tests.rs:768-810` 只覆盖无并发的物理保存-关闭-重开。新增审计证据补齐了模块交错、真实 hook 的继续/过期回执行为，以及 Kernel undo 回到 persisted identity 的单独验证；仍未贯通 Rust export、并发 edit/replace、mark_saved 与前端 authoritative dirty/continue。证据测试断言的是基线缺陷，修复时应改为正确行为的业务回归测试。

**建议主责**

主责：Desktop/Workbench 生命周期集成。必要协作：Score 定义与 document identity、persisted checkpoint 和历史 dirty 语义一致的 typed result。继续动作必须证明没有未持久化内容会被丢弃；不能用单纯版本比较替代 authoritative identity/dirty 判断。并发保存或文档替换需由 operation lease、identity precondition、显式拒绝或其他经测试的方案处理。

## 发现 3：副作用清理失败发生在 session replacement/physical save 之后

**严重度：P1**

**状态：生产 Rust 模块使用真实文件系统故障，真实 hook/client/bridge 使用 IPC 拒绝注入，均已分段复现；真实 command/AppState、Tauri dialog 及跨进程贯通未执行。**

**位置**

- `apps/desktop/src-tauri/src/commands.rs:728-748`（打开文件）
- `apps/desktop/src-tauri/src/commands.rs:784-790`（保存文件）
- `apps/workbench/src/workbench/use-document-files.ts:105-120,40-66`

**触发条件与证据**

- Open：`locked(...).import_file(...)` 已替换 workspace session 后，才调用 `state.recovery.remove(...)`。remove 失败会直接 `?` 返回错误；前端只有收到完整成功结果才执行 `onSession(imported)`，因此 UI 仍持有旧 session，而 Rust 已持有新文件 session。
- Save：`atomic_write` 和 `mark_saved` 已完成后，recovery remove 失败同样通过 `?` 返回错误；前端 catch 分支不会执行 `onSession(result.session)`，也不会更新文件 checkpoint。
- 新增 `audit_import_remains_committed_when_recovery_removal_fails` 和 `audit_save_remains_committed_when_recovery_removal_fails` 使用目录占位令生产 `RecoveryManager::remove` 真实失败，确认导入 session 或已写文件/路径绑定没有回滚。
- 浏览器的 Open/Save 拒绝用例直接运行生产 hook/client/bridge，确认 UI 保留旧 session/checkpoint 并显示错误。此处宿主提交为注入条件，不把它写成真实 Rust IPC 证据。

**影响**

后续读取/编辑使用旧 document identity/version，Rust 端已是新 session，产生 stale 或 identity conflict；保存错误消息还可能掩盖“文件已经写入/后端已经替换”的部分成功状态。该类错误不是普通可重试的纯函数失败。

**现有测试缺口**

新增审计测试已覆盖两类部分提交在模块中的状态，以及前端接收拒绝后的行为。仍缺真实 command/AppState 到 React 的一致性与重试测试；原业务回归套件没有因此自动获得这些覆盖。

**建议主责**

主责：Desktop/Workbench 生命周期集成。必要协作：Score 设计 replacement/save 的提交结果；Agent 若可并发发起 score operation，需遵守同一 workspace 的身份与完成条件，不预设必须新增 lease。建议比较可观察后续清理与显式部分提交回执，复用现有结果应用流程。

## 发现 4：恢复失败不可见且恢复 remove 没有版本门

**严重度：P2**

**状态：源码确认；复用生产 `document_io.rs` 的模块级真实临时文件 probe 已覆盖同路径 Persist/Remove、缺目录写失败和 Remove 失败；完整 AppState/崩溃端到端仍未验证。**

**位置**

- `apps/desktop/src-tauri/src/commands.rs:793-802`
- `apps/desktop/src-tauri/src/document_io.rs:35-103`
- `apps/desktop/src-tauri/src/commands.rs:720-724,786-789`

**触发条件与证据**

`schedule_current_recovery` 对 `export_document`、目录准备和 `RecoveryManager::schedule` 的失败全部直接 return/ignore；编辑 command 仍返回成功。Recovery worker 在原子写失败时把内容放回 pending；显式 `flush` 会重试待写内容，并报告该次写入是否成功。`Remove` 不重试写入，也不报告此前写入错误，而是先移除 pending，再尝试删除文件；文件不存在被视为删除成功，即使删除失败，已移除的 pending 也不会放回。因此 `Remove` 不能作为持久化确认步骤。与此同时，edit、save、close 都通过同一个无版本的路径名执行 Persist/Remove；例如一次保存检查到 clean 后，紧接着的编辑可能先 enqueue Persist，而保存随后 enqueue Remove，Remove 会抵消刚发生编辑的 recovery。

新增 `audit_failed_write_can_be_silently_cancelled_by_remove`：缺父目录时 schedule 成功、flush 失败、remove 成功，随后 flush 成功但没有恢复文件。`audit_remove_failure_also_discards_pending_contents` 则证明目录占位导致 remove 失败后，pending 同样被移除；仅删除该测试自己创建的空目录解除阻挡，再 flush 也不会重试原内容。

**影响**

应用不能向用户或上层证明“最新未保存版本已有可恢复副本”。崩溃发生在静默失败窗口内时，恢复能力退化为不可见的数据安全风险；并发 close/save 还可能删除比其快照更新的 recovery。

**现有测试缺口**

缺少 recovery write failure 的可观测性测试、Persist/Remove/Flush 的版本或序列测试、edit-vs-save-vs-close 交错测试，以及崩溃重启后应恢复哪个版本的断言。

**建议主责**

主责：Desktop/Workbench 生命周期集成；必要协作：Score 规定保存 checkpoint 与 recovery identity/version 的关系。当前证据未要求 Kernel 改动；是否需要调整 Kernel 契约或实现，留待后续 Kernel 审计决定。

## 历史执行结果（本轮复核前）

- `npm ci --offline --ignore-scripts --no-audit --no-fund`：根目录退出 0。
- `npm --prefix apps/workbench ci --offline --ignore-scripts --no-audit --no-fund`：退出 0。
- `npm --prefix apps/desktop ci --offline --ignore-scripts --no-audit --no-fund`：退出 0。
- `node scripts/development-environment.mjs --check-tools --base eae40757681a3aa6810ee63ac70ea8f880687994`：退出 0。
- `node --experimental-strip-types --test .local-evidence/close-bridge-repro.test.ts`：2 passed / 0 failed。
- `node --experimental-strip-types --test .local-evidence/stage1-close-save-recovery-repro.test.ts`：5 passed / 0 failed；前两例是生产 bridge 加 mock 后端/窗口，后三例是说明性顺序模型。后三例通过不计作产品复现，也不补齐 hook/client/command 测试缺口。
- Workbench close/file/identity 聚焦：`node --experimental-strip-types --test test/workbench-host-bridge.test.ts --test-name-pattern="tauri close requests|tauri native file commands|desktop workspace identity"`：19 passed / 0 failed（其中目标 close/file/identity 测试通过）。
- Desktop `physical_save_close_and_reopen_preserves_the_business_document`：1 passed / 0 failed。
- Desktop `document_io::tests`：4 passed / 0 failed。
- Desktop `commands::tests::a_fresh_app_state_recovers_the_previous_process_document`：1 passed / 0 failed。
- `.local-evidence/save-race` Rust probe：退出 0，输出见发现 2。
- `.local-evidence/recovery-order-probe`：使用 `C:\Users\ATOM\.cargo\bin\cargo.exe run --manifest-path .local-evidence/recovery-order-probe/Cargo.toml --offline`，退出 0；输出 `persist_remove_same_path=cancelled`、`persist_missing_parent=schedule_ok_flush_err`、`remove_directory_path=err`。

## 历史文档复核（新增验证前）

- 该轮未新增、修改或重跑探针；没有用说明性模型追加产品证据。
- 该轮只读复核了 close bridge/command 差异、Tauri SDK 调用链、`export_snapshot -> atomic_write -> mark_saved` 的锁与 identity 边界、Kernel persisted/dirty 语义，以及报告内部责任与验收表述。
- 该轮只修改本审计文档；最后成功步骤为文档校正与 `git status`/tracked diff 检查。

## 补充验证与校正（2026-09-22）

- 修正验收条件：以不丢未保存内容、identity 正确及可重试结果验收，不强制单飞、lease 或特定两项窗口 grants。
- 修正 Remove 描述：先清 pending 再删文件，删除失败不恢复 pending；flush 的本次重试结果不等于过去写入已成功。
- 在审计分支新增 `docs/audit/evidence/stage1-20260922/`，直接引用生产模块，没有复制生产实现或新写顺序模型替代它。
- Rust 首次离线生成独立审计 `Cargo.lock` 后测试 25 passed / 0 failed；格式化后以 `--locked --offline` 复跑仍为 25 passed / 0 failed、exit 0。其中 7 个新增 characterization tests，18 个原模块测试。**通过意味着基线行为得到确认，不代表缺陷修复。**
- 浏览器 4 passed / 0 failed，刷新后同样 4 passed / 0 failed；Chromium UA 为 `Chrome/153.0.0.0`，Windows x64。使用本 worktree React/ReactDOM，未加载生产 Vite 配置或启动 addon 预构建。
- 审计 TypeScript 配置类型检查 exit 0；初次缺 Vite 环境类型，已在审计配置中引用现有 `vite/client.d.ts` 后通过，未修改生产 TS 配置。
- 新增 Rust 证据文件 `rustfmt --config skip_children=true --check` exit 0，未递归格式化引用的生产模块。
- 临时页面和仅监听 `127.0.0.1:5194` 的审计服务器已正常关闭；未访问外部服务、未启动或终止其他任务进程。
- 报告与复跑说明曾因工具审批超时未写入；用户确认继续后补齐。该工具超时不是产品测试失败。
- 复跑步骤与证据限制见 `docs/audit/evidence/stage1-20260922/README.md`；不声称全仓或原生 GUI 验收通过。

## 未执行项与环境阻挡

- 未在本 worktree 启动原生 GUI；未重新操作协调任务的 smoke 窗口，也未强杀任何进程。
- 未把旧 B9 的 native 观察 relabel 为本次执行结果。本阶段只独立确认了同一源码的 ACL/SDK 静态链路，并用桥接故障注入确认 guard/顺序行为。
- Workbench 完整 `npm --prefix apps/workbench test` 的一次尝试因本 worktree 未准备 `target/integrated-v2/brilliant_kernel_node.node` 而出现 557 passed / 60 failed；失败均为 `MODULE_NOT_FOUND`，不是本阶段产品结论。未借用其他 worktree addon 来绕过该阻挡。
- 未执行完整三 addon/Desktop 构建、原生 smoke、断电、签名、跨平台或真实用户文件验收。

## 交付范围与源码隔离

- 未修改生产源码、生产锁文件、公共配置或业务测试。新增锁文件仅属于独立审计 harness。
- 历史 Workbench kernel 预构建触发的两个 tracked schema 文件只有同一 blob 的索引 stat 变化，当时已用 `git add` 重新记录同一基线 blob，未形成 staged diff；新增验证没有改写这些文件。
- 交付仅含本报告、审计证据源码、复跑说明和独立审计锁；缓存、合成数据及构建产物保持被忽略，不加入提交。历史 `.local-evidence/` 探针不随此次提交交付，历史结果不能当作从交付内容即可重跑的证据。
- 审计分支：`codex/audit-close-save-recovery-stage1`。用户已授权仅提交 `docs/audit`；实际提交 SHA 与提交后状态由协调回执记录，不在文档中预写未完成的结果。
- 未合并、push、rebase 或修改 main；生产源码仍使用 `eae40757681a3aa6810ee63ac70ea8f880687994` 基线。
- 生产运行时代码复杂度变化为零；没有加入生产临时兼容分支。新增的是可转化为业务回归测试的独立审计证据，不是修复层。

## 后续审计规划（本阶段不执行）

下一小阶段优先补齐原生 GUI/Tauri close-destroy 时序、ACL 失败重试，以及真实 AppState 下保存/替换/清理失败的贯通验证，再确定局部修复方案。后续全面审计仍包括启动与 DTO 合同、Score typed ports、Agent 审批/重放/恢复、Plugin identity/grants/contribution、Kernel 事务/历史/资源边界。本小阶段补充验证到此汇报并停止，不把局部证据当作全面审计完成，也不直接进入生产修复。
