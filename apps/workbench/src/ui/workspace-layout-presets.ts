import type { WorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";

export type WorkspaceLayoutPresetId = "complete" | "editing" | "playback";

export const WORKSPACE_LAYOUT_PRESETS: readonly Readonly<{
  id: WorkspaceLayoutPresetId;
  label: string;
  description: string;
}>[] = [
  { id: "complete", label: "完整", description: "显示四个停靠区，保留全部工作台入口。" },
  { id: "editing", label: "编辑", description: "保留顶部工具和左侧音符控制，扩大谱面阅读空间。" },
  { id: "playback", label: "播放", description: "保留顶部播放工具和右侧输出，隐藏编辑侧栏。" },
];

const VISIBILITY: Readonly<Record<WorkspaceLayoutPresetId, WorkspaceConfigurationV1["dock"]["visibility"]>> = {
  complete: { top: true, right: true, bottom: true, left: true },
  editing: { top: true, right: false, bottom: false, left: true },
  playback: { top: true, right: true, bottom: false, left: false },
};

function sameVisibility(left: WorkspaceConfigurationV1["dock"]["visibility"],
  right: WorkspaceConfigurationV1["dock"]["visibility"]): boolean {
  return left.top === right.top && left.right === right.right
    && left.bottom === right.bottom && left.left === right.left;
}

export function identifyWorkspaceLayoutPreset(configuration: WorkspaceConfigurationV1): WorkspaceLayoutPresetId | "custom" {
  return WORKSPACE_LAYOUT_PRESETS.find((preset) => sameVisibility(configuration.dock.visibility, VISIBILITY[preset.id]))?.id
    ?? "custom";
}

/** Presets change the visible work zones while preserving plugin placements, sizes and unrelated configuration. */
export function applyWorkspaceLayoutPreset(configuration: WorkspaceConfigurationV1,
  preset: WorkspaceLayoutPresetId): WorkspaceConfigurationV1 {
  const selection = preset === "editing"
    ? { ...configuration.dock.selection, left: "notation.note-input" }
    : preset === "playback"
      ? { ...configuration.dock.selection, right: "playback.output" }
      : configuration.dock.selection;
  return {
    ...configuration,
    dock: { ...configuration.dock, visibility: VISIBILITY[preset], selection },
  };
}
