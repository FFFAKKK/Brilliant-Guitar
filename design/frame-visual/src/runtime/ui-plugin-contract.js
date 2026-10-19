// Authoring adapter only: generate the existing v1 manifest from one contribution list.
import { captureConfig, isRecord } from "./runtime-support.js";
import { validateDefinition } from "./component-registry.js";
import { validateCommand } from "./command-router.js";
import { validateShortcut } from "./shortcut-router.js";
import { captureUiFacet, UI_FACET_VERSION } from "./plugin-facets.js";

export const UI_CONTRIBUTION_KINDS = Object.freeze(["panel", "slotItem", "view"]);
export const UI_PANEL_SLOTS = Object.freeze(["left", "right"]);
// Only legacy declarations carry presentation hints. New panels do not depend on them.
const LEGACY_KINDS = ["module", "page"];
export const MODULE_SPANS = Object.freeze(["full", "half"]);
const ROLE = Object.freeze({ panel: "tool", module: "tool", page: "inspector", slotItem: "status", view: "view" });
const COMMON = ["id", "kind", "title", "icon", "order", "slots", "defaultSlot", "permissions", "mount", "animations"];
const META = Object.freeze({ panel: ["defaultEnabled"], module: ["allowedSpans", "defaultSpan", "minHeight", "defaultEnabled"],
  page: ["footerHeight"], slotItem: ["minWidth", "priority"], view: [] });
const ID = /^[a-z][\w-]*(\.[a-z][\w-]*)*$/;
const finite = value => typeof value === "number" && Number.isFinite(value);

function unitDefinition(unit, namespace, index) {
  if (!isRecord(unit)) throw new Error(`ui[${index}]: UI 单元必须是对象`);
  if (![...UI_CONTRIBUTION_KINDS, ...LEGACY_KINDS].includes(unit.kind)) throw new Error(`${unit.id ?? `ui[${index}]`}: 未知 UI kind ${unit.kind}`);
  const allowed = new Set([...COMMON, ...META[unit.kind]]);
  const problems = Object.keys(unit).filter(key => !allowed.has(key)).map(key => `不支持字段 ${key}`);
  if (typeof unit.id !== "string" || !unit.id.startsWith(`${namespace}.`)) problems.push("id 不在插件命名空间下");
  if (unit.icon !== undefined && (typeof unit.icon !== "string" || !unit.icon.trim())) problems.push("icon 需要非空字符串");
  if (unit.order !== undefined && !finite(unit.order)) problems.push("order 需要有限数值");
  for (const key of ["minHeight", "footerHeight", "minWidth"]) {
    if (unit[key] !== undefined && (!finite(unit[key]) || unit[key] < 0)) problems.push(`${key} 需要非负有限数值`);
  }
  if (unit.priority !== undefined && !finite(unit.priority)) problems.push("priority 需要有限数值");
  if (unit.defaultEnabled !== undefined && typeof unit.defaultEnabled !== "boolean") problems.push("defaultEnabled 需要布尔值");
  let metadata = {};
  if (unit.kind === "panel") {
    if (Array.isArray(unit.slots) && unit.slots.some(slot => !UI_PANEL_SLOTS.includes(slot))) problems.push("panel 只能进入左右侧栏");
    metadata = { defaultEnabled: unit.defaultEnabled ?? false, defaultSlot: unit.defaultSlot ?? unit.slots?.[0] };
  } else if (unit.kind === "module") {
    const spans = unit.allowedSpans ?? MODULE_SPANS;
    const span = unit.defaultSpan ?? (Array.isArray(spans) ? spans[0] : undefined);
    if (!Array.isArray(spans) || !spans.length || spans.some(value => !MODULE_SPANS.includes(value)) || new Set(spans).size !== spans.length) problems.push("allowedSpans 需要非空且不重复的 full/half 数组");
    if (!Array.isArray(spans) || !spans.includes(span)) problems.push("defaultSpan 不在 allowedSpans 中");
    metadata = { allowedSpans: spans, defaultSpan: span, minHeight: unit.minHeight ?? 0, defaultEnabled: unit.defaultEnabled ?? false };
  } else if (unit.kind === "page") metadata = { footerHeight: unit.footerHeight ?? 0 };
  else if (unit.kind === "slotItem") metadata = { minWidth: unit.minWidth ?? 0, priority: unit.priority ?? 0 };
  const { kind, ...rest } = unit;
  const definition = { ...rest, ...metadata, role: ROLE[kind], uiKind: kind, order: unit.order ?? 0 };
  problems.push(...validateDefinition(definition));
  const commands = definition.permissions?.commands;
  if (Array.isArray(commands) && new Set(commands).size !== commands.length) problems.push("permissions.commands 不能重复");
  if (problems.length) throw new Error(`${unit.id ?? `ui[${index}]`}: ${problems.join("；")}`);
  return definition;
}

export function defineUiPlugin(raw) {
  const declaration = captureConfig(raw, "uiPlugin");
  if (!isRecord(declaration)) throw new Error("UI 插件声明必须是对象");
  if (typeof declaration.namespace !== "string" || !ID.test(declaration.namespace)) throw new Error("namespace 无效");
  const unknown = Object.keys(declaration).filter(key => !["namespace", "ui", "commands", "menuItems", "shortcuts"].includes(key));
  if (unknown.length) throw new Error(`UI 插件不支持字段 ${unknown.join(", ")}；请使用单份 ui 声明`);
  if (!Array.isArray(declaration.ui)) throw new Error("ui 必须是贡献数组");
  for (const key of ["commands", "menuItems", "shortcuts"]) if (declaration[key] !== undefined && !Array.isArray(declaration[key])) throw new Error(`${key} 必须是数组`);
  for (const command of declaration.commands ?? []) {
    const problems = validateCommand(command);
    if (typeof command?.id !== "string" || !command.id.startsWith(`${declaration.namespace}.`)) problems.push("id 不在插件命名空间下");
    if (problems.length) throw new Error(`${command?.id ?? "command"}: ${problems.join("；")}`);
  }
  for (const item of declaration.menuItems ?? []) if (!isRecord(item) || typeof item.menu !== "string" || typeof item.command !== "string") throw new Error("菜单贡献需要 menu 和 command 字符串");
  for (const shortcut of declaration.shortcuts ?? []) {
    const problems = validateShortcut(shortcut);
    if (typeof shortcut?.id !== "string" || !shortcut.id.startsWith(`${declaration.namespace}.`)) problems.push("快捷键 id 不在插件命名空间下");
    if (problems.length) throw new Error(`${shortcut?.id ?? "shortcut"}: ${problems.join("；")}`);
  }
  const components = declaration.ui.map((unit, index) => unitDefinition(unit, declaration.namespace, index));
  if (new Set(components.map(unit => unit.id)).size !== components.length) throw new Error("ui 包含重复 id");
  const surface = unit => ({ id: unit.id, componentId: unit.id, slots: unit.slots });
  // v1 historically puts stage views in pages. Preserve that wire shape; uiKind carries author meaning.
  const pages = components.filter(unit => unit.uiKind === "page" || unit.uiKind === "view");
  const modules = components.filter(unit => ["panel", "module", "slotItem"].includes(unit.uiKind));
  const manifest = captureConfig({ namespace: declaration.namespace, components,
    ...(declaration.commands === undefined ? {} : { commands: declaration.commands }),
    ...(declaration.menuItems === undefined ? {} : { menuItems: declaration.menuItems }),
    ...(declaration.shortcuts === undefined ? {} : { shortcuts: declaration.shortcuts }),
    facets: { ui: { contractVersion: UI_FACET_VERSION, modules: modules.map(surface), pages: pages.map(surface),
      slots: [...new Set(components.flatMap(unit => unit.slots))] } },
  });
  captureUiFacet(manifest);
  return manifest;
}
