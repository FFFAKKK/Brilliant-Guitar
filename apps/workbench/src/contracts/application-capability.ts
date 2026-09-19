import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "./capability.ts";

export type ApplicationCapabilityCaller = "ui" | "agent";

/**
 * Stable application operation contributed by a plugin. The plugin owns the
 * contract; the platform owns visibility and the gateway owns dispatch.
 */
export interface ApplicationCapabilityContribution {
  readonly id: string;
  readonly contractVersion: number;
  readonly callers: readonly ApplicationCapabilityCaller[];
  validateInput(input: unknown): boolean;
  validateOutput(output: unknown): boolean;
}

export interface RegisteredApplicationCapability extends ApplicationCapabilityContribution {
  readonly ownerPluginId: string;
}

export interface ApplicationCapabilityDirectory {
  get(id: string): RegisteredApplicationCapability | undefined;
  list(caller?: ApplicationCapabilityCaller): readonly RegisteredApplicationCapability[];
}

/** Caller-scoped execution view. Plugins and Agent code cannot choose another caller identity. */
export interface ApplicationCapabilityInvoker {
  invokeCapability(request: CapabilityTransportRequest): Promise<CapabilityResult<unknown>>;
}
