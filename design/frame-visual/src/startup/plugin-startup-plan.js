import { captureConfig, isRecord } from "../runtime/runtime-support.js";

const ID = /^[a-z][\w-]*(\.[a-z][\w-]*)*$/;
const own = (object, key) => Object.hasOwn(object, key);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function keys(value, allowed, label) {
  assert(isRecord(value), `${label} 必须是对象`);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `${label} 含未知字段 ${key}`);
}

export function validateSetting(field, value) {
  if (field.type === "number") {
    assert(typeof value === "number" && Number.isSafeInteger(value) && value >= field.min && value <= field.max,
      `${field.label}：请输入 ${field.min}–${field.max} 的整数`);
  } else {
    assert(field.options.some(option => option[0] === value), `${field.label}：请选择有效选项`);
  }
  return value;
}

/** Application-owned data only. No manifest hooks cross into management UI. */
export function definePluginDirectory(raw) {
  assert(Array.isArray(raw) && raw.length > 0, "插件目录必须是非空数组");
  const entries = raw.map(item => {
    keys(item, ["id", "name", "icon", "summary", "builtin", "required", "reason", "enabled", "source", "contributions", "dependencies", "fields"], "插件目录项");
    for (const key of ["id", "name", "icon", "summary", "source"]) assert(typeof item[key] === "string" && item[key].trim(), `目录 ${key} 需要非空字符串`);
    assert(ID.test(item.id), "目录插件 id 无效");
    for (const key of ["builtin", "required", "enabled"]) assert(typeof item[key] === "boolean", `${item.id}.${key} 必须是布尔值`);
    assert(!item.required || (item.enabled && typeof item.reason === "string" && item.reason.trim()), `${item.id} 必需策略需要启用默认值与原因`);
    assert(Array.isArray(item.dependencies) && item.dependencies.every(id => typeof id === "string" && ID.test(id)), `${item.id} 依赖必须是插件 id 数组`);
    assert(new Set(item.dependencies).size === item.dependencies.length, `${item.id} 依赖不能重复`);
    assert(Array.isArray(item.contributions), `${item.id} 贡献必须是数组`);
    for (const contribution of item.contributions) {
      keys(contribution, ["icon", "label"], "贡献");
      assert([contribution.icon, contribution.label].every(value => typeof value === "string" && value.trim()), "贡献需要图标与名称");
    }
    assert(Array.isArray(item.fields), `${item.id} 参数定义必须是数组`);
    assert(new Set(item.fields.map(field => field.key)).size === item.fields.length, `${item.id} 参数不能重复`);
    for (const field of item.fields) {
      keys(field, ["key", "label", "type", "initial", "min", "max", "options"], "参数定义");
      assert(typeof field.key === "string" && ID.test(field.key) && typeof field.label === "string" && field.label.trim(), "参数需要有效 key 和名称");
      assert(["number", "select"].includes(field.type), "不支持的参数类型");
      if (field.type === "number") assert(Number.isSafeInteger(field.min) && Number.isSafeInteger(field.max) && field.min <= field.max, "参数范围无效");
      else assert(Array.isArray(field.options) && field.options.length > 0 && field.options.every(option => Array.isArray(option)
        && option.length === 2 && option.every(value => typeof value === "string" && value.trim()))
        && new Set(field.options.map(option => option[0])).size === field.options.length, "参数选项无效");
      validateSetting(field, field.initial);
    }
    return item;
  });
  const byId = new Map(entries.map(item => [item.id, item]));
  assert(byId.size === entries.length, "插件目录 id 不能重复");
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    assert(byId.has(id), `目录依赖缺失：${id}`);
    assert(!visiting.has(id), `目录依赖循环：${id}`);
    if (visited.has(id)) return;
    visiting.add(id); byId.get(id).dependencies.forEach(visit); visiting.delete(id); visited.add(id);
  }
  entries.forEach(item => visit(item.id));
  const directory = captureConfig(entries);
  function dataOnly(value) {
    assert(typeof value !== "function" && typeof value !== "undefined", "目录投影只能包含数据");
    if (value && typeof value === "object") Object.values(value).forEach(dataOnly);
  }
  dataOnly(directory);
  validateStartupPlan(directory, { format: 1, revision: 0, plugins: {} });
  return directory;
}

/** Missing known entries/settings adopt application defaults; unknown data is never silently discarded. */
export function validatePluginSettings(item, raw) {
  assert(isRecord(raw), `${item.id}.settings 必须是对象`);
  for (const key of Object.keys(raw)) assert(item.fields.some(field => field.key === key), `${item.id} 含未知参数 ${key}`);
  return captureConfig(Object.fromEntries(item.fields.map(field => [field.key,
    validateSetting(field, own(raw, field.key) ? raw[field.key] : field.initial)])));
}

export function validateStartupPlan(directory, raw) {
  keys(raw, ["format", "revision", "plugins"], "启动计划");
  assert(raw.format === 1, "不支持的启动计划格式");
  assert(Number.isSafeInteger(raw.revision) && raw.revision >= 0, "启动计划 revision 无效");
  assert(isRecord(raw.plugins), "启动计划 plugins 必须是对象");
  const known = new Set(directory.map(item => item.id));
  for (const id of Object.keys(raw.plugins)) assert(known.has(id), `启动计划含未知插件 ${id}`);
  const plugins = Object.fromEntries(directory.map(item => {
    const entry = own(raw.plugins, item.id) ? raw.plugins[item.id] : { enabled: item.enabled, settings: {} };
    keys(entry, ["enabled", "settings"], item.id);
    assert(typeof entry.enabled === "boolean", `${item.id}.enabled 必须是布尔值`);
    assert(!item.required || entry.enabled, `${item.name} 为必需插件，不能停用`);
    const settings = validatePluginSettings(item, entry.settings);
    return [item.id, { enabled: entry.enabled, settings }];
  }));
  for (const item of directory) if (plugins[item.id].enabled) {
    for (const id of item.dependencies) assert(plugins[id].enabled, `${item.name} 需要启用 ${directory.find(entry => entry.id === id).name}`);
  }
  return captureConfig({ format: 1, revision: raw.revision, plugins });
}

export const defaultStartupPlan = directory => validateStartupPlan(directory, { format: 1, revision: 0, plugins: {} });
export function readStartupPlan(directory, store) {
  if (!store || typeof store.read !== "function") throw new TypeError("启动配置需要 read() 存储端口");
  const raw = store.read();
  if (raw && typeof raw.then === "function") {
    // A mismatched port may already have dispatched IO. Observe its rejection,
    // but never consume an asynchronous result in the synchronous path.
    void Promise.resolve(raw).catch(() => undefined);
    throw new Error("同步 read() 不能返回 Promise；请使用 async 模式");
  }
  return raw === null ? defaultStartupPlan(directory) : validateStartupPlan(directory, raw);
}

export async function readStartupPlanAsync(directory, store) {
  if (!store || typeof store.read !== "function") throw new TypeError("启动配置需要 read() 存储端口");
  const raw = await store.read();
  return raw === null ? defaultStartupPlan(directory) : validateStartupPlan(directory, raw);
}
