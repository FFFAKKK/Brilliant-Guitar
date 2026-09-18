# 技术设计：F11 范围选择与剪贴编辑

## 边界

F11 只扩展 Workbench 的编辑交互和 Host 命令适配。Core 已提供 `voice-event-range`、`core.range.delete` 与原子 `core.transaction.batch`，本次不改变 Core 的领域模型、命令或规则判断。

## 状态与数据流

范围是 Workbench 编辑状态的一部分：它保存同一谱表投影中两个事件端点，并从当前 `notation.measures[].events` 解析出有序、连续的事件列表。单事件选择仍保持独立；有范围时，活动事件是范围的锚点或焦点事件。

```text
Staff SVG / 键盘
  → range selection reducer
  → clipboard fragment v1
  → ScoreEditIntent
  → ScoreEditRequest
  → Workbench Host
  → Core Command Bus
```

剪贴板格式是严格校验的 `ScoreClipboardFragmentV1`。它只保存必要的可移植音乐内容：事件顺序、时值、rest/note、书写音高与变音。读取浏览器剪贴板失败或内容不是本应用格式时，使用会话内存副本；不能把任意文本解释为命令。

## 命令映射

- 范围删除 / 剪切：`core.range.delete`，目标为当前文档，payload 为 `voice-event-range`。
- 粘贴：Host 根据当前插入点把片段事件转为 `core.event.insert-note` / `core.event.insert-rest` 子命令，放进单个 `core.transaction.batch`。每次粘贴生成新 ID。
- 范围拷贝没有文档写入。

粘贴只使用当前输入位置。若位置处于已选择事件，先转为该事件尾部的编辑点；不得覆盖选区或任何已有事件。超拍留给 Core 规则警告系统表达，不在 Workbench 预判为拒绝。

## 视觉与可访问性

`StaffView` 利用已有 `NotationInteractionGeometry.events` 计算范围带。该带包络同一小节内首尾事件的横向区间，并采用低对比填充与细边界，避免和单事件框、输入光标、播放头混淆。键盘操作更新 ARIA live 状态，说明范围事件数；常态不增加冗余文字。

## 兼容与回退

- 维持现有组件 ID、布局存储、单事件编辑行为和命令 ID。
- 浏览器 Clipboard API 只做尽力同步，权限或安全上下文限制不会阻断会话内编辑。
- Core 拒绝、版本冲突和网络桥接错误复用 Workbench 反馈与队列机制。
- 删除 F11 的前端适配文件即可回退；不会留下新的文档数据格式或 Core 状态。
