# 第一批代表性 UI 测试插件

日期：2026-10-04。三份工厂和 [25 项专项测试](../../representative-plugin-trials.test.js) 用于验证当前作者合同，不装入默认预览。代码基于备份 `design/frame-visual`；当前命令、左右侧栏 panel、菜单和组件作用域键位可以在独立测试运行实例中消费。

## 装配与状态

每个新会话重新调用工厂，取出 `manifest` 交给已有公开应用入口。声明创建不会申请 DOM、监听或计时器。工厂的 `snapshot()` 返回冻结的只读测试快照，不是新的宿主服务或组件权限。插件只导入 `defineUiPlugin`，不取得完整 router、布局 store 或测试检查端口。

以下代码供可信测试宿主使用；`root` 必须连接到当前 document。单个 root 同时只能有一个活跃运行实例：

```js
import { createWorkspaceRuntime } from "../../../src/host/workspace-runtime.js";
import { createCommandOnlyPlugin } from "./command-only-plugin.js";
import { createMovablePanelPlugin } from "./movable-panel-plugin.js";
import { createSharedEntryPlugin } from "./shared-entry-plugin.js";

const trials = [createCommandOnlyPlugin(), createMovablePanelPlugin(), createSharedEntryPlugin()];
const runtime = createWorkspaceRuntime({ root, plugins: trials.map(trial => trial.manifest) });
try {
  const result = runtime.execute("trial.command.ping", { mode: "accept" });
  // 显式结果：{ ok: true, count: 1 }
} finally {
  runtime.dispose();
}
```

该示例只说明装配；它没有安装到任何页面。专项测试使用现有 DOM 替身；部分断言通过既有 `loadRuntimeForTest()` 只读观察登记和清理，插件本身不依赖此辅助入口。

## 工厂与输入

| 工厂 | 贡献与私有状态 | 可选测试输入 |
| --- | --- | --- |
| `createCommandOnlyPlugin({ enabled })` | `trial.command.ping`，`ui: []`；attempts / accepted | 同步、无副作用的 enabled 判断，默认 true |
| `createMovablePanelPlugin({ defaultSlot, probeCommand, failMount })` | `trial.movable.panel`；左右可移动面板、textarea、编辑次数、可见性记录 | defaultSlot 默认 right，允许 left/right；probeCommand 触发无权限探测；failMount 在登记资源清理后抛错 |
| `createSharedEntryPlugin({ namespace, keys, enabled, perform, allowCommand, bindShortcut })` | 默认 `trial.entries.count/panel/local`；一个动作、按钮、plugins 菜单项、局部快捷键；成功计数与 pending | namespace 默认 trial.entries；keys 默认 Alt+J；perform 默认显式成功；其他开关默认允许，供拒绝／故障测试 |

command-only 的 payload 是 `{ mode?: "accept" | "reject" | "throw" }`。公开执行入口将省略的 payload 归一化为对象；其他字段返回 `trial.invalid-payload`，不认识的 mode 返回 `trial.invalid-mode`，reject 返回 `trial.rejected`，throw 抛出 `Error`。只有成功增加 accepted，禁用在调用 handler 前返回 `command.disabled`。

shared-entry 的 perform 是动作内部测试替身，不是平台依赖注入 API。它可同步或异步返回 `{ ok: true }` 或 `{ ok: false, code: 非空字符串 }`；失败 code 在真实作者动作中应使用自己的稳定命名空间。空值、缺少 boolean ok 或拒绝缺少有效 code 均抛出 `TypeError`。成功最终返回 `{ ok: true, count }`；异常不转换成成功。

## 入口、权限和资源

- 按钮用受限 `ctx.execute`；菜单和键位由已有宿主映射到同一命令。pending 由动作拥有，enabled 同时限制三个入口，按钮自身的 disabled 不承担全局去重。
- 默认键位为 component 作用域，仅当前可见、实际焦点所在的本插件面板响应。文本字段、composition 标志、Dead 和 AltGraph 保留给输入处理。不同 namespace 可以拥有相同局部键；同一声明中的重复键拒绝。
- 面板只申请 left/right。移动、排序、隐藏和布局取消保留持久实例、私有输入和阅读位置；取消组件配置后，期间四栏的日常开关和尺寸继续保留。
- 探测面板未获得外部命令权限，得到 `permission.denied`。缺少自己命令权限的组件按钮也被拒绝；可信菜单拥有宿主授予的独立执行权限。声明了无权执行的快捷键则启动预检失败。
- 输入／点击监听和内部视图订阅通过 `ctx.onDispose` 清理。组件释放后屏蔽旧 DOM 更新；重新启动使用新工厂，不带入旧私有计数或输入。
- shared-entry 隐藏期间允许已经开始的任务结束。dispose 不自动撤销任务；旧工厂的任务计数可能完成，但不会污染替换后的 UI 会话。

## 实际验证与边界

25 项测试覆盖独立装配、三入口单次执行、忙碌保护、无效结果、权限、移动／取消、组合释放、启动失败回滚及新会话隔离。无效结果用同步和异步两种方式各检查六个输入。整包结果、源码保护与初次失败记录见 [本批审查](../../../evidence/representative-plugin-trials-20261004/review.md)。

这是 DOM 替身逻辑验证。真实浏览器的像素、窗口容量、原生焦点和原生输入法仍未验收；静态谱面没有变成真实编辑业务。view、slotItem、工作区内部固定区、通用浮层、持久化、多实例和热插拔没有因本批通过而开放。

当前宿主键盘入口的异步拒绝在解绑后仍可能记入旧 runtime 的 notices；专项验证旧 DOM、新会话与新 notices 不受影响，没有宣称旧诊断被取消。后续正式反馈合同需要明确已经开始任务的诊断归属与结束策略。

Node v24.15.0 的 DOM 替身在 `removeEventListener(type, fn, true)` 上与浏览器 capture 匹配语义存在差异。新专项的 `withTrials()` 仅把 document 上此组选项规范化为 `{ capture: true }`，再观察清理。独立重现见 [脚本](../../../evidence/representative-plugin-trials-20261004/node-eventtarget-capture-repro.mjs) 与 [结果](../../../evidence/representative-plugin-trials-20261004/node-eventtarget-capture-result.json)。生产 popover、keyboard 和旧 DOM helper 均未修改。

## 运行

从备份目录执行：

```powershell
Set-Location E:/desktop/brilliant_ideas/brilliant_guitar/design/frame-visual
node --test --test-isolation=none tests/representative-plugin-trials.test.js
$taskTestFiles = @(rg --files tests -g '*.test.js')
node --test --test-isolation=none @taskTestFiles
node --check tests/fixtures/representative-plugins/command-only-plugin.js
node --check tests/fixtures/representative-plugins/movable-panel-plugin.js
node --check tests/fixtures/representative-plugins/shared-entry-plugin.js
node --check tests/representative-plugin-trials.test.js
```

当前目录只提供 test/serve 脚本，没有 lint/typecheck。`--test-isolation=none` 用于此环境的进程权限限制，不会跳过用例；每个逻辑场景仍创建独立声明和运行实例。
