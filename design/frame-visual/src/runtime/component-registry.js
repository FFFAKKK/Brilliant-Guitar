// Registers component definitions. A definition declares what it is and where it may go; it has no layout state.
import { captureConfig, isRecord, notifyObservers } from "./runtime-support.js";
import { captureAnimationContribution, captureAnimationPermissions } from "../contracts/animation.js";
export const ROLES = Object.freeze(["view", "tool", "inspector", "status"]);
export const SLOTS = Object.freeze(["stage", "top", "left", "right", "bottom"]);

export function validateDefinition(definition) {
  if (!isRecord(definition)) return ["组件声明必须是对象"];
  const problems = [];
  if (typeof definition.id !== "string" || !/^[a-z][\w-]*(\.[a-z][\w-]*)+$/.test(definition.id)) problems.push("id 需要点分命名空间");
  if (typeof definition.title !== "string" || !definition.title.trim()) problems.push("缺少 title");
  if (!ROLES.includes(definition.role)) problems.push(`未知职责 ${definition.role}`);
  if (!Array.isArray(definition.slots) || !definition.slots.length) problems.push("至少声明一个合法位置");
  else {
    if (definition.slots.some((slot) => !SLOTS.includes(slot))) problems.push("存在未知位置");
    if (new Set(definition.slots).size !== definition.slots.length) problems.push("位置重复");
    if (definition.role === "view" && definition.slots.some((slot) => slot !== "stage")) problems.push("view 只能进入中央工作区");
    if (definition.role !== "view" && definition.slots.includes("stage")) problems.push("只有 view 可以进入中央工作区");
    if (definition.defaultSlot != null && !definition.slots.includes(definition.defaultSlot)) problems.push("默认位置不在合法位置中");
  }
  if (definition.permissions !== undefined) {
    if (!isRecord(definition.permissions)) problems.push("permissions 必须是对象");
    else if (definition.permissions.commands !== undefined && (!Array.isArray(definition.permissions.commands) || definition.permissions.commands.some(id => typeof id !== "string"))) problems.push("permissions.commands 必须是命令 id 数组");
  }
  try {
    const animations = captureAnimationContribution(definition.animations);
    const allowed = captureAnimationPermissions(definition.permissions?.animations);
    if (Object.keys(animations.definitions).some(intent => !allowed.includes(intent))) problems.push("动画贡献超过组件权限");
  } catch (error) { problems.push(error.message); }
  if (typeof definition.mount !== "function") problems.push("缺少 mount");
  return problems;
}

export function createComponentRegistry({ onObserverError } = {}) {
  const definitions = new Map();
  const listeners = new Set();
  return {
    register(owner, raw) {
      const definition = captureConfig(raw, "component");
      const problems = validateDefinition(definition);
      if (definitions.has(definition?.id)) problems.push(`已由 ${definitions.get(definition.id).owner} 注册`);
      if (problems.length) throw new Error(`${definition?.id ?? "component"}: ${problems.join("；")}`);
      const entry = Object.freeze({ ...definition, owner });
      definitions.set(entry.id, entry);
      notifyObservers(listeners, onObserverError);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (definitions.get(entry.id) !== entry) return;
        definitions.delete(entry.id);
        notifyObservers(listeners, onObserverError);
      };
    },
    list: () => [...definitions.values()],
    get: (id) => definitions.get(id) ?? null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
