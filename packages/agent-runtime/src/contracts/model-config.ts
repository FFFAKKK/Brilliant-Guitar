export interface AgentModelConnection {
  readonly providerId: "deepseek" | "openai-compatible";
  readonly protocol: "chat-completions";
  readonly baseUrl: string;
}

export interface AgentModelConfiguration extends AgentModelConnection {
  readonly modelId: string;
}

export const DEFAULT_DEEPSEEK_CONFIGURATION: AgentModelConfiguration = Object.freeze({
  providerId: "deepseek", protocol: "chat-completions", baseUrl: "https://api.deepseek.com", modelId: "deepseek-flash",
});

/** Shared target validation for configuration and pre-configuration discovery. */
export function parseAgentModelConnection(value: unknown): AgentModelConnection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("模型配置格式无效");
  const item = value as Record<string, unknown>;
  const keys = ["providerId", "protocol", "baseUrl"];
  if (Object.keys(item).length !== keys.length || !Object.keys(item).every((key) => keys.includes(key))
    || !["deepseek", "openai-compatible"].includes(String(item.providerId)) || item.protocol !== "chat-completions"
    || typeof item.baseUrl !== "string" || item.baseUrl.length > 2048) throw new Error("模型连接格式无效");
  const url = new URL(item.baseUrl);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash) throw new Error("服务地址需使用 HTTPS，本地测试可使用 HTTP");
  return Object.freeze({ providerId: item.providerId as AgentModelConnection["providerId"], protocol: "chat-completions", baseUrl: url.href.replace(/\/$/, "") });
}

export function isAgentModelId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value === value.trim()
    && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** One validation owner for both the settings client and host. */
export function parseAgentModelConfiguration(value: unknown): AgentModelConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("模型配置格式无效");
  const item = value as Record<string, unknown>;
  const keys = ["providerId", "protocol", "baseUrl", "modelId"];
  if (Object.keys(item).length !== keys.length || !Object.keys(item).every((key) => keys.includes(key))
    || !isAgentModelId(item.modelId)) throw new Error("模型配置格式无效");
  const connection = parseAgentModelConnection({ providerId: item.providerId, protocol: item.protocol, baseUrl: item.baseUrl });
  return Object.freeze({ ...connection, modelId: item.modelId });
}
