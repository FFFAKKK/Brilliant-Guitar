import { capturedArrayValues, capturedStrings, exactDataRecord } from "../ui/plugin-manifest.ts";
import { captureAnimationContribution, captureAnimationPermissions } from "../../../../shared/ui-animation/contract.js";
import type { AnimationContribution, AnimationContributionInput, AnimationIntent, ComponentAnimationPort } from "../../../../shared/ui-animation/contract.js";
import type { NotationInteractionDirectory } from "../../../../shared/notation/interaction/notation-interaction-registry.ts";

/** Public DOM mount facet. No React values, layout state, platform or kernel handles. */
export interface PluginMountRuntimeHost {
  readonly settings?: Readonly<{ read<T = unknown>(): T }>;
}
export interface PluginMountContext extends PluginMountRuntimeHost {
  /** Optional application-provided read facade, limited to this package's declared interactions. */
  readonly notationInteractions?: NotationInteractionDirectory;
  execute(commandId: string, payload?: unknown): unknown;
  notify(text: string, level?: "info" | "warning" | "error"): unknown;
  onDispose(callback: () => void): () => void;
  confirm?: (request: unknown) => unknown;
  readonly motion?: ComponentAnimationPort;
}
export interface PluginMountInstance {
  dispose?(): void;
  setVariant?(variant: string): void;
  setVisible?(visible: boolean): void;
  handleKeyDown?(event: KeyboardEvent): boolean | void;
}
export interface PluginMountComponent {
  readonly id: string;
  readonly title: string;
  readonly role: "view" | "tool" | "inspector" | "status";
  readonly uiKind?: "panel" | "slotItem" | "view" | "module" | "page";
  readonly slots: readonly ("stage" | "top" | "left" | "right" | "bottom")[];
  readonly defaultSlot?: string;
  readonly icon?: string;
  readonly order?: number;
  readonly permissions?: Readonly<{ commands?: readonly string[]; animations?: readonly AnimationIntent[] }>;
  readonly animations?: AnimationContribution;
  readonly defaultEnabled?: boolean;
  readonly allowedSpans?: readonly ("full" | "half")[];
  readonly defaultSpan?: "full" | "half";
  readonly minHeight?: number;
  readonly footerHeight?: number;
  readonly minWidth?: number;
  readonly priority?: number;
  mount(element: HTMLElement, context: PluginMountContext, presentation: Readonly<{ variant: string }>): PluginMountInstance | void;
}
export interface PluginMountCommand {
  readonly id: string;
  readonly label?: string;
  readonly keys?: readonly string[];
  enabled?(): boolean;
  checked?: (() => boolean) | null;
  run(payload: unknown, host: PluginMountRuntimeHost): unknown;
}
export interface PluginMountMenuItem {
  readonly id: string;
  readonly menu: string;
  readonly command: string;
  readonly label?: string;
  readonly group?: number;
  readonly order?: number;
}
export interface PluginMountShortcut {
  readonly id: string;
  readonly command: string;
  readonly keys: readonly string[];
  readonly scope?: "global" | "component" | "score";
  readonly componentId?: string;
}
export interface PluginMountUiFacet {
  readonly contractVersion: 1;
  readonly components: readonly PluginMountComponent[];
  readonly commands: readonly PluginMountCommand[];
  readonly menuItems: readonly PluginMountMenuItem[];
  readonly shortcuts: readonly PluginMountShortcut[];
}
type NullableOptional<T> = { readonly [K in keyof T]: {} extends Pick<T, K> ? T[K] | null : T[K] };
export type PluginMountComponentInput = Omit<NullableOptional<PluginMountComponent>, "permissions" | "animations"> & {
  readonly permissions?: Readonly<{ commands?: readonly string[] | null; animations?: readonly AnimationIntent[] | null }> | null;
  readonly animations?: AnimationContributionInput | null;
};
export interface PluginMountUiInput {
  readonly contractVersion: 1;
  readonly components?: readonly PluginMountComponentInput[] | null;
  readonly commands?: readonly NullableOptional<PluginMountCommand>[] | null;
  readonly menuItems?: readonly NullableOptional<PluginMountMenuItem>[] | null;
  readonly shortcuts?: readonly NullableOptional<PluginMountShortcut>[] | null;
}

const idPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function fail(): never { throw new Error("Invalid mount UI facet v1"); }
function text(value: unknown): value is string { return typeof value === "string" && !!value.trim() && value.length <= 128; }
function ownId(value: unknown, pluginId: string): value is string {
  return typeof value === "string" && idPattern.test(value) && value.startsWith(`${pluginId}.`);
}
function list<T>(value: unknown, capture: (value: unknown) => T): readonly T[] {
  const values = capturedArrayValues(value);
  if (!values) fail();
  return Object.freeze(values.map(capture));
}
function uniqueIds(values: readonly { readonly id: string }[]): void {
  if (new Set(values.map(item => item.id)).size !== values.length) fail();
}
function optionalFields(value: Record<string, unknown> | null, optional: readonly string[]): Record<string, unknown> {
  if (!value) fail();
  return Object.fromEntries(Object.entries(value).filter(([key, field]) => !optional.includes(key) || field != null));
}

/** Capture executable references only in the module boundary; never put them in manifest discovery data. */
export function capturePluginMountUi(value: unknown, pluginId: string): PluginMountUiFacet {
  const facet = exactDataRecord(value, ["contractVersion"], ["components", "commands", "menuItems", "shortcuts"]);
  if (facet?.contractVersion !== 1) fail();
  const components = list(facet.components ?? [], value => {
    const optional = ["uiKind", "defaultSlot", "icon", "order", "permissions", "defaultEnabled", "allowedSpans", "defaultSpan",
      "minHeight", "footerHeight", "minWidth", "priority", "animations"];
    const unit = optionalFields(exactDataRecord(value, ["id", "title", "role", "slots", "mount"], optional), optional);
    if (!unit || !ownId(unit.id, pluginId) || !text(unit.title) || typeof unit.mount !== "function"
      || typeof unit.role !== "string" || !["view", "tool", "inspector", "status"].includes(unit.role)) fail();
    const slots = capturedStrings(unit.slots);
    if (!slots?.length || slots.some(slot => !["stage", "top", "left", "right", "bottom"].includes(slot))
      || (unit.role === "view" ? slots.some(slot => slot !== "stage") : slots.includes("stage"))) fail();
    if (unit.defaultSlot !== undefined && (typeof unit.defaultSlot !== "string" || !slots.includes(unit.defaultSlot))) fail();
    if (unit.uiKind !== undefined && (typeof unit.uiKind !== "string" || !["panel", "slotItem", "view", "module", "page"].includes(unit.uiKind))) fail();
    if (unit.uiKind === "view" && unit.role !== "view") fail();
    if (unit.uiKind === "panel" && slots.some(slot => slot !== "left" && slot !== "right")) fail();
    if (unit.icon !== undefined && !text(unit.icon)) fail();
    if (unit.defaultEnabled !== undefined && typeof unit.defaultEnabled !== "boolean") fail();
    for (const key of ["order", "priority", "minHeight", "footerHeight", "minWidth"]) {
      if (unit[key] !== undefined && (!finite(unit[key]) || (key.startsWith("min") || key === "footerHeight") && unit[key] < 0)) fail();
    }
    let permissions: PluginMountComponent["permissions"];
    if (unit.permissions !== undefined) {
      const record = exactDataRecord(unit.permissions, [], ["commands", "animations"]);
      if (!record) fail();
      const commands = record.commands == null ? Object.freeze([]) : capturedStrings(record.commands);
      if (!commands || commands.some(id => !idPattern.test(id))) fail();
      permissions = Object.freeze({ commands, animations: captureAnimationPermissions(record.animations) });
    }
    const animations = unit.animations === undefined ? undefined : captureAnimationContribution(unit.animations);
    if (Object.keys(animations?.definitions ?? {}).some(intent => !permissions?.animations?.includes(intent as AnimationIntent))) fail();
    const spans = unit.allowedSpans === undefined ? undefined : capturedStrings(unit.allowedSpans);
    if (spans === null || spans?.some(span => span !== "full" && span !== "half") || spans?.length === 0
      || unit.defaultSpan !== undefined && (unit.defaultSpan !== "full" && unit.defaultSpan !== "half"
        || spans !== undefined && !spans.includes(unit.defaultSpan))) fail();
    return Object.freeze({ ...unit, slots, ...(permissions === undefined ? {} : { permissions }), ...(animations === undefined ? {} : { animations }),
      ...(spans === undefined ? {} : { allowedSpans: spans }) }) as unknown as PluginMountComponent;
  });
  const commands = list(facet.commands ?? [], value => {
    const optional = ["label", "keys", "enabled", "checked"];
    const command = optionalFields(exactDataRecord(value, ["id", "run"], optional), optional);
    if (!command || !ownId(command.id, pluginId) || typeof command.run !== "function"
      || command.label !== undefined && !text(command.label)
      || command.enabled !== undefined && typeof command.enabled !== "function"
      || command.checked != null && typeof command.checked !== "function") fail();
    const keys = command.keys === undefined ? undefined : capturedStrings(command.keys);
    if (keys === null) fail();
    return Object.freeze({ ...command, ...(keys === undefined ? {} : { keys }) }) as unknown as PluginMountCommand;
  });
  const menuItems = list(facet.menuItems ?? [], value => {
    const optional = ["label", "group", "order"];
    const item = optionalFields(exactDataRecord(value, ["id", "menu", "command"], optional), optional);
    if (!item || !ownId(item.id, pluginId) || !text(item.menu) || !text(item.command)
      || item.label !== undefined && !text(item.label)
      || item.group !== undefined && !finite(item.group) || item.order !== undefined && !finite(item.order)) fail();
    return Object.freeze(item) as unknown as PluginMountMenuItem;
  });
  const shortcuts = list(facet.shortcuts ?? [], value => {
    const optional = ["scope", "componentId"];
    const binding = optionalFields(exactDataRecord(value, ["id", "command", "keys"], optional), optional);
    const keys = capturedStrings(binding?.keys);
    const scope = binding?.scope ?? "global";
    if (!binding || !ownId(binding.id, pluginId) || !text(binding.command) || !keys
      || typeof scope !== "string" || !["global", "component", "score"].includes(scope)
      || (scope === "global" ? binding.componentId !== undefined : !ownId(binding.componentId, pluginId))) fail();
    return Object.freeze({ ...binding, keys }) as unknown as PluginMountShortcut;
  });
  for (const values of [components, commands, menuItems, shortcuts]) uniqueIds(values);
  return Object.freeze({ contractVersion: 1, components, commands, menuItems, shortcuts });
}

export function mountUiManifest(facet: PluginMountUiFacet) {
  return Object.freeze({ contractVersion: 1 as const,
    components: Object.freeze(facet.components.map(item => item.id)), commands: Object.freeze(facet.commands.map(item => item.id)),
    menus: Object.freeze(facet.menuItems.map(item => item.id)), shortcuts: Object.freeze(facet.shortcuts.map(item => item.id)) });
}
