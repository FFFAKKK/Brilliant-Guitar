// UI facet host. It owns component definitions and delegates mounting to the
// component host. It deliberately has no layout store, focus controller or
// transient overlay API.
import { validateDefinition } from "./component-registry.js";
import { createDisposalScope, rollback } from "./runtime-support.js";

export function createUiPluginHost({ components }) {
  function preflight(manifest, facet) {
    const problems = [];
    const surfaces = [...facet.modules, ...facet.pages];
    const surfaceByComponent = new Map(surfaces.map((surface) => [surface.componentId, surface]));
    if (surfaceByComponent.size !== surfaces.length) problems.push("同一组件不能重复绑定 UI 表面");
    const seen = new Set();
    for (const definition of manifest.components ?? []) {
      problems.push(...validateDefinition(definition).map((problem) => `${definition.id}: ${problem}`));
      if (seen.has(definition.id)) problems.push(`${definition.id}: 组件重复`);
      seen.add(definition.id);
      const existing = components.get(definition.id);
      if (existing) problems.push(`${definition.id}: 已由 ${existing.owner} 注册`);
      const surface = surfaceByComponent.get(definition.id);
      if (!surface) problems.push(`${definition.id}: 未在 UI facet 中声明`);
      else if (!surface.slots.every((slot) => definition.slots.includes(slot))) problems.push(`${definition.id}: UI facet 槽位超出组件声明`);
    }
    if (surfaceByComponent.size !== (manifest.components ?? []).length) problems.push("UI facet 包含未绑定到组件定义的表面");
    return problems;
  }

  function install(manifest, facet) {
    const problems = preflight(manifest, facet);
    if (problems.length) throw new Error(`插件 ${manifest.namespace} UI host 安装失败：\n${problems.join("\n")}`);
    const scope = createDisposalScope();
    try {
      for (const definition of manifest.components ?? []) scope.add(components.register(manifest.namespace, definition));
      return () => scope.dispose();
    } catch (error) { rollback(scope, error); }
  }

  return Object.freeze({ install, preflight });
}
