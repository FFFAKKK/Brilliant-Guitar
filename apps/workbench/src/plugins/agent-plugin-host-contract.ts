import { definePluginHostBindingsContract } from "./plugin-host-bindings.ts";

export const AGENT_ASSISTANT_PLUGIN_ID = "brilliant.agent.assistant" as const;
export const AGENT_ASSISTANT_PLUGIN_VERSION = "1.0.0" as const;

export const AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT = definePluginHostBindingsContract({
  pluginId: AGENT_ASSISTANT_PLUGIN_ID,
  pluginVersion: AGENT_ASSISTANT_PLUGIN_VERSION,
  slots: [
    {
      key: "provider",
      hostService: "agent.provider",
      methods: ["readAgentProviderCredentialStatus", "decideAgentProvider"],
    },
    {
      key: "scoreRead",
      hostService: "score.read",
      methods: ["readSummary", "readMetadata", "readStructure", "readMeasureIndex", "readMeasureRange"],
    },
    {
      key: "scoreChangeSets",
      hostService: "score.change-set",
      methods: ["prepareTempoChange", "prepareMetadataTransaction"],
    },
    { key: "commit", hostService: "score.commit", methods: ["invoke"] },
    {
      key: "runStore",
      hostService: "agent.run-store",
      methods: ["load", "commit", "listRecoverable", "quarantine"],
    },
    {
      key: "receipts",
      hostService: "agent.invocation-receipts",
      methods: ["lookup"],
      nullable: true,
    },
    { key: "workflows", hostService: "workflow.directory", methods: ["get", "list", "listByPlugin"] },
  ] as const,
});

export const AGENT_ASSISTANT_HOST_SERVICES = Object.freeze(
  AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT.slots.map((slot) => slot.hostService),
);
