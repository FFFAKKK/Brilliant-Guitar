# 桌面宿主

这是工作台的 Tauri 2 生产宿主。它复用 `apps/workbench` 的 React/Vite 页面，不复制组件、主题或谱面渲染代码。

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
