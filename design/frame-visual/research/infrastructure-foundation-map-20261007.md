# 基础设施公开能力与状态所有者地图

日期：2026-10-07。范围为备份框架当前正式4.0链和只读桌面装配，不涵盖整个内核/Agent/吉他重构。
公开是对某种获准调用者公开，不等于所有插件都能拿到该对象。代码与证据指纹见本轮审计目录。

```mermaid
flowchart LR
  Config[应用启动计划] --> Assembly[可信组合根]
  Package[4.0包与UI facet v1] --> Platform[唯一正式PluginPlatform]
  Assembly --> Platform
  Platform --> MountHost[贡献安装与原组件宿主]
  MountHost --> Entries[按钮 菜单 快捷键]
  Entries --> Router[唯一UI router]
  Router --> Run[插件run]
  Run --> Port[已授权业务端口]
  Port --> Session[内核或文档会话]
  Session --> Projection[同版只读投影]
  Projection --> View[核心谱面view与共享绘制]
```

平台登记/捕获run而不再次转发执行。业务端口可能采用内核命令协议，那是跨业务边界，
没有第二次查UI command ID或重复执行。布局、缩放等宿主动作在自己的状态所有者处终止。

| 模块 | 公共使用及允许调用者 | 状态所有者与真实消费者 | 已支持边界/欠缺 |
| --- | --- | --- | --- |
| 公共包/平台 | 作者definePlugin；可信应用register/start/list/facets/dispose | apps/workbench的PluginPlatform持有身份、固定会话集合和登记目录；backup formal assembly真实消费 | apiVersion4.0、UI facet1；3.0 React另留旧宿主兼容；不能混用 |
| 贡献安装/组件 | 作者ui.components、同步mount受限ctx；宿主ComponentHost | 原registry拥有声明；ComponentHost拥有cell、局部资源与活动标记 | 移动/隐藏同实例；UI安装回滚；同步生命周期；拒绝非法异步返回 |
| UI命令 | 作者ui.commands.run(payload,{settings?})；组件ctx.execute获准ID | 原command-router拥有唯一命令表；handler或已授权业务端口拥有业务状态 | 参数与同步/Promise结果保持；未启用/缺命令/越权不执行；无第二router |
| 菜单/快捷键 | 作者menuItems/shortcuts；宿主消费已存在菜单及焦点 | 原menu-registry/shortcut-router拥有映射；keyboard/ComponentHost按焦点执行 | global/component/score、输入框/IME门禁；不能靠伪造component ID获得权限；改键目前内存范围 |
| 设置 | 作者声明schema/defaults/同步parse；组件及挂载命令只读本插件 | 正式SettingsRegistry拥有独立冻结JSON值；应用恢复和启动管理草稿拥有写入口 | 原启动envelope不变；挂载read不是隐式write；3.0持久写先接受内存再保存，与备份草稿保存合同不同 |
| 布局/栏内编排 | 获准frame.layout工厂得到layout/contents/actions/view四读端口；原授权命令写入 | workspace-state/sidebar-composition/layout-edit-session各持有约定子状态；原shell/sidebar presentation消费 | 四栏开关和尺寸始终可用；编辑仅栏内组件；普通ctx没有完整布局状态；两项UX仍由视觉会话修改 |
| 视口/缩放 | 宿主frame.workspace视图命令；布局settings和壳控件消费读端口 | workspace-view-state/stage-viewport拥有单一zoom/滚动；core view消费结果 | 连续数值和Ctrl+滚轮接线；当前同版原生事件/系统缩放未验 |
| 局部动画 | 作者捕获定义和permissions.animations；组件ctx.motion.bind(targets) | 动画service/provider持有受限目标、预算与轨道；宿主绑定cell和身份 | scope/生命周期及静态回退；同线程代码无强制抢占；当前美术源仍并发修改 |
| 启动管理/持久化 | 可信管理控制器、固定目录、store.read/write；普通插件不直接拿磁盘 | 管理controller持有草稿/基线；plan-store持有单实例队列；既有Tauri JSON store落盘 | 启停/参数下次进程生效；目录不从任意包自动生成；跨写者CAS或单写者强制门禁尚缺 |
| 真实文档会话 | 可信应用createReadonlyScoreDocumentSession；核心包获注入read/actions | Rust ScoreSessionService是音乐/作品权威；前端会话只有已接受read、checkpoint、busy/epoch | 新建/打开/取消/重读、脏作品保护；新UI尚未开放音符编辑/保存/历史/播放 |
| 文档/谱面投影与绘制 | 应用createDocumentStaffProjection；core view只读snapshot/status/subscribe/retry | 投影检查documentId/version并归一记谱数据；共享notation/VexFlow产出同次SVG/几何 | 单份作品身份驱动标题/读数/谱面；不能让普通样例声称获得内核client；公共交互读端口下一阶段 |

边界文件：

- 正式平台/SDK：`apps/workbench/src/plugins/plugin-platform.ts`、`plugin-sdk.ts`、`plugin-mount-ui.ts`、`plugin-mount-host.ts`、`plugin-settings.ts`。
- 真实装配：`src/plugin-startup-preview.js`、`src/host/backup-ui-runtime.js`、`workspace-runtime.js`、`formal-plugin-assembly.js`。
- 执行与资源：`src/runtime/command-router.js`、`component-host.js`、`ui-contribution-installation.js`、`runtime-support.js`。
- 文档与渲染：正式`readonly-score-document-session.ts`、备份`src/score/document-staff-projection.js`、`staff-read-port.js`、`core-score-view.js`及正式notation模块。
- 存储：`src/startup/desktop-plugin-plan-store.js`、正式`workbench-host-bridge.ts`和桌面`json_store.rs/commands.rs`。

上述备份路径均相对design/frame-visual；正式路径相对仓库根。端口合同以[当前挂载合同](../plugin-mount-contract-v4.md)、
[布局合同](../workspace-layout-contract.md)、[只读文档合同](../../../.trellis/spec/frontend/readonly-score-document-contract.md)为准。
能力地图不等于完成声明；资格、问题和未验范围见[本轮审计](infrastructure-foundation-audit-20261007.md)。
