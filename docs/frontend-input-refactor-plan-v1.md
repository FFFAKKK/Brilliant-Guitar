# 前端输入系统整体重构方案 v1

日期：2026-09-18

## 目标

把当前绑定五线谱的输入逻辑重构为可复用的前端输入系统，使鼠标、键盘、音符控制组件、MIDI、六线谱和简谱输入都可以通过同一套应用编辑闭环操作内核。

这次重构保留现有用户行为和内核事务语义，主要调整 TypeScript 中间层的职责边界。

## 不在本次范围内

- 不修改 Rust 内核的绝对音高、事件、版本和事务合同。
- 不重做五线谱绘图和 VexFlow 排版。
- 不同时实现六线谱或 MIDI 功能；本次只为它们留下适配接口。
- 不改变现有组件 ID、快捷键 ID、布局持久化格式和用户可见的基础操作。

## 目标架构

```text
UI / 外部输入源
  ├─ StaffView 鼠标
  ├─ StaffView 键盘
  ├─ NoteInputPanel
  ├─ 全局快捷键
  └─ MIDI / 未来插件
          │
          ▼
InputSignal
  只描述用户动作，不描述五线谱存储方式
          │
          ▼
Notation Input Adapter
  Staff / Tablature / Numbered / MIDI
  把具体输入语法翻译为通用意图
          │
          ▼
EditIntent
  locate / navigate / compose / insert / update / delete / paste / history
          │
          ▼
ScoreEditController
  目标解析、策略判断、排队、请求和失败恢复
          │
          ▼
WorkbenchClient / Host Bridge
          │
          ▼
Rust / Kernel
          │
          ▼
OperationResult + Projection
          │
          ▼
FocusReconciler
  更新谱面、选中事件、输入位置和组件状态
```

## 核心合同

### InputSignal

输入源只产生信号：

```ts
type InputSignal =
  | { kind: "pointer-locate"; position: unknown }
  | { kind: "pointer-select"; target: unknown; extend: boolean }
  | { kind: "key-press"; key: string; modifiers: number }
  | { kind: "control-change"; control: string; value: unknown }
  | { kind: "navigate"; direction: "left" | "right" | "up" | "down" }
  | { kind: "jump"; edge: "start" | "end" };
```

具体类型会在实现时收窄。这里的关键是：输入源不直接调用内核，也不直接决定 `append` 或 `delete-event`。

### EditIntent

```ts
type EditIntent =
  | { kind: "locate"; target: unknown }
  | { kind: "navigate"; direction: string }
  | { kind: "compose"; method: string; draft: unknown }
  | { kind: "insert-event"; target: unknown; event: EventDraft }
  | { kind: "update-event"; eventId: string; properties: EventProperties }
  | { kind: "delete-event"; eventId: string; timePolicy: DeleteTimePolicy }
  | { kind: "delete-range"; range: ScoreEventRange }
  | { kind: "paste-fragment"; target: unknown; fragment: ScoreClipboardFragmentV1 }
  | { kind: "history"; direction: "undo" | "redo" };
```

五线谱的 `A → A5`、六线谱的“弦 + 品位”和 MIDI 的 `note-on` 都应该最终生成同一类 `insert-event` 或 `update-event`。

### FocusDirective

每个成功的编辑操作都必须明确返回下一步焦点：

```ts
type FocusDirective =
  | { kind: "keep-selection"; eventId: string }
  | { kind: "after-insert"; eventId: string }
  | { kind: "at-measure-start"; measureId: string }
  | { kind: "at-measure-end"; measureId: string }
  | { kind: "at-offset"; measureId: string; offsetUnits: number }
  | { kind: "clear" };
```

这样删除、插入、粘贴和小节结构操作不再各自猜测光标位置。

## 操作闭环

```text
Ready
  ↓
接收 InputSignal
  ↓
输入适配器解析
  ├─ 仅导航 → 更新本地焦点
  ├─ 未完成组合 → 保存 draft
  └─ 完成操作 → 产生 EditIntent
  ↓
ScoreEditController
  ├─ 检查目标是否仍然存在
  ├─ 判断操作是否允许
  ├─ 生成警告或自动补偿
  └─ 构造带版本的请求
  ↓
Kernel transaction
  ├─ committed
  ├─ rejected
  ├─ stale
  └─ retryable / uncertain
  ↓
应用 OperationResult
  ├─ 更新 session projection
  ├─ 应用 FocusDirective
  ├─ 更新输入组件
  └─ 回到 Ready / Composing / Failed
```

不允许出现“无法转换就直接清空队列”“内核返回后没有明确焦点”“失败后输入状态和谱面状态不一致”等隐式结束路径。

## 分阶段实施

### 阶段 0：行为基线

冻结现有 Workbench 测试，并补充输入闭环测试：

- 鼠标定位、键盘定位和控制组件定位得到同一目标。
- 插入音符、插入休止符和插入到空拍位都能继续输入。
- 修改音高、时值、附点和变音记号保留事件 ID。
- 删除事件的 preserve / collapse 两种策略明确。
- 插入、修改、删除失败后都能反馈、重试或恢复。
- 内核返回后焦点位置明确。

### 阶段 1：抽取通用合同

新增 `src/input/` 和 `src/application/edit/` 的最小合同：

- `InputSignal`
- `InputContext`
- `EditIntent`
- `OperationRequest`
- `OperationResult`
- `FocusDirective`

这一阶段不改变现有 UI 行为，只把类型和边界建立起来。

### 阶段 2：抽取五线谱适配器

把以下逻辑从总控制器移入 `StaffInputAdapter`：

- `A-G + 2-6` 的音高组合。
- 五线谱位置到输入音高的转换。
- 五线谱鼠标定位。
- 五线谱方向键和 Home/End 导航。

编辑状态机只接收通用组合事件，不再检查 `staff.pitch`。

### 阶段 3：建立 ScoreEditController

把 `use-score-input.ts` 中的以下职责收拢：

- 操作队列。
- requestId 和 expectedVersion。
- 本地策略和警告。
- 内核调用。
- stale / retryable / rejected 分支。
- session 更新。
- FocusDirective 应用。

React hook 只负责订阅 controller 状态和暴露 UI actions。

### 阶段 4：统一四类编辑操作

按以下顺序迁移：

1. `insert-event`
2. `update-event`
3. `delete-event` / `delete-range`
4. `paste-fragment` / `history`

每迁移一类，都保留原有行为测试，并增加“不同输入来源产生相同意图”的测试。

### 阶段 5：清理旧接线

- 删除 `use-score-input.ts` 对五线谱输入方法的直接判断。
- 删除重复的鼠标、键盘和控制组件操作转换。
- 将 `staffIntentToAction` 改为通用 controller 的适配入口。
- 保留旧外部 ID 和命令 ID，避免布局和快捷键迁移。

## 风险和控制方式

### 风险：光标行为变化

控制方式：先引入 `FocusDirective`，不改变默认策略；只有测试确认后再切换旧的隐式定位。

### 风险：输入队列和异步提交顺序变化

控制方式：保持单队列、单请求 ID 和版本校验，禁止并发提交同一文档的编辑操作。

### 风险：插件能力越界

控制方式：插件只能声明它能产生的意图和读取的 projection，不能直接访问内核 bridge。

### 风险：未来六线谱再次复制逻辑

控制方式：在阶段 2 完成后增加一个最小的虚拟 `TablatureInputAdapter` 测试，只验证它可以产生通用 `insert-event`，不实现真实六线谱 UI。

## 完成标准

这次重构完成后，需要满足：

- 鼠标、键盘、音符控制组件可以产生统一的编辑意图。
- 五线谱输入代码不再出现在通用编辑状态机中。
- 插入、修改、删除、粘贴和历史操作都经过同一条事务闭环。
- 每个成功操作都有明确的焦点结果。
- 每个失败操作都有明确的反馈、重试或恢复路径。
- 新增六线谱适配器时，不需要修改通用 controller 或内核事务层。
- 现有组件 ID、布局数据、快捷键和内核行为保持兼容。

## 当前实现状态（2026-09-18）

已落地：

- `ScoreEditController` 已接管编辑队列、串行提交、重试、阻塞和文档重置。
- `InputSignal` 已覆盖键盘、鼠标定位/选择和音符控制变更。
- `StaffInputAdapter` 已把五线谱键盘输入翻译为通用 `insert-event`。
- `NotationInteractionRegistry` 已接入插件宿主，输入 Hook 通过谱式交互贡献分发输入、导航和编辑。
- 鼠标、键盘和音符控制组件都通过工作区输入入口进入同一编辑闭环。
- 方向键、Home/End、Escape 和 Shift 范围选择已抽到 `StaffNavigationPolicy`。
- 删除、时值调整和选中音符的音高重输已抽到 `StaffEditKeyPolicy`。
- 空拍位置的 Delete/Backspace 已区分左右事件，不再把左侧事件误判为右侧目标。
- 已加入虚拟六线谱适配器测试，验证新增谱式无需修改通用编辑控制器。
- 组合草稿的读取和启动也由谱式交互贡献提供，通用 Hook 不再直接依赖五线谱适配器。
- 已删除旧的全局 `InputAdapterRegistry` 及其兼容测试，避免输入规则存在两个注册入口。

仍待后续：

- 将外部 MIDI 输入接入 `external-note` 信号，并补齐设备生命周期处理。
- 将 `FocusDirective` 和外部输入设备生命周期进一步抽成独立应用服务。
