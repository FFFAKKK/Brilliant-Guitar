# 备份框架桌面入口 v0.1

日期：2026-10-07。沿用已认可的插件启动配置列表和四栏工作区；此入口复用现有Rust宿主，不切回旧真实UI。

2026-10-08三页产品续做已将备份desktop资产入口改为生成的`startup-center.html`：最近／插件／设置共用原控制器及协调器，显式选择作品后在同一窗口进入工作区，返回/继续保留固定会话。产品页要求桌面环境；独立外观仍看`startup-center-static-preview.html`，旧独立管理页保留。几何服务及备份限定权限已接线，实际原生视觉、系统缩放和IME仍待验收。当前批次构建/验证以[evidence/startup-center-product-20261008/verification.md](evidence/startup-center-product-20261008/verification.md)为准。

以下记录保留前一入口及其历史二进制行为，不能代替三页产品的当前验证。

同日基础审计已更新通知/生命周期/设置所有权及静态生成资产，尚未重新编译下述EXE。
此前窗口证据属于原二进制，不自动覆盖本轮或并发布局增量；当前范围及待验项见
[基础审计](research/infrastructure-foundation-audit-20261007.md)。下文历史“当前”说明需按其记录版本理解。

## 当前可运行入口

本轮已编译调试EXE：

```text
E:/desktop/brilliant_ideas/brilliant_guitar/apps/desktop/src-tauri/target/backup-ui/debug/brilliant-guitar-desktop.exe
```

它嵌入当前前端资产，可直接运行，无需启动前端服务。最先显示插件启动配置，保存完成后点击页脚播放图形启动固定工作区。
2026-10-07 协议收敛后，桌面左上返回图形仅隐藏工作区并返回配置；再次进入保留同一会话，关闭并重新启动进程才采用新计划。
启用插件使贡献进入目录，面板位置仍由布局编辑决定。file 预览仍可结束完整会话再创建独立预览。

同日真实文档续做已接通五线谱只读显示。在新启动的该EXE进入工作区后，使用文件菜单“打开作品…”或Ctrl+O选择宿主支持的作品文件；作品标题、保存图形及五线谱投影同步更新。Ctrl+N或“新建作品”创建一小节空谱，读取异常可从图形重读入口或文件菜单重读。没有现存作品才初始化空谱，不填演示音符。
未保存的恢复作品会保守阻止新建/打开；本切片没有保存或放弃恢复内容入口。普通file/HTTP预览不具备此文件能力，仍使用fixture。
同日已通过computer-use实跑原生空谱、文件取消、A/B切换、坏文件保留与重读、返回配置保留作品，以及保存下一次计划后关闭/重开恢复启停和参数。连续数值125.5%实际生效；系统缩放、原生Ctrl+滚轮和IME另列未验收。底部小节数/速度消费同一原子文档结果，真实入口隐藏尚无跟踪端口的固定页码。证据与限制见 [窗口验收](evidence/desktop-readonly-window-20261007/verification.md)。

从仓库根重新构建/开发：

```powershell
npm run desktop:backup:dev
npm --prefix apps/desktop run backup:build:debug
npm run desktop:backup:build
```

开发入口使用静态资源、关闭内置HTTP服务与代码监听；构建均使用锁定的现有离线依赖，不生成安装包。
debug产物在target/backup-ui/debug，release产物在target/backup-ui/release。默认旧桌面构建命令保留，使用单独输出。

## 装配链与配置

```text
原启动HTML + CSS/经典IIFE + 本地VexFlow资产
  → build-desktop.mjs → dist/desktop/index.html（当前18个资源；具体集合以生成manifest为准）
  → tauri.backup.conf.json → 现有Rust宿主
  → 启动配置中心 → 既有插件设置IPC
  → 已保存计划 → 同一createBackupUiRuntime/PluginPlatform
  → 布局/核心谱面/选中的实际备份插件
```

前端只有一个页面源；桌面构建仅改HTML标题，依赖含CSS的scrollbars import与动态绘制库，保持原列表/四栏CSS。源、研究、测试与历史证据不打包。

备份应用标识为com.brilliantguitar.backup，配置和WebView数据目录与旧com.brilliantguitar.workbench隔离。插件启停/参数由既有plugin-settings.v1.json保存，命名空间为brilliant.ui.backup-startup。浏览器文件/HTTP来源、旧桌面与新桌面配置不自动迁移，当前file页面仍使用localStorage。

现有Rust命令、窗口与安全能力继续复用。本轮只在json_store测试模块追加恢复回归，生产存储和原子替换算法没有修改。

## 插件协议边界

| 输入 | 当前处理 |
| --- | --- |
| definePlugin产生的apiVersion4.0公共包，可选UI facet v1 | 经正式PluginPlatform登记，原DOM宿主挂载 |
| defineUiPlugin产生的旧备份namespace清单 | 必须由可信应用提供匹配的id/name/version/activation后适配为4.0；内置身份明确采用开发版0.1.0 |
| 正式apiVersion3.0清单或含manifest.apiVersion的React包 | 在投影/订阅/平台资源获取前明确拒绝，要求可信应用适配 |
| 给v1清单追加apiVersion空值/未来值 | 同样拒绝，不能靠混合字段绕过边界 |

公共挂载包已接通身份、版本、设置、权限和固定会话；没有实现通用React→mount转换器，也没有把外部安装目录接入。
详情见 [4.0作者合同](./plugin-mount-contract-v4.md)。原四栏、CSS与记谱算法保持；实际文档编辑仍未开放。

## 已验证和仍待验证

- 原生Tauri调试编译成功；真实EXE创建了主窗口且Responding为true，详见独立证据。
- 本轮新增7项前端资源/协议回归；备份全量452/452（含同期动效追加1项）。资源集合、每个字节与生成manifest一致。
- Rust真实文件存储5/5通过，包含新增的启停/参数/revision与其他命名空间重新创建store恢复测试。
- 新增JS/MJS语法和Rust scoped格式检查通过；全局git diff --check另报告其他会话capability.ts的末尾空行，本轮未覆盖该文件。

以上452项与窗口存在证据属于桌面入口初次切片。同日最新窗口续验正式700/700、备份533/533、生产类型、资源一致性和独立debug EXE构建通过；正式4.0协议与真实作品只读源已接通。
已在真实窗口实跑空谱、新建/打开/取消、A/B切换、坏文件保留与重读、返回配置保留作品、配置保存后正常关闭重开及正式可选贡献。125.5%数值缩放和两处读数同步已观察；最终EXE图形重读后直接Ctrl+N成功。
底部文档读数、白纸错误图形颜色及移除重试控件后的焦点所有权已修复。原生Ctrl+滚轮、系统100/150/200%缩放、IME与完整记谱标准仍需独立验收；数值控件和当前环境截图不替代这些检查。音符编辑、保存、历史、播放、六线谱与安装发布仍需继续。

证据：evidence/desktop-bootstrap-20261007/verification.md。
最新只读接线：evidence/real-document-readonly-20261007/verification.md；合同：../../.trellis/spec/frontend/readonly-score-document-contract.md。
原生窗口与本批根因修复：evidence/desktop-readonly-window-20261007/verification.md；最终EXE及资源哈希：同目录final-hashes.json。

## 2026-10-08：当前三页产品入口及偏好

当前备份自动入口为startup-center.html/原经典产品bundle，桌面闭包21资源；旧管理和独立三页视觉预览保留。最近按宿主recordId操作，选择后同窗口转换再挂载唯一工作区，返回/继续保留原runtime，详见[产品合同](../../.trellis/spec/frontend/startup-center-product-contract.md)。

欢迎页密度/字号在原plugin-settings.v1.json的brilliant.ui.startup-appearance保存，不注册为插件，也不改变旧ApplicationSettingsV1。它与插件计划共用同一模块文档队列，保留其他namespace；坏/未来数据保留且只锁设置，失败图形重试，冲突明确重读。队列有效性guard贯穿读后/写前，页面释放后不发未发写入。独立视觉页仍本地内存；设置只作用欢迎页，不改变四栏或谱面。

真实原生窗口重放仍按用户要求暂停。当前新候选只能声明编译/自动化范围，不能搬用前述历史窗口资格。独立作者、真实绘制/4核8GB实机及长期资源、原生Ctrl+滚轮/系统缩放/IME仍待验证。当前偏好验证见[本批证据](evidence/startup-appearance-20261008/verification.md)。
