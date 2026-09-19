# 前端输入系统分层架构 v1

## 目标

输入系统需要把“输入来源”“具体谱面语法”“编辑意图”和“内核事务”分开。五线谱、六线谱、简谱或 MIDI 输入可以拥有不同的操作方式，但最终都应该产生同一组可复用的编辑意图和音乐事件。

本设计只描述 TypeScript 应用层与 UI 插件边界，不修改 Rust 内核合同。内核继续负责文档数据、事件身份、版本校验、原子事务、撤销重做和规则诊断。

## 四层模型

```text
输入源层 Input Surface
  鼠标 / 键盘 / 音符控制组件 / MIDI / 触摸
          │ InputSignal
          ▼
输入意图层 Input Intent
  定位 / 导航 / 组合 / 插入 / 修改 / 删除 / 粘贴 / 结构操作
          │ EditIntent
          ▼
应用策略层 Application Policy
  目标解析 / 能力检查 / 警告策略 / 自动补偿 / 请求构造
          │ OperationRequest
          ▼
内核事务层 Kernel Operation
  原子执行 / 版本检查 / 诊断 / 新投影 / 撤销重做
          │ OperationResult
          └───────────────┐
                          ▼
                 投影与焦点协调
             更新谱面、选择和下一输入位置
```

四层的职责不能互相越界：

- 输入源层不知道五线谱事件如何存储，也不直接调用内核。
- 输入意图层不关心 C5 是由键盘、鼠标还是 MIDI 产生的。
- 应用策略层决定操作是否允许、是否只提示警告，以及删除后光标去哪里。
- 内核事务层不认识 UI 组件，也不认识“音符控制面板”。

## 通用输入信号

所有来源先归一化为信号，信号只描述用户做了什么：

```text
InputSignal
├─ pointer
│  ├─ locate(x, y)
│  ├─ select(target)
│  └─ activate(target)
├─ key
│  ├─ press(key, modifiers)
│  └─ repeat(key, modifiers)
├─ control
│  ├─ set-duration(value)
│  ├─ set-pitch(value)
│  ├─ set-accidental(value)
│  └─ set-rest(value)
├─ navigation
│  ├─ move(direction)
│  └─ jump(edge)
└─ external
   ├─ midi-note
   ├─ tablature-fingering
   └─ numbered-notation-value
```

输入信号必须携带作用域和上下文：

```text
InputContext
├─ focusScope: global | score | component | field
├─ target: caret | selected-event | range | unavailable
├─ composition: idle | composing
├─ notationKind: staff | tablature | numbered
└─ capabilities: insert | update | delete | navigate | paste
```

快捷键的优先级固定为：输入字段 > 对话框/菜单 > 当前组件 > 谱面编辑器 > 全局命令。这样输入组件不会抢走文本字段、菜单或其他插件的按键。

## 通用编辑意图

具体输入适配器只能产生这些通用意图：

```text
EditIntent
├─ locate(point)
├─ navigate(direction | edge)
├─ compose(method, draft)
├─ insert-event
│  ├─ anchor
│  ├─ offsetUnits
│  └─ event: duration + content
├─ update-event
│  ├─ eventId
│  └─ properties
├─ delete-event
│  ├─ eventId
│  └─ timePolicy: preserve | collapse
├─ delete-range
├─ paste-fragment
├─ insert-measure
├─ remove-measure
└─ history
   ├─ undo
   └─ redo
```

“输入 C5”“在五线谱上点某条线”“按 MIDI 键”都不应该直接变成 `append`。它们应该先变成同一个 `insert-event` 意图，事件内容使用绝对音高、时值和休止符语义表达。

## 输入适配器

具体谱面插件只实现输入语法适配：

```text
StaffInputAdapter
  五线谱坐标 + A-G/数字 + 鼠标定位
          └─> EditIntent

TablatureInputAdapter
  弦号 + 品位 + 六线谱位置
          └─> EditIntent

NumberedNotationAdapter
  简谱数字 + 调号上下文
          └─> EditIntent

MidiInputAdapter
  MIDI note-on / note-off
          └─> EditIntent
```

适配器可以拥有自己的组合状态，例如五线谱的 `A → A5`，或六线谱的“弦 + 品位”，但组合完成后必须输出同一个通用意图。编辑状态机不应该知道 `staff.pitch` 这样的具体方法名。

## 统一闭环

每个会改变文档的操作必须经过同一条闭环：

```text
Ready
  ↓ 输入信号
Resolve target
  ↓ 目标 + 输入上下文
Build intent
  ↓ 通用 EditIntent
Preflight policy
  ├─ reject: 结构上不允许
  ├─ warn: 允许执行但产生规则提示
  └─ normalize: 自动补休止符、自动左移等可配置策略
  ↓ OperationRequest
Dispatch to kernel
  ├─ applying
  ├─ committed
  ├─ rejected
  ├─ stale
  └─ uncertain/retryable
  ↓ OperationResult
Reconcile projection
  ├─ 更新谱面数据
  ├─ 保留或清除选中事件
  ├─ 计算删除后的光标
  └─ 计算插入后的下一输入位置
  ↓
Ready / Composing / Failed
```

任何分支都不能静默丢失。无法生成操作、文档被替换、目标过期或内核返回不确定结果，都必须进入明确的反馈或恢复分支。

## 当前仍需关注的耦合点

当前输入闭环已经通过插件交互注册表接通，通用 Hook 不再直接选择五线谱的输入、导航或编辑策略。剩余耦合主要是边界内的业务实现：

1. `ScoreEditPoint`、`InputPitch`、`StaffView` 仍是五线谱应用策略的具体类型，未来六线谱需要提供自己的上下文适配器。
2. `FocusDirective` 目前由 `ScoreEditController` 与焦点协调器共同推导，后续可以再抽成独立的可序列化结果合同。
3. MIDI 和其他外部输入还没有接入 `external-note`，设备生命周期需要单独的输入源服务。
4. `staffInputAdapter` 仍保留在五线谱插件实现目录中，这是谱式插件内部依赖，不属于工作台框架依赖。

## 推荐目录边界

```text
src/input/
├─ input-signal.ts
├─ input-context.ts
├─ input-keymap.ts
├─ input-intent.ts
├─ input-session.ts
└─ input-controller.ts

src/application/edit/
├─ edit-policy.ts
├─ edit-request.ts
├─ edit-result.ts
├─ focus-directive.ts
└─ score-edit-controller.ts

src/notation/staff/
├─ staff-input-adapter.ts
├─ staff-navigation-adapter.ts
└─ staff-pointer-adapter.ts

src/notation/tablature/
└─ tablature-input-adapter.ts
```

第一阶段不需要移动所有文件。可以先建立通用合同，再让现有五线谱代码通过 adapter 接入，等行为稳定后再拆目录。

## 实施顺序

1. 冻结当前行为测试，继续保持现有 231 项测试通过。
2. 定义 `InputSignal`、`InputContext`、`EditIntent` 和 `FocusDirective`。
3. 把鼠标、键盘、音符控制组件都改成只产生信号或意图。
4. 把 `staff.pitch` 组合逻辑移到 `StaffInputAdapter`。
5. 建立统一 `ScoreEditController`，负责策略、请求、内核结果和焦点协调。
6. 把插入、修改、删除、粘贴统一接入同一闭环。
7. 补齐休止符转音符、删除后光标策略、失败恢复和过期目标处理。
8. 将五线谱输入、导航、编辑和组合状态包装成插件可注册的交互贡献。
9. 最后再接六线谱或其他输入插件，验证它们不需要修改通用编辑状态机。

这次重构的核心不是增加更多快捷键，而是让所有输入来源都通过同一个抽象入口产生同一种编辑意图，再由应用层和内核完成统一事务闭环。
