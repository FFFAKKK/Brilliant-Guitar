import type { AnyUiProjection } from "./projection-registry.ts";
import { UiProjectionRegistry } from "./projection-registry.ts";
import { UiPluginHost } from "./plugin-manager.ts";
import type { WorkbenchFeatureRegistry } from "../plugins/plugin-manifest.ts";
import type { PluginContributionHost, PluginContributionHostContext } from "../plugins/plugin-platform.ts";

/** Compatibility composition for the original hostFeatures/projections/factory entry point. */
export function createLegacyContributionHost(options: {
  readonly hostFeatures: WorkbenchFeatureRegistry;
  readonly projections: readonly AnyUiProjection[];
  readonly createContributionHost?: (context: PluginContributionHostContext) => PluginContributionHost;
}, services: Pick<PluginContributionHostContext, "reportDiagnostic" | "settings">): PluginContributionHost {
  const projections = new UiProjectionRegistry(options.projections);
  return options.createContributionHost?.({ features: options.hostFeatures, projections, ...services })
    ?? new UiPluginHost(options.hostFeatures, projections, services.reportDiagnostic);
}
