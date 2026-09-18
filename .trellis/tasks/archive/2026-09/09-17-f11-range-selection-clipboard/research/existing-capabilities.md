# 已有能力审计

- `src/core-kernel/commands/range-selection.ts` 已能解析 `voice-event-range`，并验证端点、声部归属与连续顺序。
- `src/core-kernel/commands/range-command-adapters.ts` 已注册 `core.range.delete`；`core.transaction.batch` 可原子提交最多 100 个子命令。
- `apps/workbench/host/score-session.ts` 已负责把编辑请求转换为 Core 命令并返回新的谱面投影。
- `apps/workbench/src/editor/use-note-overview.ts` 已拥有单事件选择和导航；F11 在其上添加范围状态，不能破坏现有选中事件直接编辑。
- `apps/workbench/src/components/staff-view.tsx` 已有 SVG interaction overlay，`NotationInteractionGeometry.events` 提供事件边界，可用于范围带。
- 当前 `note-input` 合同没有范围删除或粘贴动作，需要在 Workbench 内部合同与 Host 层扩展。
