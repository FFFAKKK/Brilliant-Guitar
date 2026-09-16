import type { ScoreSessionRead } from "../contracts/score-session";

export type UiComponentKind = "view" | "tool" | "inspector" | "status";
export type UiComponentDomain = string;
export type UiSlot = "workspace" | "top" | "right" | "bottom" | "left" | "overlay";
export type UiPresentation = "inline" | "panel" | "popover" | "dialog";

export interface UiComponentCapabilities {
  readonly movable?: boolean;
  readonly resizable?: boolean;
  readonly dockable?: boolean;
  readonly acceptsKeyboardInput?: boolean;
  readonly providesSelection?: boolean;
  readonly rendersPreview?: boolean;
  readonly mutatesDocument?: boolean;
  readonly selectionAware?: boolean;
}

export interface UiComponentPermissions {
  readonly reads: readonly string[];
  readonly commands: readonly string[];
}

export interface UiCommand {
  readonly type: string;
  readonly payload?: unknown;
}

export interface UiCommandDispatcher {
  dispatch(command: UiCommand): Promise<void>;
}

export interface UiLayoutContext {
  readonly slot: UiSlot;
  readonly presentation: UiPresentation;
  readonly size: Readonly<{ width: number; height: number }>;
  readonly setSize?: (size: Readonly<{ width: number; height: number }>) => void;
}

export interface UiComponentContext {
  readonly componentId: string;
  readonly session: ScoreSessionRead | null;
  readonly selection: Readonly<{ eventId?: string; count: number }>;
  readonly input: Readonly<{ enabled: boolean; durationBase: number; durationDots: number }>;
  readonly layout: UiLayoutContext;
  readonly commands: UiCommandDispatcher;
}

export interface UiComponentInstance {
  update(context: UiComponentContext): void;
  dispose(): void;
}

export interface UiComponentDefinition {
  readonly id: string;
  readonly version: string;
  readonly kind: UiComponentKind;
  /** Extensible dotted namespace, for example notation.editing or playback.transport. */
  readonly domain: UiComponentDomain;
  readonly slots: readonly UiSlot[];
  readonly presentation: Readonly<{
    allowed: readonly UiPresentation[];
    default: UiPresentation;
  }>;
  readonly capabilities: UiComponentCapabilities;
  readonly permissions: UiComponentPermissions;
  readonly mount: (context: UiComponentContext) => UiComponentInstance;
}

export function isUiComponentDefinition(value: unknown): value is UiComponentDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UiComponentDefinition>;
  if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.version !== "string") return false;
  if (candidate.kind !== "view" && candidate.kind !== "tool" && candidate.kind !== "inspector" && candidate.kind !== "status") return false;
  if (typeof candidate.domain !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(candidate.domain)) return false;
  if (!Array.isArray(candidate.slots) || candidate.slots.length === 0
    || candidate.slots.some((slot) => !["workspace", "top", "right", "bottom", "left", "overlay"].includes(slot))) return false;
  const presentation = candidate.presentation;
  if (typeof presentation !== "object" || presentation === null || !Array.isArray(presentation.allowed)
    || presentation.allowed.length === 0 || !presentation.allowed.includes(presentation.default)
    || presentation.allowed.some((item) => !["inline", "panel", "popover", "dialog"].includes(item))) return false;
  const permissions = candidate.permissions;
  if (typeof permissions !== "object" || permissions === null || !Array.isArray(permissions.reads)
    || !permissions.reads.every((item) => typeof item === "string")
    || !Array.isArray(permissions.commands) || !permissions.commands.every((item) => typeof item === "string")) return false;
  const capabilities = candidate.capabilities;
  if (typeof capabilities !== "object" || capabilities === null
    || Object.values(capabilities).some((enabled) => typeof enabled !== "boolean")) return false;
  return typeof candidate.mount === "function";
}
