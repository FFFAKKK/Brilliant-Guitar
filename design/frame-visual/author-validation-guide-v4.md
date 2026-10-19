# 4.0 插件作者验收指南

2026-10-08。范围：JavaScript 公共包 4.0 / 挂载 UI facet 1 的三类开发试验。
本指南是可执行练习说明，不增加生产接口。验收包只导出正式 SDK 的 definePlugin；参考插件由已有作者样例生成。

## 使用步骤与资料边界

维护者在仓库根运行 `npm --prefix design/frame-visual run author:build`，得到 `design/frame-visual/dist/author-validation/`。
把这个目录复制为独立作者目录。作者只阅读本指南、sdk.mjs 的公开入口和本目录参考文件；不得依赖宿主私有源码或口头隐藏规则。
目录包含 package.json、sdk.mjs、三个插件文件及可追踪的 kit-manifest.json，不需要启动产品服务。
Node 与工程依赖由维护者准备；sdk.mjs 已包含其声明捕获依赖，作者不用安装另一套平台。

参考文件用于展示可执行接口。直接提交未改参考文件只能算工具自检；独立资格需另有作者身份、读取资料、开发过程和澄清记录。
作者可以在独立目录内拆分自己的 .js/.mjs 模块，只使用静态相对 import/export 和 sdk.mjs；本次练习不支持 npm、Node 内置模块、动态 import 或 require。
导入检查约束这次试验的依赖图，不提供进程安全沙箱或证明作者从未阅读其他文件。

作者保留下面的工厂导出、验收 ID 和 data 属性，独立实现行为。维护者在同一正式平台和原 UI router/ComponentHost 中验收。
提交目录不进入产品默认集合，不自动出现在启动管理页；生产可配置包仍需要可信应用补齐目录、字段、设置恢复和装配。

## 公开声明的最小字段

```js
import { definePlugin } from "./sdk.mjs";
export const plugin = definePlugin({
  id: "example.panel", name: "Example", version: "0.1.0", apiVersion: "4.0",
  ui: { contractVersion: 1, components: [], commands: [], menuItems: [], shortcuts: [] },
});
```

| 声明 | 本次使用的字段与约束 |
| --- | --- |
| 共同身份 | id/name/version/apiVersion；ID由小写段和点分隔，贡献ID必须位于本插件命名空间；4.0精确匹配 |
| settings | schemaVersion、defaults、同步parse(value)；parse返回合法JSON值或根null拒绝；接受值被复制冻结 |
| component | id/title/role/slots/mount；uiKind使用panel或view；panel支持left/right，view仅stage |
| commands | id、run(payload, host)，可选label/enabled/checked；run允许同步值或Promise，enabled/checked同步 |
| menuItems | id、menu、command；本试验宿主公开view菜单，条目只映射已有命令 |
| shortcuts | id、command、keys、scope；B使用global和Mod+Alt+I，Mod在Windows为Ctrl |
| permissions | 组件声明commands白名单；ctx.execute仍在执行时检查许可和命令可用性 |

可以省略ui或可选数组，不产生占位组件；空数组合法。不要把apiVersion省略，否则旧SDK调用会生成3.0。
mount、实例dispose/setVisible/setVariant/handleKeyDown、onDispose清理回调必须同步；非法Promise不表示成功。

组件只接收自己的 element 和以下窄上下文：

```text
ctx.execute(commandId, payload?) -> 原命令结果（可以是Promise）
ctx.notify(text, level?) -> 通知结果
ctx.onDispose(callback) -> 取消登记函数
ctx.settings?.read() -> 本插件不可变设置
host.settings?.read() -> 命令的本插件不可变设置
```

settings只在包声明设置时可用。普通插件无设置写端口；维护者在register后、start及首次mount前恢复设置。
DOM通过element.ownerDocument创建。监听/订阅获取后立即登记清理；返回实例的dispose清理自己的节点。
隐藏和左右移动保持同一个实例；整个会话结束才释放。插件不能自行创建平台、router、布局或文档权威。
ctx.confirm/motion、业务贡献、作品读端口、浮层、自由放置和样式预设均不在本次A/B/C验收范围，不能据本次通过宣布可用。

## A：左右栏面板与设置

文件 panel-plugin.js，导出 `createPanelPlugin({source, onRun})`。
包ID audit.panel，组件 audit.panel.content，命令 audit.panel.inspect。

- source.read()返回当前数字；source.subscribe(listener)返回同步取消订阅函数。输入由作者试验拥有，不是产品文档。
- settings schemaVersion=1、默认prefix=A；parse接受长度不超过16的字符串prefix，其他值拒绝。
- 维护者首次mount前恢复prefix=R；组件output标记data-audit-panel-value，显示`R:当前值`。
- 一个带aria-label的button执行同一命令，payload为`{source:"button"}`。命令调用onRun(payload)，返回`{ok:true,payload,prefix:host.settings.read().prefix}`。
- 左右移动/隐藏恢复不增加订阅；输入更新刷新显示；结束后订阅、按钮监听和节点清理。命令释放后不得继续执行。

## B：命令、菜单和快捷键

文件 command-plugin.js，导出 `createCommandPlugin({enabled, run}={})`。
包ID audit.command，无组件；命令 audit.command.run，菜单项 audit.command.menu，快捷键 audit.command.key。

- enabled默认返回true；run默认返回`{ok:true,payload}`；传入函数由作者试验拥有。
- view菜单和global Mod+Alt+I都指向同一个audit.command.run，不各写一个处理函数。
- 禁用时返回原router的command.disabled且不调用run；启用后payload对象及Promise结果保持，每次执行一次。
- 结束后菜单/快捷键/命令全部释放；无组件包没有占位面板。

## C：异步工作区只读视图

文件 readonly-view-plugin.js，导出 `createReadonlyViewPlugin({read})`。
包ID audit.readonly，唯一stage组件 audit.readonly.view，role/uiKind=view。

- read({signal})可以返回值或Promise；这是作者自己的输入，不等于获准读取真实作品。
- mount同步创建output[data-audit-view-value]和一个带aria-label的重读button，再发起异步读取。
- 正常结果显示String(result)；失败显示不可用，重试后可恢复。
- 新请求取消旧signal；逆序返回只采用最新结果。释放后取消在途请求，晚到结果不回写已结束视图。
- 宿主拥有滚动和缩放；作者不创建第二套工作区。C占用stage，只在独立装配中测试，不能与notation.core同时抢占stage。

## 维护者验收与记录

在仓库根执行，directory使用复制后的独立作者目录：

```text
node design/frame-visual/tools/verify-author-submission.mjs --directory .tmp/author-submission --output design/frame-visual/evidence/author-development-qualification-20261008/submission
```

工具先验证SDK与正式源生成字节一致，并检查全部作者静态依赖在提交目录内，再运行既有真实宿主回归。
directory和output都按仓库根解析，output必须是仓库内的新目录，父目录已存在；已存在的报告目录直接拒绝，不覆盖旧证据。
工具自动先执行原startup生成一致性检查，过期即停止，不在验收中自动修复。随后复用原五项真实宿主试验，必须有完整非空TAP汇总、全部通过且无失败/取消/跳过/todo；进程提前退出0也不能通过。
验收前后核对SDK、作者静态依赖、package.json原始字节、当前作者包以及持续检查声明的宿主源/资产指纹；变化或结束指纹失败为stale。范围不包含所有node_modules或瞬时变化，验收需要稳定候选。
report.json记录指纹、步骤、退出/超时、测试数量、结果和范围；start/end.json保存宿主前后快照，startup-assets.log与tests.log保留证据。通过表示提交满足本次行为试验，不自动表示独立作者资格或实际Windows视觉通过。
Node回归的DOM替身不计算字体、像素或原生焦点，容量另验。

独立作者记录至少填写：作者标识、此前是否读过私有实现、获得的包指纹、允许资料、起止时间、所有澄清/阻塞、提交指纹、宿主修改次数和最终结果。
遇到缺失公共能力应记录合同缺口，由接口所有者修复；不能让作者导入私有宿主或另建权威绕过。
当前新作者是否真正仅凭文档完成仍需实际独立执行；本指南和参考自检不替代这一步。
