# 桌面宿主接入计划

日期：2026-09-15

## 当前里程碑

`apps/desktop` 正在从最小 Tauri 2 开发宿主迁移为生产宿主，复用 `apps/workbench` 的 React/Vite 工作台。浏览器入口继续保留，用于快速预览、组件审核、合同测试和回归；桌面入口目标是负责生产会话、文件生命周期和 Rust Kernel 调用。

工作台已通过 `WorkbenchHostBridge` 与具体进程通信方式解耦。桌面生产实现使用 Tauri invoke 和 Rust application service；浏览器开发实现继续使用 Vite HTTP 宿主作为兼容适配器。

```text
React 工作台
    │
WorkbenchHostBridge
    ├── TauriWorkbenchHostBridge → Tauri commands → Rust application service → Rust Kernel
    └── BrowserWorkbenchHostBridge → Vite HTTP → Node host → Rust N-API（仅浏览器开发/合同回归）
```

## 当前实现进度

1. 浏览器和桌面入口共用 React 组件、合同与 `WorkbenchClient`。
2. Tauri bridge 覆盖创建、读取、编辑、撤销、重做、导入、导出和关闭工作区。
3. Rust application service 持有每个 workspace 的唯一 Kernel session、版本检查和有限幂等记录。
4. 原生打开、保存和另存为使用 Rust 文件对话框；保存采用同目录临时文件、同步和原子替换。
5. 未保存关闭确认和应用数据目录恢复文件已经接通。
6. 生产编译已能关闭 Vite HTTP 业务中间件并生成独立 release EXE；安装包动作已独立为显式 `desktop:package`，在功能闭环完成前不作为日常构建步骤。
7. CSP 与 capability 已做首轮收紧，仍需结合真实桌面流程复核。
8. 桌面工作区 ID 已改为跨窗口持久身份，并有前端存储测试和 Rust 跨 `AppState` 恢复测试，崩溃重启可以重新发现未保存文档。

## 当前边界

- `apps/desktop` 不拥有组件外观、主题、谱面排版或输入逻辑。
- `apps/workbench` 不直接读取文件系统、窗口对象或 Rust 私有实现。
- 浏览器下载式保存继续保留为开发适配器；桌面适配器提供真实路径覆盖保存。
- 开发占位图标只满足 Windows 资源编译，正式图标需要单独视觉审核。
- 六边形开场、粒子、WebGL 和其他装饰动画全部后置。

## 完成前仍需验证

- 通过真实桌面窗口逐项验证创建、编辑、撤销、重做、保存、关闭、重开与崩溃恢复；目前已有服务层物理文件闭环、跨进程状态恢复测试和 release EXE 启动烟雾测试。
- 核对 Browser host 与 Rust desktop host 的完整合同等价性，补齐失败路径和文件生命周期测试。
- 复核 UI 中每个实际编辑入口是否全部走 Tauri/Rust 路径，并检查未保存关闭、取消对话框和异常恢复。
- 功能闭环完成后，再在独立干净 Windows 环境执行安装、升级和卸载验收。
- 建立启动时间、长谱读取、编辑延迟和保存耗时基线。
- 优化 VexFlow 绘图分块与长谱虚拟化；当前构建存在约 722 kB 的绘图 chunk 警告。
- 正式发布前替换开发图标并完成签名、版本升级与发布渠道设计。
