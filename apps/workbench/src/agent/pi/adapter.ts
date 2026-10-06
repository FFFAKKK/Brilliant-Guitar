/**
 * @deprecated The capability-executing Pi prototype is a compatibility path.
 * New Agent Plugins must use `decision-adapter.ts` and return AgentDecision;
 * only AgentRunController may execute product capabilities.
 */
export { runPiAgent } from "./legacy/adapter.ts";
export type {
  PiAgentEvent,
  PiAgentRunInput,
  PiAgentRunResult,
} from "./legacy/types.ts";
