# F14 调号能力与内核合同方案

日期：2026-09-19。

## 当前状态

F14 采用必装的第一方记谱模块实现，不扩张微内核专用机制。调号以 Part-owned extension block 保存，模块命令和 module extension Effect 复用现有事务、撤销、重做、重放、资源限制和错误溯源。前端只有在这条权威写入路径完成后才装配选择器。

截至 2026-09-19，权威写入路径与工作台最小业务流程已经完成：

- `brilliant.notation.key-signature.set` 支持设置、替换和恢复继承。
- 持久化只保留规范化后的稀疏变化点；冗余、越界和悬空位置会被拒绝。
- 工作台创建和打开会话时必装调号模块，保存后重开保持同一时间线。
- Projection 只输出稀疏 `{ measureId, measureIndex, fifths }`。
- 排版在系统行首重复有效调号，在变化点派生取消记号。
- 临时变音以有效调号为基线，小节线只清除小节内覆盖。
- 删除承载变化点的小节时，工作台以“恢复继承 + 删除小节”的单笔事务执行。
- 乐谱属性提供初始调号；小节上下文菜单提供任意小节起点的调号变化。

调号仍属于统一“乐谱属性／音乐结构”分区，不创建独立停靠组件。待内核合同落地后，第一版提供初始调号和从指定小节开始的调号变化两个入口。

## V1 稀疏数据合同

```json
{
  "namespace": "brilliant.notation.key-signature",
  "schemaVersion": 1,
  "owner": { "kind": "part", "partId": "part-1" },
  "payload": {
    "changes": [
      { "measureId": "measure-1", "fifths": 1 },
      { "measureId": "measure-9", "fifths": 0 }
    ]
  }
}
```

只保存实际变化点；没有 block 或 `changes` 为空时默认为 `fifths = 0`。V1 不保存 major/minor、主音、开放调号、自定义调号或 courtesy 标记。

## 数据位置和作用范围

- 调号变化不设独立 ID；`partId + measureId` 是稳定组合身份。
- 第一版只允许小节起点和 Part 级作用域。
- 修改范围是“从当前位置生效，直到同一作用域的下一次调号变化”，不照搬拍号的连续值区段算法。
- 调号修改不得改变已有音符的绝对书写音高或同音异名拼写。移调是独立显式命令。
- 调号 extension 不参与播放投影；除文档版本外，修改调号前后的播放计划保持不变。

## 变音记号和渲染

- 每个小节开始的变音状态来自当前位置有效调号，不再固定从自然音 `0` 开始。
- 小节内临时变音继续覆盖调号，并按五线谱规则在小节线处重置。
- 调号变化后，从新调号重新建立临时变音基线。
- 取消旧调号时需要显示的还原号属于派生排版结果，不保存为独立音乐事实。
- 输入组件的“空／升／降／还原”是书写意图；最终是否显示符号由调号、小节内上下文与书写音高共同决定。

## 移调乐器

V1 保存 Part 的书写调号，与 `WrittenPitch` 位于同一坐标系。`writtenToSounding` 只参与播放投影；切换 concert pitch 视图时由 Projection 临时变换音符和调号，不保存第二份调号。

显式移调音乐仍是独立命令。上层可以把“移调音符”和“更新调号”组合成一笔事务，但设置调号命令不得修改音符。

## Core 最小交付

1. Part-owned extension 可无损保存稀疏调号时间线。
2. 查询指定 Part 和小节位置的有效调号。
3. 一个类型化模块命令完成设置、替换和恢复继承。
4. 目标、作用域、重复位置和 `fifths` 范围校验。
5. 单笔事务撤销／重做和保存往返。
6. Projection 只输出 `{ measureId, measureIndex, fifths }` 稀疏变化点。

以上合同已由模块级和工作台真实流程测试覆盖。后续高级能力继续留在记谱模块或独立排版策略中，不扩张微内核：Staff 局部覆盖、小节中途换调、自定义/微分音调号、courtesy 策略、concert-pitch 视图和自动同音异名重拼写。

## 规范依据

- MusicXML 4.0：`<key>`、`<fifths>`、`<mode>`。
- MuseScore Studio：Key signatures。
- Dorico：Key signatures 与 Inputting key signatures。
