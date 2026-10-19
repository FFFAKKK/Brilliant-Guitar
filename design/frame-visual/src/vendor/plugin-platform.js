// Generated from the formal plugin platform and SDK. Run npm run startup:build; do not edit.

// ../../apps/workbench/src/ui/plugin-contract.ts
function isUiComponentDefinition(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.version !== "string") return false;
  if (candidate.kind !== "view" && candidate.kind !== "tool" && candidate.kind !== "inspector" && candidate.kind !== "status") return false;
  if (typeof candidate.domain !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(candidate.domain)) return false;
  if (!Array.isArray(candidate.slots) || candidate.slots.length === 0 || candidate.slots.some((slot) => !["workspace", "top", "right", "bottom", "left", "overlay"].includes(slot))) return false;
  const presentation = candidate.presentation;
  if (typeof presentation !== "object" || presentation === null || !Array.isArray(presentation.allowed) || presentation.allowed.length === 0 || !presentation.allowed.includes(presentation.default) || presentation.allowed.some((item) => !["inline", "panel", "popover", "dialog"].includes(item))) return false;
  const permissions = candidate.permissions;
  if (typeof permissions !== "object" || permissions === null || !Array.isArray(permissions.projections) || !permissions.projections.every((item) => typeof item === "string") || !Array.isArray(permissions.commands) || !permissions.commands.every((item) => typeof item === "string")) return false;
  const capabilities = candidate.capabilities;
  if (typeof capabilities !== "object" || capabilities === null || Object.values(capabilities).some((enabled) => typeof enabled !== "boolean")) return false;
  if (candidate.extensionPoints !== void 0 && (!Array.isArray(candidate.extensionPoints) || candidate.extensionPoints.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(item)) || new Set(candidate.extensionPoints).size !== candidate.extensionPoints.length)) return false;
  return true;
}

// ../../apps/workbench/src/plugins/plugin-package-contract.ts
var PLUGIN_PACKAGE_V1_LIMITS = Object.freeze({ kernelModules: 62 });
var dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
var semanticVersion = /^\d+\.\d+\.\d+$/;
function isPluginTier(value) {
  return value === "system" || value === "product" || value === "third-party";
}
function isPluginKernelModuleManifestV1(value) {
  if (typeof value !== "object" || value === null) return false;
  const module = value;
  return typeof module.moduleId === "string" && dottedId.test(module.moduleId) && module.apiVersion === 1 && (module.runtime === "internal-module" || module.runtime === "wasm") && module.activation === "session-fixed";
}
function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function createPluginKernelAssemblyPlanV1(packages) {
  const packageIds = /* @__PURE__ */ new Set();
  const moduleOwners = /* @__PURE__ */ new Map();
  const modules = [];
  for (const plugin of packages) {
    const tier = plugin.tier ?? "product";
    const contributions = plugin.kernelModules ?? [];
    if (!dottedId.test(plugin.id) || !semanticVersion.test(plugin.version) || !isPluginTier(tier)) {
      throw new Error(`Invalid plugin package identity: ${plugin.id}`);
    }
    if (packageIds.has(plugin.id)) throw new Error(`Plugin package already registered: ${plugin.id}`);
    packageIds.add(plugin.id);
    if (tier === "system" && plugin.activation !== "always") {
      throw new Error(`System plugin must always be active: ${plugin.id}`);
    }
    for (const contribution of contributions) {
      if (!isPluginKernelModuleManifestV1(contribution)) {
        throw new Error(`Invalid kernel module manifest: ${plugin.id}`);
      }
      if (tier === "third-party" && contribution.runtime !== "wasm") {
        throw new Error(`Third-party kernel module must use Wasm: ${contribution.moduleId}`);
      }
      const owner = moduleOwners.get(contribution.moduleId);
      if (owner !== void 0) {
        throw new Error(`Kernel module already owned: ${contribution.moduleId} (${owner})`);
      }
      moduleOwners.set(contribution.moduleId, plugin.id);
      modules.push(Object.freeze({
        pluginId: plugin.id,
        pluginVersion: plugin.version,
        tier,
        moduleId: contribution.moduleId,
        apiVersion: contribution.apiVersion,
        runtime: contribution.runtime,
        activation: contribution.activation
      }));
      if (modules.length > PLUGIN_PACKAGE_V1_LIMITS.kernelModules) {
        throw new Error(`Kernel module limit exceeded: ${PLUGIN_PACKAGE_V1_LIMITS.kernelModules}`);
      }
    }
  }
  modules.sort((left, right) => codeUnitCompare(left.moduleId, right.moduleId));
  return Object.freeze({ planVersion: 1, modules: Object.freeze(modules) });
}

// ../../apps/workbench/src/plugins/plugin-security.ts
var FORBIDDEN_PLUGIN_HOST_SERVICE_ID = "host.all-access";
var dottedId2 = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
function immutableServiceIds(value, label) {
  const services = [...value];
  if (services.some((serviceId) => !dottedId2.test(serviceId) || serviceId === FORBIDDEN_PLUGIN_HOST_SERVICE_ID) || new Set(services).size !== services.length) {
    throw new Error(`Invalid ${label}`);
  }
  return Object.freeze(services);
}
var PluginHostServiceRegistry = class {
  #services;
  #snapshot;
  constructor(services) {
    this.#snapshot = immutableServiceIds(services, "plugin host service directory");
    this.#services = new Set(this.#snapshot);
  }
  has(serviceId) {
    return this.#services.has(serviceId);
  }
  list() {
    return this.#snapshot;
  }
  missing(required) {
    return Object.freeze(required.filter((serviceId) => !this.#services.has(serviceId)));
  }
};
function serviceSet(value, label) {
  return new Set(immutableServiceIds(value, label));
}
function frozenMatching(required, predicate) {
  return Object.freeze(required.filter(predicate));
}
var PluginHostServicePolicy = class {
  #available;
  #tierAllowlist;
  #userGrants;
  #sessionPolicy;
  constructor(available, options = {}) {
    this.#available = available;
    const all = available.list();
    this.#tierAllowlist = Object.freeze({
      system: serviceSet(options.tierAllowlist?.system ?? all, "system plugin host service allowlist"),
      product: serviceSet(options.tierAllowlist?.product ?? all, "product plugin host service allowlist"),
      "third-party": serviceSet(
        options.tierAllowlist?.["third-party"] ?? [],
        "third-party plugin host service allowlist"
      )
    });
    const userGrants = /* @__PURE__ */ new Map();
    for (const [pluginId, services] of Object.entries(options.userGrants ?? {})) {
      if (!dottedId2.test(pluginId)) throw new Error(`Invalid plugin user grant identity: ${pluginId}`);
      userGrants.set(pluginId, serviceSet(services, `plugin user grants: ${pluginId}`));
    }
    this.#userGrants = userGrants;
    this.#sessionPolicy = serviceSet(options.sessionPolicy ?? all, "plugin session host service policy");
  }
  resolve(request) {
    if (!dottedId2.test(request.pluginId) || !/^\d+\.\d+\.\d+$/.test(request.pluginVersion)) {
      throw new Error(`Invalid plugin host service request identity: ${request.pluginId}`);
    }
    const required = immutableServiceIds(
      request.requiredHostServices,
      `plugin host service requirements: ${request.pluginId}`
    );
    const tierAllowed = this.#tierAllowlist[request.tier];
    const defaultUserGrants = request.tier === "third-party" ? /* @__PURE__ */ new Set() : new Set(this.#available.list());
    const userAllowed = this.#userGrants.get(request.pluginId) ?? defaultUserGrants;
    const effective = frozenMatching(required, (serviceId) => this.#available.has(serviceId) && tierAllowed.has(serviceId) && userAllowed.has(serviceId) && this.#sessionPolicy.has(serviceId));
    if (effective.length === required.length) {
      return Object.freeze({
        accepted: true,
        grant: Object.freeze({
          grantVersion: 1,
          pluginId: request.pluginId,
          pluginVersion: request.pluginVersion,
          tier: request.tier,
          hostServices: effective
        })
      });
    }
    return Object.freeze({
      accepted: false,
      effectiveHostServices: effective,
      denial: Object.freeze({
        unavailable: frozenMatching(required, (serviceId) => !this.#available.has(serviceId)),
        deniedByTier: frozenMatching(required, (serviceId) => !tierAllowed.has(serviceId)),
        deniedByUser: frozenMatching(required, (serviceId) => !userAllowed.has(serviceId)),
        deniedBySession: frozenMatching(required, (serviceId) => !this.#sessionPolicy.has(serviceId))
      })
    });
  }
};
function describePluginHostServiceDenial(denial) {
  const parts = [
    denial.unavailable.length === 0 ? null : `unavailable=${denial.unavailable.join(",")}`,
    denial.deniedByTier.length === 0 ? null : `tier=${denial.deniedByTier.join(",")}`,
    denial.deniedByUser.length === 0 ? null : `user=${denial.deniedByUser.join(",")}`,
    denial.deniedBySession.length === 0 ? null : `session=${denial.deniedBySession.join(",")}`
  ].filter((part) => part !== null);
  return parts.join("; ");
}

// ../../apps/workbench/src/ui/plugin-manifest.ts
var WORKBENCH_PLUGIN_API_VERSION = "3.0";
var MOUNT_PLUGIN_API_VERSION = "4.0";
var dottedId3 = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
var semanticVersion2 = /^\d+\.\d+\.\d+$/;
function uniqueStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0) && new Set(value).size === value.length;
}
function exactDataRecord(value, required, optional = []) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  let keys;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    keys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !keys.includes(key))) return null;
  const captured = {};
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return null;
    captured[key] = descriptor.value;
  }
  return captured;
}
function capturedArrayValues(value) {
  if (!Array.isArray(value)) return null;
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (keys.length !== value.length + 1 || !keys.includes("length")) return null;
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    result.push(descriptor.value);
  }
  return result;
}
function capturedStrings(value) {
  const values = capturedArrayValues(value);
  if (!values) return null;
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of values) {
    if (typeof item !== "string" || item.length === 0 || item.length > 128 || seen.has(item)) return null;
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}
function capturedKernelModules(value) {
  const values = capturedArrayValues(value);
  if (!values) return null;
  const result = [];
  for (const value2 of values) {
    const record3 = exactDataRecord(value2, ["moduleId", "apiVersion", "runtime", "activation"]);
    if (!record3 || !isPluginKernelModuleManifestV1(record3)) return null;
    result.push(Object.freeze({
      moduleId: record3.moduleId,
      apiVersion: 1,
      runtime: record3.runtime,
      activation: "session-fixed"
    }));
  }
  return Object.freeze(result);
}
function captureUiPluginManifest(value) {
  try {
    const candidate = exactDataRecord(
      value,
      ["id", "name", "version", "apiVersion", "runtime", "activation", "requires", "contributes"],
      ["tier"]
    );
    if (!candidate || typeof candidate.id !== "string" || !dottedId3.test(candidate.id) || typeof candidate.name !== "string" || candidate.name.trim().length === 0 || candidate.name.length > 128 || typeof candidate.version !== "string" || !semanticVersion2.test(candidate.version) || candidate.tier !== void 0 && !isPluginTier(candidate.tier) || candidate.apiVersion !== WORKBENCH_PLUGIN_API_VERSION && candidate.apiVersion !== MOUNT_PLUGIN_API_VERSION || candidate.runtime !== "internal-module" || candidate.activation !== "always" && candidate.activation !== "user") return null;
    const requires = exactDataRecord(candidate.requires, ["hostFeatures", "projections"], ["hostServices"]);
    const hostFeatures = capturedStrings(requires?.hostFeatures);
    const hostServices = requires?.hostServices === void 0 ? void 0 : capturedStrings(requires.hostServices);
    const projections = capturedStrings(requires?.projections);
    const contributes = exactDataRecord(
      candidate.contributes,
      ["views", "commands", "interactions", "componentExtensions"],
      ["instruments", "playbackOutputs", "applicationCapabilities", "workflows", "kernelModules", "ui"]
    );
    if (contributes && Object.hasOwn(contributes, "ui") && candidate.apiVersion !== MOUNT_PLUGIN_API_VERSION) return null;
    const views2 = capturedStrings(contributes?.views);
    const commands2 = capturedStrings(contributes?.commands);
    const interactions2 = capturedStrings(contributes?.interactions);
    const componentExtensions2 = capturedStrings(contributes?.componentExtensions);
    const instruments2 = contributes?.instruments === void 0 ? void 0 : capturedStrings(contributes.instruments);
    const playbackOutputs2 = contributes?.playbackOutputs === void 0 ? void 0 : capturedStrings(contributes.playbackOutputs);
    const applicationCapabilities2 = contributes?.applicationCapabilities === void 0 ? void 0 : capturedStrings(contributes.applicationCapabilities);
    const workflows2 = contributes?.workflows === void 0 ? void 0 : capturedStrings(contributes.workflows);
    const kernelModules = contributes?.kernelModules === void 0 ? void 0 : capturedKernelModules(contributes.kernelModules);
    let ui;
    if (contributes?.ui !== void 0) {
      if (candidate.apiVersion !== MOUNT_PLUGIN_API_VERSION) return null;
      const facet = exactDataRecord(contributes.ui, ["contractVersion", "components", "commands", "menus", "shortcuts"]);
      const components = capturedStrings(facet?.components), uiCommands = capturedStrings(facet?.commands);
      const menus = capturedStrings(facet?.menus), shortcuts = capturedStrings(facet?.shortcuts);
      if (facet?.contractVersion !== 1 || !components || !uiCommands || !menus || !shortcuts) return null;
      if ([...components, ...uiCommands, ...menus, ...shortcuts].some((id) => !dottedId3.test(id) || !id.startsWith(`${candidate.id}.`))) return null;
      ui = Object.freeze({ contractVersion: 1, components, commands: uiCommands, menus, shortcuts });
    }
    if (!hostFeatures || hostServices === null || !projections || !contributes || !views2 || !commands2 || !interactions2 || !componentExtensions2 || instruments2 === null || playbackOutputs2 === null || applicationCapabilities2 === null || workflows2 === null || kernelModules === null) return null;
    if (candidate.apiVersion === MOUNT_PLUGIN_API_VERSION && (views2.length || commands2.length || componentExtensions2.length)) return null;
    if (hostServices !== void 0) new PluginHostServiceRegistry(hostServices);
    const manifest = Object.freeze({
      id: candidate.id,
      name: candidate.name,
      version: candidate.version,
      ...candidate.tier === void 0 ? {} : { tier: candidate.tier },
      apiVersion: candidate.apiVersion,
      runtime: "internal-module",
      activation: candidate.activation,
      requires: Object.freeze({ hostFeatures, ...hostServices === void 0 ? {} : { hostServices }, projections }),
      contributes: Object.freeze({
        views: views2,
        commands: commands2,
        interactions: interactions2,
        componentExtensions: componentExtensions2,
        ...instruments2 === void 0 ? {} : { instruments: instruments2 },
        ...playbackOutputs2 === void 0 ? {} : { playbackOutputs: playbackOutputs2 },
        ...applicationCapabilities2 === void 0 ? {} : { applicationCapabilities: applicationCapabilities2 },
        ...workflows2 === void 0 ? {} : { workflows: workflows2 },
        ...kernelModules === void 0 ? {} : { kernelModules },
        ...ui === void 0 ? {} : { ui }
      })
    });
    createPluginKernelAssemblyPlanV1([{
      id: manifest.id,
      version: manifest.version,
      activation: manifest.activation,
      ...manifest.tier === void 0 ? {} : { tier: manifest.tier },
      ...manifest.contributes.kernelModules === void 0 ? {} : { kernelModules: manifest.contributes.kernelModules }
    }]);
    return manifest;
  } catch {
    return null;
  }
}
function isUiPluginManifest(value) {
  return captureUiPluginManifest(value) !== null;
}
var WorkbenchFeatureRegistry = class {
  #features;
  constructor(features) {
    if (!uniqueStrings(features)) throw new Error("Invalid workbench feature directory");
    this.#features = new Set(features);
  }
  has(feature) {
    return this.#features.has(feature);
  }
  list() {
    return [...this.#features];
  }
  missing(required) {
    return required.filter((feature) => !this.#features.has(feature));
  }
};

// ../../shared/ui-animation/contract.js
var ANIMATION_CONTRACT_VERSION = 1;
var ANIMATION_SHAPE_EXTENT = 512;
var ANIMATION_LIMITS = Object.freeze({
  "content-transition": 24,
  "selection-transition": 256,
  "drag-settle": 512,
  "shape-transition": ANIMATION_SHAPE_EXTENT
});
var ANIMATION_BUDGET = Object.freeze({ targets: 32, active: 128, variants: 8, velocity: 1600, springSeconds: 0.8 });
function animationRecord(value, allowed, name) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`Invalid ${name}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.includes(key) || !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) throw new TypeError(`Unknown or non-data ${name} field`);
  return value;
}
var validAnimationVariant = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);
function dataArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`Invalid animation ${name}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = /* @__PURE__ */ new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key) || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`Invalid animation ${name}`);
  return Array.from({ length: value.length }, (_, index) => {
    if (!descriptors[index]) throw new TypeError(`Sparse animation ${name}`);
    return descriptors[index].value;
  });
}
function bounded(value, min, max, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`Out of range animation ${name}`);
  return value;
}
function variant(input, intent) {
  animationRecord(input, ["type", "duration", "ease", "fadeDuration", "exitDuration", "stiffness", "damping"], "animation variant");
  if (input.type === "instant") {
    animationRecord(input, ["type"], "instant variant");
    return Object.freeze({ type: "instant" });
  }
  if (input.type === "spring" && !["content-transition", "shape-transition"].includes(intent)) {
    animationRecord(input, ["type", "stiffness", "damping"], "spring variant");
    return Object.freeze({ type: "spring", stiffness: bounded(input.stiffness, 80, 800, "stiffness"), damping: bounded(input.damping, 10, 80, "damping") });
  }
  if (input.type !== "tween") throw new TypeError("Invalid animation variant type");
  const content = intent === "content-transition";
  animationRecord(input, content ? ["type", "duration", "ease", "fadeDuration", "exitDuration"] : ["type", "duration", "ease"], "tween variant");
  if (!Array.isArray(input.ease) || input.ease.length !== 4) throw new TypeError("Invalid animation ease");
  const ease = Object.freeze(dataArray(input.ease, "ease").map((item) => bounded(item, 0, 1, "ease")));
  const result = { type: "tween", duration: bounded(input.duration, 0.04, 0.3, "duration"), ease };
  if (content) {
    result.fadeDuration = bounded(input.fadeDuration, 0.04, 0.3, "fadeDuration");
    result.exitDuration = bounded(input.exitDuration, 0.04, 0.3, "exitDuration");
  }
  return Object.freeze(result);
}
function captureAnimationContribution(input) {
  if (input == null) return Object.freeze({ contractVersion: ANIMATION_CONTRACT_VERSION, definitions: Object.freeze({}) });
  animationRecord(input, ["contractVersion", "definitions"], "animation contribution");
  if (input.contractVersion !== ANIMATION_CONTRACT_VERSION) throw new TypeError("Incompatible animation contract version");
  const definitions = input.definitions ?? {};
  animationRecord(definitions, Object.keys(ANIMATION_LIMITS), "animation definitions");
  return Object.freeze({ contractVersion: ANIMATION_CONTRACT_VERSION, definitions: Object.freeze(Object.fromEntries(Object.entries(definitions).map(([intent, definition]) => {
    animationRecord(definition, ["defaultVariant", "variants"], "animation definition");
    const choices = definition.variants;
    animationRecord(choices, Object.keys(choices ?? {}), "animation variants");
    const names = Object.keys(choices);
    if (!names.length || names.length > ANIMATION_BUDGET.variants || names.some((name) => !validAnimationVariant(name)) || !validAnimationVariant(definition.defaultVariant) || !Object.hasOwn(choices, definition.defaultVariant)) throw new TypeError("Invalid animation default or variants");
    return [intent, Object.freeze({
      defaultVariant: definition.defaultVariant,
      variants: Object.freeze(Object.fromEntries(names.map((name) => [name, variant(choices[name], intent)])))
    })];
  }))) });
}
function captureAnimationPermissions(input) {
  if (input == null) return Object.freeze([]);
  const intents = dataArray(input, "permissions");
  if (intents.some((intent) => !Object.hasOwn(ANIMATION_LIMITS, intent)) || new Set(intents).size !== intents.length) throw new TypeError("Invalid animation permissions");
  return Object.freeze(intents);
}

// ../../apps/workbench/src/plugins/plugin-mount-ui.ts
var idPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function fail() {
  throw new Error("Invalid mount UI facet v1");
}
function text(value) {
  return typeof value === "string" && !!value.trim() && value.length <= 128;
}
function ownId(value, pluginId) {
  return typeof value === "string" && idPattern.test(value) && value.startsWith(`${pluginId}.`);
}
function list(value, capture) {
  const values = capturedArrayValues(value);
  if (!values) fail();
  return Object.freeze(values.map(capture));
}
function uniqueIds(values) {
  if (new Set(values.map((item) => item.id)).size !== values.length) fail();
}
function optionalFields(value, optional) {
  if (!value) fail();
  return Object.fromEntries(Object.entries(value).filter(([key, field]) => !optional.includes(key) || field != null));
}
function capturePluginMountUi(value, pluginId) {
  const facet = exactDataRecord(value, ["contractVersion"], ["components", "commands", "menuItems", "shortcuts"]);
  if (facet?.contractVersion !== 1) fail();
  const components = list(facet.components ?? [], (value2) => {
    const optional = [
      "uiKind",
      "defaultSlot",
      "icon",
      "order",
      "permissions",
      "defaultEnabled",
      "allowedSpans",
      "defaultSpan",
      "minHeight",
      "footerHeight",
      "minWidth",
      "priority",
      "animations"
    ];
    const unit = optionalFields(exactDataRecord(value2, ["id", "title", "role", "slots", "mount"], optional), optional);
    if (!unit || !ownId(unit.id, pluginId) || !text(unit.title) || typeof unit.mount !== "function" || typeof unit.role !== "string" || !["view", "tool", "inspector", "status"].includes(unit.role)) fail();
    const slots = capturedStrings(unit.slots);
    if (!slots?.length || slots.some((slot) => !["stage", "top", "left", "right", "bottom"].includes(slot)) || (unit.role === "view" ? slots.some((slot) => slot !== "stage") : slots.includes("stage"))) fail();
    if (unit.defaultSlot !== void 0 && (typeof unit.defaultSlot !== "string" || !slots.includes(unit.defaultSlot))) fail();
    if (unit.uiKind !== void 0 && (typeof unit.uiKind !== "string" || !["panel", "slotItem", "view", "module", "page"].includes(unit.uiKind))) fail();
    if (unit.uiKind === "view" && unit.role !== "view") fail();
    if (unit.uiKind === "panel" && slots.some((slot) => slot !== "left" && slot !== "right")) fail();
    if (unit.icon !== void 0 && !text(unit.icon)) fail();
    if (unit.defaultEnabled !== void 0 && typeof unit.defaultEnabled !== "boolean") fail();
    for (const key of ["order", "priority", "minHeight", "footerHeight", "minWidth"]) {
      if (unit[key] !== void 0 && (!finite(unit[key]) || (key.startsWith("min") || key === "footerHeight") && unit[key] < 0)) fail();
    }
    let permissions;
    if (unit.permissions !== void 0) {
      const record3 = exactDataRecord(unit.permissions, [], ["commands", "animations"]);
      if (!record3) fail();
      const commands3 = record3.commands == null ? Object.freeze([]) : capturedStrings(record3.commands);
      if (!commands3 || commands3.some((id) => !idPattern.test(id))) fail();
      permissions = Object.freeze({ commands: commands3, animations: captureAnimationPermissions(record3.animations) });
    }
    const animations = unit.animations === void 0 ? void 0 : captureAnimationContribution(unit.animations);
    if (Object.keys(animations?.definitions ?? {}).some((intent) => !permissions?.animations?.includes(intent))) fail();
    const spans = unit.allowedSpans === void 0 ? void 0 : capturedStrings(unit.allowedSpans);
    if (spans === null || spans?.some((span) => span !== "full" && span !== "half") || spans?.length === 0 || unit.defaultSpan !== void 0 && (unit.defaultSpan !== "full" && unit.defaultSpan !== "half" || spans !== void 0 && !spans.includes(unit.defaultSpan))) fail();
    return Object.freeze({
      ...unit,
      slots,
      ...permissions === void 0 ? {} : { permissions },
      ...animations === void 0 ? {} : { animations },
      ...spans === void 0 ? {} : { allowedSpans: spans }
    });
  });
  const commands2 = list(facet.commands ?? [], (value2) => {
    const optional = ["label", "keys", "enabled", "checked"];
    const command = optionalFields(exactDataRecord(value2, ["id", "run"], optional), optional);
    if (!command || !ownId(command.id, pluginId) || typeof command.run !== "function" || command.label !== void 0 && !text(command.label) || command.enabled !== void 0 && typeof command.enabled !== "function" || command.checked != null && typeof command.checked !== "function") fail();
    const keys = command.keys === void 0 ? void 0 : capturedStrings(command.keys);
    if (keys === null) fail();
    return Object.freeze({ ...command, ...keys === void 0 ? {} : { keys } });
  });
  const menuItems = list(facet.menuItems ?? [], (value2) => {
    const optional = ["label", "group", "order"];
    const item = optionalFields(exactDataRecord(value2, ["id", "menu", "command"], optional), optional);
    if (!item || !ownId(item.id, pluginId) || !text(item.menu) || !text(item.command) || item.label !== void 0 && !text(item.label) || item.group !== void 0 && !finite(item.group) || item.order !== void 0 && !finite(item.order)) fail();
    return Object.freeze(item);
  });
  const shortcuts = list(facet.shortcuts ?? [], (value2) => {
    const optional = ["scope", "componentId"];
    const binding = optionalFields(exactDataRecord(value2, ["id", "command", "keys"], optional), optional);
    const keys = capturedStrings(binding?.keys);
    const scope = binding?.scope ?? "global";
    if (!binding || !ownId(binding.id, pluginId) || !text(binding.command) || !keys || typeof scope !== "string" || !["global", "component", "score"].includes(scope) || (scope === "global" ? binding.componentId !== void 0 : !ownId(binding.componentId, pluginId))) fail();
    return Object.freeze({ ...binding, keys });
  });
  for (const values of [components, commands2, menuItems, shortcuts]) uniqueIds(values);
  return Object.freeze({ contractVersion: 1, components, commands: commands2, menuItems, shortcuts });
}
function mountUiManifest(facet) {
  return Object.freeze({
    contractVersion: 1,
    components: Object.freeze(facet.components.map((item) => item.id)),
    commands: Object.freeze(facet.commands.map((item) => item.id)),
    menus: Object.freeze(facet.menuItems.map((item) => item.id)),
    shortcuts: Object.freeze(facet.shortcuts.map((item) => item.id))
  });
}

// ../../apps/workbench/src/ui/plugin-module-capture.ts
function captureComponentDefinition(definition) {
  if (!isUiComponentDefinition(definition)) throw new Error("Invalid UI component definition");
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    kind: definition.kind,
    domain: definition.domain,
    slots: Object.freeze([...definition.slots]),
    presentation: Object.freeze({
      allowed: Object.freeze([...definition.presentation.allowed]),
      default: definition.presentation.default
    }),
    capabilities: Object.freeze({ ...definition.capabilities }),
    permissions: Object.freeze({
      projections: Object.freeze([...definition.permissions.projections]),
      commands: Object.freeze([...definition.permissions.commands])
    }),
    ...definition.extensionPoints === void 0 ? {} : { extensionPoints: Object.freeze([...definition.extensionPoints]) }
  });
}
function captureInternalUiPluginModule(plugin) {
  const manifest = captureUiPluginManifest(plugin.manifest);
  if (!manifest) throw new Error("Invalid UI plugin manifest");
  const ui = plugin.ui === void 0 ? void 0 : capturePluginMountUi(plugin.ui, manifest.id);
  if (ui !== void 0 && manifest.apiVersion !== "4.0") throw new Error("Mount UI facet requires plugin API 4.0");
  if (JSON.stringify(ui === void 0 ? void 0 : mountUiManifest(ui)) !== JSON.stringify(manifest.contributes.ui)) {
    throw new Error("Mount UI contributions do not match manifest");
  }
  return Object.freeze({
    manifest,
    ...ui === void 0 ? {} : { ui },
    projections: Object.freeze(plugin.projections.map((projection) => Object.freeze({ id: projection.id }))),
    commands: Object.freeze(plugin.commands.map((command) => Object.freeze({
      id: command.id,
      create: command.create
    }))),
    views: Object.freeze(plugin.views.map((view) => Object.freeze({
      definition: captureComponentDefinition(view.definition),
      label: view.label,
      ...view.icon === void 0 ? {} : { icon: view.icon },
      ...view.inlineZone === void 0 ? {} : { inlineZone: view.inlineZone },
      render: view.render
    }))),
    interactions: Object.freeze(plugin.interactions.map((interaction) => Object.freeze({
      id: interaction.id,
      notationKind: interaction.notationKind,
      input: Object.freeze({
        id: interaction.input.id,
        canHandle: interaction.input.canHandle,
        translate: interaction.input.translate
      }),
      readDraft: interaction.readDraft,
      startComposition: interaction.startComposition,
      navigate: interaction.navigate,
      edit: interaction.edit
    }))),
    componentExtensions: Object.freeze(plugin.componentExtensions.map((extension) => Object.freeze({
      id: extension.id,
      extensionPoint: extension.extensionPoint,
      ...extension.order === void 0 ? {} : { order: extension.order },
      render: extension.render
    }))),
    instruments: Object.freeze((plugin.instruments ?? []).map((instrument) => Object.freeze({
      id: instrument.id,
      label: instrument.label,
      family: instrument.family,
      notationKinds: Object.freeze([...instrument.notationKinds]),
      ...instrument.noteControlExtensionIds === void 0 ? {} : { noteControlExtensionIds: Object.freeze([...instrument.noteControlExtensionIds]) },
      ...instrument.playbackProfileId === void 0 ? {} : { playbackProfileId: instrument.playbackProfileId }
    }))),
    playbackOutputs: Object.freeze((plugin.playbackOutputs ?? []).map((output) => Object.freeze({
      id: output.id,
      kind: output.kind,
      label: output.label,
      createEngine: output.createEngine
    }))),
    applicationCapabilities: Object.freeze((plugin.applicationCapabilities ?? []).map((capability) => Object.freeze({
      id: capability.id,
      contractVersion: capability.contractVersion,
      callers: Object.freeze([...capability.callers]),
      validateInput: capability.validateInput,
      validateOutput: capability.validateOutput
    }))),
    workflows: Object.freeze((plugin.workflows ?? []).map((workflow) => Object.freeze({
      id: workflow.id,
      contractVersion: workflow.contractVersion,
      name: workflow.name,
      description: workflow.description,
      runtime: workflow.runtime,
      operationIds: Object.freeze([...workflow.operationIds]),
      entryOperationIds: Object.freeze([...workflow.entryOperationIds])
    })))
  });
}

// ../../apps/workbench/src/ui/plugin-catalog.ts
var UiPluginCatalog = class {
  #plugins = [];
  constructor(plugins = []) {
    this.registerAll(plugins);
  }
  register(plugin) {
    this.#plugins.push(plugin);
  }
  registerAll(plugins) {
    for (const plugin of plugins) this.register(plugin);
  }
  list() {
    return [...this.#plugins];
  }
  clear() {
    this.#plugins.length = 0;
  }
  findComponentExtensions(extensionPoint) {
    return this.#plugins.flatMap((plugin) => plugin.componentExtensions.filter((contribution) => contribution.extensionPoint === extensionPoint).map((contribution) => ({ pluginId: plugin.manifest.id, contribution })));
  }
  installationPlan() {
    const owners = /* @__PURE__ */ new Map();
    for (const plugin of this.#plugins) {
      for (const view of plugin.views) {
        for (const extensionPoint of view.definition.extensionPoints ?? []) {
          const current = owners.get(extensionPoint) ?? [];
          owners.set(extensionPoint, [...current, plugin]);
        }
      }
    }
    const dependencies = /* @__PURE__ */ new Map();
    for (const plugin of this.#plugins) {
      const requiredOwners = /* @__PURE__ */ new Set();
      for (const extension of plugin.componentExtensions) {
        const candidates = owners.get(extension.extensionPoint) ?? [];
        const owner = candidates[0];
        if (candidates.length === 1 && owner && owner !== plugin) requiredOwners.add(owner);
      }
      dependencies.set(plugin, requiredOwners);
    }
    const pending = new Set(this.#plugins);
    const installed = /* @__PURE__ */ new Set();
    const plan = [];
    while (pending.size > 0) {
      let progressed = false;
      for (const plugin of this.#plugins) {
        if (!pending.has(plugin)) continue;
        const requirements = dependencies.get(plugin) ?? /* @__PURE__ */ new Set();
        if ([...requirements].some((owner) => !installed.has(owner))) continue;
        pending.delete(plugin);
        installed.add(plugin);
        plan.push(plugin);
        progressed = true;
      }
      if (progressed) continue;
      for (const plugin of this.#plugins) if (pending.delete(plugin)) plan.push(plugin);
    }
    return plan;
  }
};

// ../../apps/workbench/src/ui/notify-observers.ts
function notifyObservers(listeners) {
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result !== void 0) void Promise.resolve(result).catch(() => {
      });
    } catch {
    }
  }
}

// ../../apps/workbench/src/ui/plugin-diagnostic.ts
var reportSequence = 0;
function reportId(now = Date.now()) {
  reportSequence = (reportSequence + 1) % 1e4;
  const stamp = new Date(now).toISOString().replace(/\D/g, "").slice(0, 14);
  return `BG-UI-${stamp}-${reportSequence.toString().padStart(4, "0")}`;
}
function uiPluginIdentity(manifest) {
  return {
    id: typeof manifest?.id === "string" && manifest.id ? manifest.id : "unknown.plugin",
    name: typeof manifest?.name === "string" && manifest.name ? manifest.name : "\u672A\u77E5\u754C\u9762\u63D2\u4EF6",
    version: typeof manifest?.version === "string" && manifest.version ? manifest.version : "unknown"
  };
}
var UiPluginHostError = class extends Error {
  diagnostic;
  constructor(input) {
    super(input.detail, input.cause === void 0 ? void 0 : { cause: input.cause });
    this.name = "UiPluginHostError";
    this.diagnostic = Object.freeze({
      reportId: reportId(),
      occurredAt: Date.now(),
      code: input.code,
      stage: input.stage,
      plugin: input.plugin,
      ...input.subject ? { subject: input.subject } : {},
      message: input.message,
      detail: input.detail,
      recoverable: true
    });
  }
};
function isUiPluginHostError(error) {
  return error instanceof UiPluginHostError;
}
var UiPluginDiagnosticStore = class {
  #snapshot = Object.freeze([]);
  #fingerprints = /* @__PURE__ */ new Set();
  #listeners = /* @__PURE__ */ new Set();
  list = () => this.#snapshot;
  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  report(diagnostic) {
    const subject = diagnostic.subject;
    const fingerprint = [
      diagnostic.code,
      diagnostic.plugin.id,
      diagnostic.stage,
      subject?.kind ?? "",
      subject?.id ?? "",
      subject?.ownerPluginId ?? "",
      diagnostic.detail
    ].join("|");
    if (this.#fingerprints.has(fingerprint)) return;
    this.#fingerprints.add(fingerprint);
    this.#snapshot = Object.freeze([...this.#snapshot, diagnostic]);
    queueMicrotask(() => {
      notifyObservers(this.#listeners);
    });
  }
};

// ../../apps/workbench/src/ui/projection-registry.ts
var UiProjectionSnapshot = class {
  #values;
  constructor(values) {
    this.#values = values;
  }
  get(projection) {
    if (!this.#values.has(projection.id)) throw new Error(`UI projection is not bound: ${projection.id}`);
    return this.#values.get(projection.id);
  }
  scoped(allowed) {
    for (const projection of allowed) {
      if (!this.#values.has(projection.id)) throw new Error(`UI projection is not bound: ${projection.id}`);
    }
    const ids = new Set(allowed.map((projection) => projection.id));
    return { get: (projection) => {
      if (!ids.has(projection.id)) throw new Error(`UI projection is not declared by this plugin: ${projection.id}`);
      return this.get(projection);
    } };
  }
};
var UiProjectionRegistry = class {
  #projections = /* @__PURE__ */ new Map();
  constructor(projections = []) {
    for (const projection of projections) this.register(projection);
  }
  register(projection) {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(projection.id)) throw new Error(`Invalid UI projection ID: ${projection.id}`);
    if (this.#projections.has(projection.id)) throw new Error(`UI projection already registered: ${projection.id}`);
    this.#projections.set(projection.id, projection);
  }
  has(id) {
    return this.#projections.has(id);
  }
  list() {
    return [...this.#projections.values()];
  }
  snapshot(bindings) {
    const values = /* @__PURE__ */ new Map();
    for (const binding of bindings) {
      if (!this.#projections.has(binding.projection.id)) throw new Error(`Unknown UI projection: ${binding.projection.id}`);
      if (values.has(binding.projection.id)) throw new Error(`Duplicate UI projection binding: ${binding.projection.id}`);
      values.set(binding.projection.id, binding.value);
    }
    return new UiProjectionSnapshot(values);
  }
};

// ../../apps/workbench/src/ui/component-registry.ts
var UiComponentRegistry = class {
  definitions = /* @__PURE__ */ new Map();
  register(definition) {
    if (!isUiComponentDefinition(definition)) throw new Error("Invalid UI component definition");
    if (this.definitions.has(definition.id)) throw new Error(`UI component already registered: ${definition.id}`);
    this.definitions.set(definition.id, definition);
  }
  unregister(id) {
    return this.definitions.delete(id);
  }
  get(id) {
    return this.definitions.get(id);
  }
  list() {
    return [...this.definitions.values()];
  }
};

// ../../shared/notation/interaction/notation-interaction-registry.ts
var NotationInteractionRegistry = class {
  #byKind = /* @__PURE__ */ new Map();
  #byId = /* @__PURE__ */ new Map();
  clear() {
    this.#byKind.clear();
    this.#byId.clear();
  }
  register(contribution) {
    if (this.#byId.has(contribution.id)) throw new Error(`Duplicate notation interaction: ${contribution.id}`);
    if (this.#byKind.has(contribution.notationKind)) {
      throw new Error(`Notation interaction already registered: ${contribution.notationKind}`);
    }
    this.#byId.set(contribution.id, contribution);
    this.#byKind.set(contribution.notationKind, contribution);
  }
  hasId(id) {
    return this.#byId.has(id);
  }
  hasKind(kind) {
    return this.#byKind.has(kind);
  }
  list() {
    return [...this.#byId.keys()];
  }
  translate(kind, signal, context) {
    const contribution = this.#byKind.get(kind);
    if (!contribution || !contribution.input.canHandle(signal, context)) return null;
    return contribution.input.translate(signal, context);
  }
  readDraft(kind, composition) {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.readDraft(composition) : null;
  }
  startComposition(kind, draft) {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.startComposition(draft) : null;
  }
  navigate(kind, signal, context) {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.navigate(signal, context) : null;
  }
  edit(kind, signal, context) {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.edit(signal, context) : null;
  }
};

// ../../apps/workbench/src/ui/plugin-manager.ts
function sameIds(actual, declared) {
  return actual.length === declared.length && actual.every((id, index) => id === declared[index]);
}
var UiPluginHost = class {
  components = new UiComponentRegistry();
  projections;
  interactions = new NotationInteractionRegistry();
  #features;
  #plugins = /* @__PURE__ */ new Map();
  #componentOwners = /* @__PURE__ */ new Map();
  #commandOwners = /* @__PURE__ */ new Map();
  #interactionOwners = /* @__PURE__ */ new Map();
  #notationOwners = /* @__PURE__ */ new Map();
  #extensionOwners = /* @__PURE__ */ new Map();
  #extensionPointOwners = /* @__PURE__ */ new Map();
  #reportDiagnostic;
  constructor(features, projections, reportDiagnostic) {
    this.#features = features;
    this.projections = projections;
    this.#reportDiagnostic = reportDiagnostic;
  }
  #failure(plugin, code, stage, message, detail, subject, cause) {
    return new UiPluginHostError({
      code,
      stage,
      plugin: uiPluginIdentity(plugin.manifest),
      message,
      detail,
      ...subject ? { subject } : {},
      ...cause === void 0 ? {} : { cause }
    });
  }
  #resolveFailure(error) {
    if (!this.#reportDiagnostic) throw error;
    this.#reportDiagnostic(error.diagnostic);
  }
  install(plugin) {
    if (plugin.manifest.apiVersion !== "3.0") throw new Error("This UI host supports plugin API 3.0; select a mount contribution host for 4.0");
    if (!isUiPluginManifest(plugin.manifest)) throw this.#failure(
      plugin,
      "UI-PLG-001",
      "manifest",
      "\u754C\u9762\u63D2\u4EF6\u6E05\u5355\u65E0\u6548",
      "Invalid UI plugin manifest"
    );
    plugin = captureInternalUiPluginModule(plugin);
    if (this.#plugins.has(plugin.manifest.id)) throw this.#failure(
      plugin,
      "UI-PLG-002",
      "registration",
      "\u754C\u9762\u63D2\u4EF6\u91CD\u590D\u52A0\u8F7D",
      `UI plugin already installed: ${plugin.manifest.id}`,
      { kind: "plugin", id: plugin.manifest.id, ownerPluginId: plugin.manifest.id }
    );
    const missingFeatures = this.#features.missing(plugin.manifest.requires.hostFeatures);
    if (missingFeatures.length > 0)
      throw this.#failure(
        plugin,
        "UI-PLG-003",
        "requirements",
        "\u63D2\u4EF6\u9700\u8981\u7684\u5DE5\u4F5C\u53F0\u80FD\u529B\u4E0D\u53EF\u7528",
        `UI plugin ${plugin.manifest.id} requires unavailable host features: ${missingFeatures.join(", ")}`,
        { kind: "capability", id: missingFeatures.join(", ") }
      );
    const missingProjections = plugin.manifest.requires.projections.filter((id) => !this.projections.has(id));
    if (missingProjections.length > 0)
      throw this.#failure(
        plugin,
        "UI-PLG-004",
        "requirements",
        "\u63D2\u4EF6\u9700\u8981\u7684\u6570\u636E\u6295\u5F71\u4E0D\u53EF\u7528",
        `UI plugin ${plugin.manifest.id} requires unavailable projections: ${missingProjections.join(", ")}`,
        { kind: "projection", id: missingProjections.join(", ") }
      );
    const projectionIds = plugin.projections.map((projection) => projection.id);
    const viewIds = plugin.views.map((view) => view.definition.id);
    const commandIds = plugin.commands.map((command) => command.id);
    const interactionIds = plugin.interactions.map((interaction) => interaction.id);
    const extensionIds = plugin.componentExtensions.map((extension) => extension.id);
    const applicationCapabilityIds = (plugin.applicationCapabilities ?? []).map((capability) => capability.id);
    const workflowIds = (plugin.workflows ?? []).map((workflow) => workflow.id);
    if (!sameIds(projectionIds, plugin.manifest.requires.projections))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u6570\u636E\u6295\u5F71\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} projection binding does not match its manifest`
      );
    if (!sameIds(viewIds, plugin.manifest.contributes.views))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u89C6\u56FE\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} view binding does not match its manifest`
      );
    if (!sameIds(commandIds, plugin.manifest.contributes.commands))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u547D\u4EE4\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} command binding does not match its manifest`
      );
    if (!sameIds(interactionIds, plugin.manifest.contributes.interactions))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u4EA4\u4E92\u89C4\u5219\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} interaction binding does not match its manifest`
      );
    if (!sameIds(extensionIds, plugin.manifest.contributes.componentExtensions))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u7EC4\u4EF6\u6269\u5C55\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} component extension binding does not match its manifest`
      );
    if (!sameIds(applicationCapabilityIds, plugin.manifest.contributes.applicationCapabilities ?? []))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u5E94\u7528\u80FD\u529B\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `UI plugin ${plugin.manifest.id} application capability binding does not match its manifest`
      );
    if (!sameIds(workflowIds, plugin.manifest.contributes.workflows ?? []))
      throw this.#failure(
        plugin,
        "UI-PLG-005",
        "contributions",
        "\u63D2\u4EF6\u5DE5\u4F5C\u6D41\u4E0E\u6E05\u5355\u4E0D\u4E00\u81F4",
        `Plugin ${plugin.manifest.id} workflow binding does not match its manifest`
      );
    if (new Set(viewIds).size !== viewIds.length || new Set(commandIds).size !== commandIds.length || new Set(interactionIds).size !== interactionIds.length || new Set(extensionIds).size !== extensionIds.length || new Set(applicationCapabilityIds).size !== applicationCapabilityIds.length || new Set(plugin.interactions.map((interaction) => interaction.notationKind)).size !== plugin.interactions.length)
      throw this.#failure(
        plugin,
        "UI-PLG-006",
        "contributions",
        "\u63D2\u4EF6\u5305\u542B\u91CD\u590D\u8D21\u732E",
        `UI plugin ${plugin.manifest.id} contains duplicate contributions`
      );
    const declaredExtensionPoints = /* @__PURE__ */ new Set();
    for (const view of plugin.views) {
      const definition = view.definition;
      if (!isUiComponentDefinition(definition)) throw this.#failure(
        plugin,
        "UI-PLG-007",
        "contributions",
        "\u63D2\u4EF6\u89C6\u56FE\u5B9A\u4E49\u65E0\u6548",
        `UI plugin ${plugin.manifest.id} contains an invalid view definition`
      );
      const componentOwner = this.#componentOwners.get(definition.id);
      if (componentOwner) throw this.#failure(
        plugin,
        "UI-PLG-008",
        "registration",
        "\u7EC4\u4EF6 ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        `UI component already owned: ${definition.id}`,
        { kind: "component", id: definition.id, ownerPluginId: componentOwner }
      );
      if (definition.permissions.projections.some((id) => !projectionIds.includes(id)))
        throw this.#failure(
          plugin,
          "UI-PLG-009",
          "permissions",
          "\u7EC4\u4EF6\u8BF7\u6C42\u4E86\u63D2\u4EF6\u672A\u58F0\u660E\u7684\u6570\u636E\u6295\u5F71",
          `UI component ${definition.id} requests an undeclared projection`,
          { kind: "component", id: definition.id }
        );
      const undeclaredCommand = definition.permissions.commands.find((id) => !commandIds.includes(id));
      if (undeclaredCommand)
        throw this.#failure(
          plugin,
          "UI-PLG-009",
          "permissions",
          "\u7EC4\u4EF6\u8BF7\u6C42\u4E86\u63D2\u4EF6\u672A\u58F0\u660E\u7684\u547D\u4EE4",
          `UI component ${definition.id} requests an undeclared command: ${undeclaredCommand}`,
          { kind: "command", id: undeclaredCommand }
        );
      for (const extensionPoint of definition.extensionPoints ?? []) {
        const owner = this.#extensionPointOwners.get(extensionPoint);
        if (owner || declaredExtensionPoints.has(extensionPoint)) throw this.#failure(
          plugin,
          "UI-PLG-008",
          "registration",
          "\u7EC4\u4EF6\u6269\u5C55\u70B9\u4E0E\u5176\u4ED6\u7EC4\u4EF6\u51B2\u7A81",
          `UI component extension point already owned: ${extensionPoint}`,
          { kind: "extension-point", id: extensionPoint, ownerPluginId: owner?.pluginId ?? plugin.manifest.id }
        );
        declaredExtensionPoints.add(extensionPoint);
      }
    }
    for (const commandId of commandIds) {
      const commandOwner = this.#commandOwners.get(commandId);
      if (commandOwner) throw this.#failure(
        plugin,
        "UI-PLG-010",
        "registration",
        "\u547D\u4EE4 ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        `Workbench command already owned: ${commandId}`,
        { kind: "command", id: commandId, ownerPluginId: commandOwner }
      );
    }
    for (const interaction of plugin.interactions) {
      const owner = this.#interactionOwners.get(interaction.id) ?? this.#notationOwners.get(interaction.notationKind);
      if (owner) throw this.#failure(
        plugin,
        "UI-PLG-008",
        "registration",
        "\u8C31\u5F0F\u4EA4\u4E92\u89C4\u5219\u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        `Notation interaction already owned: ${interaction.id} (${interaction.notationKind})`,
        { kind: "interaction", id: interaction.id, ownerPluginId: owner }
      );
    }
    const availableExtensionPoints = new Map(this.#extensionPointOwners);
    for (const view of plugin.views) for (const extensionPoint of view.definition.extensionPoints ?? []) {
      availableExtensionPoints.set(extensionPoint, { componentId: view.definition.id, pluginId: plugin.manifest.id });
    }
    for (const extension of plugin.componentExtensions) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(extension.id) || typeof extension.render !== "function" || extension.order !== void 0 && !Number.isFinite(extension.order))
        throw this.#failure(
          plugin,
          "UI-PLG-007",
          "contributions",
          "\u7EC4\u4EF6\u6269\u5C55\u5B9A\u4E49\u65E0\u6548",
          `UI plugin ${plugin.manifest.id} contains an invalid component extension`,
          { kind: "component-extension", id: extension.id }
        );
      const owner = this.#extensionOwners.get(extension.id);
      if (owner) throw this.#failure(
        plugin,
        "UI-PLG-008",
        "registration",
        "\u7EC4\u4EF6\u6269\u5C55 ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        `UI component extension already owned: ${extension.id}`,
        { kind: "component-extension", id: extension.id, ownerPluginId: owner }
      );
      if (!availableExtensionPoints.has(extension.extensionPoint))
        throw this.#failure(
          plugin,
          "UI-PLG-009",
          "permissions",
          "\u7EC4\u4EF6\u6269\u5C55\u70B9\u4E0D\u5B58\u5728",
          `UI component extension point is not installed: ${extension.extensionPoint}`,
          { kind: "extension-point", id: extension.extensionPoint }
        );
    }
    for (const view of plugin.views) {
      this.components.register(view.definition);
      this.#componentOwners.set(view.definition.id, plugin.manifest.id);
      for (const extensionPoint of view.definition.extensionPoints ?? []) {
        this.#extensionPointOwners.set(extensionPoint, { componentId: view.definition.id, pluginId: plugin.manifest.id });
      }
    }
    for (const commandId of commandIds) this.#commandOwners.set(commandId, plugin.manifest.id);
    for (const interaction of plugin.interactions) {
      this.interactions.register(interaction);
      this.#interactionOwners.set(interaction.id, plugin.manifest.id);
      this.#notationOwners.set(interaction.notationKind, plugin.manifest.id);
    }
    for (const extension of plugin.componentExtensions) this.#extensionOwners.set(extension.id, plugin.manifest.id);
    this.#plugins.set(plugin.manifest.id, plugin);
  }
  list() {
    return [...this.#plugins.values()].map((plugin) => plugin.manifest);
  }
  /** Whole-session release. The platform prevents this host from being reused after disposal. */
  dispose() {
    this.interactions.clear();
    for (const definition of this.components.list()) this.components.unregister(definition.id);
    this.#plugins.clear();
    this.#componentOwners.clear();
    this.#commandOwners.clear();
    this.#interactionOwners.clear();
    this.#notationOwners.clear();
    this.#extensionOwners.clear();
    this.#extensionPointOwners.clear();
  }
  ownerOf(componentId) {
    const owner = this.#componentOwners.get(componentId);
    return owner ? this.#plugins.get(owner)?.manifest : void 0;
  }
  ownerOfCommand(commandId) {
    const owner = this.#commandOwners.get(commandId);
    return owner ? this.#plugins.get(owner)?.manifest : void 0;
  }
  ownerOfInteraction(interactionId) {
    const owner = this.#interactionOwners.get(interactionId);
    return owner ? this.#plugins.get(owner)?.manifest : void 0;
  }
  ownerOfComponentExtension(extensionId) {
    const owner = this.#extensionOwners.get(extensionId);
    return owner ? this.#plugins.get(owner)?.manifest : void 0;
  }
  #installed(snapshot, includedPluginIds) {
    return [...this.#plugins.values()].filter((module) => includedPluginIds === void 0 || includedPluginIds.has(module.manifest.id)).map((module) => ({ module, projections: snapshot.scoped(module.projections) }));
  }
  resolveCommands(snapshot, includedPluginIds) {
    const result = [];
    for (const plugin of this.#installed(snapshot, includedPluginIds)) {
      for (const contribution of plugin.module.commands) {
        try {
          const command = contribution.create(plugin.projections);
          if (command.id !== contribution.id) throw this.#failure(
            plugin.module,
            "UI-PLG-011",
            "resolution",
            "\u63D2\u4EF6\u547D\u4EE4\u5728\u88C5\u914D\u65F6\u6539\u53D8\u4E86\u58F0\u660E ID",
            `UI command factory changed its declared ID: ${contribution.id}`,
            { kind: "command", id: contribution.id }
          );
          result.push(command);
        } catch (error) {
          const failure = error instanceof UiPluginHostError ? error : this.#failure(
            plugin.module,
            "UI-PLG-012",
            "resolution",
            "\u63D2\u4EF6\u547D\u4EE4\u88C5\u914D\u5931\u8D25",
            `UI command contribution failed: ${contribution.id}: ${error instanceof Error ? error.message : String(error)}`,
            { kind: "command", id: contribution.id },
            error
          );
          this.#resolveFailure(failure);
        }
      }
    }
    return result;
  }
  resolveViews(snapshot, includedPluginIds) {
    const result = /* @__PURE__ */ new Map();
    const installed = this.#installed(snapshot, includedPluginIds);
    const extensions = (extensionPoint) => installed.flatMap((plugin) => plugin.module.componentExtensions.filter((extension) => extension.extensionPoint === extensionPoint).map((extension) => ({
      id: extension.id,
      order: extension.order ?? 0,
      render: () => extension.render(plugin.projections)
    }))).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const plugin of installed) {
      for (const view of plugin.module.views) {
        const componentId = view.definition.id;
        if (result.has(componentId)) {
          this.#resolveFailure(this.#failure(
            plugin.module,
            "UI-PLG-008",
            "resolution",
            "\u7EC4\u4EF6\u89C6\u56FE\u53D1\u751F\u8FD0\u884C\u65F6\u51B2\u7A81",
            `Duplicate UI view contribution: ${componentId}`,
            { kind: "component", id: componentId }
          ));
          continue;
        }
        const componentProjections = snapshot.scoped(plugin.module.projections.filter(
          (projection) => view.definition.permissions.projections.includes(projection.id)
        ));
        result.set(componentId, {
          componentId,
          label: view.label,
          ...view.icon === void 0 ? {} : { icon: view.icon },
          ...view.inlineZone === void 0 ? {} : { inlineZone: view.inlineZone },
          render: () => view.render(componentProjections, { extensions })
        });
      }
    }
    return result;
  }
};

// ../../apps/workbench/src/plugins/plugin-sdk-adapter.ts
function projectionReader(reader) {
  return reader;
}
function resolvedExtension(extension) {
  return extension;
}
function runtimeHost(pluginId, services) {
  return { settings: services?.settings(pluginId) ?? null };
}
function viewHost(host, pluginId, services) {
  return {
    ...runtimeHost(pluginId, services),
    extensions: (extensionPoint) => host.extensions(extensionPoint).map(resolvedExtension)
  };
}
function adaptUiPluginPackage(plugin, services) {
  return captureInternalUiPluginModule({
    ...plugin.ui === void 0 ? {} : { ui: plugin.ui },
    manifest: {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      tier: plugin.tier,
      apiVersion: plugin.apiVersion,
      runtime: "internal-module",
      activation: plugin.activation,
      requires: {
        hostFeatures: plugin.hostFeatures,
        hostServices: plugin.hostServices,
        projections: plugin.projections.map((projection) => projection.id)
      },
      contributes: {
        views: plugin.views.map((view) => view.definition.id),
        commands: plugin.commands.map((command) => command.id),
        interactions: plugin.interactions.map((interaction) => interaction.id),
        componentExtensions: plugin.componentExtensions.map((extension) => extension.id),
        instruments: plugin.instruments.map((instrument) => instrument.id),
        playbackOutputs: plugin.playbackOutputs.map((output) => output.id),
        applicationCapabilities: plugin.applicationCapabilities.map((capability) => capability.id),
        workflows: plugin.workflows.map((workflow) => workflow.id),
        kernelModules: plugin.kernelModules,
        ...plugin.ui === void 0 ? {} : { ui: mountUiManifest(plugin.ui) }
      }
    },
    projections: plugin.projections,
    commands: plugin.commands.map((contribution) => {
      const create = contribution.create;
      return {
        id: contribution.id,
        create: (reader) => create(
          projectionReader(reader),
          runtimeHost(plugin.id, services)
        )
      };
    }),
    interactions: plugin.interactions,
    componentExtensions: plugin.componentExtensions.map((contribution) => {
      const render = contribution.render;
      return {
        id: contribution.id,
        extensionPoint: contribution.extensionPoint,
        ...contribution.order === void 0 ? {} : { order: contribution.order },
        render: (reader) => render(projectionReader(reader), runtimeHost(plugin.id, services))
      };
    }),
    instruments: plugin.instruments,
    playbackOutputs: plugin.playbackOutputs,
    applicationCapabilities: plugin.applicationCapabilities,
    workflows: plugin.workflows,
    views: plugin.views.map((contribution) => {
      const render = contribution.render;
      return {
        definition: contribution.definition,
        label: contribution.label,
        ...contribution.icon === void 0 ? {} : { icon: contribution.icon },
        ...contribution.inlineZone === void 0 ? {} : { inlineZone: contribution.inlineZone },
        render: (reader, host) => render(projectionReader(reader), viewHost(host, plugin.id, services))
      };
    })
  });
}

// ../../apps/workbench/src/plugins/plugin-sdk.ts
var NOTE_CONTROL_EXTENSION_POINT = "notation.note-input.controls";
var packageBrand = /* @__PURE__ */ Symbol.for("brilliant-guitar.ui-plugin-package");
function immutableList(value) {
  return Object.freeze([...value ?? []]);
}
function componentDefinition(definition) {
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    kind: definition.kind,
    domain: definition.domain,
    slots: Object.freeze([...definition.slots]),
    presentation: Object.freeze({
      allowed: Object.freeze([...definition.presentation.allowed]),
      default: definition.presentation.default
    }),
    capabilities: Object.freeze({ ...definition.capabilities }),
    permissions: Object.freeze({
      projections: Object.freeze([...definition.permissions.projections]),
      commands: Object.freeze([...definition.permissions.commands])
    }),
    ...definition.extensionPoints === void 0 ? {} : { extensionPoints: Object.freeze([...definition.extensionPoints]) }
  });
}
function commands(value) {
  return Object.freeze((value ?? []).map((command) => Object.freeze({ id: command.id, create: command.create })));
}
function views(value) {
  return Object.freeze((value ?? []).map((view) => Object.freeze({
    definition: componentDefinition(view.definition),
    label: view.label,
    ...view.icon === void 0 ? {} : { icon: view.icon },
    ...view.inlineZone === void 0 ? {} : { inlineZone: view.inlineZone },
    render: view.render
  })));
}
function interactions(value) {
  return Object.freeze((value ?? []).map((interaction) => Object.freeze({
    id: interaction.id,
    notationKind: interaction.notationKind,
    input: Object.freeze({
      id: interaction.input.id,
      canHandle: interaction.input.canHandle,
      translate: interaction.input.translate
    }),
    readDraft: interaction.readDraft,
    startComposition: interaction.startComposition,
    navigate: interaction.navigate,
    edit: interaction.edit
  })));
}
function componentExtensions(value) {
  return Object.freeze((value ?? []).map((extension) => Object.freeze({
    id: extension.id,
    extensionPoint: extension.extensionPoint,
    ...extension.order === void 0 ? {} : { order: extension.order },
    render: extension.render
  })));
}
function instruments(value) {
  return Object.freeze((value ?? []).map((instrument) => Object.freeze({
    id: instrument.id,
    label: instrument.label,
    family: instrument.family,
    notationKinds: Object.freeze([...instrument.notationKinds]),
    ...instrument.noteControlExtensionIds === void 0 ? {} : { noteControlExtensionIds: Object.freeze([...instrument.noteControlExtensionIds]) },
    ...instrument.playbackProfileId === void 0 ? {} : { playbackProfileId: instrument.playbackProfileId }
  })));
}
function playbackOutputs(value) {
  return Object.freeze((value ?? []).map((output) => Object.freeze({
    id: output.id,
    kind: output.kind,
    label: output.label,
    createEngine: output.createEngine
  })));
}
function applicationCapabilities(pluginId, value) {
  const result = (value ?? []).map((capability) => {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(capability.id) || !Number.isSafeInteger(capability.contractVersion) || capability.contractVersion < 1 || capability.callers.length === 0 || new Set(capability.callers).size !== capability.callers.length || capability.callers.some((caller) => caller !== "ui" && caller !== "agent") || typeof capability.validateInput !== "function" || typeof capability.validateOutput !== "function") {
      throw new Error(`Invalid application capability contribution: ${pluginId}`);
    }
    return Object.freeze({
      ...capability,
      callers: Object.freeze([...capability.callers])
    });
  });
  if (new Set(result.map((capability) => capability.id)).size !== result.length) {
    throw new Error(`Duplicate application capability contribution: ${pluginId}`);
  }
  return Object.freeze(result);
}
function workflows(pluginId, value) {
  const result = (value ?? []).map((workflow) => {
    const operationIds = [...workflow.operationIds];
    const entryOperationIds = [...workflow.entryOperationIds];
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(workflow.id) || !Number.isSafeInteger(workflow.contractVersion) || workflow.contractVersion < 1 || !workflow.name.trim() || !workflow.description.trim() || workflow.runtime !== "agent-orchestration-v1" || operationIds.length === 0 || new Set(operationIds).size !== operationIds.length || operationIds.some((id) => !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)) || entryOperationIds.length === 0 || new Set(entryOperationIds).size !== entryOperationIds.length || entryOperationIds.some((id) => !operationIds.includes(id))) {
      throw new Error(`Invalid workflow contribution: ${pluginId}`);
    }
    return Object.freeze({
      ...workflow,
      operationIds: Object.freeze(operationIds),
      entryOperationIds: Object.freeze(entryOperationIds)
    });
  });
  if (new Set(result.map((workflow) => workflow.id)).size !== result.length) {
    throw new Error(`Duplicate workflow contribution: ${pluginId}`);
  }
  return Object.freeze(result);
}
function definePlugin(input) {
  const apiVersion = input.apiVersion === void 0 ? "3.0" : input.apiVersion;
  if (apiVersion !== "3.0" && apiVersion !== "4.0") throw new Error("Unsupported plugin API version");
  if (apiVersion === "3.0" && input.ui !== void 0) throw new Error("Mount UI facet requires plugin API 4.0");
  if (apiVersion === "4.0" && ((input.views?.length ?? 0) || (input.commands?.length ?? 0) || (input.componentExtensions?.length ?? 0))) throw new Error("Plugin API 4.0 requires mount UI contributions");
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(input.id)) throw new Error(`Invalid plugin ID: ${input.id}`);
  if (!input.name.trim()) throw new Error("Plugin name is required");
  if (!/^\d+\.\d+\.\d+$/.test(input.version)) throw new Error(`Invalid plugin version: ${input.version}`);
  if (input.settings && (!Number.isSafeInteger(input.settings.schemaVersion) || input.settings.schemaVersion < 1)) {
    throw new Error(`Invalid plugin settings schema version: ${input.id}`);
  }
  if (input.settings) {
    try {
      const parsed = input.settings.parse(input.settings.defaults);
      if (parsed && (typeof parsed === "object" || typeof parsed === "function") && "then" in parsed && typeof parsed.then === "function") {
        void Promise.resolve(parsed).catch(() => {
        });
        throw new Error(`Invalid plugin settings defaults: ${input.id}`);
      }
      if (parsed === null) {
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
    kernelModules
  }]);
  return Object.freeze({
    [packageBrand]: true,
    apiVersion,
    ...input.ui == null ? {} : { ui: capturePluginMountUi(input.ui, input.id) },
    id: input.id,
    name: input.name,
    version: input.version,
    tier,
    activation,
    kernelModules,
    hostFeatures: immutableList(input.hostFeatures),
    hostServices: new PluginHostServiceRegistry(input.hostServices ?? []).list(),
    projections: immutableList(input.projections),
    commands: commands(input.commands),
    views: views(input.views),
    interactions: interactions(input.interactions),
    componentExtensions: componentExtensions(input.componentExtensions),
    instruments: instruments(input.instruments),
    playbackOutputs: playbackOutputs(input.playbackOutputs),
    applicationCapabilities: applicationCapabilities(input.id, input.applicationCapabilities),
    workflows: workflows(input.id, input.workflows),
    ...input.settings ? { settings: Object.freeze({ ...input.settings }) } : {}
  });
}
function isUiPluginPackage(value) {
  return typeof value === "object" && value !== null && value[packageBrand] === true;
}
var isPluginPackage = isUiPluginPackage;

// ../../apps/workbench/src/plugins/plugin-settings.ts
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function captureSettingsValue(value, ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Plugin settings must contain persistent JSON data");
  }
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string") || Object.entries(descriptors).some(([key, descriptor]) => (key !== "length" || !Array.isArray(value)) && (!descriptor.enumerable || !("value" in descriptor)))) throw new TypeError("Invalid settings fields");
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => descriptors[String(index)]).some((item) => !item)) {
        throw new TypeError("Invalid settings array");
      }
      return Object.freeze(Array.from({ length: value.length }, (_, index) => captureSettingsValue(descriptors[String(index)].value, ancestors)));
    }
    return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, captureSettingsValue(descriptor.value, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function parseSettings(definition, value) {
  try {
    const parsed = definition.parse(value);
    if (parsed && (typeof parsed === "object" || typeof parsed === "function") && "then" in parsed && typeof parsed.then === "function") {
      void Promise.resolve(parsed).catch(() => {
      });
      return null;
    }
    return captureSettingsValue(parsed);
  } catch {
    return null;
  }
}
function normalizePluginSettingsDocument(value) {
  const source = record(value);
  if (!source) return Object.freeze({});
  const document = {};
  for (const [pluginId, rawEnvelope] of Object.entries(source)) {
    const envelope = record(rawEnvelope);
    if (!envelope || !Number.isSafeInteger(envelope.schemaVersion) || Number(envelope.schemaVersion) < 1 || !Object.prototype.hasOwnProperty.call(envelope, "value")) continue;
    document[pluginId] = Object.freeze({ schemaVersion: Number(envelope.schemaVersion), value: envelope.value });
  }
  return Object.freeze(document);
}
var PluginSettingsRegistry = class {
  #definitions = /* @__PURE__ */ new Map();
  #values = /* @__PURE__ */ new Map();
  #listeners = /* @__PURE__ */ new Set();
  register(pluginId, contribution) {
    if (this.#definitions.has(pluginId)) throw new Error(`Plugin settings already registered: ${pluginId}`);
    const definition = {
      schemaVersion: contribution.schemaVersion,
      defaults: contribution.defaults,
      parse: contribution.parse
    };
    const defaults = parseSettings(definition, contribution.defaults);
    if (defaults === null) throw new Error(`Plugin settings defaults are invalid: ${pluginId}`);
    this.#definitions.set(pluginId, {
      schemaVersion: contribution.schemaVersion,
      defaults,
      parse: contribution.parse
    });
    this.#values.set(pluginId, defaults);
  }
  has(pluginId) {
    return this.#definitions.has(pluginId);
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  read(pluginId) {
    if (!this.#definitions.has(pluginId)) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    return this.#values.get(pluginId);
  }
  write(pluginId, value) {
    const definition = this.#definitions.get(pluginId);
    if (!definition) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    const parsed = parseSettings(definition, value);
    if (parsed === null) throw new Error(`Plugin settings are invalid: ${pluginId}`);
    this.#values.set(pluginId, parsed);
    this.#publish();
    return parsed;
  }
  reset(pluginId) {
    const definition = this.#definitions.get(pluginId);
    if (!definition) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    this.#values.set(pluginId, definition.defaults);
    this.#publish();
    return definition.defaults;
  }
  restore(value) {
    const source = normalizePluginSettingsDocument(value);
    const restored = [];
    const defaulted = [];
    for (const [pluginId, definition] of this.#definitions) {
      const envelope = source[pluginId];
      const parsed = envelope?.schemaVersion === definition.schemaVersion ? parseSettings(definition, envelope.value) : null;
      if (parsed === null) {
        this.#values.set(pluginId, definition.defaults);
        defaulted.push(pluginId);
      } else {
        this.#values.set(pluginId, parsed);
        restored.push(pluginId);
      }
    }
    this.#publish();
    return Object.freeze({ restored: Object.freeze(restored), defaulted: Object.freeze(defaulted) });
  }
  serialize() {
    const document = {};
    for (const [pluginId, definition] of this.#definitions) {
      document[pluginId] = Object.freeze({
        schemaVersion: definition.schemaVersion,
        value: this.#values.get(pluginId)
      });
    }
    return Object.freeze(document);
  }
  dispose() {
    this.#definitions.clear();
    this.#values.clear();
    this.#listeners.clear();
  }
  #publish() {
    notifyObservers(this.#listeners);
  }
};

// ../../apps/workbench/src/plugins/plugin-settings-persistence.ts
var PluginSettingsPersistence = class {
  #registry;
  #storage;
  #preserved = Object.freeze({});
  #writeQueue = Promise.resolve();
  #disposed = false;
  constructor(registry, storage) {
    this.#registry = registry;
    this.#storage = storage;
  }
  async restore() {
    this.#assertAlive();
    const document = await this.#storage.read();
    this.#assertAlive();
    this.#preserved = normalizePluginSettingsDocument(document);
    const result = this.#registry.restore(this.#preserved);
    await this.#enqueue(this.#mergedDocument());
    return result;
  }
  async write(pluginId, value) {
    this.#assertAlive();
    const normalized = this.#registry.write(pluginId, value);
    await this.#enqueue(this.#mergedDocument());
    return normalized;
  }
  async reset(pluginId) {
    this.#assertAlive();
    const defaults = this.#registry.reset(pluginId);
    await this.#enqueue(this.#mergedDocument());
    return defaults;
  }
  snapshot() {
    this.#assertAlive();
    return this.#mergedDocument();
  }
  #mergedDocument() {
    return Object.freeze({ ...this.#preserved, ...this.#registry.serialize() });
  }
  #enqueue(document) {
    const task = this.#writeQueue.catch(() => void 0).then(() => {
      this.#assertAlive();
      return this.#storage.write(document);
    }).then(() => {
      this.#assertAlive();
      this.#preserved = document;
    });
    this.#writeQueue = task;
    return task;
  }
  dispose() {
    this.#disposed = true;
  }
  #assertAlive() {
    if (this.#disposed) throw new Error("Plugin settings persistence is disposed");
  }
};

// ../../apps/workbench/src/plugins/plugin-activation-persistence.ts
var pluginIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function normalizePluginActivationDocument(value) {
  const source = record2(value);
  const ids = source?.schemaVersion === 1 && Array.isArray(source.enabledPluginIds) ? source.enabledPluginIds.filter((item) => typeof item === "string" && pluginIdPattern.test(item)) : [];
  return Object.freeze({ schemaVersion: 1, enabledPluginIds: Object.freeze([...new Set(ids)]) });
}
var PluginActivationPersistence = class {
  #target;
  #storage;
  #desired = /* @__PURE__ */ new Set();
  #writeQueue = Promise.resolve();
  #disposed = false;
  constructor(target, storage) {
    this.#target = target;
    this.#storage = storage;
  }
  async restore() {
    this.#assertAlive();
    const document = normalizePluginActivationDocument(await this.#storage.read());
    this.#assertAlive();
    this.#desired = new Set(document.enabledPluginIds);
    this.#target.restoreActivation(document.enabledPluginIds);
    await this.#enqueue(document);
    return document;
  }
  async setEnabled(pluginId, enabled) {
    this.#assertAlive();
    if (!pluginIdPattern.test(pluginId)) throw new Error(`Invalid plugin ID: ${pluginId}`);
    if (enabled) this.#desired.add(pluginId);
    else this.#desired.delete(pluginId);
    const document = this.snapshot();
    this.#target.restoreActivation(document.enabledPluginIds);
    await this.#enqueue(document);
    return document;
  }
  snapshot() {
    this.#assertAlive();
    return Object.freeze({
      schemaVersion: 1,
      enabledPluginIds: Object.freeze([...this.#desired])
    });
  }
  #enqueue(document) {
    const task = this.#writeQueue.catch(() => void 0).then(() => {
      this.#assertAlive();
      return this.#storage.write(document);
    });
    this.#writeQueue = task;
    return task;
  }
  dispose() {
    this.#disposed = true;
  }
  #assertAlive() {
    if (this.#disposed) throw new Error("Plugin activation persistence is disposed");
  }
};

// ../../apps/workbench/src/plugins/plugin-session-activation.ts
var PluginSessionActivation = class {
  #kinds = /* @__PURE__ */ new Map();
  #desiredUserPluginIds = /* @__PURE__ */ new Set();
  #selectedPluginIds = /* @__PURE__ */ new Set();
  #activePluginIds = /* @__PURE__ */ new Set();
  #running = false;
  register(pluginId, kind) {
    if (this.#running) throw new Error("Plugin activation session has already started");
    if (this.#kinds.has(pluginId)) throw new Error(`Plugin activation already registered: ${pluginId}`);
    this.#kinds.set(pluginId, kind);
  }
  phase() {
    return this.#running ? "running" : "configuring";
  }
  start(selectedPluginIds) {
    if (this.#running) return;
    const selectedUsers = selectedPluginIds === void 0 ? this.#desiredUserPluginIds : new Set(selectedPluginIds);
    for (const [pluginId, kind] of this.#kinds) {
      if (kind === "always" || selectedUsers.has(pluginId)) this.#selectedPluginIds.add(pluginId);
    }
    this.#running = true;
  }
  selectedForSession(pluginId) {
    if (!this.#running) throw new Error("Plugin activation session has not started");
    return this.#selectedPluginIds.has(pluginId);
  }
  markActive(pluginId) {
    if (!this.#selectedPluginIds.has(pluginId)) {
      throw new Error(`Plugin was not selected for this session: ${pluginId}`);
    }
    this.#activePluginIds.add(pluginId);
  }
  restoreDesired(pluginIds) {
    const desired = new Set(pluginIds);
    this.#desiredUserPluginIds.clear();
    for (const [pluginId, kind] of this.#kinds) {
      if (kind === "user" && desired.has(pluginId)) this.#desiredUserPluginIds.add(pluginId);
    }
  }
  setDesired(pluginId, enabled) {
    const kind = this.#kinds.get(pluginId);
    if (kind !== "user") return this.#change(pluginId, "rejected");
    const before = this.state(pluginId);
    if (enabled) this.#desiredUserPluginIds.add(pluginId);
    else this.#desiredUserPluginIds.delete(pluginId);
    const after = this.state(pluginId);
    const changed = before.nextLaunchActive !== after.nextLaunchActive || before.restartRequired !== after.restartRequired;
    return this.#change(pluginId, !changed ? "unchanged" : this.#running ? "restart-required" : "configured");
  }
  state(pluginId) {
    const kind = this.#kinds.get(pluginId);
    const active = this.#activePluginIds.has(pluginId);
    const nextLaunchActive = kind === "always" || kind === "user" && this.#desiredUserPluginIds.has(pluginId);
    return Object.freeze({
      active,
      nextLaunchActive,
      restartRequired: this.#running && active !== nextLaunchActive
    });
  }
  activeIds() {
    return new Set(this.#activePluginIds);
  }
  nextLaunchIds() {
    return new Set([...this.#kinds].filter(([pluginId, kind]) => kind === "always" || this.#desiredUserPluginIds.has(pluginId)).map(([pluginId]) => pluginId));
  }
  restartRequired() {
    return [...this.#kinds].some(([pluginId]) => this.state(pluginId).restartRequired);
  }
  #change(pluginId, effect) {
    return Object.freeze({ pluginId, ...this.state(pluginId), effect });
  }
};

// ../../apps/workbench/src/plugins/plugin-platform.ts
function kernelPackageSource(manifest) {
  return {
    id: manifest.id,
    version: manifest.version,
    activation: manifest.activation,
    ...manifest.tier === void 0 ? {} : { tier: manifest.tier },
    ...manifest.contributes.kernelModules === void 0 ? {} : { kernelModules: manifest.contributes.kernelModules }
  };
}
function sortedHostServiceGrants(grants) {
  return Object.freeze([...grants].sort((left, right) => left.pluginId < right.pluginId ? -1 : left.pluginId > right.pluginId ? 1 : 0));
}
var PluginPlatform = class {
  diagnostics;
  #catalog = new UiPluginCatalog();
  #ui;
  #uiFeatures;
  #settings = new PluginSettingsRegistry();
  #componentDirectory;
  #interactionDirectory;
  #projectionDirectory;
  #settingsDirectory;
  #hostServicePolicy;
  #hostServiceGrantDirectory;
  #settingsHosts = /* @__PURE__ */ new Map();
  #hostServiceGrants = /* @__PURE__ */ new Map();
  #activation = new PluginSessionActivation();
  #records = /* @__PURE__ */ new Map();
  #instrumentOwners = /* @__PURE__ */ new Map();
  #playbackOutputOwners = /* @__PURE__ */ new Map();
  #applicationCapabilities = /* @__PURE__ */ new Map();
  #applicationCapabilityDirectory;
  #workflows = /* @__PURE__ */ new Map();
  #workflowDirectory;
  #listeners = /* @__PURE__ */ new Set();
  #onDiagnostic;
  #snapshot = Object.freeze([]);
  #settingsPersistence = null;
  #activationPersistence = null;
  #disposed = false;
  #stopSettings;
  constructor(options) {
    this.#uiFeatures = options.hostFeatures;
    this.diagnostics = options.diagnostics ?? new UiPluginDiagnosticStore();
    this.#onDiagnostic = options.onDiagnostic;
    this.#hostServicePolicy = new PluginHostServicePolicy(
      options.hostServices ?? new PluginHostServiceRegistry([]),
      options.hostServicePolicy
    );
    const projections = new UiProjectionRegistry(options.projections);
    this.#ui = options.createContributionHost?.({
      features: options.hostFeatures,
      projections,
      reportDiagnostic: (diagnostic) => this.#report(diagnostic),
      settings: (pluginId) => this.#settingsHost(pluginId)
    }) ?? new UiPluginHost(options.hostFeatures, projections, (diagnostic) => this.#report(diagnostic));
    this.#componentDirectory = Object.freeze({
      get: (id) => this.#ui.components.get(id),
      list: () => this.#ui.components.list()
    });
    this.#interactionDirectory = Object.freeze({
      hasId: (id) => this.#ui.interactions.hasId(id),
      hasKind: (kind) => this.#ui.interactions.hasKind(kind),
      list: () => this.#ui.interactions.list(),
      translate: (kind, signal, context) => this.#ui.interactions.translate(kind, signal, context),
      readDraft: (kind, composition) => this.#ui.interactions.readDraft(kind, composition),
      startComposition: (kind, draft) => this.#ui.interactions.startComposition(kind, draft),
      navigate: (kind, signal, context) => this.#ui.interactions.navigate(kind, signal, context),
      edit: (kind, signal, context) => this.#ui.interactions.edit(kind, signal, context)
    });
    this.#projectionDirectory = Object.freeze({
      has: (id) => this.#ui.projections.has(id),
      list: () => this.#ui.projections.list(),
      snapshot: (...args) => this.#ui.projections.snapshot(...args)
    });
    this.#settingsDirectory = Object.freeze({
      has: (pluginId) => this.#settings.has(pluginId),
      subscribe: (listener) => {
        this.#assertAlive();
        return this.#settings.subscribe(listener);
      },
      read: (pluginId) => this.#settings.read(pluginId),
      write: (pluginId, value) => {
        this.#assertAlive();
        return this.#settings.write(pluginId, value);
      },
      reset: (pluginId) => {
        this.#assertAlive();
        return this.#settings.reset(pluginId);
      },
      restore: (value) => {
        this.#assertAlive();
        return this.#settings.restore(value);
      },
      serialize: () => this.#settings.serialize()
    });
    this.#hostServiceGrantDirectory = Object.freeze({
      get: (pluginId) => this.#hostServiceGrants.get(pluginId),
      list: () => sortedHostServiceGrants(this.#hostServiceGrants.values())
    });
    this.#applicationCapabilityDirectory = Object.freeze({
      get: (id) => this.#applicationCapabilities.get(id),
      list: (caller) => Object.freeze([...this.#applicationCapabilities.values()].filter((capability) => caller === void 0 || capability.callers.includes(caller)))
    });
    this.#workflowDirectory = Object.freeze({
      get: (id) => this.#workflows.get(id),
      list: () => Object.freeze([...this.#workflows.values()]),
      listByPlugin: (ownerPluginId) => Object.freeze([...this.#workflows.values()].filter((workflow) => workflow.ownerPluginId === ownerPluginId))
    });
    this.#stopSettings = this.#settings.subscribe(() => this.#publish());
  }
  register(registration) {
    this.#assertAlive();
    if (this.phase() === "running") throw new Error("Plugin platform has already started");
    let plugin;
    let pluginPackage = null;
    if (isUiPluginPackage(registration)) {
      pluginPackage = registration;
      plugin = adaptUiPluginPackage(registration, { settings: (pluginId) => this.#settingsHost(pluginId) });
    } else {
      plugin = captureInternalUiPluginModule(registration);
    }
    if (this.#records.has(plugin.manifest.id)) throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    createPluginKernelAssemblyPlanV1([
      ...[...this.#records.values()].map((record3) => kernelPackageSource(record3.manifest)),
      kernelPackageSource(plugin.manifest)
    ]);
    if (pluginPackage?.settings) this.#settings.register(plugin.manifest.id, pluginPackage.settings);
    this.#catalog.register(plugin);
    this.#activation.register(plugin.manifest.id, plugin.manifest.activation);
    this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "discovered"));
    this.#publish();
  }
  registerAll(plugins) {
    for (const plugin of plugins) this.register(plugin);
  }
  start(options = {}) {
    this.#assertAlive();
    if (this.phase() === "running") return this.sessionPlan();
    this.#activation.start(options.selectedPluginIds);
    for (const plugin of this.#catalog.installationPlan()) {
      if (!this.#activation.selectedForSession(plugin.manifest.id)) {
        this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "installed"));
        continue;
      }
      try {
        const missingFeatures = plugin.manifest.requires.hostFeatures.filter((id) => !this.#uiFeatures.has(id));
        const missingProjections = plugin.manifest.requires.projections.filter((id) => !this.#ui.projections.has(id));
        if (plugin.manifest.apiVersion === "4.0" && (missingFeatures.length || missingProjections.length)) throw new Error(
          `Unavailable plugin requirements: ${[...missingFeatures, ...missingProjections].join(", ")}`
        );
        const hostServiceGrant = this.#resolveHostServiceGrant(plugin);
        this.#validateInstruments(plugin);
        this.#validatePlaybackOutputs(plugin);
        this.#validateApplicationCapabilities(plugin);
        this.#validateWorkflows(plugin);
        this.#ui.install(plugin);
        for (const instrument of plugin.instruments ?? []) {
          this.#instrumentOwners.set(instrument.id, plugin.manifest.id);
        }
        for (const output of plugin.playbackOutputs ?? []) {
          this.#playbackOutputOwners.set(output.id, plugin.manifest.id);
        }
        for (const capability of plugin.applicationCapabilities ?? []) {
          this.#applicationCapabilities.set(capability.id, Object.freeze({
            ...capability,
            callers: Object.freeze([...capability.callers]),
            ownerPluginId: plugin.manifest.id
          }));
        }
        for (const workflow of plugin.workflows ?? []) {
          this.#workflows.set(workflow.id, Object.freeze({
            ...workflow,
            operationIds: Object.freeze([...workflow.operationIds]),
            entryOperationIds: Object.freeze([...workflow.entryOperationIds]),
            ownerPluginId: plugin.manifest.id,
            ownerPluginVersion: plugin.manifest.version
          }));
        }
        this.#hostServiceGrants.set(plugin.manifest.id, hostServiceGrant);
        this.#activation.markActive(plugin.manifest.id);
        this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "active"));
      } catch (error) {
        const failure = isUiPluginHostError(error) ? error : new UiPluginHostError({
          code: "UI-PLG-012",
          stage: "registration",
          plugin: uiPluginIdentity(plugin.manifest),
          message: "\u754C\u9762\u63D2\u4EF6\u88C5\u914D\u5931\u8D25",
          detail: error instanceof Error ? error.message : String(error),
          cause: error
        });
        this.#report(failure.diagnostic);
        this.#records.set(plugin.manifest.id, Object.freeze({ ...this.#runtimeInfo(plugin.manifest, "failed"), error: failure.diagnostic.detail }));
      }
    }
    this.#publish();
    return this.sessionPlan();
  }
  phase() {
    return this.#disposed ? "disposed" : this.#activation.phase();
  }
  list() {
    return this.#snapshot;
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener) => {
    this.#assertAlive();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  /** Configures activation before launch, or schedules it for the next launch after the session is locked. */
  activate(pluginId) {
    return this.#setNextLaunchActivation(pluginId, true);
  }
  /** Configures activation before launch, or schedules it for the next launch after the session is locked. */
  deactivate(pluginId) {
    return this.#setNextLaunchActivation(pluginId, false);
  }
  /**
   * Reconciles the desired user-plugin set. Before start this configures the imminent
   * session; after start it only changes the next-launch plan. The current session is immutable.
   */
  restoreActivation(pluginIds) {
    this.#assertAlive();
    this.#activation.restoreDesired(pluginIds);
    if (this.#refreshActivationRecords()) this.#publish();
  }
  activatedPluginIds() {
    return this.#disposed ? /* @__PURE__ */ new Set() : this.#activation.activeIds();
  }
  nextLaunchPluginIds() {
    return this.#activation.nextLaunchIds();
  }
  restartRequired() {
    return this.#activation.restartRequired();
  }
  sessionPlan() {
    if (this.phase() !== "running") throw new Error("Plugin platform has not started");
    return Object.freeze({
      planVersion: 1,
      pluginIds: Object.freeze([...this.#activation.activeIds()].sort()),
      hostServiceGrants: sortedHostServiceGrants(this.#hostServiceGrants.values()),
      kernelAssembly: this.kernelAssemblyPlan()
    });
  }
  /** Data-only fixed-session plan. The trusted host resolves implementations in a separate execution adapter. */
  kernelAssemblyPlan() {
    return createPluginKernelAssemblyPlanV1(
      [...this.#records.values()].filter((record3) => this.phase() === "running" ? record3.active : record3.nextLaunchActive).map((record3) => kernelPackageSource(record3.manifest))
    );
  }
  components() {
    return this.#componentDirectory;
  }
  interactions() {
    return this.#interactionDirectory;
  }
  projections() {
    return this.#projectionDirectory;
  }
  settings() {
    return this.#settingsDirectory;
  }
  hostServiceGrants() {
    return this.#hostServiceGrantDirectory;
  }
  applicationCapabilities() {
    return this.#applicationCapabilityDirectory;
  }
  workflows() {
    return this.#workflowDirectory;
  }
  instruments() {
    return Object.freeze(this.#catalog.list().flatMap((plugin) => {
      const record3 = this.#records.get(plugin.manifest.id);
      return record3?.active ? [...plugin.instruments ?? []] : [];
    }));
  }
  playbackOutputs() {
    return Object.freeze(this.#catalog.list().flatMap((plugin) => {
      const record3 = this.#records.get(plugin.manifest.id);
      return record3?.active ? [...plugin.playbackOutputs ?? []] : [];
    }));
  }
  connectSettings(storage) {
    this.#assertAlive();
    if (this.phase() !== "running") throw new Error("Plugin platform has not started");
    if (this.#settingsPersistence) throw new Error("Plugin settings storage is already connected");
    this.#settingsPersistence = new PluginSettingsPersistence(this.#settings, storage);
    return this.#settingsPersistence;
  }
  connectActivation(storage) {
    this.#assertAlive();
    if (this.#activationPersistence) throw new Error("Plugin activation storage is already connected");
    this.#activationPersistence = new PluginActivationPersistence(this, storage);
    return this.#activationPersistence;
  }
  resolveCommands(snapshot) {
    this.#assertAlive();
    return this.#ui.resolveCommands(snapshot, this.#activation.activeIds());
  }
  resolveViews(snapshot) {
    this.#assertAlive();
    return this.#ui.resolveViews(snapshot, this.#activation.activeIds());
  }
  /** Frozen, data-only mount descriptors for UI management; implementations remain private. */
  uiContributions(pluginId) {
    const ui = this.#catalog.list().find((plugin) => plugin.manifest.id === pluginId)?.ui;
    if (!ui) return void 0;
    return Object.freeze({
      components: Object.freeze(ui.components.map(({ mount: _mount, ...data }) => Object.freeze(data))),
      commands: Object.freeze(ui.commands.map((command) => Object.freeze({ id: command.id, label: command.label ?? command.id }))),
      menuItems: ui.menuItems,
      shortcuts: ui.shortcuts
    });
  }
  /** Placement query over the active catalog. Does not own another registry or lifecycle. */
  facets(facetId) {
    if (this.#disposed || facetId !== void 0 && facetId !== "ui") return Object.freeze([]);
    return Object.freeze(this.#catalog.list().filter((plugin) => this.#records.get(plugin.manifest.id)?.active && plugin.ui).map((plugin) => {
      const units = plugin.ui.components;
      const surface = (unit, kind) => Object.freeze({
        id: unit.id,
        componentId: unit.id,
        kind,
        slots: unit.slots,
        role: unit.role
      });
      const page = (unit) => unit.uiKind === "page" || unit.role === "view";
      return Object.freeze({
        facetId: "ui",
        contractVersion: 1,
        pluginId: plugin.manifest.id,
        value: Object.freeze({
          facetId: "ui",
          contractVersion: 1,
          modules: Object.freeze(units.filter((unit) => !page(unit)).map((unit) => surface(unit, "module"))),
          pages: Object.freeze(units.filter(page).map((unit) => surface(unit, "page"))),
          slots: Object.freeze([...new Set(units.flatMap((unit) => unit.slots))])
        })
      });
    }));
  }
  /** Ends this entire application session permanently. Not a per-plugin hot unload API. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopSettings();
    this.#settingsPersistence?.dispose();
    this.#activationPersistence?.dispose();
    try {
      this.#ui.dispose();
    } finally {
      this.#catalog.clear();
      this.#settings.dispose();
      this.#hostServiceGrants.clear();
      this.#settingsHosts.clear();
      this.#records.clear();
      this.#instrumentOwners.clear();
      this.#playbackOutputOwners.clear();
      this.#applicationCapabilities.clear();
      this.#workflows.clear();
      try {
        this.#publish();
      } finally {
        this.#listeners.clear();
      }
    }
  }
  #assertAlive() {
    if (this.#disposed) throw new Error("Plugin platform is disposed");
  }
  #setNextLaunchActivation(pluginId, enabled) {
    this.#assertAlive();
    const change = this.#activation.setDesired(pluginId, enabled);
    if (change.effect !== "rejected" && this.#refreshActivationRecord(pluginId)) this.#publish();
    return change;
  }
  #runtimeInfo(manifest, status) {
    return Object.freeze({ manifest, status, ...this.#activation.state(manifest.id) });
  }
  #refreshActivationRecord(pluginId) {
    const record3 = this.#records.get(pluginId);
    if (!record3) return false;
    const state = this.#activation.state(pluginId);
    if (record3.active === state.active && record3.nextLaunchActive === state.nextLaunchActive && record3.restartRequired === state.restartRequired) return false;
    this.#records.set(pluginId, Object.freeze({ ...record3, ...state }));
    return true;
  }
  #refreshActivationRecords() {
    let changed = false;
    for (const pluginId of this.#records.keys()) changed = this.#refreshActivationRecord(pluginId) || changed;
    return changed;
  }
  #report(diagnostic) {
    this.diagnostics.report(diagnostic);
    if (this.#onDiagnostic) notifyObservers([() => this.#onDiagnostic?.(diagnostic)]);
  }
  #settingsHost(pluginId) {
    if (!this.#settings.has(pluginId)) return null;
    const existing = this.#settingsHosts.get(pluginId);
    if (existing) return existing;
    const host = Object.freeze({
      read: () => this.#settings.read(pluginId),
      write: (value) => {
        this.#assertAlive();
        return this.#settingsPersistence ? this.#settingsPersistence.write(pluginId, value) : Promise.resolve(this.#settings.write(pluginId, value));
      },
      reset: () => {
        this.#assertAlive();
        return this.#settingsPersistence ? this.#settingsPersistence.reset(pluginId) : Promise.resolve(this.#settings.reset(pluginId));
      }
    });
    this.#settingsHosts.set(pluginId, host);
    return host;
  }
  #resolveHostServiceGrant(plugin) {
    const resolution = this.#hostServicePolicy.resolve({
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      tier: plugin.manifest.tier ?? "product",
      requiredHostServices: plugin.manifest.requires.hostServices ?? []
    });
    if (resolution.accepted) return resolution.grant;
    const denied = [
      ...resolution.denial.unavailable,
      ...resolution.denial.deniedByTier,
      ...resolution.denial.deniedByUser,
      ...resolution.denial.deniedBySession
    ][0] ?? "unknown.host-service";
    throw new UiPluginHostError({
      code: "UI-PLG-003",
      stage: "permissions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "host-service", id: denied },
      message: "\u63D2\u4EF6\u6240\u9700\u5BBF\u4E3B\u670D\u52A1\u672A\u83B7\u6388\u6743",
      detail: `Plugin ${plugin.manifest.id} host service grant denied: ${describePluginHostServiceDenial(resolution.denial)}`
    });
  }
  #validateInstruments(plugin) {
    const instruments2 = plugin.instruments ?? [];
    const actualIds = instruments2.map((instrument) => instrument.id);
    const declaredIds = plugin.manifest.contributes.instruments ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "\u4E50\u5668\u63CF\u8FF0\u4E0E\u63D2\u4EF6\u6E05\u5355\u4E0D\u4E00\u81F4",
      detail: `UI plugin ${plugin.manifest.id} instrument binding does not match its manifest`
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "instrument", id: duplicateId },
      message: "\u63D2\u4EF6\u5305\u542B\u91CD\u590D\u4E50\u5668\u63CF\u8FF0",
      detail: `UI plugin ${plugin.manifest.id} contains duplicate instrument: ${duplicateId}`
    });
    for (const instrument of instruments2) {
      const extensionIds = instrument.noteControlExtensionIds ?? [];
      const validExtensionIds = extensionIds.length === new Set(extensionIds).size && extensionIds.every((id) => /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id));
      const validNotationKinds = instrument.notationKinds.length > 0 && instrument.notationKinds.length === new Set(instrument.notationKinds).size && instrument.notationKinds.every((kind) => ["staff", "tablature", "numbered"].includes(kind));
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(instrument.id) || !instrument.label.trim() || !/^[a-z][a-z0-9-]*$/.test(instrument.family) || !validNotationKinds || !validExtensionIds || instrument.playbackProfileId !== void 0 && !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(instrument.playbackProfileId)) {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "instrument", id: instrument.id },
          message: "\u4E50\u5668\u63CF\u8FF0\u5B9A\u4E49\u65E0\u6548",
          detail: `UI plugin ${plugin.manifest.id} contains an invalid instrument: ${instrument.id}`
        });
      }
      for (const extensionId of extensionIds) {
        const extension = plugin.componentExtensions.find((item) => item.id === extensionId);
        if (!extension || extension.extensionPoint !== NOTE_CONTROL_EXTENSION_POINT) {
          throw new UiPluginHostError({
            code: "UI-PLG-009",
            stage: "permissions",
            plugin: uiPluginIdentity(plugin.manifest),
            subject: { kind: "component-extension", id: extensionId },
            message: "\u4E50\u5668\u63CF\u8FF0\u5F15\u7528\u4E86\u672A\u58F0\u660E\u7684\u97F3\u7B26\u63A7\u5236\u6269\u5C55",
            detail: `Instrument ${instrument.id} references an unavailable note-control extension: ${extensionId}`
          });
        }
      }
      const ownerPluginId = this.#instrumentOwners.get(instrument.id);
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "instrument", id: instrument.id, ownerPluginId },
        message: "\u4E50\u5668\u63CF\u8FF0 ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        detail: `Instrument already owned: ${instrument.id}`
      });
    }
  }
  #validatePlaybackOutputs(plugin) {
    const outputs = plugin.playbackOutputs ?? [];
    const actualIds = outputs.map((output) => output.id);
    const declaredIds = plugin.manifest.contributes.playbackOutputs ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "\u64AD\u653E\u8F93\u51FA\u4E0E\u63D2\u4EF6\u6E05\u5355\u4E0D\u4E00\u81F4",
      detail: `UI plugin ${plugin.manifest.id} playback output binding does not match its manifest`
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "playback-output", id: duplicateId },
      message: "\u63D2\u4EF6\u5305\u542B\u91CD\u590D\u64AD\u653E\u8F93\u51FA",
      detail: `UI plugin ${plugin.manifest.id} contains duplicate playback output: ${duplicateId}`
    });
    for (const output of outputs) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(output.id) || !output.label.trim() || !["builtin-synth", "sample-bank", "midi-out"].includes(output.kind) || typeof output.createEngine !== "function") {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "playback-output", id: output.id },
          message: "\u64AD\u653E\u8F93\u51FA\u5B9A\u4E49\u65E0\u6548",
          detail: `UI plugin ${plugin.manifest.id} contains an invalid playback output: ${output.id}`
        });
      }
      const ownerPluginId = this.#playbackOutputOwners.get(output.id);
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "playback-output", id: output.id, ownerPluginId },
        message: "\u64AD\u653E\u8F93\u51FA ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        detail: `Playback output already owned: ${output.id}`
      });
    }
  }
  #validateApplicationCapabilities(plugin) {
    const capabilities = plugin.applicationCapabilities ?? [];
    const actualIds = capabilities.map((capability) => capability.id);
    const declaredIds = plugin.manifest.contributes.applicationCapabilities ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "\u5E94\u7528\u80FD\u529B\u4E0E\u63D2\u4EF6\u6E05\u5355\u4E0D\u4E00\u81F4",
      detail: `Plugin ${plugin.manifest.id} application capability binding does not match its manifest`
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "capability", id: duplicateId },
      message: "\u63D2\u4EF6\u5305\u542B\u91CD\u590D\u5E94\u7528\u80FD\u529B",
      detail: `Plugin ${plugin.manifest.id} contains duplicate Application Capability: ${duplicateId}`
    });
    for (const capability of capabilities) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(capability.id) || !Number.isSafeInteger(capability.contractVersion) || capability.contractVersion < 1 || capability.callers.length === 0 || capability.callers.length !== new Set(capability.callers).size || capability.callers.some((caller) => caller !== "ui" && caller !== "agent") || typeof capability.validateInput !== "function" || typeof capability.validateOutput !== "function") {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "capability", id: capability.id },
          message: "\u5E94\u7528\u80FD\u529B\u5B9A\u4E49\u65E0\u6548",
          detail: `Plugin ${plugin.manifest.id} contains an invalid Application Capability: ${capability.id}`
        });
      }
      const ownerPluginId = this.#applicationCapabilities.get(capability.id)?.ownerPluginId;
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "capability", id: capability.id, ownerPluginId },
        message: "\u5E94\u7528\u80FD\u529B ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        detail: `Application Capability already owned: ${capability.id}`
      });
    }
  }
  #validateWorkflows(plugin) {
    const workflows2 = plugin.workflows ?? [];
    const actualIds = workflows2.map((workflow) => workflow.id);
    const declaredIds = plugin.manifest.contributes.workflows ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "\u5DE5\u4F5C\u6D41\u4E0E\u63D2\u4EF6\u6E05\u5355\u4E0D\u4E00\u81F4",
      detail: `Plugin ${plugin.manifest.id} workflow binding does not match its manifest`
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "workflow", id: duplicateId },
      message: "\u63D2\u4EF6\u5305\u542B\u91CD\u590D\u5DE5\u4F5C\u6D41",
      detail: `Plugin ${plugin.manifest.id} contains duplicate workflow: ${duplicateId}`
    });
    for (const workflow of workflows2) {
      const validOperationIds = workflow.operationIds.length > 0 && workflow.operationIds.length === new Set(workflow.operationIds).size && workflow.operationIds.every((id) => /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id));
      const validEntryIds = workflow.entryOperationIds.length > 0 && workflow.entryOperationIds.length === new Set(workflow.entryOperationIds).size && workflow.entryOperationIds.every((id) => workflow.operationIds.includes(id));
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(workflow.id) || !Number.isSafeInteger(workflow.contractVersion) || workflow.contractVersion < 1 || !workflow.name.trim() || !workflow.description.trim() || workflow.runtime !== "agent-orchestration-v1" || !validOperationIds || !validEntryIds) {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "workflow", id: workflow.id },
          message: "\u5DE5\u4F5C\u6D41\u5B9A\u4E49\u65E0\u6548",
          detail: `Plugin ${plugin.manifest.id} contains an invalid workflow: ${workflow.id}`
        });
      }
      const ownerPluginId = this.#workflows.get(workflow.id)?.ownerPluginId;
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "workflow", id: workflow.id, ownerPluginId },
        message: "\u5DE5\u4F5C\u6D41 ID \u4E0E\u5176\u4ED6\u63D2\u4EF6\u51B2\u7A81",
        detail: `Workflow already owned: ${workflow.id}`
      });
    }
  }
  #publish() {
    this.#snapshot = Object.freeze([...this.#records.values()].map((record3) => Object.freeze({ ...record3 })));
    notifyObservers(this.#listeners);
  }
};

// ../../apps/workbench/src/plugins/plugin-mount-host.ts
function createMountContributionHost(context, installMount) {
  const business = new UiPluginHost(context.features, context.projections, context.reportDiagnostic);
  const releases = [];
  let disposed = false;
  return Object.freeze({
    components: business.components,
    interactions: business.interactions,
    projections: business.projections,
    install(plugin) {
      if (disposed) throw new Error("Contribution host is disposed");
      if (plugin.manifest.apiVersion !== "4.0") throw new Error("Mount contribution host requires plugin API 4.0");
      if (plugin.commands.length || plugin.views.length || plugin.componentExtensions.length) {
        throw new Error("Mount contribution host cannot execute React contributions");
      }
      const { ui: _facet, ...contributes } = plugin.manifest.contributes;
      const { ui: _implementation, ...module } = plugin;
      const businessModule = {
        ...module,
        manifest: { ...plugin.manifest, apiVersion: "3.0", contributes }
      };
      const release = installMount(plugin);
      try {
        business.install(businessModule);
      } catch (error) {
        try {
          release();
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Mount installation rollback failed");
        }
        throw error;
      }
      releases.push(release);
    },
    resolveCommands: (snapshot, included) => business.resolveCommands(snapshot, included),
    resolveViews: (snapshot, included) => business.resolveViews(snapshot, included),
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const release of releases.splice(0).reverse()) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        business.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "Contribution host disposal failed");
    }
  });
}
export {
  PluginPlatform,
  WorkbenchFeatureRegistry,
  captureUiPluginManifest,
  createMountContributionHost,
  definePlugin,
  isPluginPackage
};
