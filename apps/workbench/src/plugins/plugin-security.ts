import type { PluginTier } from "./plugin-package-contract.ts";

export type PluginHostServiceId = string;

export const FORBIDDEN_PLUGIN_HOST_SERVICE_ID = "host.all-access" as const;

const dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

function immutableServiceIds(value: readonly string[], label: string): readonly PluginHostServiceId[] {
  const services = [...value];
  if (services.some((serviceId) => !dottedId.test(serviceId) || serviceId === FORBIDDEN_PLUGIN_HOST_SERVICE_ID)
    || new Set(services).size !== services.length) {
    throw new Error(`Invalid ${label}`);
  }
  return Object.freeze(services);
}

/** Trusted-host inventory of typed service ports available for one process session. */
export class PluginHostServiceRegistry {
  readonly #services: ReadonlySet<PluginHostServiceId>;
  readonly #snapshot: readonly PluginHostServiceId[];

  constructor(services: readonly PluginHostServiceId[]) {
    this.#snapshot = immutableServiceIds(services, "plugin host service directory");
    this.#services = new Set(this.#snapshot);
  }

  has(serviceId: PluginHostServiceId): boolean { return this.#services.has(serviceId); }
  list(): readonly PluginHostServiceId[] { return this.#snapshot; }
  missing(required: readonly PluginHostServiceId[]): readonly PluginHostServiceId[] {
    return Object.freeze(required.filter((serviceId) => !this.#services.has(serviceId)));
  }
}

export interface PluginHostServicePolicyOptions {
  /** Maximum service set for each trust tier. Product and system default to the host inventory. */
  readonly tierAllowlist?: Partial<Record<PluginTier, readonly PluginHostServiceId[]>>;
  /** Per-plugin user consent. Third-party plugins default to no consent. */
  readonly userGrants?: Readonly<Record<string, readonly PluginHostServiceId[]>>;
  /** Services allowed in the current launch mode. Defaults to the host inventory. */
  readonly sessionPolicy?: readonly PluginHostServiceId[];
}

export interface PluginHostServiceGrantV1 {
  readonly grantVersion: 1;
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly tier: PluginTier;
  readonly hostServices: readonly PluginHostServiceId[];
}

export interface PluginHostServiceDenialV1 {
  readonly unavailable: readonly PluginHostServiceId[];
  readonly deniedByTier: readonly PluginHostServiceId[];
  readonly deniedByUser: readonly PluginHostServiceId[];
  readonly deniedBySession: readonly PluginHostServiceId[];
}

export type PluginHostServiceGrantResolution =
  | Readonly<{ accepted: true; grant: PluginHostServiceGrantV1 }>
  | Readonly<{
    accepted: false;
    effectiveHostServices: readonly PluginHostServiceId[];
    denial: PluginHostServiceDenialV1;
  }>;

export interface PluginHostServiceRequest {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly tier: PluginTier;
  readonly requiredHostServices: readonly PluginHostServiceId[];
}

function serviceSet(value: readonly PluginHostServiceId[], label: string): ReadonlySet<PluginHostServiceId> {
  return new Set(immutableServiceIds(value, label));
}

function frozenMatching(
  required: readonly PluginHostServiceId[],
  predicate: (serviceId: PluginHostServiceId) => boolean,
): readonly PluginHostServiceId[] {
  return Object.freeze(required.filter(predicate));
}

/** Resolves grants once during startup. It never exposes service implementations to plugin code. */
export class PluginHostServicePolicy {
  readonly #available: PluginHostServiceRegistry;
  readonly #tierAllowlist: Readonly<Record<PluginTier, ReadonlySet<PluginHostServiceId>>>;
  readonly #userGrants: ReadonlyMap<string, ReadonlySet<PluginHostServiceId>>;
  readonly #sessionPolicy: ReadonlySet<PluginHostServiceId>;

  constructor(available: PluginHostServiceRegistry, options: PluginHostServicePolicyOptions = {}) {
    this.#available = available;
    const all = available.list();
    this.#tierAllowlist = Object.freeze({
      system: serviceSet(options.tierAllowlist?.system ?? all, "system plugin host service allowlist"),
      product: serviceSet(options.tierAllowlist?.product ?? all, "product plugin host service allowlist"),
      "third-party": serviceSet(options.tierAllowlist?.["third-party"] ?? [],
        "third-party plugin host service allowlist"),
    });
    const userGrants = new Map<string, ReadonlySet<PluginHostServiceId>>();
    for (const [pluginId, services] of Object.entries(options.userGrants ?? {})) {
      if (!dottedId.test(pluginId)) throw new Error(`Invalid plugin user grant identity: ${pluginId}`);
      userGrants.set(pluginId, serviceSet(services, `plugin user grants: ${pluginId}`));
    }
    this.#userGrants = userGrants;
    this.#sessionPolicy = serviceSet(options.sessionPolicy ?? all, "plugin session host service policy");
  }

  resolve(request: PluginHostServiceRequest): PluginHostServiceGrantResolution {
    if (!dottedId.test(request.pluginId) || !/^\d+\.\d+\.\d+$/.test(request.pluginVersion)) {
      throw new Error(`Invalid plugin host service request identity: ${request.pluginId}`);
    }
    const required = immutableServiceIds(request.requiredHostServices,
      `plugin host service requirements: ${request.pluginId}`);
    const tierAllowed = this.#tierAllowlist[request.tier];
    const defaultUserGrants = request.tier === "third-party" ? new Set<PluginHostServiceId>()
      : new Set(this.#available.list());
    const userAllowed = this.#userGrants.get(request.pluginId) ?? defaultUserGrants;
    const effective = frozenMatching(required, (serviceId) => this.#available.has(serviceId)
      && tierAllowed.has(serviceId)
      && userAllowed.has(serviceId)
      && this.#sessionPolicy.has(serviceId));
    if (effective.length === required.length) {
      return Object.freeze({
        accepted: true as const,
        grant: Object.freeze({
          grantVersion: 1 as const,
          pluginId: request.pluginId,
          pluginVersion: request.pluginVersion,
          tier: request.tier,
          hostServices: effective,
        }),
      });
    }
    return Object.freeze({
      accepted: false as const,
      effectiveHostServices: effective,
      denial: Object.freeze({
        unavailable: frozenMatching(required, (serviceId) => !this.#available.has(serviceId)),
        deniedByTier: frozenMatching(required, (serviceId) => !tierAllowed.has(serviceId)),
        deniedByUser: frozenMatching(required, (serviceId) => !userAllowed.has(serviceId)),
        deniedBySession: frozenMatching(required, (serviceId) => !this.#sessionPolicy.has(serviceId)),
      }),
    });
  }
}

export function describePluginHostServiceDenial(denial: PluginHostServiceDenialV1): string {
  const parts = [
    denial.unavailable.length === 0 ? null : `unavailable=${denial.unavailable.join(",")}`,
    denial.deniedByTier.length === 0 ? null : `tier=${denial.deniedByTier.join(",")}`,
    denial.deniedByUser.length === 0 ? null : `user=${denial.deniedByUser.join(",")}`,
    denial.deniedBySession.length === 0 ? null : `session=${denial.deniedBySession.join(",")}`,
  ].filter((part): part is string => part !== null);
  return parts.join("; ");
}
