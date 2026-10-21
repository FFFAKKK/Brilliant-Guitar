# Native 固定乐器领域与同快照双谱合同

2026-10-21更新。真实宿主同快照读口已接入备份界面的五线谱/只读Tab呈现切换。本合同与
[原Native记谱](native-notation-module-contract.md)、[Tab弦品](tablature-position-contract.md)、
[共享绘制](tablature-rendering-contract.md)共同使用。

## 1. Scope / Trigger

适用于真实桌面固定领域集合、领域执行器、同快照staff/Tab投影和typed接受边界。
当前仅固定官方调号＋吉他，继续一个`IntegratedKernelSessionV2`和原文档/历史/文件所有者；
UI仍使用同一个PluginPlatform/4.0与router。新增领域时在可信宿主组合根安装，
不能让UI传任意namespace、executor或命令ID。没有热插拔或新的动态Native领域加载器。

共享记谱负责谱式模型、绘制与纯策略；乐器负责调弦、弦品、音高和技巧事实。
Native吉他实现位于应用领域模块，以原TS执行器为差分依据，不将算法移入Core或UI。
本页记录原读取切片及其只读呈现消费者。[公开弦品合同](score-fretted-position-contract.md)已开放原typed/Native动作；
Tab编辑、空拍插入和自动关系清理仍未开放。吉他schema 1/2兼容见
[统一品位合同](fretted-range-evolution-contract.md)。

## 2. Signatures

```ts
interface ScoreSessionRead extends ScoreSessionSummary {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly notation: NotationView; // staff | unsupported，保持原结构
  readonly tablature?: TablatureProjection; // 仅旧宿主可缺失
  readonly playbackSource: PlaybackSourceProjection;
  readonly metadata?: ScoreDocumentMetadataProjection;
}
type TablatureProjection =
  | TablatureView
  | { readonly kind: "unsupported"; readonly message: string };
// TablatureView:
// kind="tablature"; partId/staffId; tempoBpm;
// stringCount/fretCount(number|null的物理事实)/capoFret; measures[{id,voiceId,meter,events,ruleWarnings}]
// event: {id,duration,content:{kind:"rest"}
//   | {kind:"note",noteId,position:{stringNumber,fret}}}
isScoreSessionRead(value: unknown): value is ScoreSessionRead;
isTablatureProjection(value: unknown): value is TablatureProjection;
// 两个实参须先分别通过原模型校验；typed接受器与备份投影复用同一实现。
pairedNotationMatches(staff: StaffView, tab: TablatureView): boolean;
```

备份内部呈现入口（不新增Native/IPC）：

```js
createStaffProjectionPort({ snapshot = null, tablature = undefined } = {});
// 旧read.snapshot()/subscribe()仍返回staff；旧publish(snapshot)继续有效。
// 新read.notation("staff" | "tablature")；publish(snapshot, tablature)原子接受。
createScorePresentation(score);
// read: {snapshot, status, retry, subscribe}; choices(); select(payload); dispose()
// 原PluginPlatform命令：notation.core.presentation.select
// 唯一合法payload：{kind: "staff"} 或 {kind: "tablature"}，不接受多余键。
```

```rust
// application/notation_session.rs，沿原session的submit/read/history/checkpoint出口
NotationSession::create(request: KernelSessionCreateRequestV1)
    -> Result<NotationSession, HostError>;
// application/tablature_projection.rs，仅消费接受的同一snapshot与warnings
project(document: &ScoreDocumentV1, warnings: &[CoreRuleWarningV1])
    -> TablatureProjection;
```

现有内部领域命令，`commandVersion:1`、`target:{kind:"part",partId}`：

| commandId（前缀`brilliant.instrument.guitar.`） | payload |
| --- | --- |
| initialize | `{}` |
| set-tuning | `{tuning:[{stringNumber,soundingPitch:{step,alter,octave}}]}` |
| set-position | `{noteId,position:{stringNumber,fret} \| null}` |
| set-technique | `{technique}`：原hammer-on/pull-off/slide/bend/vibrato结构 |
| remove-technique | `{techniqueId}` |

这些是原gateway领域命令，不是新增的`ScoreEditAction`。UI目前不能直接调用本表。

## 3. Contracts

- `build-notation-module.mjs`复用原`compileFirstPartyModuleCatalogV1()`，生成
  `official_domains/assembly.json`、`guitar-profile.json`、`oracle.json`和
  `guitar-document.json`。`--check`逐字核对；不得手改生成数据。
  原调号目录/67条回调继续保留专项。当前固定领域目录由原TS实际prepare/transform/assess生成288条回调。
- Native唯一`official_domains::Executor`捕获可信目录，按原命令/贡献派发，
  通过原`compute_domain_availability_v1`给出实际availability；
  assessment按编译目录顺序合并吉他、调号。不能由UI或snapshot假定complete。
- `domain_value.rs`只包含lossless值访问、严格键集合、整数和UTF-16 ID等基元；
  音乐语义仍归各领域。ID/排序和opaque payload沿原lossless codec，不经过破坏性UTF-8归一化。
- 吉他profile来自原官方数据。现有弦号/品位/调弦、written-to-sounding、五技巧、
  引用与同弦冲突沿原TS语义。set-position一次事务更新written pitch与placement；
  同值no-op不推进版本/历史/dirty，调弦同步更新已有placements关联的音高。
- 原`session_projection`/Node`read`只读取一个接受的document snapshot与同版warnings，
  同时返回notation、tablature、metadata、playback及history。typed链仍只发一次
  `workbench_read_v1`，不新增独立Tab请求或拼接异步作品读数。
- 当前Native与Node宿主总返回tablature；TS可选仅兼容旧宿主。无字段可接受，
  null、畸形字段和不一致字段拒绝，不能按“旧宿主”吞掉坏数据。
- 备份`createDocumentStaffProjection`消费同一`readSession()`结果。两谱验证、克隆冻结后
  才推进接受身份/版本；失败不替换旧谱、不推进水位。真实文档缺Tab时明确禁用，
  不补演示fixture、不从pitch猜位置；只有明确的演示入口可成对提供fixture。
- `notation.core.presentation.select`仅改变view-local偏好，不修改文档、历史、dirty或文件。
  原top slot承载32px图标按钮，Tab的可访问名称和提示包含“只读”。
  正在执行原staff写入时，按钮禁用且命令拒绝，不能仅靠视觉禁用阻止竞态。
- selection/input仍绑定原staff源。Tab期间调用原输入controller的`setVisible(false)`，
  取消组合/缓冲，禁用键盘、属性、剪贴板和小节写入，隐藏staff工具及命中；
  返回staff恢复同一个工具实例和原选择，不建立第二个编辑权威。
- 切换或重绘立即废除旧命中，取消上一绘制，只采纳当前结果；可保留旧SVG和纸页几何
  避免视口跳动。Tab不发布staff交互几何。staff重绘loading不能吞掉原连续键输入。
  source error保留最后接受的谱式/图形并给出局部retry；新作品Tab unsupported且staff
  ready时回到staff，不把error当作切换作品或支持状态。
- 接受器核对Tab自身维度/ID/位置/时值/警告、measureCount及metadata/playback速度。
  两谱均支持时，必须核对part/staff、measure/voice/event顺序、meter、duration、
  note/rest类别及warnings。此核对防结构混读，音高与placement的领域语义由真实宿主校验。
- 当前Tab仅支持单部/单谱表/单声部、从起点开始的单音/休止和原有限时值；
  弦数来自领域。缺领域或某个单音缺placement，Tab明确unsupported，不能从pitch猜指法。
  合法吉他无技巧事实与合法调号可进入原staff/playback；不是只凭namespace放行。
- future已知schema和未知扩展无损保留，视图unsupported；future已知贡献由
  原gateway兼容性保护阻止写入。未知扩展的其他Core操作继续服从原gateway，不能自行扩展保护。
  坏已知schema1/2、owner/payload/引用/音高不一致在候选导入或提交时整体拒绝。
- 五技巧事实能接受、保留和校验，不等于已经能正确呈现；当前staff、Tab、playback
  遇到技巧均unsupported。已有位置时直接改pitch/删除若破坏关系，领域校验整体拒绝；
  自动关系清理留给后续真实编辑切片，不绕过校验改善表面体验。
- guarded写盘成功才建立检查点。关闭会话、读取物理文件重建后内容不变、历史干净；
  不持久化投影、内存版本或撤销栈。当前新建仍为通用五线谱，不自动初始化吉他。

## 4. Validation & Error Matrix

| 条件 | 必须行为 |
| --- | --- |
| 内部payload多余字段、错误target、非整数/非法弦品 | invalid-envelope或原领域invalid-position，零修改 |
| 错误乐器移调、坏owner/引用/同弦冲突/位置与音高不一致 | contribution-semantic-invalid，候选导入/事务整体拒绝 |
| future吉他/调号schema | 无损unsupported；原required-contribution-incompatible阻止不兼容写入 |
| opaque未知扩展/孤立UTF-16值 | 编码保留内容与对象次序，视图unsupported，不改写成默认值 |
| 未初始化领域或已有单音缺指法 | Tab unsupported；满足staff条件时五线谱继续可读 |
| 已接受的真实技巧/和弦/弱起等未支持事实 | 对应投影unsupported，不丢弃事实或造占位音 |
| Tab缺字段/Tab为null | 缺字段兼容旧宿主；null拒绝 |
| Tab与外层metadata/count或支持staff的节奏/身份不一致 | typed拒绝；原source进入error，保留已接受身份/版本，read拒绝，显式reload恢复 |
| 呈现payload缺kind、未知kind或多余字段 | `score.presentation.invalid-payload`，零修改 |
| 呈现未mount、已dispose或目标未ready | 对应`score.presentation.not-ready`、`score.presentation.disposed`或`score.presentation.unavailable` |
| 原staff事务pending时请求切换 | `score.presentation.input-pending`；原事务仍由原owner完成 |
| Tab期间派发原staff写命令 | 原输入readiness拒绝，零文档/历史/文件修改 |
| 快速往返切换，旧绘制晚到或失败 | 不采纳旧结果；当前失败显示局部retry，不留下旧命中 |
| stale身份/版本、request重放、写盘失败 | 沿原文档/事务/guarded-save合同，不新增重发或检查点路径 |

## 5. Good / Base / Bad Cases

- Good：真实吉他已有第6弦0品，set-position为12品；同版staff音高与Tab数字一起改变，
  只加一个历史步。undo恢复两谱，redo再恢复；guarded保存后关闭会话重开保持事实。
- Base：普通通用作品仍返回staff，Tab明确缺领域；合法吉他缺placement不猜位置。
  旧宿主缺Tab字段保持兼容。
- Good（呈现）：切到Tab只显示同版真实指法，不能写入；回staff仍使用原工具和选择，
  文档版本、undoDepth及dirty不因切换而变化。
- Bad：分别请求两份作品再套同一版本号；熟悉namespace但未支持的schema3仍放行；
  UI单独修改pitch和placement，或丢弃技巧以冒充支持；仅藏按钮却允许Tab快捷键写入。

## 6. Tests Required

- `application::official_domains::tests`：288条真实TS回调精确差分、真实位置/调弦/
  no-op/历史/检查点、坏导入与raw写入零修改、缺位置、技巧、future/opaque无损，
  同版调号、metadata、事件顺序与超量warnings。原调号7项专项仍运行。
- `commands::save_tests::guitar_staff_tab_survive_duration_history_guarded_physical_save_and_reopen`：
  原guarded物理文件写盘、时值修改/undo/redo、关闭会话/重开及干净历史。
  不能用仅JSON编码往返替代物理保存。
- `apps/workbench/test/score-dual-notation-read.test.ts`：真实Node固定宿主双谱、历史/
  codec，原typed读仅一次IPC；旧宿主兼容、畸形与混读拒绝，原source error/reload恢复，
  future/未知保护、领域坏导入原子拒绝和技巧保留。
- 原两组类型、生成一致性、正式/备份边界与备份整包。原测试替身警告如仍存在须记录，
  不调高maxListeners或隐藏warning当作修复。
- `design/frame-visual/tests/score-presentation.test.js`：双谱原子接受、旧源兼容、
  unsupported与error区别、retry/dispose、快速切换和原正式平台top slot生命周期。
- `design/frame-visual/tests/score-note-input.test.js`：Tab阻止键盘/属性/剪贴板/小节写入，
  回staff同工具/选择且文档不变；pending写入不能切换；原staff连续输入重绘不回归。
- 实际浏览器核对staff/Tab真绘制、选中/禁用态及缩放保持；独立原生profile核对通用旧谱
  staff编辑、undo/redo、取消关闭及“不保存后重开”与物理文件保持。
  Tab编辑、IME、Windows缩放矩阵、4核/8GB设备及发布资格继续由原任务验收。

## 7. Wrong vs Correct

```ts
// Wrong: two snapshots can describe different music even with the same UI label.
const staff = await client.read();
const tab = await anotherTabReader.read();
accept({ ...staff, tablature: tab });
// Correct: one existing host read supplies both projections atomically.
const read = await client.read();
if (!read || !isScoreSessionRead(read)) throw new Error("Invalid score read");
// Bind each view to its own kind; keep one original selection/edit/history owner.
```

```js
// Wrong: switching a drawing must not turn Tab into a second staff write surface.
input.setVisible(true);
// Correct: the original controller owns readiness and cancels drafts/buffers when hidden.
input.setVisible(visible && presentation.read.snapshot()?.kind === "staff");
```

下一项：原应用的Tab选择/输入策略消费已有窄弦品动作与同一选择/输入事务；
再实现空拍插入、关系清理、首批技巧，最后集中打磨。不得提前引用未来API。
