# 核心谱面：历史与保存合同

## 1. 范围与触发

这是基础键盘输入之后的最小编辑闭环。它只覆盖已接受作品的撤销、重做、保存和另存为；单事件删除与选中属性另见[删除合同](score-delete-input-contract.md)及[属性合同](score-event-properties-contract.md)。播放、六线谱和完整工具箱不在范围内。普通没有文档动作的fixture不提供这些写入口。

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
```

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

## 5. 案例

- 正常：输入后`Mod+S`使用当前版本保存，dirty变为false；再次输入后dirty重新变为true。干净作品禁用保存但仍可另存为。
- 冲突：保存对话框期间输入新音符，宿主以旧版本保存请求返回409，磁盘与检查点保持原值，重读后再保存。
- 重新打开：保存后的文件重新打开，音符和元数据保留，undoDepth从干净会话重新开始。
- 同ID同版本重开：新实例不能接收旧保存快照；两个另存为对话框先后返回时，后到的旧绑定请求不能覆盖先接受的绑定。
- 历史身份：版本1保存、版本2编辑、版本3 undo回已保存内容，`savedVersion=1, dirty=false`，无需再次保存。

## 6. 验证

- `apps/workbench/test/readonly-score-history-save.test.ts`：真实typed client/IPC envelope、历史版本、保存/另存、取消、失败、坏回执、mutex、释放和warning。
- `apps/desktop/src-tauri/src/commands/save_tests.rs`：真实原子文件写入、stale身份/版本拒绝、失败保留恢复文件、保存后重新导入和Windows共享失败警告。
- `apps/desktop/src-tauri/src/application/tests.rs`：编辑/替换/同ID重开/跨workspace/竞争另存为快照拒绝、写失败零checkpoint，以及undo回已保存历史。
- `apps/workbench/test/document-file-state.test.ts`：可选persistence解码、历史clean及迟到回执不覆盖；`readonly-score-history-save.test.ts`同时覆盖当前guarded owner与旧宿主省略字段的兼容性。
- `apps/workbench/test/browser/document-save.browser.html`：在Workbench Vite服务打开，真实React hook/client/bridge验证迟到保存、取消、错误、同渲染重入、保存后warning及“保存并继续”。原生IPC由测试注入，不替代原生文件选择框验收。
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
