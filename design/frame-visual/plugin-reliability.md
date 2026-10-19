# UI 插件运行时可靠性增强

2026-10-02。工作基于备份框架的视觉副本 `design/frame-visual`。本批修改限定在 `src/runtime/`，另增独立测试、审计工具和本说明。布局侧维护的 Shell、CSS、工作区状态、几何和视觉 fixture 不由本批修改；原 `design/frame` 和废弃产品 `apps/workbench` 不由本批修改。

## 已实现的合同

### 注册时捕获与校验

平台登记插件时复制并冻结声明中的普通对象和数组；后续修改作者原对象不会改变已登记配置。函数钩子保留，函数闭包中的私有状态不被冻结。循环引用和特殊对象不能作为声明配置。

组件、命令、菜单引用和 v1 UI Facet 在注册时校验。重复 ID、命名空间越界、歧义表面绑定、非法槽位、未知权限引用及快捷键冲突提前失败。快捷键统一大小写和修饰键顺序后检查，待启动插件之间也检查冲突。独立注册表同样捕获配置。

### 安装失败回滚

安装前再次检查实时注册状态和命令提供者。每项贡献返回的清理函数立即纳入本插件的清理范围；中途失败按逆序撤回组件、命令和菜单。一个清理函数报错不会阻断其余清理，原安装错误保留在聚合错误中。

平台将失败插件记为 `failed`，继续启动独立插件。引用了失败提供者命令的后续插件也会失败。`onFailure` 报错记入 `reportingError`，不会中止其他插件。公共快照不暴露内部清理函数。旧 `installPlugin` 入口遇到晚期安装失败会抛错。

### 资源清理与重复释放

组件上下文新增可选 `ctx.onDispose(callback)`。获得订阅、监听或定时器后即可登记同步清理函数；挂载后续失败也能释放已登记资源。回调按登记的逆序执行，每次登记至多执行一次。返回值是可提前执行的幂等清理函数；组件释放后再登记回调会立即执行。

```js
mount(element, ctx) {
  const unsubscribe = viewPort.subscribe(update);
  ctx.onDispose(unsubscribe);

  const listener = event => updateFromEvent(event);
  element.addEventListener("input", listener);
  ctx.onDispose(() => element.removeEventListener("input", listener));

  return { setVariant(variant) { element.dataset.variant = variant; } };
}
```

原 `mount` / `setVariant` / `dispose` 合同继续可用。`mount` 同步返回实例对象或空值；实例的 `setVariant` 和 `dispose` 若存在需为函数。实例 `dispose` 在先前登记的上下文回调之前执行，清理其中一个资源报错后仍继续清理其余资源。相同资源应选择一种登记方式，避免同时在实例 `dispose` 中重复清理。

切换页面和移动 cell 仍保留原实例和用户输入。定义移除后宿主自动释放实例，平台清理不依赖 Shell 执行。组件和平台可安全重复释放；组件释放后保留的 `ctx.execute` 返回 `component.disposed`，`ctx.notify` 不再产生通知。组件清理错误通过 notices 报告，平台清理错误在完成其余清理后用 `AggregateError` 抛出。

注册表观察者异常与注册行为隔离；可通过构造选项 `onObserverError` 收集，诊断回调自身报错也不阻断注册或撤销。

## 兼容性与范围

- 合法 v1 UI Facet、默认 `role: view` 到 page 的历史映射、旧安装入口与现有内置页面继续工作。
- 已登记声明不可原地修改；下一固定会话重新登记才能应用新声明。平台 `dispose` 后清空原记录与待登记队列。
- 资源清理只管理已登记回调及实例 `dispose`；无法自动发现插件未登记的订阅或监听。当前清理合同是同步的。
- 本批沿用启动时加载和单个前端命令路由。没有增加热安装、热卸载或真实内核接入。

## 验证与证据

20 项新增故障测试与 14 项现有测试共 34 项通过，覆盖不可变捕获、声明冲突、部分安装失败、回滚清理报错、错误观察者、依赖提供者失败、陈旧 disposer、重复释放、挂载失败及无 Shell 的实例释放。

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/plugin-reliability.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/audit-plugin-reliability.cjs
```

上述显式测试命令已通过；这不表示目录形式的 `npm test` 已通过。本项目当前 Node 环境不支持该目录导入方式，本轮采用显式文件列表。

浏览器在独立后台检查页验证了四页导航、切页输入保留、区域开合、布局取消恢复和确认保留。旧 `index.html` 正常渲染原组件形态。运行时预览与当时最新结构预览的默认几何一致，未见故障占位或控制台错误。测试输入和区域状态均已恢复；用户已有的预览标签页未操作。本轮没有重跑完整 96 状态视觉矩阵。

审计基线为本批开始时 66 个非 evidence 文件的 SHA256。审计通过：本批修改 7 个运行时文件、新增 4 个源码/说明文件，期间布局侧独立更新了 `README.md`、`runtime-integration.md`、`src/fixtures/structure-preview.js`、`tools/horizontal-bands-contract.js`，均保留并单列；不能将整个视觉副本描述为未变化。原 `design/frame` 的 33 个文件清单及 SHA256 均与 `copy-provenance.json` 一致。

本批修改的是运行时合同，因此使用独立审计，不使用要求继承合同哈希不变的历史 `audit-copy` / `audit-runtime` 作为完成证据。报告和截图保存在 `evidence/plugin-reliability/`：

- `before-source-hashes.json`：开始时哈希基线。
- `source-audit.json`：本批变更、并发布局变更与原件保护结果。
- `browser-review.json`：交互检查与只读 DOM 采样。
- `runtime-compatible.jpg`：恢复初始状态后的运行时预览。
