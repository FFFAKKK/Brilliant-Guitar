# 插件平台启动配置与运行时状态边界 v0.1

日期：2026-10-07。

本日协议收敛续做已接入正式 PluginPlatform。**当前版本以此补充及 [4.0 挂载合同](./plugin-mount-contract-v4.md) 为准**：
内置包采用明确开发身份/版本；启动参数由正式 Settings Registry 在首个 mount 前恢复；管理 UI 保留原列表。
桌面 process 模式返回配置仅隐藏原工作区，保存后再次进入复用同一会话，关闭/重新启动进程才采用新计划。
file preview 模式仍可结束完整旧会话后创建独立会话。下文较早切片中“拒绝所有 apiVersion”和“返回即释放”
仅描述当时实现。外部安装发现、更新、恢复上次可用计划和真实编辑仍未完成。

## 结论

插件平台需要一个独立的“启动配置中心”。当前备份切片负责在工作区启动前决定哪些内置插件进入本次会话、使用哪些配置；工作区运行后只读取并展示已经生效的结果。运行中的插件集合保持冻结，不能通过管理页直接 register、start、dispose 或热替换。安装、版本选择、兼容范围协商和更新仍为后续能力。

## 两个入口

下表是完整目标边界；当前实现备份内置目录、启停、参数、浏览器同步保存、已有桌面服务的异步存储适配和固定启动。备份桌面入口已完成原生调试编译和窗口存在检查，Rust 配置存储已通过实际磁盘恢复测试；窗口内保存后关闭/重开的完整操作仍待验收。版本选择、恢复默认、安装更新与已知可用计划回滚尚未实现，不能以目标表作为完成清单。

| 入口 | 时机 | 能做什么 | 不能做什么 |
| --- | --- | --- | --- |
| 启动配置中心 | 启动前／下次启动前 | 查看插件、启用/禁用、选择版本、查看依赖、编辑插件配置、保存启动计划、恢复默认 | 不直接执行业务命令，不修改当前工作区 DOM |
| 运行时管理页 | 工作区运行中 | 查看已登记插件、运行状态、贡献、失败原因、版本和诊断信息 | 不改变插件拓扑，不动态加载/卸载，不伪造插件状态 |

## 启动流程

```text
插件目录/安装来源
  → 读取 manifest 与版本兼容性
  → 启动配置中心生成启动计划
  → 校验依赖、冲突、必需插件和权限
  → 保存用户配置
  → 下次启动读取启动计划
  → 固定 PluginPlatform.register()
  → PluginPlatform.start()
  → UI 挂载
  → 运行时管理页只读展示
```

启动计划应是数据，不是运行时对象。示例：

```json
{
  "format": 1,
  "revision": 3,
  "plugins": {
    "frame.builtin": { "enabled": true, "settings": {} },
    "notation.core": { "enabled": true, "settings": {} },
    "frame.layout": { "enabled": true, "settings": {} },
    "frame.plugins": { "enabled": true, "settings": {} },
    "frame.score-info": { "enabled": false, "settings": { "mode": "summary", "measureLimit": 8 } }
  }
}
```

## 必须区分的状态

- `installed`：插件已存在于插件目录。
- `enabledNextStart`：用户已加入下次启动计划。
- `active`：当前会话实际成功运行。
- `failed`：当前会话尝试启动但失败。
- `disabled`：当前启动计划明确禁用。
- `incompatible`：版本或宿主接口不兼容。
- `blocked`：依赖、冲突或权限检查阻止启动。
- `pendingRestart`：配置已经改变，但当前会话仍保持旧状态。

不能把 `enabledNextStart` 显示成 `active`。用户保存启用操作后，界面应显示“下次启动生效”。

## 计划修改原则

1. 用户修改启停、版本或设置时，只改启动计划草稿。
2. 依赖和冲突在保存前校验，并显示具体阻断原因。
3. 保存后生成新的 `revision`，记录变更摘要。
4. 当前工作区继续使用旧会话；不自动拆卸正在使用的谱面、布局或命令路由。
5. 下次启动读取新 revision，重新登记并启动固定集合。
6. 启动失败时保留失败原因，并允许回滚到上一个已知可用计划。

## UI 结构：紧凑列表与选中详情（2026-10-07 交互预览）

当前采用用户要求试做的“可扫描列表 + 行内启停 + 单项详情”。之前的三栏摘要和卡片画廊不再作为当前候选。

- 列表按内置、扩展分组；默认展示名称、短用途与开关，不重复“已启用/必需”状态文字。
- 搜索和启用/停用筛选直接可用，选中项的详情跟随变化；无匹配时列表与详情均显示空状态。
- 开关修改下次启动草稿，选择按钮和开关互为兄弟节点，避免嵌套控件的点击歧义。
- 必需项显示锁图形与原因 tooltip，当前必需性来自备份应用策略，正式产品仍需确认。
- 单项详情只展开用途、贡献和实际可调参数；版本/来源/依赖/标识收进原生“技术信息”。
- 修改前不显示保存/撤销；有修改时使用 28px 高的小操作和一行必要反馈，不独立占摘要栏。
- 非法参数显示局部错误并禁用保存；撤销恢复最近一次本页已应用基线。
- 窄窗口把详情放到列表下面，不把关键操作隐藏。

当前使用明确的草稿、保存、撤销。“已保存 · 下次启动生效”只在所选存储写入成功后显示，桌面必须等待 Promise 完成。读取/保存/启动等待时锁定修改与重复操作，失败保留草稿与基线；非法输入局部反馈并禁用保存。可观察到的其他页面修改会阻止覆盖；重新读取是显式撤销草稿，不假装实现跨进程事务。退出使晚到结果失效；已发送的磁盘写入可能继续完成。

当前文件：plugin-startup-config-static-preview.html，样式 styles/plugin-startup-preview.css，管理源代码 src/startup/，应用入口 src/plugin-startup-preview.js，经典产物 vendor/plugin-startup-preview.js。直接打开本地 HTML 即可，管理页不依赖 HTTP 服务或 ES module。

目录现在是实际应用装配项：frame.builtin、frame.layout、notation.core、frame.plugins 和可选只读 frame.score-info。没有实现的分析、节拍、和弦样例已经移除。未定义的插件版本与兼容范围不编造显示；技术信息显示配置修订、来源、依赖和备份内部协议。

页脚播放图形读取已保存计划并在同一文档中启动备份工作区；有未保存修改或读取失败时不可启动。工作区左上方图形返回配置页，先完整释放当前会话，再显示管理页。插件启用与面板放置是两件事：启用谱面信息后，其面板进入布局内容目录，需要在布局编辑中启用/放置；它不会擅自重排四栏。

管理页和启动入口共用一个注入的存储端口。普通 file 页面使用 localStorage，刷新恢复依赖浏览器允许该文件存储；HTTP 来源与文件来源是不同配置。真实 Tauri 环境选择现有 TauriPluginSettingsStorage 的桌面适配，启停和参数保存在 plugin-settings.v1.json 的 brilliant.ui.backup-startup envelope 中；合并保留其他命名空间。无自动迁移，存储失败显示错误，不回退到另一种存储制造假成功。桌面宿主既有的无效 JSON 隔离策略仍保留，前端无法将其与首次启动区分。

此前交互预览验证为 395/395，旧证据保留在 evidence/plugin-startup-list-20261007/。本轮接入证据位于 evidence/plugin-startup-integration-20261007/，新增 11 项校验/保存/固定会话/DOM 回归。浏览器工具此前明确拒绝 file://，本轮未通过替代浏览器或协议绕过该限制，不宣称实际视觉或本地字体加载验收。

## 当前接口与实施状态

```js
const controller = createPluginStartupController({ directory: BACKUP_PLUGIN_DIRECTORY, store, storageMode: "async" });
// async store: read(): Promise<Plan | null>, write(plan, { expectedRevision }): Promise<void>
// 省略 storageMode 则为 sync，保留原 read(): Plan | null, write(...): void 调用行为。
await controller.ready;
mountPluginStartupView({ root, controller, onStart });
const startupPlan = await readStartupPlanAsync(BACKUP_PLUGIN_DIRECTORY, store);
createBackupUiRuntime({ root: workspaceRoot, startupPlan });
// 组合根先确认自身仍有效并显示容器；异步端口不能直接传给同步 runtime。
// 同步端口仍可使用 startupStore；它与 startupPlan 互斥。
```

未提供计划/存储时，旧应用调用行为保持：核心谱面固定登记，诊断页由 enablePluginDiagnostics 控制。提供计划时，该布尔值不能重复指定；外部固定 plugins 数组仍由应用自行装配，不冒充目录已管理项。桌面适配接线复用已有 read/write 命令，Rust 生产存储算法和废弃 UI 页面保持原实现，本轮只追加存储测试。备份桌面包装入口已落地；正式扩展目录/工厂登记、版本迁移、权限/冲突策略、已知可用计划回滚和安装发布验收留给后续工程切片。

正式工作台的 apiVersion 3.0 React render 清单与备份内部 v1 mount 清单不同，不能直接改名装入。备份组合根现在在获取投影/订阅前拒绝自身或 manifest 的 apiVersion 字段，包括空值。合法备份插件的布局、核心谱面和业务贡献继续共用一个固定平台；管理视图仍只得到数据目录。正式协议适配仍需可信应用定义视图承载、受限端口与生命周期后实施。

构建命令：npm run startup:build；一致性检查：npm run startup:check。生成脚本从既有 workbench TS 源生成窄桌面设置桥接模块，再为经典预览适配已有 VexFlow 资产定位，不复制 IPC/错误解码或记谱算法。运行测试前检查共享记谱、桌面窄桥接与启动管理产物。

此前桌面存储接线新增 20 项异步/合并/真实服务 fake invoke/经典产物回归，连同原有 11 项接入专项为 31/31；当时全量备份 UI 444/444。历史证据见 evidence/plugin-startup-desktop-20261007/verification.md。这批验证仅覆盖接口与生命周期；普通本地页面仍显示浏览器存储状态。

## 2026-10-07：备份桌面入口落地

通过独立 tauri.backup.conf.json 将认可的启动列表和工作区静态资产嵌入现有 Rust 宿主，无需前端服务。应用标识 com.brilliantguitar.backup 和 target/backup-ui 输出与旧桌面隔离，不自动迁移配置。构建只携带当前可达的 17 个资源，不整目录复制设计、测试或历史证据；同一固定插件平台、视口与命令路径继续复用。

新增 7 项资源/协议回归，连同同期动效追加 1 项，备份全量 452/452；desktop:check 核对资源集合、字节与 manifest。原生调试 EXE 编译成功并创建响应的主窗口。Rust 实际磁盘存储 5/5，含启停、参数、修订与其他命名空间重新创建 store 后恢复的回归。

窗口内操作、保存后关闭/重开、字体/像素及系统缩放仍待验收。核心谱面仍是只读 fixture；正式 React 插件适配、真实文档业务和安装发布未完成。入口说明见 desktop-entry-v0.1.md，完整证据见 evidence/desktop-bootstrap-20261007/verification.md。


## 当前备份框架的落点

- `PluginPlatform` 继续是唯一运行时注册边界。
- 当前 `frame.plugins` 页面降级为运行时只读管理页，保留搜索、状态筛选和详情查看。
- 新增启动配置中心时，应由应用组合根在创建 `PluginPlatform` 之前读取 `startup plan`，过滤并校验 `plugins` 数组。
- 不能把启动计划逻辑塞进普通 UI 插件，也不能在运行时管理页直接调用平台写入方法。
- 第一版可先实现内存/文件配置适配器和静态启动计划 UI，再接真实安装目录、版本下载和持久化。

## 推荐实施顺序

1. 定义 `PluginStartupPlan` 数据结构和状态转换。
2. 实现只读插件目录投影与依赖/冲突校验。
3. 实现启动配置中心静态 UI 和草稿编辑，不接热替换。
4. 将组合根改为读取启动计划后固定注册。
5. 增加重启提示、失败回滚和上次可用计划。
6. 最后接真实安装、更新和卸载能力。
