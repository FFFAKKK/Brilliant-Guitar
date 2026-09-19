# 应用配置边界

状态：2026-09-19 已实现 V1 用户配置文件、Agent 插件启停、非秘密 Provider 选择与快捷键映射。

Brilliant Guitar 将状态按用途分开保存，避免界面偏好、音乐事实和临时编辑状态互相污染：

| 状态 | 权威来源 | 是否进入乐谱撤销历史 |
| --- | --- | --- |
| 音符、休止符、拍号等音乐事实 | Rust 内核管理的乐谱文档 | 是 |
| 选择、输入草稿、未完成操作 | 当前编辑会话内存 | 否 |
| 动画、规则提示、删除时间策略、快捷键、Agent 插件启停与模型选择 | 用户应用配置 | 否 |
| 面板位置和工作区布局 | 独立的工作区配置 | 否 |
| 插件自己的选项 | 未来的插件命名空间配置，必须声明结构和默认值 | 否 |

## V1 文件

桌面宿主通过 Tauri 的用户配置目录保存 settings.v1.json。文件由 Rust 宿主读取、校验并原子替换，前端不能指定任意路径。浏览器开发预览使用相同 JSON 结构并回退到 localStorage。

    {
      "schemaVersion": 1,
      "ui": {
        "animationsEnabled": true,
        "ruleWarningsVisible": true
      },
      "editing": {
        "deleteTimePolicy": "preserve"
      },
      "agent": {
        "enabled": false,
        "providerSelection": null
      },
      "shortcuts": {
        "profileName": "官方默认",
        "bindings": {}
      }
    }

配置使用明确的版本和字段白名单。未知字段、损坏 JSON 或不支持的版本不会被悄悄接受；桌面宿主会把原文件改名为 settings.v1.json.invalid-<id> 保存证据，再以内置默认值启动。

旧版三个分散的本地存储键只用于首次迁移。迁移成功后，新配置文件成为权威来源。

`agent.enabled` 只表达用户是否激活 Agent 插件。`agent.providerSelection` 只保存用户明确选择的
`providerId` 与 `modelId`，不代表 Provider 当前可连接，也不授予任何 Capability 权限。没有选择时为 `null`。

API Key 不得写入 `settings.v1.json`、浏览器 `localStorage`、日志或模型上下文。桌面宿主通过系统凭据库存储
Provider 凭据；前端只能读取 `configured`、`missing` 或 `unavailable` 状态，不能通过任何 IPC 命令取回明文。
旧版缺少 `agent` 字段的 V1 文件按 `enabled: false`、`providerSelection: null` 读取；已有 `agent.enabled`
但缺少选择字段的文件保留启停值并补为 `providerSelection: null`。

`shortcuts.bindings` 只保存用户相对官方命令贡献的覆盖项。缺少命令 ID 时继续使用插件或宿主声明的官方快捷键；
值为 `null` 时明确取消该命令的快捷键。映射以命令 ID 为稳定身份，因此插件命令可以复用同一套配置入口，
暂时未安装插件的合法映射也可以在模板中保留。

## 快捷键模板 V1

快捷键设置可导入和导出独立的 `brilliant-guitar-shortcuts.json` 文件：

    {
      "kind": "brilliant-guitar-shortcut-template",
      "schemaVersion": 1,
      "name": "我的编辑键位",
      "bindings": {
        "file.save": "Mod+S",
        "playback.toggle": "Space",
        "view.paper-fit": null
      }
    }

模板导入前会检查文件大小、字段白名单、命令 ID、组合键格式和重复映射；失败时保留当前配置。
`Mod` 是平台中立的主修饰键，界面在 Windows/Linux 显示为 Ctrl，在 macOS 显示为 ⌘。
导入模板不会执行命令、加载插件或修改乐谱内容。

## 工作区配置 V1

桌面宿主按稳定的工作区标识保存 `workspaces/<workspace-id>.workspace.v1.json`。它包含停靠区尺寸与可见性、组件挂载布局、共享标签选择和检查器宽度。工作区标识必须是 UUID，不能被用来拼接任意路径。浏览器开发预览使用相同 JSON 合同。

旧版布局、可见性、组件位置、共享标签和检查器宽度键只在配置文件缺失时读取一次。迁移后，前端通过统一的工作区配置 API 更新完整快照，不再分别写入这些键。损坏文件会被隔离为带随机标识的副本，再恢复兼容布局。

## 后续扩展原则

- 新设置必须声明作用范围、默认值、生效时机和复位行为。
- 描述作品本身的值必须进入乐谱文档，不能伪装成应用偏好。
- 改变数据含义或可能造成内容损失的行为不能仅靠隐藏开关实现。
- 插件设置必须按插件标识隔离，并经过插件声明的配置结构验证。
- 前端插件平台已经提供版本化插件设置目录；桌面持久化尚未接入，不能把该内存目录误认为磁盘权威来源。
- 插件设置持久化通过应用宿主提供的 `read/write` 端口接入；恢复时必须保留当前未安装插件的命名空间。
- 用户插件启用集合使用独立的版本化文档和存储端口，未知但合法的插件 ID 必须保留，以便插件重新安装后
  恢复用户原来的启用选择。
- 浏览器预览分别使用 `plugin-activation.v1` 与 `plugin-settings.v1` 本地存储文档；桌面宿主仍使用自己的
  受控配置位置，两者共享前端合同但不共享存储实现。
- 工作区布局应独立于用户通用偏好，以便不同工作区使用不同布局。
- 快捷键模板只描述命令 ID 与按键映射；命令的业务权限、启用条件和作用范围仍由命令路由决定。
