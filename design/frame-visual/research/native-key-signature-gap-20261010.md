# 桌面调号接线缺口

2026-10-10 小节/拍号续做发现的实际跨层缺口，下一切片的输入。当前 UI 平台与命令协议不用因此重做。

1. `src/first-party-modules/key-signature.ts` 已实现正式 `brilliant.notation.key-signature.set`、effect、validate 和固定 module catalog。调号作为 part-owned schemaVersion 1 extension，payload 为按 measureId 排序的稀疏 changes；修改按文档顺序归一化，去除与前调号相同的冗余，inherit 移除当前 change。
2. `apps/workbench/host/score-session.ts` 的旧 TS 宿主使用 compileWorkbenchModuleCatalog/open integrated bus；删除小节会在同一 batch 先清理每个 part 的调号再删除定义。旧 projection 输出有 measureIndex 的 change list，输入与共享渲染由该读模型继承调号。
3. `apps/desktop/src-tauri/src/application/mod.rs` 仍创建 `KernelSession`，operate_stage4_bytes 只接公开 Core。Native DTO 没有 set-key-signature，project_notation 对非空 extensions 返回 unsupported。其播放投影同样需要核对已知扩展支持边界。旧调号文件不会静默显示成 C 大调，但当前无法在新桌面 UI 中编辑它。
4. `crates/brilliant-kernel-session/src/integrated.rs` 已有 `IntegratedKernelSessionV2` 与 `ContributionExecutorV2`；Node integrated host 已使用正式 gateway。应接一个可信固定官方领域集合，保持同一 Native 文档/历史/文件所有者，不给 UI 填第二份 extensions，也不能每次操作重建 session。

后续顺序：确认官方模块 executor/固定 assembly 的现有复用途径和职责→接原 Native 会话的 integrated gateway/读写接口→复用正式调号 payload、归一化及验证规则→同步 notation/playback 的已知扩展读回→接窄 UI 命令与紧凑调号控件→验证 set/inherit/取消调号、音高基线、删除 change-bearing 小节、一次撤销、失败与物理保存重开。

验收必须同时证明 module 注册和真实 Native 执行；不能以旧 TS 测试、绘制 fixture 或前端 dropdown 当作已接通证据。本轮的小节/拍号实现保持保护边界，只开放已接通动作。

## 同日续做状态

以上是小节切片结束时的缺口记录。下一切片已接已有 IntegratedKernelSessionV2、固定正式调号贡献与原文档服务，补齐同源typed读取、调号投影及batch删除清理。原TS compiler生成assembly和67项callback差分用例；Native实际写入、一次undo、未知/future保护及物理保存重开均已进入真实Rust回归。前端调号控件尚未接通，不能把它计作已完成。最终当前资格以 evidence/native-key-signature-20261010/verification.md 为准；本轮仍不恢复原生窗口操作。

## 同日再续做：前端调号入口完成

前端控件已通过原窄文档入口、单一 router、选择事务和正式 Native 调号链接通，支持有效值/显式自然调/继承、no-op 和后续音符输入基线。旧字段连续 change 的捕获记录及派发前隐藏取消已在原控制器修复，不增加音乐/历史所有者。最终17步骤通过，备份整包907/907，Native调号7/7与物理保存8/8复验通过；最新限定证据为 evidence/score-key-signature-controls-20261010/verification.md。以上旧缺口描述保留为历史；原生窗口/像素/IME/低配资格仍待验。
