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
  render(projections: UiProjectionReader): ReactNode;
}

/** A render-ready contribution scoped to one projection snapshot. */
export interface UiResolvedViewContribution {
  readonly componentId: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly inlineZone?: InlineDockZone;
  render(): ReactNode;
}
