# 焦点与快捷键边界

2026-10-02。本批在备份视觉副本完成默认入口的键盘接入和组件焦点边界。19 项新增行为测试通过，全副本当前 101 项测试通过。

## 适用范围与触发

实现位于 host/focus-boundary.js、host/keyboard.js、现有组件宿主和默认运行入口。panel/slotItem/view、v1 登记格式、全局 keys 的唯一性与权限合同保留。此轮没有新增平台插件、命令注册表、焦点状态存储或布局样式。

默认 Shell 曾独立在 window 监听 Escape，现在通过一个 document 冒泡监听，在局部控件处理之后分配按键。DOM 和实际可见实例决定归属；侧栏选择偏好不决定键盘归属。

## 具体签名

```js
const disposeKeyboard = bindKeyboard(router, {
  root: shell.shell, components: host, fallback: shell.handleKeyDown,
  isMac: false, // 省略时沿用当前平台信息推断
  onError: error => report(error),
});
// mount 可选实例成员；ctx 仍只有 execute/notify/onDispose。
return { handleKeyDown(event) { /* 同步 true、false 或 undefined */ } };

// 内部宿主接口；插件不接收整个 host。
host.handleKeyDown(event, eventPath); // boolean
const recover = captureFocusRecovery(shell.shell);
// 渲染后使用一次；可见移动恢复原节点，否则使用 fallback。
recover(activeVisibleTab ?? shell.stage);
```

默认入口在非 BFCache 的 pagehide 先解绑键盘，再释放 Shell 和组件。unbind 幂等。保留到 BFCache 时继续持有当前绑定。

## 分配与消费合同

顺序是原生/局部 DOM 监听 → 字段保护 → 瞬态界面保护 → 当前真实组件实例 → 全局命令或工作区兜底。中央谱面组件仅在事件路径进入其实际 cell 时收到按键；侧栏未处理的按键没有再次投递到后台谱面。

字段包括 input、textarea、select 和继承的 contenteditable，接受空值、true、plaintext-only，并尊重最近的 false。输入法组合期、兼容 keyCode 229、Dead/Process/Unidentified、AltGraph、已经 preventDefault 或 stopPropagation 的事件不交给宿主。可见 dialog/alertdialog/menu、当前 popover 与 body 弹出层保留按键；本轮不实现其焦点圈定和打开/关闭策略。

实例 true 表示消费，宿主 preventDefault；false/undefined 表示交还。实例自行 preventDefault 或 stopPropagation 也表示消费。框架不在 capture 阶段抢占局部监听，不主动 stopPropagation 抑制其他 DOM 观察者。

cell 身份决定目标；复制 data-component 不能重定向按键。隐藏、失败、释放实例不会收到 hook；实际呈现层同时维护可见状态与隐藏 DOM。多个实例可复用局部同键，只调用事件路径中的最近实际实例。全局 keys 保持安装期唯一；局部 hook 不同时声明那组全局 keys。

禁用的全局命令不执行、不 preventDefault。Windows Ctrl 和 macOS Meta 按 Mod 严格匹配。工作区仅对普通 Escape 取消调整，字段或弹出层中的 Escape 不取消布局；页签与调整柄只处理普通方向键。

## 验证与错误矩阵

| 条件 | 结果 |
| --- | --- |
| mount 返回非函数 handleKeyDown | mount 失败，清理资源并显示原加载失败状态 |
| hook true | 消费，一次局部动作，无全局动作 |
| hook false/undefined | 交还全局；不调用其他组件 |
| hook 抛错或错误返回类型 | 消费并报告，其他实例继续可用 |
| hook 返回 Promise | 拒绝异步合同，消费并报告；排空 rejection，不等待延迟认领 |
| ctx.execute 未获权限 | 原 permission.denied；hook 应返回 true 消费自己的尝试 |
| 全局 enabled/run 抛错、run 拒绝 | 报告并隔离，后续其他按键继续处理 |
| 聚焦节点移动到仍可见区域 | 节点和输入保留；浏览器移除焦点时恢复原节点 |
| 聚焦内容隐藏、切换、禁用或移除 | 当前可见页签；无可用页签则舞台 |
| 插件更新中主动聚焦另一有效控件 | 保留新焦点 |

异步 hook 已启动的副作用不能由同步宿主撤销，作者必须遵守同步返回。动作可以启动异步服务调用，但按键认领必须同步完成。

## 示例与插件影响

按钮与局部快捷键复用同一个动作；匹配只放在输入 hook 中。

```js
const plugin = defineUiPlugin({
  namespace: "example.notes",
  commands: [{ id: "example.notes.inspect", run: payload => inspect(payload) }],
  ui: [{
    id: "example.notes.panel", kind: "panel", title: "笔记", slots: ["left", "right"],
    permissions: { commands: ["example.notes.inspect"] },
    mount(element, ctx) {
      const button = document.createElement("button");
      button.textContent = "检查";
      const inspectNow = () => ctx.execute("example.notes.inspect", { source: "notes" });
      button.addEventListener("click", inspectNow);
      ctx.onDispose(() => button.removeEventListener("click", inspectNow));
      element.append(button);
      return { handleKeyDown(event) {
        if (event.key.toLowerCase() !== "i" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        inspectNow(); return true;
      } };
    },
  }],
});
```

好例：焦点在笔记按钮，按 I 执行自己的命令一次。基础例：旧插件没有 hook，局部 DOM 监听和按钮继续工作，未处理按键沿用全局命令。坏例：每个插件都在 document 监听 I 并操作业务，导致多个插件同时响应，绕开字段和弹窗分配边界。

局部行为跟着实例走：以后移动侧栏内容或改变样式，不必根据左侧/右侧/页签类型决定业务接收者。manifest 不需迁移，业务命令留在各模块，宿主只分配输入。音符转换、事务、版本检查、撤销重做仍留在类型化编辑端口和内核链，本轮谱面保持只读。

## 测试与明确限制

```powershell
$keyboardBatchTests = @(rg --files design/frame-visual/tests -g '*.test.js')
node --test --test-isolation=none @keyboardBatchTests
node design/frame-visual/tools/audit-keyboard-boundaries.cjs
```

19 个新增场景覆盖实际 Shell、组件宿主、平台、目录、编排、router，以及执行 runtime-preview 入口的绑定与释放。入口测试只替换浏览器 viewport plumbing；键盘、焦点和 Shell 是实际实现。三种视口参数下的旧 Shell 结构对照继续通过。

DOM 替身模拟冒泡、preventDefault、stopPropagation、composedPath 和 activeElement，不执行浏览器排版、操作系统输入法或像素。composedPath 只消费浏览器暴露的节点；封闭 Shadow DOM 和自定义控件应在自身监听消费保留按键。非模态浮层出现时也暂时保护背景快捷键，这是本批保守的分配策略。

已有 file:// 浏览器访问拒绝保持有效，本轮未更换协议或浏览器绕过，未完成真实浏览器键盘/像素验收。

新基线、7 个修改文件原稿、测试、语法检查与源码审计位于 evidence/keyboard-boundaries。审计保留原框架与废弃 workbench 的新基线，同期设计修改另列。旧批次审计与证据不覆盖。

`.trellis/spec/frontend` 仍是 reserved 层，本批未将备份实验合同登记为正式产品规范。可执行边界与示例写在本说明和 plugin-authoring.md，正式发布时再迁入活跃层。
