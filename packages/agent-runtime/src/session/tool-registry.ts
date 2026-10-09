import type { AgentCapabilityDescriptor } from "../runtime/agent-contracts.ts";
import type { AgentCapabilityPort, AgentCapabilityInvocationContext } from "../runtime/capability-port.ts";
import { AgentCapabilityPortError } from "../runtime/capability-port.ts";
import type { CapabilityResult, CapabilityTransportRequest } from "../contracts/capability.ts";
import type { AgentReadPreview, AgentReadResultLimitV1 } from "../contracts/tool-feedback-admission.ts";

export interface RegisteredAgentTool {
  readonly descriptor: AgentCapabilityDescriptor;
  readonly execute: (input: unknown, context?: AgentCapabilityInvocationContext) => Promise<unknown>;
  readonly previewRead?: (input: unknown, context: AgentCapabilityInvocationContext & { readonly resultLimit: AgentReadResultLimitV1 }) =>
    { readonly status: "ready"; readonly data: unknown } | { readonly status: "insufficient-limit" };
}

/** Runtime execution port. Plugins receive catalog projections, never this object. */
export class AgentToolRegistry implements AgentCapabilityPort {
  readonly catalog: readonly AgentCapabilityDescriptor[];
  readonly #tools: ReadonlyMap<string, RegisteredAgentTool>;

  constructor(tools: readonly RegisteredAgentTool[] = []) {
    const entries = new Map<string, RegisteredAgentTool>();
    for (const tool of tools) {
      if (!tool.descriptor.id.trim() || entries.has(tool.descriptor.id)) {
        throw new Error("Duplicate or invalid Agent tool identity");
      }
      entries.set(tool.descriptor.id, Object.freeze({ ...tool, descriptor: Object.freeze({ ...tool.descriptor }) }));
    }
    this.#tools = entries;
    this.catalog = Object.freeze([...entries.values()].map((tool) => tool.descriptor));
  }

  #validated(request: CapabilityTransportRequest): RegisteredAgentTool {
    const tool = this.#tools.get(request.capabilityId);
    if (!tool || tool.descriptor.contractVersion !== request.contractVersion || !tool.descriptor.validateInput(request.input)) {
      throw new AgentCapabilityPortError("Agent tool is unavailable or input is invalid", "definite-failure");
    }
    return tool;
  }

  previewRead(request: CapabilityTransportRequest, context: AgentCapabilityInvocationContext & { readonly resultLimit: AgentReadResultLimitV1 }): AgentReadPreview {
    const tool = this.#validated(request);
    if (!tool.previewRead) return { status: "unsupported" };
    const preview = tool.previewRead(request.input, context);
    return preview.status === "ready" ? { status: "ready", result: { status: "completed", invocationId: request.invocationId,
      capabilityId: request.capabilityId, contractVersion: request.contractVersion, data: preview.data } } : preview;
  }

  async invoke(request: CapabilityTransportRequest, context?: AgentCapabilityInvocationContext): Promise<CapabilityResult<unknown>> {
    const tool = this.#validated(request);
    const data = await tool.execute(request.input, context);
    return { status: "completed", invocationId: request.invocationId, capabilityId: request.capabilityId, contractVersion: request.contractVersion, data };
  }

  withTools(tools: readonly RegisteredAgentTool[]): AgentToolRegistry {
    return new AgentToolRegistry([...this.#tools.values(), ...tools]);
  }
}
