# 插件公共包与挂载 UI 合同 4.0

2026-10-07 实施版。新备份预览及桌面入口采用正式 PluginPlatform；保留原四栏、布局和组件宿主。
旧 SDK 3.0 是 React 承载合同，UI facet v1 是挂载能力版本，两者不是同一升级序列。

作者先提供共同身份，再按需要贡献 UI、业务能力、设置或内核模块。没有界面也合法。
可选 ui/贡献数组缺失、undefined、null 归一为空；条目及内部必填不能为空。合法 false/0 保留。
下面的无界面包不生成占位：

```js
import { definePlugin } from "./src/vendor/plugin-platform.js";
const plugin = definePlugin({ id: "example.analysis", name: "Analysis", version: "0.1.0",
  apiVersion: "4.0", tier: "product", activation: "user" });
```

正式 TS 作者使用 `apps/workbench/src/plugins/plugin-sdk.ts`；备份浏览器使用由相同源码生成的模块。
应用在启动集合内登记包。插件不创建平台、router、布局状态或另一份文档。
2026-10-08：独立SDK bundle的包已修复同一运行时身份识别，仍经过原捕获/权限校验。SDK与宿主须用当前源重建；旧私有Symbol的已加载bundle不混用，JSON/IPC不是执行包传递接口。API4.0/facet1及声明字段不变。

当前桌面 notation.core 已由可信应用注入真实文档读投影；新建/打开/重读是该包内部动作贡献，共用原router。
普通预览仍使用显式fixture。核心view不获得WorkbenchClient、文件写权限或平台；只读接线及未保存保护见
[真实文档合同](../../.trellis/spec/frontend/readonly-score-document-contract.md)。

带面板、动作、菜单和局部快捷键的包：

```js
import { definePlugin } from "./src/vendor/plugin-platform.js";
const plugin = definePlugin({ id: "example.inspect", name: "Inspector", version: "0.1.0",
  apiVersion: "4.0", activation: "user", ui: {
    contractVersion: 1,
    components: [{ id: "example.inspect.panel", title: "Inspector", role: "tool", uiKind: "panel",
      slots: ["left", "right"], permissions: { commands: ["example.inspect.read"] },
      mount(element, ctx) {
        const button = element.ownerDocument.createElement("button");
        button.setAttribute("aria-label", "Inspect");
        // Author-owned SVG; no dependency on the application's private icon catalog.
        button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3h7l4 4v14H7zM14 3v5h4M10 12h5M10 16h5"/></svg>';
        const onClick = () => ctx.execute("example.inspect.read", { source: "button" });
        button.addEventListener("click", onClick); element.append(button);
        ctx.onDispose(() => button.removeEventListener("click", onClick));
        return { dispose() { button.remove(); } };
      } }],
    commands: [{ id: "example.inspect.read", label: "Inspect", enabled: () => true,
      run(payload, host) { return { ok: true, payload }; } }],
    menuItems: [{ id: "example.inspect.menu", menu: "view", command: "example.inspect.read" }],
    shortcuts: [{ id: "example.inspect.key", command: "example.inspect.read", keys: ["Mod+I"],
      scope: "component", componentId: "example.inspect.panel" }],
  } });
```

`uiKind` 推荐 panel/slotItem/view。panel 可用左右栏、slotItem 可用已支持的普通槽位、view 仅用 stage。
module/page 及 footerHeight/allowedSpans 是有界兼容元数据；不把它们当成整个插件的类型。
当前不开放 overlay、谱面内部自由位置或新侧栏样式。菜单必须引用宿主已存在的位置及可用命令。

执行链为按钮/菜单/快捷键→同一 UI router→本插件 run→明确的业务端口；平台只安装 run，不转发执行。
参数和同步/Promise 结果保留原样。组件 execute 检查白名单；局部快捷键也经过该检查。
ctx 提供 execute、notify、onDispose、可选 confirm、本插件只读 settings；同期动画模块还可提供按权限收窄的 motion。
2026-10-11：本备份组合还向声明 interaction 的包提供可选 `ctx.notationInteractions`，
只读本包已捕获的谱式策略；其他包没有此端口。它不包含注册/清空、平台或音乐写能力。
正式核心将共享记谱策略绑定到当前 view，详见[记谱策略合同](../../.trellis/spec/frontend/notation-interaction-package-contract.md)。
不暴露完整平台/布局/router，动画描述沿用共享动画合同。旧命令迁移仍按单参数 run(payload) 调用。

正式可选动画随组件声明 `animations: {contractVersion:1, definitions}` 和
`permissions.animations` 一次捕获；空值合法，非法版本/字段/越权定义拒绝。
作者只拿 `ctx.motion.bind(targets)`，宿主绑定实际 cell 与登记身份。声明、使用例和生命周期见
[受限动画合同](animation-service-contract.md)；布局的四读端口、单位和写命令见
[布局公开合同](workspace-layout-contract.md)。

`mount` 必须同步返回实例或空；可选实例方法为 dispose、setVariant、setVisible、handleKeyDown。
hide/move 不释放、不重建；异常由 ComponentHost 局部处理并释放已登记资源。
dispose、setVariant、setVisible 及 onDispose 回调必须同步完成。非法 Promise 返回会被观察并拒绝，
不等待其完成，也不把它当作挂载或清理成功；剩余同步清理仍继续。异步读写应放在同步 mount 内，
由插件自己的有效标记/序号和取消端口阻止晚到结果回写。取消是协作式，不会强制中断同线程代码。
纯数据 manifest 仅含贡献 ID，mount/run 留在被捕获的模块，管理 UI 获得冻结描述。

包的 `settings: {schemaVersion, defaults, parse}` 沿用正式 SDK；parse 返回校验值或 null。
parse 必须同步；接受结果只包含可持久化的 JSON 数据：有限数、字符串、布尔、普通对象、密集数组及嵌套 null。
根 null 是校验失败信号；undefined、函数、访问器、循环、稀疏数组和 Date/Map 等实例不作为设置值接受。
正式注册表复制并递归冻结接受的值，不冻结作者输入。read 返回不可变数据；修改应经过可信设置所有者，
普通挂载组件和命令仍只有本插件 read 端口。本次纠正设置所有权，不变更 API/envelope/schemaVersion 编号；
原 3.0/4.0 已有普通数据用例保持，依赖可变引用或非持久化值的旧写法需改为显式 JSON 值。
可信应用先注册所有包，再恢复 settings，随后 start 和首次 mount。组件使用 ctx.settings.read()，
命令使用 host.settings.read()。备份管理页保存到原启动计划 envelope，配置变动在下次进程生效。

原内置清单通过明确的应用元数据适配成 4.0；本轮开发版本统一 0.1.0。
未知旧 namespace 清单必须传 `legacyPluginMetadata[id]`，包含匹配 id、name、version、activation，
不能让平台代造第三方身份。3.0 render 包继续拒绝直接交给备份。

启动配置→验证计划→登记正式平台/settings→恢复值→固定启动→挂载原 UI。
桌面返回配置后仍保留原会话；再次进入只是返回，应用关闭并重新启动才读取新集合。
file 预览可以完整 dispose 再创建独立会话。结束的正式平台不能复用。

完整字段和错误/测试矩阵见 `.trellis/spec/frontend/plugin-protocol-convergence-contract.md`。
当前已接入内置包和应用传入的编译包；外部安装发现、更新、失败启动恢复和真实谱面编辑仍未完成。

## 可运行的作者样例与验收边界

[三类独立样例及装配步骤](examples/foundation/README.md)提供面板与设置、命令与映射、异步只读 view。
它们只导入本页的公共 SDK，不读取宿主私有实现；配套测试消费真实正式平台/原 router/ComponentHost，
并在备份实际组合根运行只读 view。测试用作者自己的数据输入，不代表普通插件已经获得真实作品端口。

平台与设置订阅、诊断通知以及工作区/文档/谱面只读通知是接受状态后的观察行为，不能否决已经接受的操作。
通知以开始分发时的订阅集合为基准，坏观察者不阻断其余观察者；误返回的 Promise 拒绝被观察且不等待。
onDiagnostic 是最佳努力通知，诊断本体先保留在 store；钩子失败不递归生成另一条插件诊断。
插件的 run/读取操作本身仍依照各自合同报告失败，这项隔离不把业务失败改成成功。

当前启动管理目录是可信应用的固定清单。应用传入包不等于自动加入启动管理：新的可配置包还需要
应用明确提供目录元数据/设置字段及固定装配方案，不能向现有已校验计划追加未知 ID。
2026-10-08：可执行接线现为`startupEntries:[{metadata,plugin}]`，见[固定装配合同](../../.trellis/spec/frontend/plugin-startup-assembly-contract.md)。有计划时不再接受额外的无目录`plugins`；无计划独立组合保持。管理页/store/runtime共用捕获目录，参数经原registry恢复后才挂载。新id的旧配置迁移尚未实现，不自动补项。
没有应用级目录接线的样例只用于独立组合测试，不宣传为外部安装或通用设置管理已经完成。
2026-10-08单写者保护及同版桌面关键流程已复验；原生Ctrl+滚轮、系统缩放/IME、独立作者及容量资格仍按[基础验收标准](infrastructure-acceptance-v0.1.md)补验。
独立作者可使用[验收指南](author-validation-guide-v4.md)和`npm run author:build`生成的仅公开SDK目录；参考自检不替代独立作者资格。
