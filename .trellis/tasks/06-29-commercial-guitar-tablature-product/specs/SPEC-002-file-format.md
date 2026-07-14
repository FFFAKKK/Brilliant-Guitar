# SPEC-002 .bgp 文件格式与迁移契约

## 状态

- 状态: 已确认第一阶段边界。
- 映射需求: `REQ-009`, `REQ-016`, `REQ-015`。
- 适用范围: 第一阶段 `.bgp` 原生文件、保存/打开、自动保存恢复、schema version 和迁移入口。
- 当前实现边界: K1-1 只定义 `score.json` 中 `brilliant-score-1` 的语义 codec 与 ExtensionBlock 保真；物理包、manifest 和 migration/report 等待 K1-5/Persistence 规划。

## 目标

`.bgp` 是用户长期保存作品的原生工程文件。它必须兼顾 Guitar Pro 式单文件体验、开源可审查性、长期兼容、迁移测试和未来插件扩展。Core Kernel 负责文件包内的语义契约和迁移入口；`Persistence Service` 负责真实文件系统、zip 读写、原子保存、自动保存和崩溃恢复。

## 架构边界

Core Kernel 负责:

- `manifest.json` 语义契约。
- `score.json` schema。
- schema version 和兼容矩阵。
- 迁移器注册和迁移入口。
- `MigrationReport` 基础结构。
- 打开后、保存前、迁移后的硬一致性验证入口。

Core Kernel 不负责:

- 文件选择器。
- 文件系统路径。
- zip 压缩/解压库。
- 原子写入、临时文件、备份和回滚实现。
- 自动保存目录和崩溃恢复文件位置。
- 最近文件列表。
- Windows、Tauri 或平台权限 API。

## 包结构

MVP `.bgp` 的长期形态必须是单文件开放 zip 包。Pure Core Kernel V1 只定义包内语义文件契约；第一阶段内核实现只需要处理以下两个语义入口的 JSON schema、schema version、migration 入口和纯 JSON round-trip:

```text
project.bgp
  manifest.json
  score.json
```

以下目录属于后续物理包、资源和插件阶段规划，不属于 Pure Core Kernel V1 实现项或验收项:

```text
project.bgp
  assets/
  extensions/
  preview/
```

目录含义:

- `manifest.json`: 文件包级元数据、版本、资源索引和兼容信息。
- `score.json`: `ScoreDocument` 根对象，是谱面语义事实来源。
- `assets/`: 未来图片、音频、字体或其它资源，不作为 MVP 必需内容。
- `extensions/`: 未来物理包附加数据位置草案；K1-1 不定义该目录。它与 `score.json` 内已批准的 `ScoreDocument.extensions`/ExtensionBlock 不是同一契约。
- `preview/`: 未来缩略图或预览缓存，不作为谱面事实来源。

## manifest.json 契约

`manifest.json` 至少必须表达:

- 文件格式标识，例如 `formatId = "brilliant-guitar-project"`。
- 文件格式版本，例如 `formatVersion`。
- 谱面 schema version，例如 `scoreSchemaVersion`。
- 创建应用名称和版本。
- 最后保存应用名称和版本。
- 创建时间和最后保存时间。
- 主谱面入口，MVP 固定为 `score.json`。
- 资源索引，MVP 可为空数组。
- 扩展命名空间摘要属于后续插件/物理包阶段；Pure Core Kernel V1 不要求在 `manifest.json` 中定义该字段。

禁止事项:

- 禁止把谱面语义只放在 `manifest.json` 中。
- 禁止把 VexFlow、SVG DOM、屏幕坐标、播放引擎状态或 UI 会话状态写入 `manifest.json`。
- 禁止把加密、DRM 或授权校验作为打开核心谱面语义的前置条件。

## score.json 契约

`score.json` 必须承载 `ScoreDocument`。

规则:

- `score.json` 是六线谱、五线谱、播放、保存、导出、命令回放和插件读取的语义来源。
- `ScoreDocument.schemaVersion` 必须与 `manifest.json.scoreSchemaVersion` 一致，或通过明确兼容规则解释差异。
- 保存前和打开后必须运行 Core Kernel 硬一致性验证。
- 迁移后必须重新运行硬一致性验证。
- 未知但可保留的扩展命名空间不得静默丢弃。

禁止事项:

- 禁止在 `score.json` 中保存 React 状态。
- 禁止在 `score.json` 中保存 SVG DOM、VexFlow 对象、Canvas/WebGL 对象或 PDF 页面坐标。
- 禁止在 `score.json` 中保存 Web Audio 节点、播放引擎状态或当前播放位置。
- 禁止在 `score.json` 中保存当前 UI 光标、临时选区、鼠标拖选状态或缩放滚动状态。

## 迁移契约

迁移器必须满足:

- 输入旧版本 `manifest.json` 和 `score.json`。
- 输出当前版本 `manifest.json`、`score.json` 和 `MigrationReport`。
- 不得静默丢弃旧文件中可保留的数据。
- 无法保留的数据必须进入 `MigrationReport`。
- 迁移失败必须安全失败，不得覆盖原文件。
- 迁移完成后必须运行硬一致性验证。

`MigrationReport` 至少包含:

- 源格式版本。
- 目标格式版本。
- 是否成功。
- 执行过的迁移步骤。
- warning 列表。
- lostData 列表。
- unsupportedFeatures 列表。
- diagnostic 列表。

## 兼容策略

- MVP 可以使用预稳定 schema version，但必须从第一天包含明确版本字段。
- 第一个稳定 `1.x` 版本发布后，`1.x` 稳定版必须能打开所有 `1.x` 稳定版保存的 `.bgp` 文件。
- 打开未来 schema version 文件时必须安全失败，并给出用户可理解错误。
- 任何字段删除、重命名或语义改变都必须配套迁移策略、fixture 和测试。

## Persistence Service 约束

`Persistence Service` 可以实现:

- zip 读写。
- 本地文件路径和文件选择器集成。
- 原子保存。
- 自动保存。
- 崩溃恢复。
- 备份。
- 最近文件列表。

`Persistence Service` 不得:

- 绕过 Core Kernel schema、迁移和验证契约。
- 直接修改 `score.json` 语义字段。
- 在后续启用 `extensions/` 契约后静默丢弃已声明的扩展数据。
- 把物理 IO 细节写入 `ScoreDocument`。

## MVP 不做

- 不做文件密码锁。
- 不做加密保存。
- 不做 DRM。
- 不做云同步。
- 不做多人实时协作合并。
- 不做出版级资源打包优化。
- 不承诺兼容 Guitar Pro 文件格式；Guitar Pro 导入属于第二阶段。

## 测试要求

- 能创建最小 `.bgp` fixture，并包含 `manifest.json` 和 `score.json`。
- 保存后重新打开，`ScoreDocument` 语义不丢失。
- zip 解包后可以人工识别 `manifest.json` 和 `score.json`。
- 保存前、打开后、迁移后必须运行硬一致性验证。
- 未来 schema version 文件必须安全失败并给出可读错误。
- 一旦存在旧 schema fixture，迁移器必须覆盖旧版本到当前版本的测试。
- 物理 `extensions/` 目录与非 JSON 资源 round-trip 属于后续 Persistence/插件阶段；`score.json` 内未知 score/part ExtensionBlock 的 JsonValue 语义 round-trip 已是 Core K1-1 验收项。
- 损坏 zip、缺失 `manifest.json`、缺失 `score.json`、schema version 不匹配必须返回结构化错误。
