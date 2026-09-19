import {
  createPluginKernelAssemblyPlanV1,
  isPluginKernelModuleManifestV1,
  isPluginTier,
} from "../plugins/plugin-package-contract.ts";
import type {
  PluginKernelModuleManifestV1,
  PluginTier,
} from "../plugins/plugin-package-contract.ts";

export const WORKBENCH_PLUGIN_API_VERSION = "2.0" as const;

export type WorkbenchCapabilityId = string;

export interface UiPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tier?: PluginTier;
  readonly apiVersion: typeof WORKBENCH_PLUGIN_API_VERSION;
  readonly runtime: "internal-module";
  readonly activation: "always" | "user";
  readonly requires: Readonly<{
    capabilities: readonly WorkbenchCapabilityId[];
    projections: readonly string[];
  }>;
  readonly contributes: Readonly<{
    views: readonly string[];
    commands: readonly string[];
    interactions: readonly string[];
    componentExtensions: readonly string[];
    readonly instruments?: readonly string[];
    readonly playbackOutputs?: readonly string[];
    readonly kernelModules?: readonly PluginKernelModuleManifestV1[];
  }>;
}

const dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const semanticVersion = /^\d+\.\d+\.\d+$/;

function uniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

function exactDataRecord(value: unknown, required: readonly string[], optional: readonly string[] = []):
  Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const allowed = new Set([...required, ...optional]);
  let keys: readonly PropertyKey[];
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    keys = Reflect.ownKeys(value);
  } catch { return null; }
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || required.some((key) => !keys.includes(key))) return null;
  const captured: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return null;
    captured[key] = descriptor.value;
  }
  return captured;
}

function capturedArrayValues(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  let keys: readonly PropertyKey[];
  try { keys = Reflect.ownKeys(value); } catch { return null; }
  if (keys.length !== value.length + 1 || !keys.includes("length")) return null;
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    result.push(descriptor.value);
  }
  return result;
}

function capturedStrings(value: unknown): readonly string[] | null {
  const values = capturedArrayValues(value);
  if (!values) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string" || item.length === 0 || item.length > 128 || seen.has(item)) return null;
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}

function capturedKernelModules(value: unknown): readonly PluginKernelModuleManifestV1[] | null {
  const values = capturedArrayValues(value);
  if (!values) return null;
  const result: PluginKernelModuleManifestV1[] = [];
  for (const value of values) {
    const record = exactDataRecord(value, ["moduleId", "apiVersion", "runtime", "activation"]);
    if (!record || !isPluginKernelModuleManifestV1(record)) return null;
    result.push(Object.freeze({
      moduleId: record.moduleId as string,
      apiVersion: 1,
      runtime: record.runtime as PluginKernelModuleManifestV1["runtime"],
      activation: "session-fixed",
    }));
  }
  return Object.freeze(result);
}

/** Strictly captures manifest-only discovery data without retaining host-owned objects. */
export function captureUiPluginManifest(value: unknown): UiPluginManifest | null {
  try {
    const candidate = exactDataRecord(value,
      ["id", "name", "version", "apiVersion", "runtime", "activation", "requires", "contributes"],
      ["tier"]);
    if (!candidate || typeof candidate.id !== "string" || !dottedId.test(candidate.id)
      || typeof candidate.name !== "string" || candidate.name.trim().length === 0 || candidate.name.length > 128
      || typeof candidate.version !== "string" || !semanticVersion.test(candidate.version)
      || (candidate.tier !== undefined && !isPluginTier(candidate.tier))
      || candidate.apiVersion !== WORKBENCH_PLUGIN_API_VERSION
      || candidate.runtime !== "internal-module"
      || (candidate.activation !== "always" && candidate.activation !== "user")) return null;
    const requires = exactDataRecord(candidate.requires, ["capabilities", "projections"]);
    const capabilities = capturedStrings(requires?.capabilities);
    const projections = capturedStrings(requires?.projections);
    const contributes = exactDataRecord(candidate.contributes,
      ["views", "commands", "interactions", "componentExtensions"],
      ["instruments", "playbackOutputs", "kernelModules"]);
    const views = capturedStrings(contributes?.views);
    const commands = capturedStrings(contributes?.commands);
    const interactions = capturedStrings(contributes?.interactions);
    const componentExtensions = capturedStrings(contributes?.componentExtensions);
    const instruments = contributes?.instruments === undefined ? undefined : capturedStrings(contributes.instruments);
    const playbackOutputs = contributes?.playbackOutputs === undefined
      ? undefined : capturedStrings(contributes.playbackOutputs);
    const kernelModules = contributes?.kernelModules === undefined
      ? undefined : capturedKernelModules(contributes.kernelModules);
    if (!capabilities || !projections || !contributes || !views || !commands || !interactions || !componentExtensions
      || instruments === null || playbackOutputs === null || kernelModules === null) return null;
    const manifest: UiPluginManifest = Object.freeze({
      id: candidate.id,
      name: candidate.name,
      version: candidate.version,
      ...(candidate.tier === undefined ? {} : { tier: candidate.tier }),
      apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module",
      activation: candidate.activation,
      requires: Object.freeze({ capabilities, projections }),
      contributes: Object.freeze({
        views, commands, interactions, componentExtensions,
        ...(instruments === undefined ? {} : { instruments }),
        ...(playbackOutputs === undefined ? {} : { playbackOutputs }),
        ...(kernelModules === undefined ? {} : { kernelModules }),
      }),
    });
    createPluginKernelAssemblyPlanV1([{
      id: manifest.id,
      version: manifest.version,
      activation: manifest.activation,
      ...(manifest.tier === undefined ? {} : { tier: manifest.tier }),
      ...(manifest.contributes.kernelModules === undefined
        ? {} : { kernelModules: manifest.contributes.kernelModules }),
    }]);
    return manifest;
  } catch {
    return null;
  }
}

export function isUiPluginManifest(value: unknown): value is UiPluginManifest {
  return captureUiPluginManifest(value) !== null;
}

/** Immutable service directory exposed by the host during plugin installation. */
export class WorkbenchCapabilityRegistry {
  readonly #capabilities: ReadonlySet<WorkbenchCapabilityId>;

  constructor(capabilities: readonly WorkbenchCapabilityId[]) {
    if (!uniqueStrings(capabilities)) throw new Error("Invalid workbench capability directory");
    this.#capabilities = new Set(capabilities);
  }

  has(capability: WorkbenchCapabilityId): boolean { return this.#capabilities.has(capability); }
  list(): readonly WorkbenchCapabilityId[] { return [...this.#capabilities]; }
  missing(required: readonly WorkbenchCapabilityId[]): readonly WorkbenchCapabilityId[] {
    return required.filter((capability) => !this.#capabilities.has(capability));
  }
}
