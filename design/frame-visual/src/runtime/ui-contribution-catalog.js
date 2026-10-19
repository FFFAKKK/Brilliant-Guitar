// A query over existing owners, not another registry. Descriptors contain data only.
import { captureConfig, isRecord } from "./runtime-support.js";
import { UI_SLOTS } from "./plugin-facets.js";
import { UI_CONTRIBUTION_KINDS } from "./ui-plugin-contract.js";

const finite = value => typeof value === "number" && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0 ? value : 0;
export const contributionKind = definition => definition.role === "view" ? "view"
  : definition.uiKind === "slotItem" || definition.role === "status" ? "slotItem" : "panel";
function metadata(kind, definition, surface) {
  if (kind === "panel") return { defaultEnabled: typeof definition.defaultEnabled === "boolean" ? definition.defaultEnabled
    : surface.kind === "page" || definition.defaultSlot != null };
  if (kind === "slotItem") return { minWidth: nonnegative(definition.minWidth), priority: finite(definition.priority) ? definition.priority : 0 };
  return {};
}

export function createUiContributionCatalog({ platform, components }) {
  function list(query = {}) {
    if (!isRecord(query)) throw new TypeError("贡献查询必须是对象");
    if (query.kind !== undefined && !UI_CONTRIBUTION_KINDS.includes(query.kind)) throw new Error(`未知 UI kind ${query.kind}`);
    if (query.slot !== undefined && !UI_SLOTS.includes(query.slot)) throw new Error(`未知 UI slot ${query.slot}`);
    const entries = platform.facets("ui").flatMap(({ pluginId, value }) => [...value.modules, ...value.pages].flatMap(surface => {
      const definition = components.get(surface.componentId);
      if (!definition || definition.owner !== pluginId) return [];
      // Content stays content regardless of position. Preserve legacy top/bottom slots too;
      // the sidebar composition consumes only the subset allowed in left/right regions.
      const kind = contributionKind(definition);
      if ((query.kind !== undefined && kind !== query.kind) || (query.slot !== undefined && !surface.slots.includes(query.slot))) return [];
      return [captureConfig({ id: surface.id, componentId: definition.id, pluginId, kind, title: definition.title,
        ...(typeof definition.icon === "string" ? { icon: definition.icon } : {}),
        order: finite(definition.order) ? definition.order : 0, slots: surface.slots,
        defaultSlot: surface.slots.includes(definition.defaultSlot) ? definition.defaultSlot : surface.slots[0],
        ...metadata(kind, definition, surface),
      })];
    }));
    entries.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Object.freeze(entries);
  }
  return Object.freeze({ list, get: id => list().find(entry => entry.id === id) ?? null });
}
