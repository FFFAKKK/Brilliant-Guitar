export const INSPECTOR_WIDTH = {
  min: 240,
  default: 288,
  wide: 360,
  max: 420,
  workspaceMinimum: 480,
} as const;

export function clampInspectorWidth(width: number, viewportWidth: number): number {
  const available = Math.min(INSPECTOR_WIDTH.max, Math.max(INSPECTOR_WIDTH.min, viewportWidth - INSPECTOR_WIDTH.workspaceMinimum));
  return Math.min(available, Math.max(INSPECTOR_WIDTH.min, Math.round(width)));
}

export function nextInspectorWidth(width: number, viewportWidth: number): number {
  const presets = [INSPECTOR_WIDTH.min, INSPECTOR_WIDTH.default, INSPECTOR_WIDTH.wide]
    .map((value) => clampInspectorWidth(value, viewportWidth))
    .filter((value, index, values) => values.indexOf(value) === index);
  return presets.find((value) => value > width + 8) ?? presets[0]!;
}
