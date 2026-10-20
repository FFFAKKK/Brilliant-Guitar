# 核心谱面：历史、保存与自动恢复合同

## 1. 范围与触发

这是基础键盘输入之后的最小编辑闭环。它覆盖已接受作品的撤销、重做、保存、另存为，以及创建、编辑和文件替换后的自动恢复副作用；单事件删除与选中属性另见[删除合同](score-delete-input-contract.md)及[属性合同](score-event-properties-contract.md)。播放、六线谱和完整工具箱不在范围内。普通没有文档动作的fixture不提供这些写入口。

2026-10-11续接：[公开弦品编辑](score-fretted-position-contract.md)也使用原历史/文件链。
当前history在staff或Tab任一投影支持时可用，防止高品位使staff超出现有视图音域后
锁死合法Tab编辑的撤销；这不代表六线谱界面已接入。

## 2. 签名

[范围与剪贴板](score-range-clipboard-contract.md)继续沿本历史/guarded保存链；范围删除或一次粘贴（含补休止）各是一条历史，不增加第二份历史权威。

[小节与拍号](score-measure-structure-contract.md)也使用原链；插入/删除/最多100小节的连续拍号各为一条可撤销事务，保留音符和 pickup，no-op不产生历史。真实 Native guarded 磁盘重开另有对应专项。

```ts
session.canUndo(): boolean
session.canRedo(): boolean
session.undo(): Promise<Result>
session.redo(): Promise<Result>
session.canSave(): boolean
session.canSaveAs(): boolean
session.save(saveAs?: boolean): Promise<Result>

client.saveNativeDocumentGuarded(
  suggestedName: string,
  saveAs: boolean,
  expected: { kind: "document"; documentId: string; documentVersion: number },
): Promise<NativeFileResult | null>

// ScoreSessionRead.persistence?: ScorePersistenceState
// 新 Native 宿主提供；旧宿主和浏览器仍可省略整个字段。
interface ScorePersistenceState {
  readonly sessionId: string;
  readonly savedVersion: number | null;
  readonly dirty: boolean;
}

// ScoreSessionRead.warnings?: readonly WorkbenchIssue[]
// 最多4项，复用isWorkbenchIssue，severity只能为"warning"。
// Rust为空时省略；旧宿主可继续省略，不新增recoveryWarning字段。
```

宿主内部恢复写者沿用一个worker，不新增IPC或环境变量：

```rust
// RecoveryManager
fn schedule(&self, path: PathBuf, contents: String) -> Result<(), HostError>;
fn flush(&self, path: PathBuf) -> Result<(), HostError>;
fn status(&self, path: PathBuf) -> Result<(), HostError>;
fn remove(&self, path: PathBuf) -> Result<(), HostError>;
```

新原生窗口关闭协议独立于旧文档关闭：

```ts
type NativeClosePrecondition = { kind: "empty" }
  | { kind: "document"; sessionId: string; documentId: string; documentVersion: number };
client.onNativeCloseRequestedGuarded(handler: () => void | Promise<void>): Promise<() => void>;
client.closeNativeWindowGuarded(expected: NativeClosePrecondition): Promise<boolean>;
// IPC: workbench_close_window_guarded_v1({workspaceId, expected})
// true = 宿主已分派原生destroy；false = 用户取消关闭或保存。
// createReadonlyScoreDocumentSession({ ..., nativeClose?: boolean }) 默认false；
// createDesktopReadonlyScoreSession由可信组合根明确启用true。
```

guard字段严格；ID为1–256个UTF-16单元，版本为非负安全整数。
旧`workbench_close_v1({workspaceId}) -> boolean`、旧boolean listener和无参数
`client.closeNativeWindow()`保持原合同；缺少新端口时报错，不用旧端口补位。

`notation.core.document.undo`、`redo`、`save`、`save-as`由核心UI内部贡献，经同一个router、菜单和全局快捷键执行：`Mod+Z`、`Mod+Shift+Z`/`Mod+Y`、`Mod+S`、`Mod+Shift+S`。输入框、IME和修饰键边界仍由原宿主处理。

## 3. 所有权与流程

- 历史深度、作品版本和音乐结果由Rust会话拥有；UI只读取accepted session，不维护第二份历史。undo/redo也是带当前ID和版本的typed edit，沿同一互斥、epoch和结果校验。
- 保存以当前作品ID/版本为预条件。旧接口入口也先捕获该预条件；受保护接口不允许旧宿主静默降级。
- 对话框前在service锁内捕获不可变`SaveSnapshot`：完整导出、作品ID/版本、宿主生成的session实例ID、源文件绑定和原保存版本。文件选择对话框在锁外；重锁后核对快照的全部身份，再原子写入和`mark_saved`。期间编辑、替换、同ID同版本重开或另一次保存改变绑定时，原目标文件和检查点不变。
- session实例ID不进入作品文件。Native的`persistence`来自原Kernel检查点：`savedVersion`为最后物理保存时的版本，`dirty`比较历史身份，不以当前版本是否相等推导。undo回已保存历史后，即使版本递增也恢复clean。Native文件回执必须与自身`persistence.savedVersion`一致且`dirty=false`；旧宿主省略整个字段的既有合同保留。
- React文件hook同步占用保存入口，防止同一渲染内Save/Save As重复派发。迟到回执只影响原session，不能覆盖新作品或同ID重开的实例；原实例有更新编辑时保留更新读，仅记录实际保存检查点。“保存并继续”只有当前内容已clean才放行。旧作品已提交的迟到成功不报告成当前作品保存失败。
- 取消保存返回成功但未改变；宿主错误或坏回执保留最后accepted session、dirty和原检查点。成功保存才更新检查点。
- 保存后的恢复文件清理或最近文件登记失败属于独立warning，不回滚已经成功的磁盘文件或作品检查点。
- 重新打开文件建立新的干净会话；文件内容保留，内存版本和撤销栈不序列化。

### 恢复快照跟随同一提交顺序

- create/create_guarded/edit/import在同一service锁内完成原操作、导出当前快照并入队，之后才释放锁。读取、发现磁盘恢复文件及导入也持有同一锁，避免恢复覆盖已经接受的新作品。
- UI和Agent capability共用`invoke_with_recovery`；只有catalog声明为mutation且结果为Completed时入队。查询、权限拒绝和stale拒绝不写恢复副本。恢复失败不把已提交的mutation改成失败或触发重放；下一次session read返回其已知warning。
- `schedule`即使目录准备失败也入队最新快照，并反馈失败。单worker按路径保留最新pending内容，每250ms检查一次固定截止点；连续消息不能推迟截止点。写入失败保留pending和失败状态，后续周期或显式flush重试，继续使用原Windows长路径原子替换。
- `status(path)`只反馈该路径已知失败；没有warning不等于pending内容已经落盘。`flush(path)`只确认本路径待写内容；没有pending时成功，允许既有清理失败继续重试remove。
- `remove(path)`只有物理删除成功或文件已经不存在才清除pending/失败状态；删除失败保留最新内容。成功Open/Save在原service锁内先入队已接受作品，再remove；清理失败后的恢复必须是新作品，不能复活被替换的旧快照。
- `file.recovery-unavailable`复用文件来源的`WorkbenchIssue`。有效session仍ready，dirty/保存检查点由原persistence决定；备份源通过现有warnings状态、React通过原feedback端口反馈。显式新建同样保留宿主warnings，不能在重置文件检查点时清空它。
- 健康重读替换旧恢复warning，保留recent等独立警告；Open/Save合并session与操作级warnings。取消或失败不清空现有警告。
- 旧文档关闭在同一service锁内仅flush/remove本workspace，均成功后才关闭session；任一步失败保留session供重试。当前两个桌面入口使用下述新窗口协议，不把旧文档关闭回执当作窗口销毁。

### 原生窗口销毁后才释放文档

- Rust只允许main窗口调用新关闭命令。先在原service锁内比较session实例、作品ID和版本并捕获原SaveSnapshot；原生确认和文件选择在锁外、命令worker中运行。没有物理保存检查点或Kernel dirty为true时，宿主统一提供“保存／不保存／取消”。恢复导入虽然有干净历史，没有物理检查点仍须确认。
- 保存使用确认前的原快照、原文件绑定和原保存版本，不在确认之后重新导出。取消不派发destroy；保存失败保留当前作品、检查点和原目标字节。确认/文件选择期间编辑或同ID重开，旧关闭或保存均被拒绝。
- 最终比较、导出/flush本workspace恢复快照、登记closing和原生destroy派发按此顺序持有同一service锁。首次派发失败撤销本次登记，保留作品与恢复供重试；已接受的派发不能被后续失败重发撤销。
- destroy回执不是销毁完成。只有真实`WindowEvent::Destroyed`才remove恢复并关闭session；清理失败仍释放已销毁session，但保留磁盘恢复副本。closing tombstone持续到进程结束，迟到read/create不能从恢复复活作品。无登记的意外销毁不清理恢复。
- 所有workspace typed读、编辑、Open、Save和旧close共用closing门；Agent的拒绝是`CapabilityResult::Unavailable`，正常写入Resolved回执，不遗留Started。锁顺序始终service→closing。
- Rust在main活动文档存在或service繁忙时同步阻止CloseRequested，保护JS尚未注册的窗口；无活动文档的空壳可以退出。新JS listener先同步preventDefault，再执行异步handler，永不自行close/destroy；旧listener保留原协议。
- backup原文档owner串行关闭与原busy/epoch/dispose。未加载时只read-existing，不为关闭自动创建文档；取消释放busy，派发成功保持busy直到销毁。失败保留accepted作品并反馈，重试先重读。关闭监听只注册一次，释放会解绑，迟到注册立即解绑；原图形reload可重试失败注册。
- React同样使用新宿主确认。文件动作采用同步互斥；稳定listener通过ref取最新session和工作状态，保存/打开未完成时不重入关闭。桌面不再重复注册浏览器beforeunload，浏览器原保护保留。新建/打开的现有未保存确认不变。
- 保留延后窗口启动、配置租约最后字段及启动失败退出码。当前实现只服务已有单main窗口，不据此开放多窗口产品能力。

## 4. 错误矩阵

| 条件 | 行为 |
| --- | --- |
| history为空 | `document.history-empty`，不派发 |
| 文档未ready、失败、动作重叠或释放 | `document.not-ready`/`document.busy`/`document.disposed` |
| 无编辑端口或保存端口 | `document.edit-unavailable`/`document.save-unavailable` |
| 非桌面文件宿主 | `document.native-required` |
| 保存参数、ID/版本或回执不合法 | `document.invalid-input`或`document.operation-failed`，不改检查点 |
| 对话框期间session实例/文件绑定/保存版本变化 | 宿主`file.save-stale`，409；写盘和检查点均不变 |
| 已成功保存的回执抵达时前端已换session | 忽略迟到回执，不更新新session/检查点、不放行待执行动作 |
| 保存弹窗取消 | `{ ok: true, changed: false, cancelled: true }` |
| 提交后清理/最近目录失败 | accepted save + `WorkbenchIssue` warning |
| 已提交创建/编辑后恢复目录不可用或已知写失败 | 返回有效session + `file.recovery-unavailable` warning；保留最新pending，不重放业务操作 |
| capability查询、权限/版本拒绝 | 不安排恢复写入，沿用原结果 |
| 恢复清理失败 | 保留pending/失败状态；Open/Save保持已接受作品和检查点，文档关闭保持session |
| 另一workspace恢复写失败 | 本workspace的flush/remove不继承其失败 |
| session warnings非法、超过4项或包含error | 拒绝坏回执，保留最后accepted结果 |
| 关闭guard不合法/宿主缺失新端口/非boolean回执 | 拒绝，保留作品；不降级旧close |
| 关闭确认期间作品/实例改变 | `file.close-stale`，409；不销毁、不清恢复 |
| 已在原生关闭中 | `file.workspace-closing`，409；Agent返回`capability.workspace-closing`并落Resolved回执 |
| 确认或关闭前保存被取消 | false；保留作品、恢复及检查点，可重试 |
| 窗口destroy分派失败 | 首次登记撤回，保留恢复/作品；已接受派发的登记保持 |
| Destroyed后的恢复删除失败 | 只记录清理失败，恢复磁盘字节保留；窗口已销毁，不虚构仍可编辑 |
| backup关闭监听失败 | 原文档状态反馈失败；原reload重试监听和读取，不新增文档 |

## 5. 案例

- 正常：输入后`Mod+S`使用当前版本保存，dirty变为false；再次输入后dirty重新变为true。干净作品禁用保存但仍可另存为。
- 冲突：保存对话框期间输入新音符，宿主以旧版本保存请求返回409，磁盘与检查点保持原值，重读后再保存。
- 重新打开：保存后的文件重新打开，音符和元数据保留，undoDepth从干净会话重新开始。
- 同ID同版本重开：新实例不能接收旧保存快照；两个另存为对话框先后返回时，后到的旧绑定请求不能覆盖先接受的绑定。
- 历史身份：版本1保存、版本2编辑、版本3 undo回已保存内容，`savedVersion=1, dirty=false`，无需再次保存。
- 恢复故障：新建成功但恢复目录被占用，作品仍ready且显示warning；修复目录后flush写入相同作品，健康重读清除恢复warning，recent警告保持。
- 替换与清理：打开B后删除恢复文件失败，保留B的最新快照；之后恢复不得得到旧作品A。
- 基础兼容：旧宿主没有warnings/persistence仍沿原合同；无pending的清理失败可再次关闭，不被历史失败状态永久阻塞。
- 关闭：未保存作品取消后可继续编辑；选择不保存后直到Destroyed前仍保留恢复。确认时发生同ID重开，旧快照不能覆盖文件或关闭新实例。
- 错误：先释放service锁再导出/入队，导致并发编辑倒序；删除失败却清pending，导致恢复内容丢失。

## 6. 验证

- `apps/workbench/test/readonly-score-history-save.test.ts`：真实typed client/IPC envelope、历史版本、保存/另存、取消、失败、坏回执、mutex和释放；恢复warning不降级ready、保存后合并、健康重读只清恢复warning、显式guarded新建不丢warning且不虚构已保存状态。
- `apps/desktop/src-tauri/src/commands/save_tests.rs`：真实原子文件写入、stale身份/版本拒绝、失败保留恢复文件、保存后重新导入和Windows共享失败警告。
- `apps/desktop/src-tauri/src/application/tests.rs`：编辑/替换/同ID重开/跨workspace/竞争另存为快照拒绝、写失败零checkpoint，以及undo回已保存历史。
- `apps/workbench/test/document-file-state.test.ts`：可选persistence/warnings严格解码、历史clean及迟到回执不覆盖；与`readonly-score-history-save.test.ts`一起覆盖当前guarded owner及旧宿主省略字段的兼容性。
- `apps/desktop/src-tauri/src/document_io.rs`恢复回归：按路径flush/status、失败删除保留最新pending、目录修复后重试、持续消息不饿死写入、后台失败保持到成功重试。
- `apps/desktop/src-tauri/src/commands/recovery_tests.rs`：创建warning、capability查询/拒绝不写与mutation接线、Open/Save清理失败保留新作品和检查点、workspace关闭隔离、无pending清理重试；四线程40次编辑后的恢复字节等于当前service导出。
- `apps/workbench/test/browser/document-save.browser.html`：在Workbench Vite服务打开，真实React hook/client/bridge验证迟到保存、取消、错误、同渲染重入、保存后warning及“保存并继续”。原生IPC由测试注入，不替代原生文件选择框验收。
- `apps/desktop/src-tauri/src/native_close.rs`决策回归和`commands/native_close_tests.rs`：取消、保存失败/取消/成功、确认前原快照、恢复导入无物理检查点、stale实例、dispatch与Destroyed分离、失败重试和清理失败保留字节。
- `apps/desktop/src-tauri/tests/native_close.rs`：Windows独立子进程、独立WebView数据目录；真实空壳关闭、service繁忙时阻止默认关闭、原guarded命令派发后session/恢复仍在、Agent结果与Resolved回执、真实Destroyed后清理。默认ignored，须显式运行；构建器只为Windows MSVC测试链接Common Controls v6，不改变生产资源。
- `apps/workbench/test/workbench-native-close.test.ts`：已安装Tauri SDK不默认destroy，异步handler失败也保持prevent；实际desktop工厂覆盖欢迎页和dirty工作区。
- `apps/workbench/test/readonly-score-native-close.test.ts`：原owner的read-existing、busy/取消/失败/重试、释放、迟到注册和旧端口不降级；React浏览器页另覆盖稳定listener、保存互斥和桌面无双重beforeunload。
- `design/frame-visual/tests/startup-center-product.test.js`和`startup-center-session.test.js`：实际desktop工厂使用原bundled SDK；共享测试替身须提供`transformCallback`、`plugin:event|listen`、`__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event,eventId)`及`plugin:event|unlisten({event,eventId})`。断言只有一份关闭监听、文档重读复用它、dispose后监听和callback均归零；不能把替身缺口当作生产注册失败并取消保护。
- `design/frame-visual/tests/score-note-input.test.js`：原UI router、菜单、键盘、投影与输入的undo/redo/save链。作品变更与DOM绘制替身不能冒充原生窗口验证。
- 相关正式/备份边界、类型、生成、整包和离线Rust专项通过后才封存；原生文件对话框与输入手感另行验收。

## 7. 错误与正确

```ts
// 错误：UI在保存前复制作品或直接写JSON。
await writeFile(path, JSON.stringify(score.snapshot()));

// 正确：带宿主身份/版本预条件的保存，由宿主导出并原子写入。
await documentActions.save(false);

// 错误：同ID同版本足以证明还是同一个打开实例。
if (saving.documentId === receipt.documentId) onSession(receipt);

// 正确：使用宿主实例身份调和回执，保留较新的当前读。
const accepted = reconcileSavedSession(saving, current, receipt);
if (accepted) onSession(accepted);
```

```rust
// 错误：提交和恢复导出之间允许另一编辑穿插。
locked(state)?.edit(request)?;
let document = locked(state)?.export_document(workspace_id)?;

// 正确：在原service锁内提交、导出并入队；恢复副作用失败单独反馈。
change_document(state, workspace_id, |service| service.edit(request))?;
```

```ts
// 错误：文档先被清掉，随后窗口close失败。
await legacyDocumentClose();
await window.close();

// 正确：捕获accepted实例，由宿主确认、保留恢复并分派destroy。
// session只在真实Destroyed中释放。
await client.closeNativeWindowGuarded(nativeClosePrecondition(acceptedSession));
```
