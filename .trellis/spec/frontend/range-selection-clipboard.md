# 范围选择与剪贴编辑

## 1. Scope / Trigger

范围选择服务于五线谱工作区中的连续事件编辑。它只覆盖同一小节、同一声部内的连续音符或休止符；通过 `Shift + 单击` 或 `Shift + ←/→` 建立和调整范围，`Esc` 清除范围。复制、剪切、粘贴由编辑命令触发，不新增停靠面板。

## 2. Signatures

```ts
type ScoreRange = {
  measureId: string;
  voiceId: string;
  startEventId: string;
  endEventId: string;
};

type ScoreClipboardFragment = {
  format: "brilliant-guitar.score-events";
  version: 1;
  events: EventProperties[];
};
```

编辑层暴露 `delete-range` 与 `paste-fragment` 两类意图。Host 将范围删除映射到 `core.range.delete`，粘贴映射为单个原子 `core.transaction.batch`。

## 3. Contracts

- 范围端点必须存在，且属于同一小节和声部；端点失效后范围立即无效。
- 范围操作按事件顺序处理音符和休止符，不保存源事件 ID，也不覆盖既有事件。
- 粘贴在当前选区之后或当前光标处插入；光标处为空拍时先物化对应休止符。
- 粘贴生成新的事件 ID，并保留精确的 `offsetUnits`。
- 超拍等规则警告继续由 Core 诊断系统负责，Workbench 不提前拒绝。
- 浏览器 Clipboard API 失败时回退到当前 Workbench 会话内存剪贴板；外部文本不得解释为谱面命令。

## 4. Validation & Error Matrix

| 情况 | 行为 |
| --- | --- |
| 跨小节或跨声部选择 | 不建立范围，保留当前单点选择 |
| 端点不存在 | 清除范围并恢复安全焦点 |
| 非法剪贴格式或版本 | 拒绝粘贴，不改变谱面 |
| Core 拒绝或版本冲突 | 复用 Workbench feedback，不产生部分提交 |
| Clipboard 权限失败 | 使用会话内存剪贴板 |

## 5. Good / Base / Bad Cases

- Good：同一小节内选择连续三事件，复制后在光标处粘贴，事件数增加三且撤销一步回滚全部插入。
- Base：选择单个事件后使用 `Shift + ←/→` 扩展或收缩，范围带始终与真实事件几何对齐。
- Bad：尝试跨小节扩展、粘贴未知文本或使用已失效端点；操作被安全拒绝且不污染编辑历史。

## 6. Tests Required

- 范围连续性、键盘扩展/收缩、跨小节限制、失效端点。
- 剪贴板 round-trip、非法格式、权限失败回退。
- 范围删除原子撤销、粘贴生成新 ID、空拍位置休止符物化。
- 范围视觉几何与五线谱事件横向对齐。

## 7. Wrong vs Correct

错误做法：把范围选择绘制成覆盖高低音跨度的大矩形，或复用单事件光标、播放头和悬停状态；粘贴覆盖既有事件，或让组件直接解析外部文本。

正确做法：范围带只依附五线谱的事件横向几何，选择状态与输入光标、播放头、悬停状态隔离；组件通过编辑合同提交意图，由 Host 和 Core 负责原子变更、诊断和撤销语义。
