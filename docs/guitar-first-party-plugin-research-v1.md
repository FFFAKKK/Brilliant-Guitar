# 第一方吉他插件调研与 V1 范围

> 状态：已用于 `brilliant.instrument.guitar` 的第一轮实现，2026-09-19。

## 目标

第一方吉他插件先证明三件事：具体乐器可以在不污染 Core 的前提下拥有调弦、弦/品位置和技巧；同一个插件包可以同时提供乐器发现描述和固定会话 Kernel Module；乐器事实仍通过一个 Part-owned `ExtensionBlock` 参与统一事务、历史和回放。面向 UI/Agent 的可执行能力等宿主分发链稳定后再注册，不增加第二套字符串能力目录。

## 外部依据

- W3C MusicXML 的[六线谱教程](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/)把开放弦调弦、弦号、品位和吉他技巧列为六线谱所需的主要事实，并给出了六弦标准调弦以及击弦/勾弦示例。
- W3C MusicXML 的[`technical` 元素](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/technical/)覆盖 `string`、`fret`、`hammer-on`、`pull-off`、`bend`、`harmonic` 和 `tap` 等演奏技术。
- W3C MusicXML 的[`slide` 元素](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/slide/)将滑音描述为两个音高之间的连续移动，因此它应建模为两个稳定 Note ID 之间的关系，而不是一个孤立的音符标记。
- W3C MusicXML 的[`bend-alter` 元素](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/bend-alter/)允许半音数、小数微分音、预推弦和释放。当前 V1 只实现一或两个半音的普通推弦，预推弦、释放、摇把和微分音留给后续 schema。
- W3C MusicXML 的[`staff-tuning` 元素](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/staff-tuning/)明确表示开放弦、未使用变调夹时的实际调弦；因此调弦和变调夹在领域状态中保持两个独立事实。
- Fender 的[标准调弦说明](https://www.fender.com/articles/setup/standard-tuning-how-eadgbe-came-to-be)、[Drop D](https://www.fender.com/articles/setup/drop-d-tuning-on-guitar)、[Open G](https://www.fender.com/articles/setup/open-g-tuning)和[常用开放/模态调弦](https://www.fender.com/articles/setup/tune-like-a-rock-star)用于核对 EADGBE、DADGBE、DGDGBD 和 DADGAD 的预设音高。

这些资料只决定语义范围和互操作词汇，不要求内部持久化结构复制 MusicXML。

## V1 能力

| 能力 | 当前实现 | 数据所有者 |
| --- | --- | --- |
| 乐器领域 | 六弦、有品、0–24 品、八度移调记谱、和弦可表达 | Guitar Domain |
| 调弦 | 标准、Drop D、DADGAD、Open G 预设；命令持久化明确的六个开放弦音高 | Guitar Domain |
| 位置 | 每个 Core Note 可关联一个弦号和品位；位置与书写音高原子更新 | 品格弦乐族实现 |
| 技巧 | `hammer-on`、`pull-off`、`slide`、`bend`、`vibrato` | 吉他技巧适配器 |
| 记谱兼容 | 声明 `staff` 与 `tablature`，不拥有六线谱渲染器 | 插件发现描述 |
| 播放 | 暂不声明播放编译能力，避免在 `PerformancePlanV1` 落地前伪造实现 | 后续阶段 |

## 调弦规则

内部弦号采用吉他常用编号：`1` 是最高音弦，`6` 是最低音弦。所有预设存储完整实际音高，不把 `EADGBE` 字符串当作业务真值。

| 预设 | 从第 6 弦到第 1 弦 |
| --- | --- |
| Standard | E2 A2 D3 G3 B3 E4 |
| Drop D | D2 A2 D3 G3 B3 E4 |
| DADGAD | D2 A2 D3 G3 A3 D4 |
| Open G | D2 G2 D3 G3 B3 D4 |

切换调弦时，所有已有弦/品位置保持不变；由这些位置导出的 Core 书写音高和 Guitar ExtensionBlock 在同一个事务中一起更新。因此撤销、重做和命令回放不会产生“位置是新调弦、音高仍是旧调弦”的中间状态。

## 技巧规则

- `hammer-on`：两个音符按乐谱顺序向前、位于同一弦，目标品位高于来源品位。
- `pull-off`：两个音符按乐谱顺序向前、位于同一弦，目标品位低于来源品位。
- `slide`：两个音符按乐谱顺序向前、位于同一弦，品位不同。
- `bend`：单个音符，V1 目标为一或两个半音。
- `vibrato`：单个音符，V1 只保存语义存在性；速度、深度和曲线以后扩展。

所有技巧引用 Core 的稳定 Note ID。删除音符或移除正在被技巧引用的位置，必须在一个原子批处理中先清理关系。

## 后续优先级

下一组候选是自然/人工泛音、闷音、延音、点弦、死音、预推弦和推弦释放。它们暂不进入 V1 联合类型，原因分别涉及实际音高与触点音高、范围所有权、播放包络或更复杂的关系生命周期，需要先完成通用技巧注册表与 `PerformancePlanV1`。
