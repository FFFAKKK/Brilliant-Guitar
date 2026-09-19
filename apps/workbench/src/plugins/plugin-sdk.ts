import type { ReactNode } from "react";
import { createPluginKernelAssemblyPlanV1 } from "./plugin-package-contract.ts";
import type {
  PluginKernelModuleManifestV1,
  PluginTier,
} from "./plugin-package-contract.ts";

export type {
  PluginKernelAssemblyEntryV1,
  PluginKernelAssemblyPlanV1,
  PluginKernelModuleManifestV1,
  PluginKernelModuleRuntime,
  PluginTier,
} from "./plugin-package-contract.ts";
export { PLUGIN_PACKAGE_V1_LIMITS } from "./plugin-package-contract.ts";

/** `user` means configurable before process launch; it never means runtime hot activation. */
export type PluginActivation = "always" | "user";
export type PluginCommandScope = "global" | "score";
export type PluginComponentKind = "view" | "tool" | "inspector" | "status";
export type PluginSlot = "workspace" | "top" | "right" | "bottom" | "left" | "overlay";
export type PluginPresentation = "inline" | "panel" | "popover" | "dialog";
export type PluginInlineDockZone = "leading" | "center" | "trailing";
export type PluginNotationKind = "staff" | "tablature" | "numbered";
export type PluginInputFocusScope = "global" | "score" | "component" | "field";
export type PluginInputTargetKind = "unavailable" | "caret" | "event" | "range";
export type PluginInputCapability = "locate" | "navigate" | "compose" | "insert" | "update" | "delete" | "paste" | "history";
export type PluginInputModifier = "shift" | "ctrl" | "meta" | "alt";
export type PluginPlaybackOutputKind = "builtin-synth" | "sample-bank" | "midi-out";

/** Read-only instrument capability metadata. Musical facts still come from the kernel projection. */
export interface PluginInstrumentContribution {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly notationKinds: readonly PluginNotationKind[];
  readonly noteControlExtensionIds?: readonly string[];
  readonly playbackProfileId?: string;
}

export interface PluginPlaybackEvent {
  readonly midi: number | null;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

/** Stable playback boundary. Output plugins never receive score or kernel data structures. */
export interface PluginPlaybackEngine {
  activate(): Promise<void>;
  now(): number;
  start(events: readonly PluginPlaybackEvent[], offsetSeconds: number): void;
  stop(): void;
}

export interface PluginPlaybackOutputContribution {
  readonly id: string;
  readonly kind: PluginPlaybackOutputKind;
  readonly label: string;
  createEngine(): PluginPlaybackEngine;
}

export interface PluginInputContext {
  readonly focusScope: PluginInputFocusScope;
  readonly target: PluginInputTargetKind;
  readonly notationKind: PluginNotationKind | "unknown";
  readonly capabilities: readonly PluginInputCapability[];
  readonly composing: boolean;
}

export interface PluginKeyPressSignal {
  readonly kind: "key-press";
  readonly key: string;
  readonly modifiers: readonly PluginInputModifier[];
  readonly repeat: boolean;
}

export type PluginInputSignal =
  | { readonly kind: "pointer-locate"; readonly position: unknown; readonly writeNow: boolean }
  | { readonly kind: "pointer-select"; readonly target: unknown; readonly extend: boolean }
  | PluginKeyPressSignal
  | { readonly kind: "control-change"; readonly control: string; readonly value: unknown }
  | { readonly kind: "navigate"; readonly direction: "left" | "right" | "up" | "down" }
  | { readonly kind: "jump"; readonly edge: "measure-start" | "measure-end" | "score-start" | "score-end" }
  | { readonly kind: "external-note"; readonly pitch: unknown; readonly velocity?: number };

export type PluginEditIntent<Event = unknown, Properties = unknown> =
  | { readonly kind: "insert-event"; readonly event: Event }
  | { readonly kind: "update-event"; readonly eventId: string; readonly properties: Properties }
  | { readonly kind: "delete-event"; readonly eventId: string };

export type PluginInputAdapterOutput<Draft = unknown, Intent = PluginEditIntent> =
  | { readonly kind: "ignored"; readonly handled?: boolean }
  | { readonly kind: "compose"; readonly methodId: string; readonly draft: Draft; readonly message?: string }
  | { readonly kind: "cancel-composition"; readonly message?: string }
  | { readonly kind: "intent"; readonly intent: Intent };

export interface PluginInputAdapter<Context extends PluginInputContext = PluginInputContext, Draft = unknown,
  Intent = PluginEditIntent> {
  readonly id: string;
  canHandle(signal: PluginInputSignal, context: Context): boolean;
  translate(signal: PluginInputSignal, context: Context): PluginInputAdapterOutput<Draft, Intent> | null;
}

export interface PluginNotationInteractionContribution<Input extends PluginInputContext = PluginInputContext,
  Draft = unknown, Intent = PluginEditIntent, NavigationContext = unknown, NavigationResult = unknown,
  EditContext = unknown, EditResult = unknown> {
  readonly id: string;
  readonly notationKind: PluginNotationKind;
  readonly input: PluginInputAdapter<Input, Draft, Intent>;
  readDraft(composition: unknown): Draft | null;
  startComposition(draft: Draft): Readonly<{ methodId: string; draft: Draft }>;
  navigate(signal: PluginKeyPressSignal, context: NavigationContext): NavigationResult | null;
  edit(signal: PluginKeyPressSignal, context: EditContext): EditResult | null;
}

export interface PluginProjection<T> {
  readonly id: string;
  /** Compile-time carrier only; projection values are supplied by the host. */
  readonly __value?: T;
}

export interface PluginProjectionReader {
  get<T>(projection: PluginProjection<T>): T;
}

export function definePluginProjection<T>(id: string): PluginProjection<T> {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)) throw new Error(`Invalid plugin projection ID: ${id}`);
  return Object.freeze({ id });
}

export interface PluginCommand {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly shortcutLabel?: string;
  readonly scope: PluginCommandScope;
  readonly enabled: boolean;
  readonly run: () => void | Promise<void>;
}

export interface PluginCommandContribution {
  readonly id: string;
  create(projections: PluginProjectionReader, host: PluginRuntimeHost): PluginCommand;
}

export interface PluginComponentDefinition {
  readonly id: string;
  readonly version: string;
  readonly kind: PluginComponentKind;
  readonly domain: string;
  readonly slots: readonly PluginSlot[];
  readonly presentation: Readonly<{
    allowed: readonly PluginPresentation[];
    default: PluginPresentation;
  }>;
  readonly capabilities: Readonly<{
    movable?: boolean;
    resizable?: boolean;
    dockable?: boolean;
    acceptsKeyboardInput?: boolean;
    providesSelection?: boolean;
    rendersPreview?: boolean;
    mutatesDocument?: boolean;
    selectionAware?: boolean;
  }>;
  readonly permissions: Readonly<{
    projections: readonly string[];
    commands: readonly string[];
  }>;
  readonly extensionPoints?: readonly string[];
}

export interface PluginResolvedComponentExtension {
  readonly id: string;
  readonly order: number;
  render(): ReactNode;
}

export interface PluginSettingsHost {
  read<T = unknown>(): T;
  write<T = unknown>(value: unknown): Promise<T>;
  reset<T = unknown>(): Promise<T>;
}

export interface PluginRuntimeHost {
  /** Present only when this plugin declared a settings contribution. */
  readonly settings: PluginSettingsHost | null;
}

export interface PluginViewHost extends PluginRuntimeHost {
  extensions(extensionPoint: string): readonly PluginResolvedComponentExtension[];
}

export interface PluginViewContribution {
  readonly definition: PluginComponentDefinition;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly inlineZone?: PluginInlineDockZone;
  render(projections: PluginProjectionReader, host: PluginViewHost): ReactNode;
}

export interface PluginComponentExtensionContribution {
  readonly id: string;
  readonly extensionPoint: string;
  readonly order?: number;
  render(projections: PluginProjectionReader, host?: PluginRuntimeHost): ReactNode;
}

export interface PluginSettingsContribution<T = unknown> {
  readonly schemaVersion: number;
  readonly defaults: T;
  /** Returns a normalized value, or null when the stored value is incompatible. */
  parse(value: unknown): T | null;
}

export const NOTE_CONTROL_EXTENSION_POINT = "notation.note-input.controls";

export type NoteControlExtensionContribution = Omit<PluginComponentExtensionContribution, "extensionPoint">;

export function defineNoteControlExtension(
  contribution: NoteControlExtensionContribution,
): PluginComponentExtensionContribution {
  return Object.freeze({ ...contribution, extensionPoint: NOTE_CONTROL_EXTENSION_POINT });
}

const packageBrand: unique symbol = Symbol("brilliant-guitar.ui-plugin-package");

export interface UiPluginPackage {
  readonly [packageBrand]: true;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tier: PluginTier;
  readonly activation: PluginActivation;
  readonly kernelModules: readonly PluginKernelModuleManifestV1[];
  readonly capabilities: readonly string[];
  readonly projections: readonly PluginProjection<unknown>[];
  readonly commands: readonly PluginCommandContribution[];
  readonly views: readonly PluginViewContribution[];
  readonly interactions: readonly PluginNotationInteractionContribution<any, any, any, any, any, any, any>[];
  readonly componentExtensions: readonly PluginComponentExtensionContribution[];
  readonly instruments: readonly PluginInstrumentContribution[];
  readonly playbackOutputs: readonly PluginPlaybackOutputContribution[];
  readonly settings?: PluginSettingsContribution<unknown>;
}

/** Unified package name. UiPluginPackage remains as a compatibility surface for existing components. */
export type PluginPackage = UiPluginPackage;

export interface DefinePluginInput {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tier?: PluginTier;
  readonly activation?: PluginActivation;
  readonly kernelModules?: readonly PluginKernelModuleManifestV1[];
  readonly capabilities?: readonly string[];
  readonly projections?: readonly PluginProjection<unknown>[];
  readonly commands?: readonly PluginCommandContribution[];
  readonly views?: readonly PluginViewContribution[];
  readonly interactions?: readonly PluginNotationInteractionContribution<any, any, any, any, any, any, any>[];
  readonly componentExtensions?: readonly PluginComponentExtensionContribution[];
  readonly instruments?: readonly PluginInstrumentContribution[];
  readonly playbackOutputs?: readonly PluginPlaybackOutputContribution[];
  readonly settings?: PluginSettingsContribution<unknown>;
}

function immutableList<T>(value: readonly T[] | undefined): readonly T[] {
  return Object.freeze([...(value ?? [])]);
}

/** Stable authoring entry point. Internal host contracts are produced by the platform adapter. */
export function definePlugin(input: DefinePluginInput): UiPluginPackage {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(input.id)) throw new Error(`Invalid plugin ID: ${input.id}`);
  if (!input.name.trim()) throw new Error("Plugin name is required");
  if (!/^\d+\.\d+\.\d+$/.test(input.version)) throw new Error(`Invalid plugin version: ${input.version}`);
  if (input.settings && (!Number.isSafeInteger(input.settings.schemaVersion) || input.settings.schemaVersion < 1)) {
    throw new Error(`Invalid plugin settings schema version: ${input.id}`);
  }
  if (input.settings) {
    try {
      if (input.settings.parse(input.settings.defaults) === null) {
        throw new Error(`Invalid plugin settings defaults: ${input.id}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid plugin settings defaults:")) throw error;
      throw new Error(`Invalid plugin settings defaults: ${input.id}`, { cause: error });
    }
  }
  const activation = input.activation ?? "always";
  const tier = input.tier ?? "product";
  const kernelModules = Object.freeze((input.kernelModules ?? []).map((module) => Object.freeze({ ...module })));
  createPluginKernelAssemblyPlanV1([{
    id: input.id,
    version: input.version,
    activation,
    tier,
    kernelModules,
  }]);
  return Object.freeze({
    [packageBrand]: true as const,
    id: input.id,
    name: input.name,
    version: input.version,
    tier,
    activation,
    kernelModules,
    capabilities: immutableList(input.capabilities),
    projections: immutableList(input.projections),
    commands: immutableList(input.commands),
    views: immutableList(input.views),
    interactions: immutableList(input.interactions),
    componentExtensions: immutableList(input.componentExtensions),
    instruments: immutableList(input.instruments),
    playbackOutputs: immutableList(input.playbackOutputs),
    ...(input.settings ? { settings: Object.freeze({ ...input.settings }) } : {}),
  });
}

export function isUiPluginPackage(value: unknown): value is UiPluginPackage {
  return typeof value === "object" && value !== null && (value as Partial<UiPluginPackage>)[packageBrand] === true;
}

export const isPluginPackage = isUiPluginPackage;
