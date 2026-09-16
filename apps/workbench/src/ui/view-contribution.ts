import type { ReactNode } from "react";
import type { UiComponentDefinition } from "./plugin-contract.ts";

/** React presentation supplied by a UI plugin, separate from its logical definition. */
export interface UiComponentViewContribution {
  readonly componentId: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly inlineZone?: "leading" | "trailing";
  render(): ReactNode;
}

export function indexUiComponentViews(definitions: readonly UiComponentDefinition[],
  contributions: readonly UiComponentViewContribution[]): ReadonlyMap<string, UiComponentViewContribution> {
  const installed = new Set(definitions.map((definition) => definition.id));
  const result = new Map<string, UiComponentViewContribution>();
  for (const contribution of contributions) {
    if (!installed.has(contribution.componentId)) throw new Error(`UI view has no installed definition: ${contribution.componentId}`);
    if (result.has(contribution.componentId)) throw new Error(`Duplicate UI view contribution: ${contribution.componentId}`);
    result.set(contribution.componentId, contribution);
  }
  return result;
}
