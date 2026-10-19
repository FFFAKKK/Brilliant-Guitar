import { UI_FACET_ID } from "./plugin-facets.js";
import { validateDefinition } from "./component-registry.js";
import { validateCommand } from "./command-router.js";
import { declaredShortcuts, validateShortcut } from "./shortcut-router.js";
import { createDisposalScope, isRecord, rollback } from "./runtime-support.js";

const ID = /^[a-z][\w-]*(\.[a-z][\w-]*)*$/;
const inNamespace = (id, namespace) => typeof id === "string" && ID.test(id) && id.startsWith(`${namespace}.`);

export function validateManifest(manifest) {
  if (!isRecord(manifest)) return ["插件声明必须是对象"];
  const problems = [];
  if (typeof manifest.namespace !== "string" || !ID.test(manifest.namespace)) problems.push("namespace 需要点分命名空间");
  for (const key of ["commands", "components", "menuItems", "shortcuts"]) {
    if (manifest[key] !== undefined && !Array.isArray(manifest[key])) problems.push(`${key} 必须是数组`);
  }
  if (problems.length) return problems;
  for (const command of manifest.commands ?? []) problems.push(...validateCommand(command).map(problem => `${command?.id ?? "command"}: ${problem}`));
  for (const shortcut of manifest.shortcuts ?? []) problems.push(...validateShortcut(shortcut).map(problem => `${shortcut?.id ?? "shortcut"}: ${problem}`));
  for (const definition of manifest.components ?? []) problems.push(...validateDefinition(definition).map(problem => `${definition?.id ?? "component"}: ${problem}`));
  for (const item of manifest.menuItems ?? []) {
    if (!isRecord(item) || typeof item.menu !== "string" || typeof item.command !== "string") problems.push("菜单贡献需要 menu 和 command 字符串");
  }
  return problems;
}

export function preflightGeneric(runtime, manifest, registered) {
  const { router, menus } = runtime;
  const problems = [];
  if (registered.some((item) => item.namespace === manifest.namespace)) problems.push("插件 namespace 已注册");
  const ownCommands = new Set((manifest.commands ?? []).map((command) => command.id));
  const pendingCommands = registered.flatMap(item => item.manifest.commands ?? []);
  const pendingComponents = registered.flatMap(item => item.manifest.components ?? []);
  const known = id => ownCommands.has(id) || router.describe(id) || pendingCommands.some(command => command.id === id);
  const commands = new Set(), components = new Set();
  for (const command of manifest.commands ?? []) {
    if (!inNamespace(command.id, manifest.namespace)) problems.push(`${command.id}: 不在插件命名空间下`);
    if (commands.has(command.id) || router.describe(command.id) || pendingCommands.some(candidate => candidate.id === command.id)) problems.push(`${command.id}: 已被注册或重复声明`);
    commands.add(command.id);
  }
  for (const definition of manifest.components ?? []) {
    if (!inNamespace(definition.id, manifest.namespace)) problems.push(`${definition.id}: 不在插件命名空间下`);
    if (components.has(definition.id) || pendingComponents.some(candidate => candidate.id === definition.id)) problems.push(`${definition.id}: 组件已被登记或重复声明`);
    components.add(definition.id);
    for (const id of definition.permissions?.commands ?? []) {
      if (!known(id)) problems.push(`${definition.id}: 权限引用了不存在的命令 ${id}`);
    }
  }
  for (const item of manifest.menuItems ?? []) {
    if (!known(item.command)) problems.push(`菜单项引用了不存在的命令 ${item.command}`);
    const menuKnown = menus.has ? menus.has(item.menu) : menus.resolve().some((menu) => menu.id === item.menu);
    if (!menuKnown) problems.push(`菜单项引用了不存在的菜单 ${item.menu}`);
  }
  const bindings = declaredShortcuts(manifest);
  const pendingBindings = registered.flatMap(item => declaredShortcuts(item.manifest).map(binding => ({ owner: item.namespace, binding })));
  problems.push(...router.shortcuts.preflight(manifest.namespace, bindings, pendingBindings));
  for (const binding of manifest.shortcuts ?? []) {
    if (!inNamespace(binding.id, manifest.namespace)) problems.push(`${binding.id}: 快捷键 id 不在插件命名空间下`);
    if (!known(binding.command)) problems.push(`${binding.id}: 快捷键引用了不存在的命令 ${binding.command}`);
    if ((binding.scope ?? "global") !== "global") {
      const definition = (manifest.components ?? []).find(item => item.id === binding.componentId);
      if (!definition || !inNamespace(binding.componentId, manifest.namespace)) problems.push(`${binding.id}: 局部快捷键必须绑定本插件组件`);
      else {
        if (!(definition.permissions?.commands ?? []).includes(binding.command)) problems.push(`${binding.id}: 组件缺少命令权限 ${binding.command}`);
        if (binding.scope === "score" && definition.role !== "view") problems.push(`${binding.id}: score 快捷键需要 view 组件`);
      }
    }
  }
  return problems;
}

export function installContributions(runtime, manifest, facets) {
  const { router, menus } = runtime;
  const uiHost = runtime.facetHosts[UI_FACET_ID];
  const scope = createDisposalScope();
  try {
    if (!uiHost) throw new Error("缺少 UI facet host");
    // Repeat against live registrations: earlier plugins may have failed or owners changed.
    const problems = preflightGeneric(runtime, manifest, []);
    if (problems.length) throw new Error(`插件 ${manifest.namespace} 安装失败：\n${problems.join("\n")}`);
    scope.add(uiHost.install(manifest, facets[UI_FACET_ID]));
    for (const command of manifest.commands ?? []) scope.add(router.register(manifest.namespace, command));
    for (const binding of manifest.shortcuts ?? []) scope.add(router.shortcuts.register(manifest.namespace, binding));
    for (const item of manifest.menuItems ?? []) scope.add(menus.contribute(manifest.namespace, item));
    return () => scope.dispose();
  } catch (error) { rollback(scope, error); }
}
