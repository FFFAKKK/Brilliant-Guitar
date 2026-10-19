# UI 插件作者入口与只读贡献目录

2026-10-09：后续工作按[开发准入范围](development-readiness-v0.1.md)推进；现有能力开发、待实现业务和发布资格分别判定，避免将所有pending事项变成统一开发阻塞。

维护者交付前运行 [基础边界持续回归](foundation-boundary-regression.md)；独立作者提交仍按4.0作者指南验收。持续检查通过不替代独立开发或原生/容量资格。

2026-10-07 当前入口已收敛到正式 PluginPlatform 和明确的 **4.0 公共包 + UI facet v1**。
新作者先读 [当前挂载合同与完整示例](./plugin-mount-contract-v4.md)。身份、版本、设置、权限和固定会话
均使用正式 SDK；UI 内部仍只有一个命令路由。以下 defineUiPlugin/v1 字段说明保留给内置迁移与历史夹具，
不能直接当成新包公共身份合同。旧声明需要可信应用提供明确元数据后适配，真实备份入口不再启动旧平台。

开发稳定性与基础设施收尾按 [验收标准 v0.1（评审草案）](./infrastructure-acceptance-v0.1.md) 做逐项资格检查。
其“仅凭文档开发”、失败/生命周期与同版桌面门槛尚未全部验收；文档存在不表示已达到商业成熟度。

当前 4.0 的[可运行三类样例](examples/foundation/README.md)已提供独立插件文件和精确测试/装配步骤。
2026-10-08补充[三类作者验收指南](author-validation-guide-v4.md)：仅公开SDK的生成目录、依赖图检查和原宿主提交验证。它是当前4.0文档的限定开发试验入口，后面的历史v1示例不作为该试验输入。
公开能力、状态所有者及应用专用端口的边界见[本轮基础地图](research/infrastructure-foundation-map-20261007.md)。
以下带“当前”的说明属于所标日期的旧 v1 阶段；新包字段、设置和生命周期以顶部的 4.0 合同为准。

## 历史 v1 说明与内置迁移记录

2026-10-02。当前合同已收敛为 `panel/slotItem/view`。实施位置为备份视觉副本 `design/frame-visual`，默认入口已通过目录、编排和呈现适配接入现有侧栏，内置包仍保留兼容的 v1 登记格式。本说明描述当前代码；此前四类接口的实现证据保留在 `evidence/plugin-authoring/`。

2026-10-03 作者就绪审查：补齐当前字段、完整接入示例、同步／异步边界、失败处理及交付检查。下面的当前协议示例与下一版共同最小声明分别说明；新作者先使用已开放接口，候选扩展待宿主完成合同后接入。

2026-10-04 文档收敛：首批作者先读 [受限试点规范](./plugin-authoring-baseline-v0.1.md)，再按本页精确字段实施；视觉接入依据 [本产品 UI 要求](./plugin-product-ui-profile.md)。试点规范中的显式结果等作者约定不等于宿主已新增强制校验。本页可执行示例与运行合同保持。

## 设计思路与独立插件判断

2026-10-05 实施补充：副本运行时的工作区布局已是独立登记单元 `frame.layout`，贡献 `frame.layout.page`。其三个读取端口由可信组合根明确注入，不是所有普通插件已获得的通用 SDK 能力；接口、协作例子及旧 ID 范围见 [工作区布局小插件](./workspace-layout-plugin-interface.md)。

2026-10-03 补充：[插件设计与编写原则 v0.1（评审草案）](./plugin-design-v0.1.md) 记录内部模块、UI 贡献、独立功能插件和逻辑功能组的区别，并给出可供外部插件平台参考的原则。该草案不扩展本页的实际作者合同。

编写前先判断登记粒度：是否存在实际的独立装配、替换或复用需求；是否能通过明确的公开接口协作并说明状态所有者；生命周期、依赖缺失和失败行为是否能够分开说明。建议同时满足这三个条件，并评估新增协调成本，再独立登记；否则先保留为所属插件的内部模块。

一份插件可以包含多个模块及多个 UI 贡献。功能组目前只体现在目录、文档或装配清单中，不新增父插件或第二套管理器；当前作者根声明不支持 group 字段。具体判断方法、谱面划分建议和作者说明清单见上述草案；当前可执行接口仍以下文为准。

### 下一版统一贡献要求与当前 API 的区别

[设计主稿第 7 节](./plugin-design-v0.1.md) 已补入本会话确认的需求：UI 包内允许功能插件，整个插件不按功能、视觉或动画分类；所有插件采用共同的最小必填声明，在其上按需组合宿主开放的最大可选扩展。`panel/view/slotItem` 仍是单项贡献的 kind，不是插件类别。

| 项目 | 目标契约 | 当前 `defineUiPlugin` |
| --- | --- | --- |
| 共同基础声明（原称最小贡献） | 稳定身份、名称、插件版本、宿主接口兼容要求；共同必填为空、空白或非法时拒绝 | 使用 namespace；尚未开放根级名称、版本与兼容字段，ui 仍必须是数组 |
| 可选贡献集合（原称最大贡献） | UI、功能、输入、绘制、动画、配置等按需组合，每个接口规定范围与程度限制 | 根字段仍只有 namespace/ui/commands/menuItems/shortcuts；其他候选接口未开放 |
| 空可选贡献 | 省略、undefined、null 统一为空；全部可选贡献为空仍可合法 | ui 可为 []，不能省略或传 null；其他三组可省略，但显式 null 会被拒绝 |
| 实际扩展条目 | 一旦提供，内部必填、目标、依赖、权限和限制必须合法；非法条目与运行失败保持明确诊断 | 继续执行现有声明、预检与运行规则，不通过本文自动变更 |

上述目标不生成虚假 UI 占位，也不把合法 false/0 当成空。动画为空时使用静态表现；已存在贡献执行异常不能吞成 null 后报告成功。完整限制矩阵、光标组合例及迁移验收集中在设计主稿维护。本页继续描述现有可执行接口，作者不要提前向当前声明加入未支持字段。

## 单份作者声明

当前应用启动入口为 `createWorkspaceRuntime({ root, plugins })`，位于 `src/host/workspace-runtime.js`。作者用 `defineUiPlugin` 返回声明，可信应用启动代码在启动时一次性传入。组合根装配命令、键盘、菜单、确认窗口、布局和组件宿主；插件不创建这些模块，也不调用第二次 register/start。

布局插件和核心谱面插件走同一条登记链，不需要各自再建注册器：

```text
插件声明
  → captureConfig / manifest 校验
  → 同一个 PluginPlatform.register()
  → PluginPlatform.start()
  → UI facet host / ComponentHost
  → catalog 查询并挂载
```

当前备份预览的固定装配集合是 `frame.builtin`、`frame.layout` 和入口传入的 `notation.core`。其中 `frame.layout` 贡献 `frame.layout.page`，`notation.core` 贡献唯一的 `notation.core.view`（`kind: view`、`slot: stage`）。`frame.layout` 不拥有谱面渲染，`notation.core` 也不拥有四栏几何；两者都由同一个组合根和同一个插件平台管理。

正式预览入口可以声明应用级必需 view 槽位：

```js
createWorkspaceRuntime({
  root: document.getElementById("app"),
  plugins: [createCoreScorePlugin({ snapshot })],
  requiredViewSlots: ["stage"],
});
```

`requiredViewSlots` 是宿主启动策略，不是插件 manifest 字段。它只表达“本应用启动必须有且只有一个该槽位 view”；缺失或重复会在壳挂载前失败并触发完整回滚。通用测试或只验证布局的运行时可以省略它，因此插件平台本身仍保持通用，不把 `notation.core` 硬编码进平台。

缩放也属于宿主工作区的阅读状态。缩放命令和 `frame.workspace.view.zoom` 由宿主持有，谱面 view 只消费宿主视口结果，不创建第二个滚动容器或保存另一份 zoom 状态。缩放控件可以在壳层预制位置显示；它不属于布局编辑会话里的栏内组件配置，普通浏览模式下始终可用。

返回值只含可信应用 execute、workspace 只读端口与 dispose；普通组件继续使用受限 ctx。当前入口实际消费侧栏 panel 和唯一的 stage view；slotItem 的真实槽位消费与正式 SDK 发布仍待后续。模块职责、启动回滚与释放见 [runtime-composition.md](./runtime-composition.md)。

### 当前根字段

| 字段 | 必填／默认 | 类型与作者规则 |
| --- | --- | --- |
| namespace | 必填 | 非空字符串，匹配 `^[a-z][\w-]*(\.[a-z][\w-]*)*$`；贡献 id 使用 namespace 加点分后缀，不能随标题或布局变化 |
| ui | 必填，可为 [] | UI 贡献数组；省略或 null 会失败。空数组表示当前声明没有 UI，属于现协议容器要求，不是未来所有插件必须贡献视觉内容 |
| commands | 可省略 | 命令数组；显式 null 非法；每项提供本命名空间下的 id 与 run |
| menuItems | 可省略 | 菜单项数组；显式 null 非法；引用宿主已有 menu 与已登记 command |
| shortcuts | 可省略 | 快捷键数组；显式 null 非法；使用稳定 id、command、keys 和明确作用域 |

当前根字段之外的名称、版本、compatibility、services、animations 等会被拒绝。完整的下一版共同最小声明是目标契约，不能用旧协议的 namespace/ui 两项取代它。

2026-10-04 位置要求补充：目标设计在谱面工作区内部左右两侧承载固定插件，分别占位、不遮挡谱面；右键菜单等小面积内容可按触发点临时悬浮，见 [工作区位置设计](./score-workspace-placement.md)。原左右侧栏与这些位置分别表达；放大时宿主自动收栏让空间，退出或空间恢复后保留用户手动调整并恢复其余原状态。这些均为待实现的目标合同。本页 panel 只允许 left/right、view 只允许 stage 的描述是当前校验事实；新位置、自动收放及通用临时浮层须同时完成合同与宿主消费，不因补充文档自动可用。

首版固定组件的预设位置、顺序及尺寸配置纳入布局编辑；临时菜单打开／关闭属于日常交互，不保存临时布局坐标，不要求先进入编辑。自由拖放仍留后续。作者不提前增加位置字段，不用私有 CSS 或全局 sidebar/store 绕过承载合同；既有命令、菜单、示例及受限执行接口继续按本页实施。

[宿主接入合同草案](./workspace-host-contract-v0.1.md) 记录新位置的数据语义、现有代码的接入落点、兼容及实际消费门槛；其中的语义名称不是本页已开放字段。Facet 清单中的 `overlay` 也不代表当前组件校验或运行宿主已经提供通用浮层。

当前合法的空贡献声明如下。该片段只验证旧协议空集合，不能作为下一版四项共同声明的示例：

```js
// docs-example: current-empty
import { defineUiPlugin } from "./src/runtime/ui-plugin-contract.js";
export const emptyPlugin = defineUiPlugin({ namespace: "example.empty", ui: [] });
```

没有面板但提供一个命令的当前声明同样合法：

```js
// docs-example: current-command-only
import { defineUiPlugin } from "./src/runtime/ui-plugin-contract.js";
export const commandOnlyPlugin = defineUiPlugin({
  namespace: "example.command",
  ui: [],
  commands: [{ id: "example.command.ping", run: () => ({ ok: true, message: "pong" }) }],
});
```

功能若需要公开服务、共享输入或绘制端口，仍需等待相应合同；不要把任意对象藏进额外根字段，也不要通过全局变量或他人的 DOM 接入。

当前没有插件根级setup/dispose或独立功能ctx。无UI命令声明可以处理离散动作，但长期订阅、计时或驻留任务需要明确的生命周期所有者及受限宿主接口；不在模块导入或创建声明时申请无法随插件释放的资源。需要这些能力时先补接口，不以假面板代替插件生命周期。

### 真实文档接入与平台管理页

核心谱面插件不直接读取 `WorkbenchClient`、Tauri bridge 或 Rust 文档对象。可信应用组合根先把原子会话读取适配为只读谱面端口，再把端口交给 `createCoreScorePlugin`：

```js
const projection = createDocumentStaffProjection({
  readSession: () => workbenchClient.read(),
  subscribe: onDocumentChanged => documentSession.subscribe(onDocumentChanged),
});
projection.start();

createWorkspaceRuntime({
  root,
  plugins: [createCoreScorePlugin({ score: projection.read })],
  requiredViewSlots: ["stage"],
});
```

适配器只接受带 `documentId`、`documentVersion` 和 `notation` 的完整会话；同一文档的旧版本会被拒绝，版本无效或谱式不支持时不会用 fixture 冒充成功。真正的应用会话负责提供读取和变更通知，适配器不复制文档状态，也不创建第二个编辑命令链。静态预览仍可使用 `STAFF_FIXTURE`，但必须明确标注为预览数据源。

应用入口可以使用 `src/host/backup-ui-runtime.js` 收敛这段装配，避免每个宿主重复拼接投影、核心谱面插件和必需槽位策略：

```js
const runtime = createBackupUiRuntime({
  root,
  documentSession: {
    read: () => workbenchClient.read(),
    subscribe: onDocumentChanged => documentSession.subscribe(onDocumentChanged),
  },
  plugins: [createGuitarUiPlugin()],
  enablePluginDiagnostics: true,
});
```

离线视觉预览默认不显示管理页；需要检查插件管理 UI 时可打开 `runtime-preview.html?plugins=1`，该参数会直接打开管理页。该查询参数只打开可选管理入口，不改变默认四栏布局或插件登记顺序。

`documentSession` 是应用传入的窄适配端口；真实桌面入口传它，离线视觉预览才传显式的 `fixture`。工厂内部创建 `document-staff-projection`，登记 `notation.core`，再把布局、核心谱面和业务插件一次性交给同一个 `PluginPlatform`。返回的 `dispose()` 同时释放工作区和投影，异常启动也会先释放投影，不会留下文档订阅。

插件平台已经是唯一注册边界。备份框架的启用顺序是 `register(manifest) → start() → catalog 查询 → ComponentHost 挂载`，运行中不追加注册；布局、核心谱面和业务插件都走同一条链。平台管理页只读消费 `createPluginStatusReadPort(platform)`，显示插件列表、状态筛选、贡献元数据和失败原因，不暴露 `register/start/dispose`。元数据投影只包含 namespace、UI 单元、命令、菜单和快捷键的数据字段，不把 `run`、`mount` 等执行函数泄露给页面。该管理页通过 `enablePluginDiagnostics: true` 显式启用，默认入口保持关闭，避免为了管理功能改变已经完成的工作区布局。

平台本身不需要常驻工作区 UI；它是固定会话的注册和生命周期内核。产品需要管理入口查看登记结果和失败原因时，使用可选插件管理页；启用时从 `plugins` 菜单打开，关闭时不增加默认栏位，也不能在页面内动态注册、卸载或热替换插件。第一版页面的搜索、状态筛选和详情查看是即时只读操作；插件启用、禁用或版本变更属于下一次会话的启动计划，当前会话保持冻结。未来的复杂操作应接入独立的管理控制器和计划端口，不改变这个边界。

### 完整接入示例

下面三个文件的假定位置都是 `design/frame-visual/` 根目录，示例导入路径按此解析。它们只用于独立接入验证，文档更新没有创建这些运行文件或向默认预览安装示例插件。

`example-plugin.js`：同一声明贡献一个命令、菜单项、局部快捷键和侧栏内容；示例不申请真实业务端口。

```js
// docs-example: current-panel
import { defineUiPlugin } from "./src/runtime/ui-plugin-contract.js";

export function createExamplePlugin() {
  let count = 0; // 每次创建声明都有自己的私有状态；不保存到模块全局。
  return defineUiPlugin({
    namespace: "example.demo",
    commands: [{
      id: "example.demo.count",
      run: () => ({ ok: true, count: ++count }),
    }],
    menuItems: [{ menu: "view", command: "example.demo.count", label: "调用示例", group: 2, order: 0 }],
    shortcuts: [{
      id: "example.demo.count-key",
      command: "example.demo.count",
      keys: ["Alt+J"],
      scope: "component",
      componentId: "example.demo.panel",
    }],
    ui: [{
      id: "example.demo.panel",
      kind: "panel",
      title: "接入示例",
      slots: ["left", "right"],
      defaultSlot: "right",
      defaultEnabled: true,
      permissions: { commands: ["example.demo.count"] },
      mount(element, ctx) {
        let active = true;
        const content = document.createElement("div");
        content.className = "example-demo";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "调用命令";
        const output = document.createElement("p");
        output.setAttribute("aria-live", "polite");
        output.textContent = "尚未从按钮调用";
        const failed = message => {
          output.textContent = message;
          ctx.notify(message, "error");
        };
        const click = async () => {
          if (!active || button.disabled) return;
          button.disabled = true;
          try {
            const result = await ctx.execute("example.demo.count");
            if (!active) return;
            if (result?.ok !== true || !Number.isSafeInteger(result.count)) {
              failed(`调用未成功：${result?.code ?? "结果不符合约定"}`);
              return;
            }
            output.textContent = `最近按钮结果：第 ${result.count} 次调用`;
          } catch (error) {
            if (active) failed(`调用异常：${error instanceof Error ? error.message : String(error)}`);
          } finally {
            if (active) button.disabled = false;
          }
        };
        button.addEventListener("click", click);
        ctx.onDispose(() => {
          active = false;
          button.removeEventListener("click", click);
        });
        content.append(button, output);
        element.append(content);
        // mount 本身同步完成；异步命令结果由事件处理器消费。
      },
    }],
  });
}
```

计数用于验证各入口复用同一 handler。面板文案仅显示最近一次按钮返回结果，不宣称自动订阅菜单／快捷键引起的状态变化；实际功能若需要持续更新，应由状态所有者提供明确的读取及订阅入口。这里的忙碌检查防止同一按钮重复提交，不能替代业务端口的请求 ID、幂等和版本约束。

`example-entry.js`：启动属于可信应用代码，组件不持有 runtime。

```js
// docs-example: current-entry
import { createWorkspaceRuntime } from "./src/host/workspace-runtime.js";
import { createExamplePlugin } from "./example-plugin.js";

export const runtime = createWorkspaceRuntime({
  root: document.getElementById("app"),
  plugins: [createExamplePlugin()],
});
const shown = runtime.execute("frame.workspace.page.select", { id: "example.demo.panel", toggle: false });
if (shown?.ok !== true) {
  runtime.dispose();
  throw new Error(`示例入口不可用：${shown?.code ?? "未知原因"}`);
}
// 应用主动退出时调用 runtime.dispose()；组合根也处理普通 pagehide。
```

`example-preview.html`：独立测试页加载现有框架样式与唯一启动脚本，通过当前 HTTP 预览服务打开，不使用 file 直接导入模块。

```html
<!-- docs-example: current-preview -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>插件接入验证</title>
  <link rel="stylesheet" href="styles/tokens.css">
  <link rel="stylesheet" href="styles/base.css">
  <link rel="stylesheet" href="styles/structure-preview.css">
  <link rel="stylesheet" href="styles/workspace-layout.css">
  <link rel="stylesheet" href="styles/runtime-preview.css">
  <link rel="stylesheet" href="styles/framework-controls.css">
  <link rel="stylesheet" href="styles/command-menu.css">
  <link rel="stylesheet" href="styles/command-dialog.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="example-entry.js"></script>
</body>
</html>
```

同一 root 只启动一个实例。正常默认入口已经启动时，不把示例启动脚本叠加到该页面；使用独立测试页，或者由已有可信启动代码在启动前选择插件集合。低层 platform.register/start 是宿主装配职责，新作者不用再搭一套平台。

### 当前贡献条目的字段

| kind | 职责 | v1 内部兼容记录 |
| --- | --- | --- |
| `panel` | 允许放入左、右侧栏的内容单元 | role `tool`，`modules` |
| `slotItem` | 宿主槽位中的状态或控件 | role `status`，`modules` |
| `view` | 中央主体视图 | role `view`，`pages` |

内部 role 和 v1 数组名称继续服从旧安装协议；新宿主按目录中的规范 kind 消费，不由这些历史名字决定视觉样式。组件定义与数据型 Facet 仍由适配器从一份声明生成，不增加注册表或命令总线。

以下是实际提供 UI 条目时的条件要求，不能把它们误当作所有插件的共同最小贡献：

| 字段 | 必填／默认 | 当前合同 |
| --- | --- | --- |
| id | 必填 | namespace 下的稳定点分 id；新作者输入中同时作为贡献和组件身份 |
| kind | 必填 | panel、slotItem 或 view；不直接填写宿主生成的 role/uiKind |
| title | 必填 | 非空、非纯空白字符串 |
| slots | 必填 | 非空、不重复的允许位置数组；panel只能left/right，view只能stage，slotItem可使用top/left/right/bottom |
| mount | 必填 | 同步函数，接收 element、受限ctx及{ variant }；返回实例对象、null或undefined |
| defaultSlot | 可省略 | panel省略或null时取slots第一项；如指定实际位置，必须在slots内 |
| order | 默认0 | 有限数值，0合法；仅为初始化排序意图 |
| icon | 可省略 | 如提供须为非空字符串；当前视觉入口按图标名称查询，尚无通用SVG／图片资源接入合同，不把标记代码当成图标名 |
| permissions | 可省略 | 命令权限对象；commands是命令id数组，省略等于空权限，显式null非法；引用必须能在启动预检中解析 |
| defaultEnabled | panel可省略，默认false | 必须为boolean，false合法；允许使用内容与默认已加入是不同概念 |
| minWidth、priority | 仅slotItem可省略，默认0 | 前者非负有限数值，后者有限数值；元数据已可声明，不表示默认入口已有真实槽位消费 |

默认值与用户后来选择的区域、启用和顺序分开。新 panel 拒绝 `full/half`、`allowedSpans/defaultSpan/minHeight/footerHeight` 和任意 style 字段，不把当前网格或页签结构变成通用内容合同。

slotItem 继续允许现有非 stage 位置，附带 `minWidth/priority` 槽位元数据；它不进入侧栏 panel 编排。view 只允许 stage。标题、图标和 namespace 不决定区域宽度或排布，稳定 id 不随名称或位置改变。

根声明、UI单元与快捷键中的未知字段、重复 UI id、无效 kind、错误命名空间、无效位置、数值或权限声明会报错。命令／菜单的当前底层捕获不等于已经严格校验所有额外字段；作者只使用这里及对应专项文档明确公开的字段。安装期的权限引用、命令和快捷键冲突仍由既有平台预检。输入复制并冻结，作者原对象和函数闭包保持独立。

### 当前命令、菜单与键位约定

- 命令必填id和run(payload)，可选enabled/checked函数；enabled应同步、无副作用地返回boolean，checked同步返回boolean或null。旧command.keys仍兼容，新作者优先使用shortcuts，避免为同一有效作用域重复声明同键。
- 新试点命令遵循 [显式结果约定](./plugin-authoring-baseline-v0.1.md)：成功显式ok为true，可预期拒绝显式ok为false及稳定code，附加字段由动作规定；调用方核对所需字段并捕获异常。这是作者交付要求，未修改下面的旧router执行行为。
- 当前router.execute对缺失／禁用返回失败对象，其余直接返回run结果或Promise，run或enabled抛出异常会向调用方传播；没有通用输入输出验证或业务事务包装。同步run返回null/undefined会按旧兼容规则变成{ ok: true }，异步Promise的完成值没有同样的归一化。新命令应显式返回约定的成功／失败结果，不能用空值表示失败。
- 组件使用await ctx.execute并处理返回的失败与捕获的异常；释放后忽略陈旧完成结果，隐藏时按任务合同决定继续或暂停。隐藏保留实例，不自动使正在执行的任务失效。按钮忙碌、菜单防重复与请求幂等分别有自己的责任，不能假定UI取消等于业务回滚。
- 菜单必填menu和command，可选label/payload/group/order；目标是宿主已有的七个菜单。新作者提供可读label、数值group/order；默认集合只有view带实际内容，贡献到其他合法菜单后由宿主消费。payload由对应handler验证，不由菜单自动保证领域正确性。键位目前不携带菜单payload。
- 快捷键必填id/command/keys；scope省略为global，global不能带componentId；component/score需绑定本插件组件且具有对应命令权限，score还要求view身份。keys可为空数组；冲突明确拒绝。文本输入、输入法和焦点规则见 [快捷键合同](./shortcut-mapping.md)。

### 挂载、资源与失败路径

| 入口 | 返回／行为 | 作者处理 |
| --- | --- | --- |
| mount(element, ctx, options) | 同步返回实例对象或空值；Promise非法 | 不写async mount；异步数据在挂载后的任务中取得，登记取消或失效标记 |
| ctx.execute(id, payload) | 受权限限制的结果或Promise，也可能抛异常 | 校验动作结果并捕获异常；不获取完整router或runtime |
| ctx.notify(text, level?) | 默认info；释放后不再通知 | 提供可读状态或错误文字，不传null占位 |
| ctx.onDispose(callback) | 登记同步清理，返回可提前调用的幂等清理函数 | 取得资源立即登记；避免同一资源又在dispose中重复清理 |
| ctx.confirm(request) | 可选，由提供dialogs的宿主装配 | 使用前检查是否存在；合同见 [命令确认](./command-dialog.md)，不自行生成可信批准外壳 |
| 实例setVariant/setVisible/dispose | 可省略；如提供须为函数，当前作者合同要求同步处理 | 缺失与显式null不同，当前实例钩子传null会失败；隐藏保留实例，不自动停止私有任务 |
| 实例handleKeyDown(event) | 同步true消费、false/undefined交还 | 不返回Promise；异常或非法返回被消费并报告，避免穿透触发另一动作 |

声明或预检失败会抛出错误；组合根安装失败会回滚整个固定集合；首次mount失败在组件内显示故障并立即清理已登记资源；真实业务拒绝继续由对应状态所有者处理。可选贡献不存在与已经执行的贡献失败分别报告。完整生命周期见 [可靠性合同](./plugin-reliability.md)。

没有公开扩展钩子的能力先按设计主稿记录需求，不能以私有DOM、模块全局变量、另建路由器或新增权限特判绕过缺口。

### 作者交付前检查

1. 确认所用接口已有当前字段合同和实际消费路径。面板类型、功能入口和动画等各自按就绪状态选择，不给整个插件分类。
2. 检查稳定身份、命令与键位引用、允许位置和执行权限；将预期拒绝写成可读反馈。业务payload由对应功能校验。
3. 在独立宿主验证声明、首次显示、按钮／菜单／键位的一次执行；确认切页、隐藏和移动不重建私有状态。
4. 验证同步异常、异步拒绝、无效结果、权限拒绝和陈旧完成；真实提交检查业务版本与事务结果。
5. 验证mount中途失败、最终释放及重复释放；没有遗留监听、订阅、定时器或宿主外节点。新会话用新声明工厂创建新的私有状态。
6. 有视觉内容时依 [本产品 UI 接入要求](./plugin-product-ui-profile.md) 在真实浏览器验证窗口容量、焦点、滚动浏览、隐藏滚动条、谱页稳定及插件私有样式；DOM替身无法完成这些项目。这些是本产品要求，不自动约束其他平台的视觉方案。

本页完整示例可通过下列命令核验。脚本从Markdown提取代码后调用真实作者适配器和组合根，不把示例安装到默认入口；失败路径通过测试副本中的明确故障输入验证。

```powershell
node design/frame-visual/evidence/plugin-authoring-readiness-20261003/verify-examples.mjs
node --test --test-isolation=none design/frame-visual/tests/plugin-authoring.test.js design/frame-visual/tests/runtime-composition.test.js
```

2026-10-03核验：提取5份示例，13条接入／失败／释放场景通过；对应已有合同与组合根38项测试通过。证据及限制见 [作者就绪审查](./evidence/plugin-authoring-readiness-20261003/review.md)。这只支持本页列出的当前能力，不代表新版共同声明、候选扩展或真实视觉已经验收。

## 旧输入兼容边界

旧作者 `module/page` 输入仍被接受，其原 v1 分组、role、uiKind 和样式提示保留。未经适配器的旧 v1 manifest 仍可直接注册。目录将侧栏内容统一为 panel，旧 stage view 仍是 view，显式 slotItem 或旧 status 职责仍是 slotItem。

旧内容可能允许 top/bottom，目录保留其全部表面 slots，不根据左右位置猜类型，也不会丢弃顶部或底部内容。新的侧栏状态只投影允许的 left/right 位置；无侧栏能力的内容不进入状态，默认位于顶部或底部的混合内容不会自动启用到侧栏。

新目录只支持 `panel/slotItem/view` 查询；原先新增原型中的 `kind: "module"/"page"` 查询已收敛，需改为 panel。默认外壳已经使用该目录，右侧页签和左侧列表通过独立呈现适配消费 panel；默认四项仍位于右侧，左侧默认为空。样式预制与选择尚未实现。

## 宿主只读贡献目录

以下为可信组合根的内部说明片段，platform、registry、host和presentationVariant来自已有宿主装配。普通插件按前面的作者路径接入，不负责创建目录或侧栏状态，也不从ctx取得这些可写宿主对象。

```js
import { createUiContributionCatalog } from "./src/runtime/ui-contribution-catalog.js";
import { createSidebarCompositionState } from "./src/layout/sidebar-composition-state.js";

const catalog = createUiContributionCatalog({ platform, components: registry });
const rightContent = catalog.list({ kind: "panel", slot: "right" });
const state = createSidebarCompositionState({ contributions: catalog.list() });
const item = catalog.get("example.demo.panel");
// 缺失、未启动或不可用的贡献可能返回null；宿主按实际目录结果消费。
if (item) host.ensure(item.componentId, presentationVariant);
```

目录每次关联平台的 active UI Facet 与既有组件注册表，不拥有额外安装状态。返回描述包含 id、componentId、pluginId、kind、标题、可选图标、order、slots、defaultSlot，以及 panel 的 defaultEnabled；slotItem 保留槽位消费元数据。没有 mount、router、permissions、布局 store 或侧栏样式提示，可序列化且冻结。

列表按默认 order、稳定 id 排序。未启动、失败、已释放和 owner 不匹配的记录不出现。旧表面别名保留 id 与 componentId 的区别，允许位置以表面 slots 为准，不扩大到组件全部允许位置。旧页面默认启用；旧模块沿用显式 defaultEnabled 或原 defaultSlot 意图。

## 状态与生命周期

侧栏状态拥有实际区域、启用和区域内顺序；其只读快照不包含作者默认值、样式、尺寸、DOM 或业务数据。固定启动集合和单组件单实例约束保留，详见 `sidebar-composition.md`。

组件基础上下文为 `execute/notify/onDispose`；提供dialogs的宿主另有可选 `confirm`，详见本页命令确认合同。execute 经过原权限白名单进入唯一前端 router。没有接入真实内核，也没有新增命令转发链或第三方执行隔离。

该 router 是 UI 框架包内部模块，由组合根创建一次，不独立登记为平台插件。各业务插件贡献自己的动作，宿主把它们登记到这个共享实例。`sidebar-commands.js` 同样是内部绑定模块；它和工作区配置命令共用一个布局编辑会话，处理函数由会话调用原状态所有者。普通区域收放、页签和缩放继续调用各自宿主方法。

按用户修正后的边界，上／下／左／右四栏的开关、尺寸、单项尺寸恢复与几何排布随时可用。栏内组件的移动/启用/排序必须先进入已有的 workspace.adjusting 模式；组件添加/移出已通过启用状态接入，后续占宽、图标、承载样式也使用该会话。模式外 router.execute 组件配置命令返回 command.disabled；直接处理函数仍通过会话检查，返回 layout.edit-required。界面 disabled 和作者权限白名单不能替代这一政策。

布局页区域开关与标题栏统一使用 region.toggle。已有 frame.workspace.region.configure 保留显式设置兼容，payload 为 { region, open }，region 为 left/right/top/voice，open 为 boolean，同样随时可用。voice 是兼容内部标识，用户可见名称统一为下侧栏，不表达声部或正文职责。

组合根创建 createLayoutEditSession({ workspace: store, composition: () => composition, reservedPanelIds: [LAYOUT_PAGE_ID] })，向两个命令绑定传入同一 editSession。侧栏绑定必须接收会话；独立、只有几何的旧工作区宿主可以省略，由工作区绑定创建并清理几何会话。组件通过只读端口和 ctx.execute/notify/onDispose 交互，不能直接取得会话或状态写方法；可选确认能力见下文。作者声明与 v1 适配协议保持原版本。

组件配置继续即时预览；确认保留，取消恢复侧栏组件的身份/位置/启用/顺序。四栏开关、尺寸、几何排布、输入、业务选择、阅读位置、当前页和窗口视口均不属于组件回滚数据。内部 batch 仅支持同步配置；失败返回或异常恢复原快照并停止通知，成功每个状态所有者最多发布一次最终通知。现有两份订阅可能各渲染一次一致状态。上侧栏严格按 topOpen 收放，编辑不强制打开；布局页与上侧栏动作调用同一确认/取消命令，上侧栏关闭后仍可从布局页结束编辑。组件差异列表不统计日常栏开关、尺寸或几何排布。当前合同见 layout-boundaries-correction.md 与 layout-edit-session.md。

实例可选提供同步的 `setVariant/setVisible/dispose`。组件宿主初始可见状态为 true，呈现层调用 `host.setVisible(componentId, boolean)` 报告变化，重复同状态不通知。宿主不会因此修改 DOM、自动暂停任意任务或释放实例；呈现层需按实际选中、区域展开和启用情况计算可见性，内容自行处理暂停/恢复。setVisible 失败被隔离并通知，最终释放仍执行实例 dispose 与 onDispose。

## 真实组件管理

副本运行时的 `frame.layout.page` 已接只读的 createSidebarContentReadPort({ catalog, composition: composition.read, changes: editSession.changes, reservedPanelIds })。返回端口只有 snapshot/subscribe；快照含 panels 和 changes，所有记录与数组冻结，不包含 mount、router、状态写方法或会话所有者。位置与加入状态来自当前编排，允许位置来自当前目录，不从名称、图标或默认顺序猜测。旧 `frame.builtin.layout` 仅在兼容组合夹具中保留。

栏内组件选择区列出固定会话中的内容，提供添加/移出、左右放置与上移/下移。添加/移出复用 frame.sidebar.panel.enabled，不安装/卸载插件；移动与排序沿用原命令。布局页仅在接入管理端口时声明这三个命令权限，旧独立布局页装配不新增权限依赖。每次操作重新读取可用性并走 ctx.execute；失败显示可见反馈，同时调用 ctx.notify。

工作区布局页不进入普通组件选择集合；同一会话在所有组件配置入口拒绝它的移动、停用和直接排序，返回 layout.reserved-panel。此保护针对固定入口身份与承载，不承诺它的数字 order 永远不随其他记录规范化变化。配置页仍允许通过日常右侧栏开关收起。内置三项普通内容仍只支持 right；支持双侧的真实测试插件验证跨栏移动，默认入口不增加样例插件。

修改摘要由会话原组件基线与当前最终配置比较得出；撤回某个操作后对应差异消失，延迟挂载布局页也能显示进入编辑以来的完整修改。计数是变更的组件记录数，不是点击次数；排序可能影响多条记录。选择和提示属于视图状态，不参与组件回滚。组件输入、业务数据、阅读位置和四栏日常几何仍由各自所有者保留。

空集合、贡献缺失、身份或位置变化以及目录中未加入当前固定会话的内容给出不可用原因，不自动创建新 placement。订阅监听编排状态；运行中安装/卸载与目录热刷新仍未开放。布局页立即登记订阅清理，挂载失败与重复释放均能停止监听。具体实现和验收见 sidebar-content-management.md。

## 共用动作状态与控件

默认布局页额外接入内部的 createActionStateReadPort({ router, commands, context, sources })。组合根从实际已登记的布局组件取得 permissions.commands、id 和 owner，作为读取名单与快捷键作用域；名单复制去重，上下文复制冻结。端口只有 snapshot/subscribe，快照 actions 的每项为 id/exists/enabled/checked/keys/reason，记录与数组冻结，没有 run、router、注册或写入方法。它是原命令状态的只读投影，不授予执行权限，也不另外登记为平台插件；不改变 ctx.execute/notify/onDispose，可选 confirm 由另一个内部宿主能力提供。

布局页控件合并原命令可用性和本地限制：例如内容位置能力、当前顺序边界、尺寸恢复值。缺少读取名单中的动作视为 permission.denied；已获准但命令缺失为 command.missing；原 enabled 为 false 时为 command.disabled。点击前重新读取，真正写入依旧只经 ctx.execute 进入原唯一 router。没有端口的旧独立装配沿用原行为。

enabled 必须同步返回 boolean；checked 必须同步返回 boolean 或 null。非法类型、异常和 thenable 在只读接口中返回 command.state-error，只禁用该动作，异步拒绝被排空。读取保留回调的 this。此隔离没有修改原 router.execute 的执行合同；状态回调作者仍需遵守同步、无副作用的规则。

快照直接读取 router.describe 与同一 shortcuts.keysFor，不另存状态或键表。订阅监听原 router、工作区与编排状态；改键/取消/恢复、命令登记/释放以及各状态所有者通知时更新。任意闭包状态的变化不会自动触发通知，作者需由状态所有者发布或调用 router.refresh。订阅失败回滚、观察者错误隔离、逆序与重复释放安全，由页面 onDispose 清理。

控件原地更新 disabled、提示和 aria-keyshortcuts，尺寸输入与组件选择保持原节点。checked 可供单一切换动作使用；同一命令带不同 payload 的四栏开关、组件位置/加入状态和排布按钮仍读取对应工作区/编排状态，不能用一个无 payload 的 checked 取代各自状态。动作状态合同见 action-state.md；视图菜单与受限命令确认分别在下文接入，自定义表单及非模态浮层仍留后续。

## 菜单贡献与当前视图菜单

默认入口已接现有菜单登记：宿主提供 file/edit/view/score/playback/plugins/help 七个稳定位置，对应顶部七个原名称，当前只有 view 启用。host/workspace-menus 贡献四栏开关与“工作区布局…”；仍执行原 frame.workspace.region.toggle 与 frame.workspace.page.select，打开布局页使用 { id: LAYOUT_PAGE_ID, toggle: false }，不自动开始组件编辑，重复选择也不收起右侧栏。四栏菜单开关随时可用。

业务插件沿用原根声明 menuItems，每项提供 menu/command 和可选 label/payload/group/order。对应命令由原 commands 声明贡献，菜单位置与命令存在性继续由平台预检。当前默认运行没有新增业务插件或示例插件；后续菜单呈现沿用这份登记，不形成第二个命令路由器。组件私有菜单仍须经其受限 ctx，当前宿主全局菜单绑定不发给普通组件。

菜单绑定从实际已登记的菜单项取得固定会话命令读取名单，以全局上下文复用 createActionStateReadPort。菜单执行只接受当前登记项的对象身份，并重读动作可用性，再调用原 router 一次；伪造/已释放项返回 menu.missing，运行中新增且未在本次名单中的命令不能隐式取得执行许可。读取数据不是权限授权；平台固定会话与原组件 ctx 合同保持。

四栏菜单的 checked 分别读取工作区 topOpen/leftOpen/rightOpen/voiceOpen；普通动作使用原 command.checked。打开期间动作通知同步 enabled/checked 与有效全局键位，菜单贡献通知同步分组与次序，保留仍有效的节点与焦点。组件局部快捷键不作为全局菜单提示。当前快捷键执行不携带 payload，所以带参数菜单项不显示通用绑定作为具体目标的快捷键；无参数动作显示有效 keys，默认入口仍无新增默认键位。后续若需要四栏独立快捷键，须明确目标动作合同后单独接入。

新菜单呈现复用原 popover、控件更新与清理工具。外层为呈现容器，内部为 role=menu；顶栏为 menubar 且只有一个键盘 Tab 入口。支持上下/Home/End/Enter/Space、左右切换已启用菜单、Escape/Tab 与输入法/修饰键保护。当前菜单保留自身键盘输入；Escape 只关闭菜单，不取消正在进行的组件编辑。外部点击、焦点离开、窗口尺寸变化或卸载均关闭并释放监听，旧浮层节点不能关闭新所有者的浮层。旧独立 Shell 缺少绑定时保持原占位结构；旧 menubar 与普通 popover 默认参数保持兼容。

成功关闭并返回触发入口；失败保留菜单，显示可见反馈并通知宿主，允许重试。异步命令执行期间防止重复认领，旧请求完成不关闭后来打开的另一浮层。新 CSS 仅作用于 .v-menu-popup，运行 HTML 加入独立样式，既有顶栏/侧栏 CSS 与几何保持。菜单定位、真实键盘焦点与原生输入仍待浏览器验收，详见 command-menu.md。

## 可选命令确认对话框

默认组合根已创建内部 createCommandDialogs 并传入 createComponentHost({ registry, router, notices, dialogs })。未提供 dialogs 的旧组件宿主继续只给 execute/notify/onDispose；提供时增加可选 ctx.confirm。平台不另登记插件，作者 manifest、权限与 UI facet 版本不变。默认产品没有新增示例按钮，原有四栏开关、尺寸与排布操作也不额外要求确认。

ctx.confirm({ title, message, command, payload?, confirmLabel?, cancelLabel? }) 只申请“确认一个已获准命令”。命令须在该实际组件的 permissions.commands 中；文本须非空，payload 只含数据且复制冻结。函数、DOM、循环或未知字段拒绝，不允许任意内容挂载。打开前与确认前都检查实例可用性和原命令状态，真正执行复用原 ctx.execute；渲染模块拿受限入口，不拿 router。

打开成功返回 { ok: true, finished }，finished 完成会话结果 { status, dispatched, result? }。confirmed 才表示成功执行结果；关闭、隐藏、卸载与宿主释放具有各自状态。dispatched 表示向受限入口提交过执行请求，不等于 handler 成功，也不代表关闭可撤回事务。一次执行期间确认禁用，失败保留反馈可重试；等待时按钮改为“关闭”，明确不会撤回已提交的操作。旧异步返回不影响新窗口。

单宿主只允许一个确认会话，其他申请返回 dialog.busy，不替换已有窗口。使用原生 dialog.showModal，原生负责 Tab 与背景不可交互；没有能力返回 dialog.unsupported。初始聚焦取消，Escape 不取消底层布局编辑，IME/修饰键保留。关闭返回有效触发节点、同组件控件或工作区回退；隐藏/移除/mount 失败/pagehide 都清理对应窗口与订阅。普通组件不能以此申请可信平台批准、任意 UI 渲染或其他组件权限。

当前默认组合根及真实模块链已通过 DOM 替身测试；原生模态、焦点圈定、背景 inert、指针、系统 IME 与视觉尚需获准浏览器验收。具体请求、拒绝代码、finished 语义和示例见 command-dialog.md。自定义表单和非模态浮层不在本小步中。

## 焦点与局部快捷键

默认运行入口通过一个可释放的宿主键盘监听分配按键。字段和瞬态界面保留自身输入，当前可见实例优先，未消费的按键才进入原全局 router 或工作区 Escape 兜底；侧栏不会向后台谱面转送按键。

普通快捷键在根声明的 `shortcuts` 中配置。每项包含 `id/command/keys/scope`：global 不指定组件；component 指定本插件 componentId；score 指定本插件 view 的 componentId，并且只在该视图实际获得焦点时生效。局部绑定的 command 必须已获目标组件的 permissions.commands 授权。scope 省略时为 global。不同组件可以使用相同按键，同一组件的 component/score 范围重叠，同键会报冲突。

快捷键是 UI 包内部模块，组合根将共享映射实例传入原命令 router。旧 `command.keys` 自动生成以 command id 为绑定 id 的 global 声明；旧 `commandFor` 委托同一映射查询。`router.describe(commandId).keys` 仅保留声明默认值，提示和设置消费者应读取 `router.shortcuts.keysFor(commandId, context)` 或 describe/list 的有效 keys。组件不会获得映射管理接口；可选 confirm 也不增加快捷键或命令权限。

宿主可调用 `router.shortcuts.setKeys(bindingId, keys)` 改键；空数组取消该绑定，reset(bindingId) 恢复默认。仅覆盖 keys，不能变更目标或权限。冲突、无效键位或不存在的绑定返回失败，保留原映射；当前覆盖只保存在内存，绑定释放后清除。设置界面与跨重启保存尚未实现。

分配顺序为输入保护 → 当前实际组件的声明绑定 → 当前组件复杂输入 hook → global → 工作区兜底。局部绑定认领后，即使命令禁用、缺失、拒绝或失败，也不穿透执行另一动作。没有匹配的局部绑定时，mount 实例仍可提供同步 `handleKeyDown(event)` 处理复杂交互，true 表示消费，false/undefined 表示交还；局部 DOM 的 preventDefault/stopPropagation 同样消费。旧实例没有这个成员时继续沿用已有行为。

聚焦内容关闭、收起或切换后，焦点转到有效页签或舞台；仍可见的跨区域移动保留节点、输入和焦点。错误类型、异常或异步 hook 被报告并消费当前事件，避免穿透到全局动作。焦点边界见 `keyboard-boundaries.md`；映射签名、作者示例、错误矩阵和提示刷新限制见 `shortcut-mapping.md`。UI Facet 的 contractVersion 仍为 1。

## 内容样式与宿主边界

框架为自己创建的每个节点标记 `data-frame-ui`，只标记该节点，不递归标记插件子树。内部 h 工具主动采用框架控件皮肤；普通作者用 document.createElement 创建的按钮、输入和滚动区域由内容自己管理。组件宿主仅标记自己的 cell 和故障提示，移动/隐藏不会给私有内容补标记或重新挂载。

控件重置、焦点圈、动画关闭、滚动条隐藏和壳内通用按钮规则仅作用于这些框架节点。CSS 的 :where 标记不额外增加选择器优先级。文档的字体、文字颜色和 color-scheme 仍可继承，私有控件可以覆盖；这不等于 iframe 或 Shadow DOM 的强隔离。

内容可使用八个主题变量：`--ui-font-family/--ui-text-color/--ui-muted-color/--ui-surface-color/--ui-accent-color/--ui-focus-color/--ui-space-unit/--ui-radius`。几何变量和 frame/v- 等私有控件类不作为插件 API。作者样式必须限定在自己的命名空间根下，例如 `.example-notes .notes-button`，避免全局 button、input、body、:root 或 * 规则。平台当前不自动检查或重写任意 CSS，作者仍负责遵守此合同。

挂载中申请的样式节点、监听、订阅和宿主外节点应立即通过 ctx.onDispose 登记清理；mount 失败也会执行。插件自有滚动容器负责 overflow 与阅读位置，宿主负责外层 cell 的可见性、位置和承载尺寸。不要把整个 layout store、router 或 DOM cell 之外的壳节点当成可写能力。可选 ctx.confirm 的窗口由宿主自动按实际组件生命周期清理；其他私有菜单/浮层能力留后续。具体样例和验收范围见 `style-boundaries.md` 与 command-dialog.md。

## 验证与当前限制

合同基础批次 58 项测试通过；随后呈现接入批次加入 12 项测试，当前共 70 项相关测试通过。测试连接实际平台、目录、状态、呈现适配、Shell、组件宿主和 router，DOM 使用最小测试替身。新旧 Shell 的默认结构在三种视口参数及页签/折叠/调整操作下对照一致；该测试不计算真实浏览器布局和像素。

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/plugin-reliability.test.js design/frame-visual/tests/plugin-authoring.test.js design/frame-visual/tests/sidebar-composition.test.js design/frame-visual/tests/sidebar-integration.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/audit-sidebar-integration.cjs
```

本次接入修改默认入口、Shell 的内容消费、内部命令绑定，以及兼容选择导航方法和实例所有权校验；既有几何字段、CSS、尺寸常量、内置内容与视觉 fixture 不由本批修改。当前记录见 `evidence/sidebar-integration/` 与 `sidebar-integration.md`；`evidence/sidebar-contract/` 等历史审计继续保留原批次含义，不重新运行来覆盖旧证据。

预制样式、布局插件选样式、更多消费者和业务内容接入、持久化、多实例、正式发布包和内核业务连接均留待后续。固定启动集合仍保留，本次没有引入热插拔。浏览器工具拒绝 file:// 访问，本批没有完成截图或像素对照，不能将 DOM 测试说成完整视觉验收。

2026-10-02 焦点批次增加 19 项测试；连同同期布局合同和视觉 fixture 测试，全副本当前 101 项通过。使用 `rg --files design/frame-visual/tests -g '*.test.js'` 的结果作为 node --test 的文件参数执行完整测试，新审计为 `tools/audit-keyboard-boundaries.cjs`；历史审计继续按原批次解释。

2026-10-02 快捷键映射批次新增 25 项测试，全副本 126 项通过。新证据与源码基线独立保存在 `evidence/shortcut-mapping/`，本批审计为 `tools/audit-shortcut-mapping.cjs`。前述数字均属于对应历史批次，不覆盖旧证据。

2026-10-02 样式边界批次新增 7 项测试，全副本 137 项通过，包含同期布局工作追加的 4 项用例。静态 CSS 合同与 DOM 替身证明选择器声明、节点身份和清理行为；没有浏览器计算样式、像素或原生焦点验收。证据在 `evidence/style-boundaries/`。

2026-10-02 布局编辑会话批次新增 20 项测试；连同同期视觉布局追加的 5 项，当时全副本 162 项通过。覆盖命令与直接处理函数策略、权限/快捷键、几何与编排共同确认/取消、失败恢复与重试、通知一致、当前视口约束、私有输入/业务/阅读状态保留，以及实际 runtime-preview 的按钮装配和 pagehide 清理。同期布局页迁移保留原只读端口和本批配置命令，CSS/fixture 改动另列。涉及 DOM 的测试仍使用替身，不代表浏览器像素验收；证据在 evidence/layout-edit-session/。

以上 162 项记录为边界修正前的历史结果。用户随后明确四栏开关与尺寸随时可用、编辑只管栏内组件；当时已有 164 项测试，修正相关断言并新增 1 项四栏实际开关与键盘/指针尺寸流程后，全副本 165 项通过、0 失败，20 个 JS/CJS 语法检查和该批源码审计通过。修正证据为 evidence/layout-boundaries-correction/；CSS、作者协议和组件 ctx 保持原边界。真实浏览器视觉与原生输入验收仍未完成。

2026-10-03 真实组件管理批次新增 17 项专项测试，当时全副本 182 项回归通过、0 失败。覆盖真实默认入口、受限命令链、固定配置入口保护、排序与最终差异、确认/取消、延迟挂载、缺失贡献/空态、失败反馈与重试、旧表面别名、同一实例/输入/阅读状态以及失败挂载与 pagehide 清理。该批证据为 evidence/sidebar-content-management/；涉及 DOM 的测试仍使用替身，不代表浏览器像素或原生焦点验收。

2026-10-03 共用动作状态第一步新增 22 项专项测试，当时全副本 204 项回归通过、0 失败。覆盖只读数据/名单与实际组件作用域、状态回调失效隔离、命令移除、改键/取消/恢复、实际权限禁用、会话失配、点击前重读与单次受限执行、节点/输入/选择保留、订阅回滚/重复释放及默认入口/pagehide。历史证据为 evidence/action-state/，源码审计为 tools/audit-action-state.cjs；当时完成状态读取与布局按钮。

2026-10-03 视图菜单第二步新增 20 项专项测试，当时全副本 233 项通过、0 失败。覆盖真实菜单/平台/命令/默认入口、四栏参数与独立勾选、打开设置页、全局键位与参数边界、失效/权限/身份/陈旧显示、键盘/输入法保护、失败重试、节点/输入/焦点模型、异步一次执行、浮层所有权、订阅回滚与 pagehide 清理。历史证据为 evidence/command-menu/，审计为 tools/audit-command-menu.cjs。

2026-10-03 命令确认第三步新增 25 项专项测试通过，基线原有 233 项加新增用例共 258 项通过、0 失败；包含同期横向槽位新增 9 项的最终全目录回归为 267 项通过、0 失败，初次失败结果仍独立保留。覆盖实际组件宿主/命令/状态/默认入口、数据与权限、确认/取消、失败重试、状态失效、原生缺失/失败、生命周期与异步隔离。6 个 JS/CJS 语法检查和范围审计通过；最新证据为 evidence/command-dialog/，源码审计为 tools/audit-command-dialog.cjs。DOM 原生方法是显式测试桩，菜单与对话框真实浏览器验收尚未完成。

2026-10-03 装配入口批次提取 createWorkspaceRuntime，预览页改为薄启动；沿用原模块与命令处理函数，新增完整启动回滚、异常后继续清理、幂等释放、root 重复启动保护和受限应用读写入口。26 项新专项覆盖默认新旧入口与旧 Shell 对照、真实插件命令链和节点保留、故障清理与页面恢复；最终回归数字和同期改动见 evidence/runtime-composition/verification.json。五个历史测试仅迁移装配观察，原行为断言保留。默认布局、CSS 和内置内容没有本批新增产品变化；浏览器原生验收与真实内核业务仍待后续。


## 2026-10-07：备份启动管理接入

启动启停与参数属于可信应用装配，不向 defineUiPlugin 增加 name/version/settingsSchema 等正式字段。
BACKUP_PLUGIN_DIRECTORY 只提供数据，管理页不能得到工厂、mount 或 run。应用入口读取并校验计划后，
只创建启用项并向既有唯一平台登记；插件读取工厂收到的冻结参数，不自行读取 localStorage 或订阅下一计划。
示例为实际只读 frame.score-info：目录提供 mode/measureLimit，工厂消费参数贡献面板和只读命令。
启用插件只让贡献可用，面板位置仍由用户在布局编辑内决定；不自动调整四栏。

经典本地预览由 npm run startup:build 生成；不得手改 vendor/plugin-startup-preview.js。
npm test 在运行前检查生成一致性。原视觉预览样例已保存在接入证据中；最终整包424/424，新增11项。
上述为前一批备份装配与DOM回归结果；本轮桌面存储端口状态见下一节。正式SDK、安装版本策略和浏览器视觉验收仍未完成。
完整边界与调用例见 plugin-startup-management-v0.1.md；证据见 evidence/plugin-startup-integration-20261007/。

## 2026-10-07：桌面异步启动配置适配

插件作者继续通过工厂消费校验后的参数，不自行调用 Tauri 设置命令。可信应用组合根选择存储：
普通文件用同步浏览器端口，真实 Tauri 环境复用既有 TauriPluginSettingsStorage，通过
createDesktopPluginPlanStore 保存 brilliant.ui.backup-startup envelope；该命名空间不是一个插件。

同一草稿控制器显式选择 storageMode，async 时等待 ready 与 save/reload；读取/写入期间不能修改或
重复提交。只有 write 完成才更新基线。释放后不采用结果或挂载工作区，已发出的 IO 仍可能完成。
作者组件不订阅下一次启动计划，运行中的插件集合保持冻结。

桌面窄桥接来自旧 workbench 的现有服务源码，startup:build/startup:check 同步检查产物；不修改旧 UI，
不手写第二套 IPC。正式 apiVersion 3.0 React render 协议与备份 v1 mount 协议仍需可信应用适配。
本轮新增20项专项，备份全量444/444；fake invoke/DOM验证不代表真实桌面磁盘或视觉通过。
以上为桌面存储接线阶段的历史验证，证据见 evidence/plugin-startup-desktop-20261007/。备份桌面包装入口的后续结果见下一节；外部插件协议适配与正式发布仍待完成。

## 2026-10-07：备份桌面入口与协议边界

已有启动列表、工作区与本地绘制资产通过独立 Tauri 配置嵌入现有 Rust 宿主，可直接运行调试 EXE，无需前端服务。沿用相同 defineUiPlugin 作者清单、唯一 PluginPlatform 和命令/组件生命周期；应用配置与构建输出同旧工作台隔离。

createBackupUiRuntime 在获取文档投影、订阅或平台资源前，拒绝自身 apiVersion 或 manifest.apiVersion 字段，包括 null/undefined。备份 v1 mount 清单不接收正式 apiVersion 3.0 React render 包；真实协议适配仍需要可信应用明确实现视图承载、端口与释放合同，不能通过函数改名伪造兼容。

新增 7 项资源/协议回归，备份全量 452/452（含同期动效新增 1 项）；静态资产一致性检查通过。原生调试编译与真实窗口存在检查通过，Rust 实际磁盘存储 5/5，包括配置重新创建 store 后恢复。窗口内保存/重开、字体/像素验收、真实文档与正式发布仍待完成；不能把 HWND、DOM 替身或文件 IO 测试称为实际窗口交互通过。

运行方式见 desktop-entry-v0.1.md；证据见 evidence/desktop-bootstrap-20261007/verification.md。
