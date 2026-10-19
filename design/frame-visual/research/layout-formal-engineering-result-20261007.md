# 布局正式插件工程结果 · 2026-10-07

状态：本工程交接的六项要求已完成接线和验收。布局已进入单一正式 PluginPlatform / apiVersion4.0 登记链，公开布局端口、可选作者动画、受限执行与生命周期均实际消费。最终备份整包516/516；正式预览与经典/桌面静态入口浏览器全部通过。

任务：`.trellis/tasks/10-07-layout-formal-engineering/`，父任务 `10-05-shared-staff-score-readonly`。需求依据为同日工程交接；实现保留平台和父视觉的并发改动。代码未提交，未广泛stage或归档混合工作区。

## 逐项完成与职责

| 交接要求 | 实际完成 | 接线与责任 |
| --- | --- | --- |
| 共同身份/名称/插件版本/精确宿主版本与空值 | 完成：正式definePlugin核验id/name/version/apiVersion4.0；无UI及可选null为空，合法0/false保留，非法条目拒绝。 | 复用平台会话的公共声明与适配；本工程只补挂载输入空值类型/捕获与动画字段。 |
| 四个公开读端口与稳定写出口 | 完成：layout必需，contents/actions/view可选；冻结snapshot/subscribe窄投影，单位、权限、拒绝和订阅释放已写合同。 | 新增contracts/workspace-layout.js；host旧命令路径re-export同一符号，plugin/page不再导入host私有命令。 |
| 同链可选动画贡献 | 完成：组件animations/permissions.animations随4.0 UI facet捕获；共享版本校验，实例局部目标、预算与作者变体实际消费。 | shared/ui-animation为单一源码；不另建插件目录或授权链。 |
| 正式布局明确目标与静态路径 | 完成：声明父视觉LAYOUT_REGION_EMPHASIS，只绑定四个region ink；父视觉attachMotion调用的身份/root/定义不转交执行服务。 | plugin/page由本工程最小接线；visual/CSS/私有动作及原动画页由父视觉维护，本工程未改。 |
| 生命周期/实例隔离/故障/回滚 | 完成：scope、隐藏/恢复/移动/释放、两完整runtime、提供者替换、当前失败、迟到、重复stage/非法provider后干净重试。 | ComponentHost与组合根沿原生命周期；快捷键复用动画端口，真实原生轨道取消有独立回归。 |
| 真实入口与几何证据 | 完成：ESM正式入口、经典file入口、生成桌面资产入口，四尺寸几何及实际作者参数有浏览器证据。 | 本工程Chrome验收完成；原生WebView、桌面保存后新进程恢复及更丰富视觉属于各自后续验收，不混入本轮结果。 |

可信内置工厂仍通过平台已有应用输入适配补齐应用拥有的名称、开发版本0.1.0和activation，最终登记为正式4.0包。第三方必须自己提供共同声明；未知旧namespace不能让宿主代造身份。旧3.0 React包继续拒绝ui挂载贡献，不伪造兼容。

## 公共接口与实际消费

- [布局公开合同](../workspace-layout-contract.md)：四读端口字段、CSS px/百分比单位、命令payload与拒绝码；[源码](../src/contracts/workspace-layout.js)。
- [受限动画合同](../animation-service-contract.md)：声明/执行示例、版本、权限/预算、系统策略、失败与生命周期。公共捕获源码为`shared/ui-animation/contract.js`，类型为同目录`contract.d.ts`；浏览器经`src/contracts/animation.js`消费生成模块。
- 正式类型入口为`apps/workbench/src/plugins/plugin-mount-ui.ts`的PluginMountContext、PluginMountComponentInput与PluginMountUiInput；SDK使用原definePlugin，不增加另一个登记入口。
- 宿主只向有动画权限的组件提供冻结`ctx.motion.bind(targets)`。作者不能传owner/root/definitions/provider/policy/任意timing；bind返回hold/place/play/cancel/dispose，play.finished只回报呈现状态。
- 实际布局绑定在`workspace-layout-page.js`：局部view先挂载，再attachMotion；只把targets交给ctx.motion.bind。view.dispose先进入scope，隐藏经实例setVisible传递；业务状态和aria-pressed先接受，只有同步指针区域开合播放。
- 默认正式入口开启动画；历史通用/旧平台夹具默认保持静态窄API，可由可信组合根显式enableAnimations。正式备份入口仍默认运行同一服务，普通面板没有额外motion权限。
- `scripts/build-plugin-startup.mjs`先生成/检查共享动画模块，再编译正式平台/经典入口；desktop沿同一生成链。没有浏览器越出frame-visual根导入shared文件的请求。

局部作者使用方式（贡献与权限已在同一次正式声明中接受）：

```js
const port = ctx.motion?.bind({
  ink: { node: localInk, intents: ["content-transition"] },
});
ctx.onDispose(() => port?.dispose());
// Existing command/state owner has already accepted the result.
port?.play({ intent: "content-transition", target: "ink",
  to: { opacity: accepted ? 1 : 0 }, immediate: keyboard });
```

无可选动画定义、无提供者或策略关闭时，合法操作静态到接受结果；提供非法定义不能吞掉当作无动画。32目标/组件、128活动项/服务，内容位移24px、选择256px、释放512px，禁止循环/任意CSS/业务回调。参数与作者变体捕获冻结；系统减少优先，内容100ms显隐且无位移，其余即时。

## 修复并复现的两个接线问题

1. 局部快捷键重取contextFor曾再次forComponent，重复占同一个cell根，按钮/局部/全局三个输入只执行两次。现在record.motion只初始化一次并登记一次释放；普通组件仍无motion能力，重复局部键沿原权限检查执行。新增单元回归，正式浏览器三次输入均执行一次。
2. 实际页先隐藏DOM再通知setVisible时，引擎native stop会提交computed styles并失败，服务计数虽归零，浏览器还留两条running轨道。本工程从经典入口发现，单独重现后改为native cancel；服务先采样并负责后续静态写入。隐藏/恢复/退出时实际轨道归零，没有迟到样式写回或误报。

早期失败与修复前源码/日志保留在本轮evidence，包括formal-browser-before-shortcut-fix.json、provider-browser-hidden-failure.json、startup-browser-hidden-failure.json及motion-provider-before-hidden-fix.js。平台同期修改启动返回恢复边界曾使生成check报告stale；该采样另存desktop-check-during-platform-edits.log，最终已重新生成并check通过。

## 最终验证

| 范围 | 命令/证据 | 最终结果 |
| --- | --- | --- |
| 备份全量 | `npm --prefix design/frame-visual test`；full-tests-final.log | 516/516，零失败/跳过。含本工程29项定向、父视觉和同期平台/视口回归。 |
| 正式TS | workbench中`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`；formal-typecheck-final.log | 通过。 |
| 正式挂载专项 | `node --experimental-strip-types --test apps/workbench/test/plugin-mount.test.ts`；formal-mount-final.log | 7/7。 |
| 固定真实引擎 | `node design/frame-visual/tools/animation-service-browser.cjs`；provider-browser.json | 8/8；含DOM先隐藏时实际轨道取消。 |
| 正式ESM预览 | `node design/frame-visual/tools/layout-formal-browser.cjs`；formal-browser.json | 27/27，无pageerror/console error。 |
| 经典与桌面静态入口 | `node design/frame-visual/tools/layout-formal-startup-browser.cjs`；startup-browser.json | 26/26；本地file与dist/desktop/index.html均实际启动/退出/干净重启。 |
| 生成与打包 | animation-contract --check、startup:check、motion:check、desktop:build/check | 通过；经典574127字节，17个桌面资产，源/生成字节一致。 |

工程证据均在 [layout-formal-engineering-20261007](../evidence/layout-formal-engineering-20261007/)。final-verification.json记录验证范围、浏览器结果及关键源/产物SHA-256；早期full-tests.log保留首次失败，不能拿它代替最终日志。最后纳入共享视口补偿更新后重新生成并复验，当前27项正式入口和26项经典/桌面静态入口仍全部通过。

ESM真实入口核验frame.builtin/frame.layout/notation.core在同一正式4.0路径，四个局部目标、固定Motion14.0.0、真实中间帧/快速反向、键盘/程序即时、系统减少/关闭、页面及整个root隐藏/恢复、无provider、最终资源归零。1024×720、1280×800、1440×900、1920×1080均检查外壳不重叠、不溢出、舞台容量及单侧调整不改对侧存值；图表/纸张反向后回到基线。

经典与生成资产入口无需测试暴露runtime：直接测实际DOM/aria、160ms作者入场轨道和100ms系统减少轨道；切换真实页面停止轨道且复用节点，返回管理页清DOM/旧轨道，再次启动创建新节点，旧按钮输入不能影响新会话。请求只落在各自本地资产闭包。Chrome版本154.0.8037.98。

## 剩余边界与交付状态

本工程六项要求无待接线或阻塞。公共正式声明、公开布局接口、受限动画服务和真实页面已完整接入。

- 更丰富的缩略图形变、分组/局部色彩以及最终视觉评审继续归父视觉会话；现有源与独立历史视觉证据保留。
- 平台整体迁移、原生EXE/WebView与桌面新进程配置恢复继续归平台会话。本工程重新生成并验证静态资产，没有把Chrome或生成检查当作原生窗口/重启验收，也未修改Rust、内核或废弃产品UI。
- 窄可执行规范已更新`layout-formal-animation-contract.md`，并链接到frontend index与正式挂载合同。PRD/实施清单已勾选。工作区仍有多会话未提交修改，未自动stage/commit/归档；工程结果可独立审阅。
