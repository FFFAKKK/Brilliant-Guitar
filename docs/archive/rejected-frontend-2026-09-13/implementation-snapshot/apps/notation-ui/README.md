# 初版五线谱 UI

这是接入真实 Native V2 内核的最小编辑工作台。默认装配一个五线谱视图模块，验证「新建 → 直接输入 → 修改/撤销 → 保存 → 重开 → 继续编辑」。

## 启动

在本工作树根目录运行，需要 Node 24，以及与本机 Node ABI 匹配的内核产物：

```powershell
npm ci --cache .tmp/npm-cache
npm run ui:build
npm run ui:start -- --port 4319
```

访问 `http://127.0.0.1:4319/`。默认加载 `target/integrated-v2/brilliant_kernel_node.node`；可通过 `--addon <绝对路径>` 指定已有产物。缺失或不兼容时启动失败，不会退回模拟内核。

默认文件目录为工作树内 `.local-evidence/notation-ui/documents`，可通过 `--data <目录>` 指定。应用的「打开」列出这个目录中的 `.score.json` 文件。不要把 `.local-evidence` 当作长期作品备份；正式使用应指定独立作品目录。

## 操作

- 点击拍位，按 A–G 直接输入自然音，不需要逐音确认；在休止拍输入后自动前进，修改已有音符则保留位置。
- ← / → 选择拍位，↑ / ↓ 按自然音级调整音高；输入八度控制下一次输入。
- Delete / Backspace 删除为休止；R 输入休止并前进。
- Ctrl+Z 撤销；Ctrl+Y 或 Ctrl+Shift+Z 重做；Ctrl+S 保存。
- 首次保存需要文件名，后续直接保存。只有放弃已有未保存修改时提示确认。

## 模块边界（必须保持）

```text
五线谱视图模块（VexFlow）
        ↓ ScoreViewContext：只读投影、选择、编辑意图
工作台 / KernelClient
        ↓ 版本化请求
宿主 EditorService
        ↓ Core 公共入口：命令、查询、历史、文档编解码
Native V2 内核
```

1. 插件只能使用约定的能力接口；不得导入内核内部文件、Native 绑定、宿主文件服务或网络客户端。插件不持有可写 ScoreDocument，也不另建撤销栈。
2. `contracts.ts` 是本次纵向切片的应用协议；`browser/score-views.ts` 是谱面视图接口。两者不包含 VexFlow 或 Native 类型。浏览器收到的状态会被冻结。
3. `plugins/standard-notation` 负责谱面绘制、命中区域与音符输入行为；`browser/main.ts` 负责文件入口、会话投影、选择状态和请求队列。
4. `host/editor-service.ts` 经公共 Core / module-sdk 入口执行命令。一次用户编辑对应一次原子命令或批处理，共享内核历史。状态版本与会话 ID 不匹配时拒绝写入。
5. `host/native-backend.ts` 是宿主启动适配器：现有内核的 Native 后端选择目前位于内部入口，所以仅此文件使用该入口。这个依赖没有进入 UI 或插件。以后公开宿主装配 API 时只替换此适配器。
6. 文件路径、校验、原子替换和冲突检测归宿主。插件不可直接读写文件。保存失败不会把文档标为已保存。

新增谱面通过 `ScoreViewRegistry.register(provider)` 提供 `id/name/supports/create`，视图实现 `render/key/destroy`。未来吉他谱模块沿用这个接口，但需要同时扩展宿主的乐器投影/编辑契约与支持检查；仅注册一个视图不会自动获得尚未实现的乐器能力。

当前视图是随应用构建的模块，尚不是支持外部安装、热加载和权限隔离的插件平台；接口也尚未作为稳定第三方 SDK 发布。

## 第一版范围

单小节、4/4、单声部、高音谱号、四分音符/休止、自然音 C3–B6。使用 VexFlow 5.0.0 绘制五线谱，字体随浏览器构建产物打包。

尚未实现播放、循环、多小节、时值编辑、升降号、和弦、吉他谱、技巧菜单和布局设置。含不支持结构或乐器扩展的文件会拒绝打开并保留当前会话和原文件。

目前一个宿主进程持有一个编辑会话；刷新浏览器可读取该会话。重启宿主后通过「打开」恢复已保存文件，历史不跨重启保存。多窗口协作、崩溃自动恢复及跨进程文件锁不在本版范围。

## 验证

```powershell
npm run ui:test
npm run typecheck
```

9 项针对性检查覆盖真实 Native 编辑与历史、陈旧请求拒绝、保存/冲突、无损拒绝不支持文件、视图注册、依赖和浏览器构建边界、HTTP 来源约束、实际客户端传参，以及宿主进程重启后的文件重开和继续编辑。

2026-09-13 已通过浏览器实际操作：连续输入 C4/D4/E4/G4 → 第四拍上移 A4 → 撤销/重做 → 保存 → 新建 → 重开 → 点击第二拍改 F4 → 再保存。最终状态为 C4/F4/E4/A4，浏览器未记录控制台错误。

本轮使用已有 Native 产物，未重新编译 Rust；SHA-256：`575ad086229ef04fd7e421197e6857ee43504a62c1849810e6b94153a0f0eb2f`。测试生成的重启与文件证据保留在 `.local-evidence/notation-ui/tests/`。
