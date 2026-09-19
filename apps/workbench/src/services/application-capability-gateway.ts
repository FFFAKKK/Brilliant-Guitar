import { isCapabilityResult } from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";
import type {
  ApplicationCapabilityCaller,
  ApplicationCapabilityDirectory,
  ApplicationCapabilityInvoker,
} from "../contracts/application-capability.ts";

export type ApplicationCapabilityGatewayFailure =
  | "capability-unavailable"
  | "caller-not-allowed"
  | "contract-version-mismatch"
  | "invalid-input"
  | "dispatch-outcome-unknown"
  | "invalid-result"
  | "result-identity-mismatch";

export class ApplicationCapabilityGatewayError extends Error {
  readonly code: ApplicationCapabilityGatewayFailure;
  readonly outcome: "definite-failure" | "unknown";

  constructor(
    code: ApplicationCapabilityGatewayFailure,
    message: string,
    outcome: "definite-failure" | "unknown",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApplicationCapabilityGatewayError";
    this.code = code;
    this.outcome = outcome;
  }
}

export interface ApplicationCapabilityTransport {
  invokeCapability(request: CapabilityTransportRequest): Promise<unknown>;
  invokeAgentCapability(request: CapabilityTransportRequest): Promise<unknown>;
}

/**
 * The single TypeScript execution boundary for application capabilities.
 * Separate host transports preserve trusted caller identity without creating
 * separate business dispatchers.
 */
export class ApplicationCapabilityGateway {
  readonly #directory: ApplicationCapabilityDirectory;
  readonly #transport: ApplicationCapabilityTransport;
  readonly #invokers = new Map<ApplicationCapabilityCaller, ApplicationCapabilityInvoker>();

  constructor(directory: ApplicationCapabilityDirectory, transport: ApplicationCapabilityTransport) {
    this.#directory = directory;
    this.#transport = transport;
  }

  forCaller(caller: ApplicationCapabilityCaller): ApplicationCapabilityInvoker {
    const existing = this.#invokers.get(caller);
    if (existing) return existing;
    const invoker = Object.freeze({
      invokeCapability: (request: CapabilityTransportRequest) => this.#invoke(caller, request),
    });
    this.#invokers.set(caller, invoker);
    return invoker;
  }

  async #invoke(
    caller: ApplicationCapabilityCaller,
    request: CapabilityTransportRequest,
  ): Promise<CapabilityResult<unknown>> {
    const capability = this.#directory.get(request.capabilityId);
    if (!capability) throw new ApplicationCapabilityGatewayError(
      "capability-unavailable",
      `Application Capability is not active: ${request.capabilityId}`,
      "definite-failure",
    );
    if (!capability.callers.includes(caller)) throw new ApplicationCapabilityGatewayError(
      "caller-not-allowed",
      `Application Capability does not allow ${caller}: ${request.capabilityId}`,
      "definite-failure",
    );
    if (capability.contractVersion !== request.contractVersion) throw new ApplicationCapabilityGatewayError(
      "contract-version-mismatch",
      `Application Capability contract version is unavailable: ${request.capabilityId}@${request.contractVersion}`,
      "definite-failure",
    );
    try {
      if (!capability.validateInput(request.input)) throw new ApplicationCapabilityGatewayError(
        "invalid-input",
        `Application Capability input is invalid: ${request.capabilityId}`,
        "definite-failure",
      );
    } catch (error) {
      if (error instanceof ApplicationCapabilityGatewayError) throw error;
      throw new ApplicationCapabilityGatewayError(
        "invalid-input",
        `Application Capability input validator failed: ${request.capabilityId}`,
        "definite-failure",
        { cause: error },
      );
    }

    let value: unknown;
    try {
      if (caller === "agent") value = await this.#transport.invokeAgentCapability(request);
      else value = await this.#transport.invokeCapability(request);
    } catch (error) {
      throw new ApplicationCapabilityGatewayError(
        "dispatch-outcome-unknown",
        `Application Capability dispatch outcome is unknown: ${request.capabilityId}`,
        "unknown",
        { cause: error },
      );
    }
    let result: CapabilityResult<unknown> | null = null;
    try {
      const isOutput = (output: unknown): output is unknown => capability.validateOutput(output);
      if (isCapabilityResult(value, isOutput)) result = value;
    } catch (error) {
      throw new ApplicationCapabilityGatewayError(
        "invalid-result",
        `Application Capability output validator failed: ${request.capabilityId}`,
        "unknown",
        { cause: error },
      );
    }
    if (result === null) throw new ApplicationCapabilityGatewayError(
      "invalid-result",
      `Application Capability returned an invalid result: ${request.capabilityId}`,
      "unknown",
    );
    if (result.invocationId !== request.invocationId
      || result.capabilityId !== request.capabilityId
      || result.contractVersion !== request.contractVersion) {
      throw new ApplicationCapabilityGatewayError(
        "result-identity-mismatch",
        `Application Capability result identity does not match the invocation: ${request.capabilityId}`,
        "unknown",
      );
    }
    return result;
  }
}
