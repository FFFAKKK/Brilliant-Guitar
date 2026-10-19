import { UiPluginHost } from "../ui/plugin-manager.ts";
import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import type { PluginContributionHost, PluginContributionHostContext } from "./plugin-platform.ts";
import type { UiProjectionSnapshot } from "../ui/projection-registry.ts";

/** Reuses the business validator/interaction directory; only mount execution is supplied by the application. */
export function createMountContributionHost(context: PluginContributionHostContext,
  installMount: (plugin: InternalUiPluginModule) => (() => void)): PluginContributionHost {
  const business = new UiPluginHost(context.features, context.projections, context.reportDiagnostic);
  const releases: (() => void)[] = [];
  let disposed = false;
  return Object.freeze({
    components: business.components, interactions: business.interactions, projections: business.projections,
    install(plugin: InternalUiPluginModule) {
      if (disposed) throw new Error("Contribution host is disposed");
      if (plugin.manifest.apiVersion !== "4.0") throw new Error("Mount contribution host requires plugin API 4.0");
      if (plugin.commands.length || plugin.views.length || plugin.componentExtensions.length) {
        throw new Error("Mount contribution host cannot execute React contributions");
      }
      // Internal business-only fragment for the existing validator. No render -> mount conversion.
      const { ui: _facet, ...contributes } = plugin.manifest.contributes;
      const { ui: _implementation, ...module } = plugin;
      const businessModule: InternalUiPluginModule = { ...module,
        manifest: { ...plugin.manifest, apiVersion: "3.0", contributes } };
      const release = installMount(plugin);
      try { business.install(businessModule); }
      catch (error) {
        try { release(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Mount installation rollback failed"); }
        throw error;
      }
      releases.push(release);
    },
    resolveCommands: (snapshot: UiProjectionSnapshot, included: ReadonlySet<string>) => business.resolveCommands(snapshot, included),
    resolveViews: (snapshot: UiProjectionSnapshot, included: ReadonlySet<string>) => business.resolveViews(snapshot, included),
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      for (const release of releases.splice(0).reverse()) {
        try { release(); } catch (error) { errors.push(error); }
      }
      try { business.dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, "Contribution host disposal failed");
    },
  });
}
