# 实施计划：F11 范围选择与剪贴编辑

1. 建立范围端点、连续事件解析和键盘扩展的纯函数，并覆盖边界与失效端点。
2. 建立严格的 `ScoreClipboardFragmentV1`、会话内存剪贴板和浏览器 Clipboard adapter，并测试非法内容与权限失败回退。
3. 扩展 `ScoreEditIntent` / `ScoreEditAction` 请求合同，加入范围删除和片段粘贴。
4. 在 `score-session.ts` 把范围删除适配到 `core.range.delete`，把粘贴适配到单个 `core.transaction.batch`。
5. 将 `use-score-input.ts` 和 `use-note-overview.ts` 接入选择、剪贴、键盘和队列提交；保持单事件改、删、输入行为。
6. 在 `staff-view.tsx` 通过独立 SVG overlay 渲染范围带，并接入 Shift 点击。
7. 更新快捷键帮助、F09/F11 交付文档和相关测试。

## 验证

```powershell
npm --prefix apps/workbench run typecheck
npm --prefix apps/workbench test
npm --prefix apps/workbench run build
```

浏览器手测：鼠标与键盘选区、Esc、复制、剪切、粘贴、撤销/重做、剪贴板权限回退、超拍警告、缩放对齐。
