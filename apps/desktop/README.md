# 桌面宿主

这是工作台的 Tauri 2 宿主。默认构建使用 `apps/workbench` 的 React/Vite 页面；新增备份构建使用已认可的 `design/frame-visual` 页面，两者复用同一 Rust 宿主。

## 备份 UI 桌面入口（2026-10-07）

从仓库根运行 `npm run desktop:backup:dev`，或用 `npm --prefix apps/desktop run backup:build:debug` 生成
`src-tauri/target/backup-ui/debug/brilliant-guitar-desktop.exe`。该EXE嵌入页面资产，可直接运行，不依赖前端服务。
`npm run desktop:backup:build` 生成独立release EXE，本切片不生成安装包。

`tauri.backup.conf.json` 覆盖静态构建入口和 `com.brilliantguitar.backup` 应用标识；配置/二进制与旧工作台隔离，Rust业务IPC沿用。仅备份main窗口增加四项尺寸/最大化写权限，默认产品权限保持。
备份程序先显示“最近／插件／设置”三页启动中心；选择作品后调整同一窗口并挂载唯一工作区。返回后继续保持同一文档和平台，启停/参数修改在下一进程生效。设置中的密度/字号只影响欢迎页，沿原plugin-settings文档自动保存/恢复，失败用图形重试；与插件计划共用完整读改写队列。真实作品没有缩略图缓存时显示文件图形。核心五线谱已接基础编辑、撤销/重做和受版本保护的保存；Tab 界面消费仍待完成。当前整合范围与验收缺口见[主线整合状态](../../design/frame-visual/MAIN_INTEGRATION_STATUS.md)。偏好坏版本不会阻止新建/打开作品，具体错误与冲突合同见[启动偏好](../../.trellis/spec/frontend/startup-appearance-contract.md)。
产品接线和真实原生资格边界见[三页产品合同](../../.trellis/spec/frontend/startup-center-product-contract.md)；自动化和编译不代替实际窗口视觉/缩放/IME验收。
协议/范围/已验证与未验收项见 [备份桌面入口](../../design/frame-visual/desktop-entry-v0.1.md)。

桌面运行链为：

```text
React Workbench -> Tauri invoke -> Rust application service -> Rust Kernel
```

桌面版的会话、编辑历史、原生文件选择和原子保存均由 Rust 进程持有：

- `npm run desktop:dev` 会复用已经运行的 `http://127.0.0.1:5173`；服务未运行时会自动启动工作台开发服务。
- 桌面窗口通过 `TauriWorkbenchHostBridge` 调用 Rust commands，不使用 `/api/workbench/*`。
- Vite 只提供开发页面；由桌面脚本自动启动时不会创建 Node 业务宿主。
- 普通浏览器开发仍保留 `BrowserWorkbenchHostBridge -> Vite HTTP -> Node/N-API` 兼容链，用于组件开发和双宿主合同回归。
- 保存使用同目录临时文件、磁盘同步和原子替换；打开失败不会覆盖当前 Rust 会话。
- 桌面工作区身份持久保存在 WebView 数据目录中，崩溃重启后 Rust 可按同一身份恢复未保存文档；正常关闭会清理对应恢复文件。
- 静态生产包不携带 Node runtime、开发服务器或 `.node` addon。
- `dev-icon.svg` 及生成的 `src-tauri/icons` 是 Windows 构建所需的开发占位资源，不代表正式产品图标方案。

运行前安装依赖：

```powershell
npm.cmd --prefix apps/desktop install
npm.cmd run desktop:dev
```

验证和构建：

```powershell
npm.cmd --prefix apps/workbench run test
npm.cmd --prefix apps/desktop run test
npm.cmd --prefix apps/desktop run build
npm.cmd --prefix apps/desktop run package
```

默认 `build` 只编译静态前端和 release EXE，不生成安装包。只有进入安装验收阶段时才显式运行 `package`。

2026-10-10桌面领域续做：原文档服务已组合一个正式IntegratedKernelSessionV2，Core与调号贡献共享历史/保存，typed读取同源。`node apps/desktop/scripts/build-notation-module.mjs --check`用原TS模块检查静态调号协议与Native差分用例；备份构建自动先生成，生产不携带JS领域执行器。前端调号控件已接原窄文档入口及同一命令/选择链，当前合同见[调号控件](../../.trellis/spec/frontend/score-key-signature-controls-contract.md)和[Native记谱领域接线](../../.trellis/spec/frontend/native-notation-module-contract.md)。原生窗口仍未启动验收；实际控件结果见[验证记录](../../design/frame-visual/evidence/score-key-signature-controls-20261010/verification.md)，前一领域记录保留。
