import type {
  AgentRunState,
  ContextBuildResult,
  ToolsetSnapshot,
} from "./agent-contracts.ts";

export interface AgentProviderRequest {
  readonly runId: string;
  readonly turnId: string;
  readonly goal: string;
  readonly runState: AgentRunState;
  readonly context: ContextBuildResult;
  readonly toolset: ToolsetSnapshot;
}

export interface AgentProviderPort {
  decide(request: AgentProviderRequest): Promise<unknown>;
}

export interface FakeProviderExpectation {
  readonly capabilityIds: readonly string[];
  readonly contextSourceIds: readonly string[];
}

export type FakeProviderStep =
  | {
      readonly kind: "decision";
      readonly expect: FakeProviderExpectation;
      readonly decision: unknown;
    }
  | {
      readonly kind: "error";
      readonly expect: FakeProviderExpectation;
      readonly message: string;
    };

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class FakeAgentProvider implements AgentProviderPort {
  private readonly steps: readonly FakeProviderStep[];
  private readonly received: AgentProviderRequest[] = [];
  private cursor = 0;

  constructor(steps: readonly FakeProviderStep[]) {
    this.steps = steps;
  }

  get requests(): readonly AgentProviderRequest[] {
    return this.received;
  }

  get exhausted(): boolean {
    return this.cursor === this.steps.length;
  }

  async decide(request: AgentProviderRequest): Promise<unknown> {
    const step = this.steps[this.cursor];
    if (step === undefined) throw new Error("Fake Provider script is exhausted");
    this.cursor += 1;
    this.received.push(request);

    if (!equalStrings(request.toolset.capabilityIds, step.expect.capabilityIds)) {
      throw new Error("Fake Provider received an unexpected Turn Toolset");
    }
    for (const sourceId of step.expect.contextSourceIds) {
      if (!request.context.contextItems.some((item) => item.sourceId === sourceId)) {
        throw new Error(`Fake Provider context is missing source ${sourceId}`);
      }
    }
    if (step.kind === "error") throw new Error(step.message);
    return step.decision;
  }
}
