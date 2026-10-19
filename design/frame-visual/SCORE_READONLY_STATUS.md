# 历史：五线谱只读接入状态

本页记录 2026-10-05 的只读 fixture 切片。真实文档与基础编辑已在后续接通；
当前范围和验收状态以[主线整合状态](MAIN_INTEGRATION_STATUS.md)为准。

日期：2026-10-05

## 已完成

- `src/score/notation-model.js` 提供四小节只读五线谱快照，包含稳定的小节和事件 ID。
- `src/score/staff-layout.js` 提供无 DOM 的小节、事件和命中几何；窄宽度会自动扩展逻辑画布，避免小节越界。
- `src/score/vexflow-runtime.js` 和 `src/score/vexflow-staff-renderer.js` 复用本地 VexFlow 5.0.0 UMD 资产，生成 SVG 与同任务的事件几何。
- `src/score/core-score-view.js` 负责同步挂载、异步绘制、过期任务取消、局部错误／重试和释放。
- `src/fixtures/core-score-plugin.js` 以 `notation.core` 插件贡献唯一的 `stage` 中央 view。
- workspace runtime 通过 `ComponentHost` 挂载中央 view；四栏、侧栏开关、尺寸拖动和宿主唯一视口仍由 UI 宿主负责。
- runtime 入口不再把 `fixtures/approved-score.svg` 当作记谱回退；核心 view 未登记时只显示明确的未注册状态，避免静态旧图掩盖插件安装问题。该 SVG 仍仅供独立视觉稿使用。

## 验证

- 备份 UI 全部测试：347/347 通过。
- 新增回归覆盖：布局边界、中央 view 挂载、插件组件身份和 runtime dispose 释放。
- 新增源码均通过 `node --check`。
- 本地静态服务可返回 `runtime-preview.html`、VexFlow bundle 和谱面样式资源（HTTP 200）。

## 明确边界

当前是“真实 VexFlow 绘制后端 + 只读 fixture”的中央五线谱显示，不是完整吉他业务闭环。尚未接入真实文档会话、吉他领域投影、选择／输入、撤销重做、播放、文件、导出和六线谱。浏览器自动化渲染检查受当前环境权限审批超时限制，不能把本轮结果写成像素级浏览器验收通过。
