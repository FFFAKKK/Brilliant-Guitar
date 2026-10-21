# Tab 绘制与同次几何合同

2026-10-21更新。共享绘制已由原core view按staff/Tab分派消费；Tab当前只读，编辑策略仍待接入。
真实Native同snapshot双谱读口已按[Native双谱合同](native-dual-notation-contract.md)续接；
下文“本切片”指共享绘制实现；呈现控制和只读边界见Native双谱合同。

## 1. Scope / Trigger

`shared/notation` 统一容纳五线谱/Tab 的绘制和谱式交互；乐器领域提供真实位置及弦数。
本合同适用于共享 Tab 模型、纸张排版、VexFlow5 适配、命中几何和完整 SVG 分页组合。
与[原绘制合同](notation-rendering-contract.md)、[Tab 弦品合同](tablature-position-contract.md)共同使用。
不新建平台、路由器、视口、作品状态、选择或历史所有者。

## 2. Signatures

```ts
layoutTablaturePages(view: TablatureView): readonly TablatureLayout[];
createTablatureRenderer(load: () => Promise<typeof import("vexflow/bravura")>):
  NotationRenderer<TablatureLayout, TablatureInteractionGeometry>;
// NotationRenderer<Layout = StaffLayout, Geometry = NotationInteractionGeometry>
// .render(layout, theme, signal?) -> Promise<RenderedNotation<Geometry>>

interface TablatureEventGeometry extends EventGeometry {
  readonly content: TablatureEvent["content"];
}
interface TablatureMeasureGeometry extends MeasureGeometry {
  readonly stringYs: readonly number[];
}
// Generic composeNotationPages(pages, drawings, signal?)
// -> {svg, layout:{width,height,pages}, interaction:{anchors,events,measures}}
// Every composed geometry item includes pageIndex.
```

备份内部绘制入口 `src/score/vexflow-tablature-renderer.js` 的
`renderTablature(input, {signal} = {})` 校验/分页后调用上述唯一绘制器和原 loader。
原core view通过`renderNotation(snapshot, options)`按kind调用staff或Tab绘制器；
真实桌面双谱读口返回只读投影，绘制仍在原UI层，不进入Native读口。

## 3. Contracts

- 输入是 `isTablatureView` 校验过的只读投影，合法弦数1..32，弦1位于顶部。
  投影无 pitch；绘制不得假造 StaffView、占位音高或推测乐器调弦。
  低层 render 接收由 layout 产生的有效布局；调用者保持该快照不可变。
- 原 A4/SCORE_PAPER、自然宽度、二进制尾部 GhostNote 与节奏 anchor 规则共用。
  原 staff 几何保持；Tab 的系统高度随实际线数增加。宽度额外预留两位数字。
- TabStave.numLines 来自投影。4/6弦分别使用对应 Bravura Tab glyph 并居中；
  其他合法弦数画真实线数，不冒用六弦 glyph。其他线数只做布局边界检查，
  当前真实引擎专项集中在4/6弦，不能声称所有谱式已经视觉验收。
- 数字来自真实 TabNote.drawPositions。其基类 getBoundingBox 不代表数字；
  适配器窄子类读取同一个 protected fretElement 的 getBoundingBox，
  加上实际 getAbsoluteX、getYs、yShift 及 digit.getWidth/2 偏移。
  该5.0适配专用，升级引擎必须重新核对。数字字体采用已加载的 theme.fontFamily；
  更改字体时重算同一个数字元素的宽/高/基线，不能测量第二个标签。
- 当前节奏样式是 stem-only：全音符无符干，二分短符干、四分标准符干；
  八/十六分使用原引擎符尾和按 meter 分组的连梁，附点由实际 Dot 绘制。
  休止使用成熟 eventNoteSpec 的 R 语义，不以数字0代替，不改音乐时值。
- 事件的 rect 覆盖实际数字/休止墨迹及 lineSpacing*0.25 留白；events 保留事件ID和真实 content，
  measures 返回每根弦的 stringYs、lineSpacing、末根弦 staffBottom。
  anchors 使用同一 formatted voice 的中心与尾部 tickable；节奏 caret 的 y1/y2 位于谱表中部，
  不能把当前弦偏好混成节奏位置。
- 共用 surface 只等比缩放整体 engraving；完整根继承 Bravura/Academico，
  字体加载仍由应用入口负责。共用 composer 保留根对象和20纸张单位页间距，
  对 events.y、anchors.y/y1/y2、measures.y/staffBottom/stringYs 应用同一个页面偏移。
- engine 加载同步抛错/异步拒绝统一 reject；预先取消不加载，等待中取消立即拒绝，
  移除监听且处理迟到 rejection。同步绘制不假定可强行中断，结束前再次检查 signal。
  每次返回 detached SVG；旧 revision 的采纳、隐藏、释放仍由原 view scope 判断，
  renderer 不拥有应用修订或 DOM 的当前状态。
  VexFlow Element.getSVGElement 会在整个document查找ID，可能命中上一版已挂载SVG；
  detached阶段的warning标注仅在当前drawing根内查找，不触碰旧版DOM。
- 原core view切换期间可保留旧SVG和纸页几何，但立即废除旧命中；
  只采纳当前未取消的完整绘制。Tab不安装staff选择/键盘呈现，隐藏并禁用原staff工具，
  返回staff复用原实例；具体输入readiness与命令边界见Native双谱合同。
- 共享绘制器不新增Native/IPC、文件schema、设置或平台版本；UI谱式命令见Native双谱合同。Tab输入、空拍插入、技巧、
  双谱对齐/选择同步、播放/导出和集中体验打磨均不在此完成范围。

## 4. Validation & Error Matrix

| 情况 | 必须行为 |
| --- | --- |
| 无效弦数/位置/capo/时值/重复ID/缺投影 | layout 抛 `Invalid tablature view`，loader未调用 |
| 未支持的领域事实 | 宿主继续返回 unsupported；绘制不补假数据 |
| 缺音乐字体、loader同步抛错或reject | 渲染Promise拒绝；沿原局部失败/重试 |
| 取消时尚未开始获取 | AbortError，不调用loader |
| 等待loader时取消，随后loader拒绝 | AbortError，迟到拒绝被处理，无结果采用 |
| 绘制期间取消 | 结束前AbortError，无drawing返回 |
| 页数与drawing不匹配/空组 | composer拒绝，不拼残缺页 |
| 已取消组合任务 | composer AbortError，不采用任何根 |
| 超量小节 | 保留全部事件及实际offset；event-hit带overfull与原warning描述 |
| SVG数值的三位小数序列化 | 图形比较容差按序列化精度；纯几何保持严格核对 |

## 5. Good / Base / Bad Cases

- Good：原六弦投影的第1弦0、第6弦12实际绘制为同一数字元素，
  两位数字全墨迹在命中rect内；第二页根和全部stringYs使用同一偏移。
- Base：真实空小节仅有弦线/谱式标记/拍号、start/beat anchors，无虚构音符。
- Bad：TabNote继承的空包围盒当作数字区域；四弦仍画六条线；
  数字用CSS手工移动后仍使用旧命中坐标；拼页仅移动事件而不移动stringYs。

## 6. Tests Required

- `apps/workbench/test/tablature-layout.test.ts`：1/4/6/7/12/32弦只读身份和非法输入，
  系统高度、拍号、页首及无DOM的预取消。
- `design/frame-visual/tests/tablature-rendering.test.js`：真实VexFlow5，
  4/6条线、0/12、数字字体/基线/两位数字墨迹、真实休止/附点/时值/连梁/符尾，
  空/未满/超量小节、多页完整根/stringYs/anchors/events的共同偏移，
  加载失败/及时取消/迟到拒绝、备份原loader、无反向UI/乐器依赖。
  已挂载上一版与新结果同eventId时，绘制warning不能修改旧节点，必须标注新根。
- 同文件对比实施前捕获的4组真实容量staff分页几何（1/1/4/13页），
  并用原renderer基线与当前renderer比较真实引擎的staff文字坐标、path及interaction。
- 原两组类型、生成一致性、正式/备份边界及整包；
  编码/事务回归仍复用上一弦品链，不新增验收平台。
- 上述引擎测试的DOM和Canvas指标是明确替身。实际浏览器staff/Tab呈现与独立原生
  通用staff旧谱验收另存本次任务证据；Tab编辑手感、IME、低配和发布资格仍未完成。

## 7. Wrong vs Correct

```ts
// Wrong: digit hits cannot use TabNote's inherited empty text bounds.
const hit = tabNote.getBoundingBox();
// Correct: read the same digit object used by drawPositions, then apply that draw's offsets.
const digit = this.fretElement[0]!;
const box = digit.getBoundingBox();
const x = this.getAbsoluteX() - digit.getWidth() / 2 + box.getX();
const y = this.getYs()[0]! + this.renderOptions.yShift + box.getY();
// Scale the ink, then apply the same page translation to its interaction geometry.
```

固定乐器领域、同版双谱读口及只读呈现已续接。下一项：原应用的Tab选择/输入消费和窄弦品动作 →
空拍插入与关系清理 → 首批技巧 → 集中视觉与连续打谱体验验收。
