# 第四小阶段审计：可重复的跨宿主边界验证

日期：2026-09-22（Asia/Shanghai）

范围：为第三阶段发现补齐已落盘、可重复的生产路径证据，复核作者信息返回。不修改生产行为，不使用子代理，不启动产品 GUI，不访问真实作品、Provider、系统凭据或外部服务。

## 结论

1. **补强 P1：八种前端编辑请求被 Rust DTO 确实拒绝。** 不再只凭 enum 源码判断；同一组 JSON 已通过真实前端验证和发送路径，再与真实 Rust 反序列化结果逐一核对。错误均为对应 action 的 `unknown variant`。
2. **确认 P2：作者信息仍在文档中，但 Desktop 会话投影遗漏 metadata。** 专用 `read_metadata` 和重新导出的文档保留 `Audit author`，同一文档/版本的 session JSON 没有 metadata，而前端仍将该 session 判为有效。UI 的空作者回退由源码确认，未运行完整页面；没有证据表明作者数据被删除。
3. **补强 P2：桌面插件启用意图没有持久化接线。** 真实入口在内存打包环境中启用 Agent 后仍未保存设置；新的模块实例仍未启用。浏览器对照能保存并在新的实例中恢复启用状态。
4. **补强 P2：有效 workspace ID 被附带存储失败替换。** 四个生产函数用例稳定确认：正常时复用已有身份，写回失败或无关 legacy 读取失败时返回新身份。

**Rust 2/2、Node 17/17 通过表示上述基线行为复现成功，不表示产品缺陷修复。** 本阶段不重复计算第三阶段已有发现；仅将作者信息投影从待复核项提升为确认项。

## 基线与证据

- Worktree：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`
- 分支：`codex/audit-close-save-recovery-stage1`
- 本阶段起点：`d3cbaaedd2f6c237e0c8f405687365497e6c3a6f`
- 生产源码基线：`eae40757681a3aa6810ee63ac70ea8f880687994`
- 可提交证据：`docs/audit/evidence/stage4-20260922/`
- 带日志的成功运行：`.local-evidence/coordinator-stage4/run-6RRGuN/`
- 该次 run.json 时间：`2026-09-22T14:46:07.732Z`，北京时间 22:46:07。

`run.json` 记录运行时 HEAD、生产基线、六项审计输入的 SHA-256；同时保留 Rust/Node stdout、stderr、退出状态和 Rust 生成的实际请求结果/投影。此时新增测试尚未提交，不能仅用当时 HEAD 代表全部审计输入；应同时核对记录的输入哈希。原始运行产物保留在本地忽略目录，测试源码及复现说明进入提交。

复用第一阶段独立审计 crate，只为其 Cargo.toml 新增 `cross-host-contract` test target；没有新增 crate、修改审计 lock 或生产 lock。Rust 生产模块通过 `#[path]` 原样编译，Node 直接导入生产校验器/client/bridge，插件入口由已安装 rolldown 编译到内存。

## A. 编辑请求与返回投影

主位置：

- `apps/desktop/src-tauri/src/dto.rs:87`：Rust 编辑 enum。
- `apps/desktop/src-tauri/src/dto.rs:131`：Rust session DTO。
- `apps/desktop/src-tauri/src/application/mod.rs:822`：session projection。
- `apps/desktop/src-tauri/src/application/mod.rs:114`：独立 metadata 读取。
- `apps/workbench/src/contracts/note-input.ts`：前端编辑请求契约。
- `apps/workbench/src/contracts/score-session.ts:20`：metadata 可选兼容边界。
- `apps/workbench/src/workbench-app.tsx:208`：无 metadata 时的 UI 数据回退。

共享样本中的 `undo`、`set-title` 能被 Rust DTO 接受；其余八项被拒绝：

```text
delete-range, paste-fragment, insert-measure, remove-measure,
set-measure-meter, set-key-signature, set-staff-clef, set-document-metadata
```

十个样本均通过前端 `isScoreEditRequest`，经 `ScoreEditClient -> TauriWorkbenchHostBridge` 发往 `workbench_edit_v1`，发送的 workspace、requestId、documentId、expectedVersion 和 action 与 Rust 实际读取的样本相同。Node 的返回值来自另一个实际 Rust session，用于完成发送路径而不是证明编辑成功；本阶段没有执行真实 IPC handler 或这些 action 的 command。支持的两项也仅验证反序列化接受，未宣称其具体编辑执行成功。

作者信息用例先用生产 service 创建合成文档，再仅在测试 JSON 中设置作者并通过生产 import 导入。之后读取 session、read_metadata 和 export：专用读取及导出包含作者，session 无 metadata，documentId/version 对齐。前端生产校验器接受该 session。源码显示 UI 随后使用空 authors；实际页面展示尚未验证。

共同根因是宿主适配和投影推进不同步，配合过渡期可选 metadata，允许“请求端具备功能、接收端不支持”及“基础 session 有效、信息不完整”同时存在。已有可选声明是明确的过渡兼容设计，不能把它单独说成错误；问题在于桌面适配缺失后仍暴露对应功能、且未有跨宿主验收。当前证据不指向 Kernel 数据丢失或历史损坏。

统一修复方向：一次性对齐操作清单及 session 投影，复用已有专用 metadata 读取的语义和 Kernel 能力。补齐宿主后评估删除不再必要的空数据回退及重复转换；若需要收紧 metadata 可选契约，应先核对全部宿主与旧数据兼容，不能立即移除。不要逐个按钮增加隐藏开关，也不要另造编辑执行器。

## B. 插件启动与下一次生效

主位置：`apps/workbench/src/ui/workbench-plugins.ts:88`、`:113`。

通过真实入口分别构建 Desktop/Browser 模式，每次在新的 VM 中装配，只共享内存存储 Map。初始 Agent 都不活跃，启用后得到：

| 观察项 | Desktop | Browser |
| --- | --- | --- |
| 当前 active | false | false |
| nextLaunchActive / restartRequired | false / false | true / true |
| 首轮存储读取 / 写入 | 0 / 0 | 2 / 3 |
| 诊断 | UI-PLG-012，storage is not connected | 无 |
| 新模块实例中的 active | false | true |
| 新实例 restartRequired | false | false |
| 实际 IPC 调用 | 0 | 0 |

新的模块实例不是正式产品重启。测试未渲染 React、未执行 Tauri/WebView 或实际持久化文件，也未连接 Agent Provider。它将“平台模块本身支持 next-launch”与“桌面 composition root 未接好 storage/controller”区分开来。

修复应复用已有 bootstrap/startup controller，并明确 desktop storage 责任，保留当前会话不可变和下一次启动生效语义。不应在 Agent UI 复制一套开关状态，也不能靠运行中重新激活插件补偿启动接线。

## C. 工作区身份与恢复入口

主位置：`apps/workbench/src/services/workbench-client.ts:66`、`:80`。

四项生产函数测试结果：Desktop 正常存储复用已有 ID；Desktop 同值写回失败、Desktop legacy 读取失败、Browser 同值写回失败均生成新 ID。存储全部为合成内存对象，没有读取用户浏览器存储。

根因仍是有效身份的选取和附带读取/写入共享一个 catch，任一失败都会放弃已获取的身份。应与前两阶段 recovery 生命周期统一处理，把已有身份的有效性与后续写入是否成功分开，减少不必要的 legacy 读取和同值写回。保持既有 key、UUID 和恢复文件格式；无需引入新的身份框架。

本阶段未运行真实崩溃重启或在磁盘上模拟身份变化后的恢复选择，仍只能据后端按 ID 查找恢复的实现判定入口失联风险，不能声称恢复文件删除已复现。

## 运行结果与装配修正

复现命令和完整说明见 `docs/audit/evidence/stage4-20260922/README.md`：

```powershell
$env:Path = 'C:\Users\ATOM\.cargo\bin;' + $env:Path
node docs/audit/evidence/stage4-20260922/run.mjs
```

- Rust：2 passed / 0 failed / 18 filtered out；被导入的其他 18 项测试未运行。
- Node 审计：17 passed / 0 failed，即十个共享请求、一个投影、四个身份和两个插件启动用例。
- 同断言初次全绿和增加日志后的重跑均 exit 0；上述带日志目录对应后一次。
- 现有相关业务用例：133 passed / 0 failed，覆盖 initial-score、host bridge、plugin bootstrap/session activation、Score read/edit/change-set、Agent host bindings 和 workspace-id 九个文件；不是 Workbench 全量测试。
- `node node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json`：exit 0。这是既有 TypeScript 测试范围，不声称覆盖新增 .mjs 的静态类型。
- 新增 Rust 文件独立 `rustfmt --check`：exit 0；Node 审计源码通过语法检查及实际执行。

审计装配期间修正了 Cargo 不在命令 PATH、遗漏 document_io 引用、Windows 动态 import 需要 file URL、插件查找应使用 manifest.id 四项问题。修正均限执行环境或审计文件，不是新增产品缺陷。新增目录曾遇审批超时，获准重试后才创建；没有换写法绕过审批。

## 复杂度、职责与阶段边界

生产源码增删为零，未新增临时兼容逻辑。此次仅新增可复用样本、生产路径审计测试和运行记录；复用一个已有审计 crate，避免再维护一份 lock。未来修复时应将缺陷特征断言改成正确行为回归，迁入现有业务测试并去掉重复装配，不长期维护两个版本。

职责维持：Score/桌面适配共同对齐编辑和投影，插件平台负责启动控制器/存储契约，Desktop/Workbench 生命周期负责恢复身份与保存关闭。每个共享文件仍只能有明确单一修改负责人；没有给其他任务派发改动，也未让它们同步覆盖文件。

尚未覆盖：正式 WebView 关闭及重试、真实 IPC/文件选择框、保存替换并发、崩溃恢复端到端、多平台，以及其余 Agent/Plugin/Kernel 的完整边界审计。这些是未完成项，不以本阶段测试通过代替。下一小阶段应继续剩余边界核查；统一修复仍须以审计汇总为依据。

本小阶段在报告、测试和复现说明落盘并核对后停止汇报；不自动合并 main，不提前宣称全面审计完成或启动无关重构。
