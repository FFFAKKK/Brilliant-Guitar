# 四向侧栏承载层闪现修复

日期：2026-10-09。范围为备份视觉框架的 `runtime-preview.html`，针对侧栏展开时“黑色背景先瞬间展开、内容随后才进入”的视觉跳变。

## Before / After / Why

| Before | After | Why |
| --- | --- | --- |
| `.v-left`、`.v-right`、`.v-top`、`.v-footer` 作为网格承载层带有不透明 `--frame-canvas` 背景。业务布局先把承载槽位扩到最终尺寸，动画表面还在 `opacity: 0`，因此用户先看到一块黑色矩形。 | 工作区运行时四向承载层改为透明；实际侧栏表面继续拥有自己的面板/横带背景，并由原有动画服务和 aperture clip 控制显现。 | 承载层不再提前绘制最终区域，动画只显示相关表面，避免“为什么背景先跳出来”的疑问，也不增加第二套动画执行器。 |

## 实测

当前预览版本：`ee09d05a6a55d7253ea9`。

- 左侧栏展开起始帧：`.v-left` 背景为 `rgba(0,0,0,0)`，`clip-path` 为 `inset(0px 230px 0px 0px)`；实际 `.v-left-surface` 的 `opacity` 为 `0`、位移为 `-24px`。
- 展开中途：承载层仍透明，面板表面按既有 300ms 轨道进入，没有黑色整块抢先绘制。
- 展开后再收起：原生动画归零，承载层 clip 清空，侧栏回到 hidden 状态。
- 取样全程谱面矩形保持 `x=95.10,y=174,w=487,h=688.75`，页面尺寸保持 `907×956`，没有滚动溢出。
- 同一 CSS 规则同时覆盖左右侧栏和上下横带，四向背景承载行为统一。

## 验证

- `npm.cmd test -- --test-name-pattern=...` 实际执行完整测试包：870 passed，0 failed。
- `node scripts/build-desktop.mjs`：21 个桌面资产生成。
- `node scripts/build-desktop.mjs --check`：21 个桌面资产校验通过。
- 证据：`evidence/sidebar-carrier-flash-20261009/mid-opening.json`、`mid-opening.jpg`、`open-complete.json`、`close-complete.json`、`final.jpg`。

本轮只修改运行时样式和对应 CSS 回归断言；没有修改 Rust/Tauri、真实产品废案、快捷键模块或外部插件接口。
