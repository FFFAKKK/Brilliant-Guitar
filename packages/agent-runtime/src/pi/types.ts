import type { Model, Api } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";

/**
 * Stable Pi adapter types. These describe the model engine boundary only;
 * product capability execution belongs to AgentRunController.
 */
export type PiAgentModel = Model<Api>;
export type PiAgentStreamFn = StreamFn;
