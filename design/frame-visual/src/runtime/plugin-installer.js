import { capturePluginFacets, UI_FACET_ID } from "./plugin-facets.js";
import { createUiPluginHost } from "./ui-plugin-host.js";
import { captureConfig, createDisposalScope, notifyObservers, rollback } from "./runtime-support.js";
import { validateManifest, preflightGeneric, installContributions } from "./ui-contribution-installation.js";

/** Generic fixed-session platform. Facet hosts own concrete runtime behavior. */
export function createPluginPlatform(runtime) {
  const facetHosts = runtime.facetHosts ?? {
    [UI_FACET_ID]: runtime.uiHost ?? createUiPluginHost({ components: runtime.components }),
  };
  const registered = [];
  const records = new Map();
  const listeners = new Set();
  let phase = "configuring";

  function register(raw) {
    if (phase !== "configuring") throw new Error("插件平台已经启动或正在释放，不能注册新插件");
    const manifest = captureConfig(raw, "plugin");
    const shapeProblems = validateManifest(manifest);
    if (shapeProblems.length) throw new Error(`插件 ${manifest?.namespace ?? "unknown"} 注册失败：\n${shapeProblems.join("\n")}`);
    const facets = capturePluginFacets(manifest);
    const problems = preflightGeneric({ ...runtime, facetHosts }, manifest, registered);
    problems.push(...(facetHosts[UI_FACET_ID]?.preflight(manifest, facets[UI_FACET_ID]) ?? []));
    if (problems.length) throw new Error(`插件 ${manifest.namespace} 注册失败：\n${problems.join("\n")}`);
    const entry = Object.freeze({ namespace: manifest.namespace, commands: manifest.commands ?? Object.freeze([]), manifest, facets });
    registered.push(entry);
    records.set(manifest.namespace, { namespace: manifest.namespace, status: "registered", active: false, manifest });
    notifyObservers(listeners);
    return entry;
  }

  function start() {
    if (phase === "running") return snapshot();
    if (phase !== "configuring") throw new Error("插件平台正在释放");
    phase = "running";
    for (const entry of registered) {
      try {
        const dispose = installContributions({ ...runtime, facetHosts }, entry.manifest, entry.facets);
        records.set(entry.manifest.namespace, { namespace: entry.manifest.namespace, status: "active", active: true, dispose, manifest: entry.manifest });
        notifyObservers(listeners);
      } catch (error) {
        const record = { namespace: entry.manifest.namespace, status: "failed", active: false, error, manifest: entry.manifest };
        records.set(entry.manifest.namespace, record);
        notifyObservers(listeners);
        try { runtime.onFailure?.(error, entry.manifest); }
        catch (reportingError) { record.reportingError = reportingError; }
      }
    }
    return snapshot();
  }

  function snapshot() {
    return Object.freeze([...records.values()].map(({ dispose, manifest, ...record }) => Object.freeze(record)));
  }

  function describe() {
    return Object.freeze([...records.values()].map(({ dispose, ...record }) => Object.freeze(record)));
  }

  function dispose() {
    if (phase === "disposing") return;
    phase = "disposing";
    const scope = createDisposalScope();
    for (const record of records.values()) if (record.dispose) scope.add(record.dispose);
    records.clear();
    registered.length = 0;
    notifyObservers(listeners);
    try { scope.dispose(); } finally { phase = "configuring"; }
  }

  return Object.freeze({
    register,
    start,
    dispose,
    phase: () => phase,
    list: snapshot,
    describe,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("插件平台订阅者必须是函数");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    facets: (facetId = undefined) => Object.freeze(registered
      .filter((entry) => records.get(entry.manifest.namespace)?.active)
      .flatMap((entry) => Object.values(entry.facets).filter((facet) => facetId === undefined || facet.facetId === facetId)
        .map((facet) => Object.freeze({ facetId: facet.facetId, contractVersion: facet.contractVersion,
          pluginId: entry.manifest.namespace, value: facet })))),
  });
}

// Compatibility adapter for the original one-call installer API.
export function installPlugin(runtime, manifest) {
  const platform = createPluginPlatform(runtime);
  platform.register(manifest);
  const failure = platform.start().find(record => !record.active);
  if (failure) {
    const scope = createDisposalScope();
    scope.add(() => platform.dispose());
    rollback(scope, failure.error);
  }
  return () => platform.dispose();
}
