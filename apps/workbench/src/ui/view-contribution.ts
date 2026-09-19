import type { ReactNode } from "react";
import type { UiComponentDefinition } from "./plugin-contract.ts";
import type { UiProjectionReader } from "./projection-registry.ts";
import type { InlineDockZone } from "./shared-dock-selection.ts";

/** A plugin-owned React adapter and its visual-neutral layout definition. */
export interface UiComponentViewContribution {
  readonly definition: UiComponentDefinition;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly inlineZone?: InlineDockZone;
  render(projections: UiProjectionReader, host: UiViewHostContext): ReactNode;
}

/** Plugin-owned content rendered inside a component-owned extension point. */
export interface UiComponentExtensionContribution {
  readonly id: string;
  readonly extensionPoint: string;
  readonly order?: number;
  render(projections: UiProjectionReader): ReactNode;
}

export interface UiResolvedComponentExtension {
  readonly id: string;
  readonly order: number;
  render(): ReactNode;
}

export interface UiViewHostContext {
  extensions(extensionPoint: string): readonly UiResolvedComponentExtension[];
}

/** A render-ready contribution scoped to one projection snapshot. */
export interface UiResolvedViewContribution {
  readonly componentId: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly inlineZone?: InlineDockZone;
  render(): ReactNode;
}
