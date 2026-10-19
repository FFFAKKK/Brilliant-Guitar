# UI 包内部快捷键模块

2026-10-02。实施位置为备份副本 `design/frame-visual`。本批完成 `shortcut-mapping-plan.md` 的基础映射和兼容迁移；设置界面、保存、多键序列和真实谱面编辑不属于本批。

## 职责与装配

快捷键可以按“小插件”的思路组织为独立功能模块：有声明、配置、查询和释放边界。目前采用 UI 包内部模块，由组合根装配一个共享实例，不向平台注册一个新的插件。这样业务插件仍只贡献动作与默认绑定，平台不需要为按键增加另一套安装协议或生命周期。

```text
按键事件
  → 原生/局部 DOM 消费、字段/输入法/瞬态界面保护
  → shortcuts 根据实际组件身份与有效键位选择绑定
  → 组件宿主用原权限上下文执行局部命令
  → 原 UI command router 调用一次处理函数
```

局部声明没有匹配时，继续当前组件的复杂 handleKeyDown，再查询 global，最后进入既有工作区兜底。映射只选择 command id，不持有 handler、不生成内核命令；业务处理函数仍由原 UI 命令模块持有。未来音乐意图到内核事务的转换沿用领域端口，不由快捷键模块负责。

`src/runtime/shortcut-router.js` 保存绑定与内存覆盖；`shortcut-keys.js` 复用原归一化逻辑；`host/keyboard.js` 持有单一 document 监听；组件宿主解析最近的实际 cell。`runtime-preview.js` 和兼容入口 `main.js` 各显式创建一份 shortcuts 并传给其唯一 command router。绑定不依赖侧栏名称、呈现样式或 DOM dataset，移动同一个组件节点保持身份。

## 作者声明

以下是可登记的最小示例。inspect 仅示范共享动作，不代表已连接真实音符输入。

```js
import { defineUiPlugin } from "./src/runtime/ui-plugin-contract.js";

const plugin = defineUiPlugin({
  namespace: "example.notes",
  commands: [{ id: "example.notes.inspect", run: () => ({ ok: true }) }],
  shortcuts: [{
    id: "example.notes.inspect-key",
    command: "example.notes.inspect",
    keys: ["Mod+I"],
    scope: "component",
    componentId: "example.notes.panel",
  }],
  ui: [{
    id: "example.notes.panel", kind: "panel", title: "笔记",
    slots: ["left", "right"], defaultSlot: "right", defaultEnabled: true,
    permissions: { commands: ["example.notes.inspect"] },
    mount(element, ctx) {
      const button = document.createElement("button");
      button.textContent = "检查";
      const click = () => ctx.execute("example.notes.inspect");
      button.addEventListener("click", click);
      ctx.onDispose(() => button.removeEventListener("click", click));
      element.append(button);
    },
  }],
});
platform.register(plugin);
// 由既有组合根在所有插件登记后统一 platform.start()。
```

按钮和快捷键进入相同命令处理函数。声明快捷键不携带自定义 payload；当前执行收到原 router 的默认 `{}`，动作需要的业务上下文应由所属控制器解析。复杂交互仍可通过原 ctx.execute 传入 payload。

| 字段/作用域 | 当前合同 |
| --- | --- |
| id | 插件命名空间下的稳定绑定 id，全局不能重复 |
| command | 已登记或本批已知的命令 id |
| keys | 单次组合数组；允许空数组；修饰符为 Mod/Alt/Shift，字母归一化为大写 |
| global | 默认 scope；不能带 componentId；宿主在输入保护后执行 |
| component | 必须指向本插件组件，命令已获该组件授权 |
| score | 必须指向本插件 role=view 的组件，仅该视图实际焦点生效；当前不表示已具备谱面编辑 |

键名采用既有 KeyboardEvent.key 语法，不是任意表达式。Mod 在 Windows/Linux 读取 Ctrl，在 macOS 读取 Meta；另一平台的修饰键与 AltGraph 不冒充 Mod。当前语法不提供空格或加号等特殊字符别名，后续扩展需要明确合同与测试。

同一有效范围不能绑定同键；global 与局部可同键，不同组件可同键。同一个 componentId 的 component 与 score 范围重叠，同键按冲突处理，不能由加载顺序决定优先者。所有者来自登记宿主，字段或输入法获得按键时所有作用域均不介入。

## 查询、改键与恢复

下面的管理 API 由宿主消费，不加入组件 ctx。它是当前原型内部接口，不宣称已发布 SDK。

```js
const shortcuts = createShortcutRouter({ onObserverError });
const router = createCommandRouter({ shortcuts });

shortcuts.setKeys("example.notes.inspect-key", ["Alt+K"]);
shortcuts.setKeys("example.notes.inspect-key", []); // 取消该绑定
shortcuts.reset("example.notes.inspect-key");      // 尝试恢复 Mod+I
```

改成 Alt+K 后，原 Mod+I 不再匹配这条绑定。只有焦点在该笔记组件中的有效控件时 Alt+K 才进入 inspect；移到另一个组件不会触发它。若原键还有适用的其他局部或全局绑定，原键仍可执行那条绑定；“取消”只取消所指定的绑定，不封锁整个按键。

| 方法 | 返回与用途 |
| --- | --- |
| register(owner, declaration) | 安装一条绑定，返回幂等 disposer；组件不直接调用 |
| preflight(owner, declarations, pending=[]) | 返回问题列表，同时核对默认声明与当前有效覆盖；pending 项为 `{owner, binding}` |
| resolve(combo, context={}, {localOnly=false}={}) | 返回冻结绑定描述或 null；局部优先于全局 |
| describe(id) / list() | 冻结纯数据；包含默认键、有效键、overridden 与 owner |
| keysFor(command, context={}) | 适用绑定的有效键位去重数组；不传组件上下文时仅返回 global |
| setKeys(id, keys) / reset(id) | 成功 `{ok:true, changed}`；失败保留原映射且不通知 |
| subscribe(listener) | 变更通知，不带快照参数，消费者重新查询；返回取消订阅函数 |

context 为 componentId、owner、score。实际键盘入口从活跃组件 cell 得到这些字段；它不是第二份活动组件状态。override 仅允许修改 keys，不能修改 command、owner、scope、componentId 或 permissions。

改键按当前有效键位检查冲突；恢复默认也检查当前有效键位。其他绑定已改用原默认键时，reset 返回冲突且保留当前值。安装新声明还校验默认声明间冲突，因此改键后释放的默认键不允许另一个新插件声明同范围的相同默认键；用户仍可显式将现有绑定改到该键，随后原绑定 reset 可能失败。

## 错误与清理

| 情况 | 结果 |
| --- | --- |
| 改键绑定不存在 | shortcut.missing |
| 改键类型、语法或重复键无效 | shortcut.invalid-keys，含 problems |
| 改键或恢复冲突 | shortcut.conflict，含 problems；原映射保留 |
| 安装声明/命名空间/目标/权限/命令引用非法 | 登记拒绝；安装时重复校验，失败逆序回滚 |
| 局部目标不活跃或所有者不匹配 | shortcut.inactive-component；不执行其他动作 |
| 局部命令权限被拒绝 | 原 permission.denied 与组件通知；按键已消费 |
| 局部命令禁用/缺失 | 原 command.disabled / command.missing；按键已消费，不进入 hook 或 global |
| 局部 enabled/run 抛错或 Promise 拒绝 | 键盘 onError 隔离报告；按键已消费，不穿透 |
| 全局命令禁用/缺失 | 保留原生默认行为，不执行 fallback |
| 观察者抛错 | onObserverError 隔离，其他观察者继续；不破坏注册或清理 |

绑定 disposer 具有身份保护，重复调用不会删除后来登记的同 id 绑定。释放同时清除该绑定的内存覆盖；当前不承诺跨安装、跨会话或重启恢复。平台失败回滚、正常释放均逆序清理快捷键、命令和组件。既有 UI Facet contractVersion 保持 1，不新增快捷键 Facet 或平台插件。

## 旧接口与提示

旧 command.keys 自动生成 global 绑定，绑定 id 等于 command id。commandFor(combo) 查询同一 shortcuts；command router 中已移除原有效 keys Map。describe(command).keys 保留冻结的声明值作为兼容元数据，用户改键不改变该数组。

菜单和布局提示已改为 keysFor 读取有效键位。菜单重开、布局浮层重新构造时反映改键；当前不自动刷新已经打开的浮层。无组件上下文的全局提示不展示局部绑定，未来局部菜单应传入对应上下文。复杂 handleKeyDown 继续同步返回 boolean/undefined；普通动作优先采用声明，字段内原生输入与局部 DOM 消费规则保持。

## 验证和实际影响

完整副本回归 126 项通过，其中本批新增 25 项。覆盖改键、取消、恢复、冲突原子性、作用域、权限、错误不穿透、安装失败回滚、旧包兼容、实际键盘宿主和 runtime-preview 装配/清理。13 个本批 JS/CJS 文件通过 node --check；本副本未配置 lint 或 TypeScript 检查，不把语法检查说成类型检查。

```powershell
$shortcutBatchTests = @(rg --files design/frame-visual/tests -g '*.test.js')
node --test --test-isolation=none @shortcutBatchTests
node design/frame-visual/tools/audit-shortcut-mapping.cjs
```

本批以新的 101 个副本源码文件哈希为基线，记录 11 个既有文件编辑和 6 个新增文件；证据位于 evidence/shortcut-mapping。源码审计核对原框架 33 文件和废弃 workbench 未变，CSS、几何、内置内容、视觉 fixture 与默认 Shell 结构未改；菜单/布局提示只改变有效键位的数据来源。并发变动单独记录，不能根据哈希声称作者身份。

默认运行预览没有新增默认绑定，仍只有 frame.builtin 平台包，既有 Escape 工作区兜底保留。因此打开现有预览不会出现改键设置或新的视觉布局。设置界面、配置持久化和已打开浮层实时更新分别留到后续。

测试运行实际模块并使用 DOM 替身；runtime-preview 测试只替换视口 plumbing，未执行真实浏览器布局。既有 file:// 浏览器访问拒绝未绕过，本批未完成像素、系统输入法和原生键盘验收，不将本次测试结论扩展为那些环境已通过。
