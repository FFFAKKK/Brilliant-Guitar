// Data-only facet contracts. The generic platform owns these records; facet
// hosts own the runtime objects (DOM, commands, layout, and services).
import { isRecord } from "./runtime-support.js";
import { ROLES, validateDefinition } from "./component-registry.js";
export const UI_FACET_ID = "ui";
export const UI_FACET_VERSION = 1;
export const UI_SLOTS = Object.freeze(["stage", "top", "left", "right", "bottom", "overlay"]);

const ID = /^[a-z][\w-]*(\.[a-z][\w-]*)+$/;
const freeze = (value) => Object.freeze(value);

function surface(component, kind) {
  return freeze({ id: component.id, componentId: component.id, kind, slots: freeze([...component.slots]), role: component.role });
}

function validateSurface(item, manifest) {
  const problems = [];
  if (typeof item.id !== "string" || !ID.test(item.id) || !item.id.startsWith(`${manifest.namespace}.`)) problems.push(`${item.id}: UI facet 表面不在插件命名空间下`);
  if (typeof item.componentId !== "string" || !ID.test(item.componentId)) problems.push(`${item.id}: 缺少合法 componentId`);
  if (item.kind !== "module" && item.kind !== "page") problems.push(`${item.id}: 未知 UI facet 类型`);
  if (!Array.isArray(item.slots) || !item.slots.length || item.slots.some((slot) => !UI_SLOTS.includes(slot)) || new Set(item.slots).size !== item.slots.length) problems.push(`${item.id}: 包含未知或重复 UI 槽位`);
  return problems;
}

function explicitSurfaces(raw, kind) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => freeze({ id: item.id, componentId: item.componentId ?? item.id, kind, slots: freeze([...(item.slots ?? [])]), ...(item.role === undefined ? {} : { role: item.role }) }));
}

/** Captures the UI facet without retaining mount functions or layout state. */
export function captureUiFacet(manifest) {
  if (!isRecord(manifest)) throw new Error("插件声明必须是对象");
  const raw = manifest.facets?.ui;
  const components = Array.isArray(manifest.components) ? manifest.components : [];
  const problems = [];
  if (manifest.components !== undefined && !Array.isArray(manifest.components)) problems.push("components 必须是数组");
  for (const component of components) problems.push(...validateDefinition(component));
  if (manifest.facets !== undefined && !isRecord(manifest.facets)) problems.push("facets 必须是对象");
  if (raw !== undefined && !isRecord(raw)) problems.push("UI facet 必须是对象");
  if (isRecord(raw)) {
    if (![raw.modules, raw.pages, raw.slots].every(Array.isArray)) problems.push("UI facet 的 modules/pages/slots 必须是数组");
    if (raw.contractVersion !== UI_FACET_VERSION) problems.push(`UI facet contractVersion 必须为 ${UI_FACET_VERSION}`);
    for (const item of [...(Array.isArray(raw.modules) ? raw.modules : []), ...(Array.isArray(raw.pages) ? raw.pages : [])]) {
      if (!isRecord(item) || !Array.isArray(item.slots)) problems.push("UI facet 表面需要对象和 slots 数组");
    }
  }
  if (problems.length) throw new Error(`插件 ${manifest.namespace} UI facet 无效：\n${problems.join("\n")}`);
  const modules = raw ? explicitSurfaces(raw.modules, "module") : components.filter((component) => component.role !== "view").map((component) => surface(component, "module"));
  const pages = raw ? explicitSurfaces(raw.pages, "page") : components.filter((component) => component.role === "view").map((component) => surface(component, "page"));
  const slots = freeze([...(raw?.slots ?? UI_SLOTS)]);
  if (new Set(slots).size !== slots.length || slots.some((slot) => !UI_SLOTS.includes(slot))) problems.push("UI facet 声明了未知或重复槽位");
  const seen = new Set();
  for (const item of [...modules, ...pages]) {
    problems.push(...validateSurface(item, manifest));
    if (seen.has(item.id)) problems.push(`${item.id}: UI facet 表面重复`);
    seen.add(item.id);
    const component = components.find((candidate) => candidate.id === item.componentId);
    if (!component) problems.push(`${item.id}: 未找到对应组件 ${item.componentId}`);
    else if (!ROLES.includes(component.role)) problems.push(`${item.id}: 对应组件职责无效`);
    else if (item.role !== undefined && item.role !== component.role) problems.push(`${item.id}: UI facet 职责与组件不一致`);
    if (item.slots.some(slot => !slots.includes(slot))) problems.push(`${item.id}: 表面槽位超出 UI facet 槽位`);
  }
  if (problems.length) throw new Error(`插件 ${manifest.namespace} UI facet 无效：\n${problems.join("\n")}`);
  return freeze({ facetId: UI_FACET_ID, contractVersion: UI_FACET_VERSION, modules: freeze(modules), pages: freeze(pages), slots });
}

export function capturePluginFacets(manifest) {
  return freeze({ [UI_FACET_ID]: captureUiFacet(manifest) });
}
