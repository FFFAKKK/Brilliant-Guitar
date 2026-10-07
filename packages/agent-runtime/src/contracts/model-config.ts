export interface AgentModelConfiguration {
  readonly providerId: "deepseek" | "openai-compatible";
  readonly protocol: "chat-completions";
  readonly baseUrl: string;
  readonly modelId: string;
}

export const DEFAULT_DEEPSEEK_CONFIGURATION: AgentModelConfiguration = Object.freeze({
  providerId: "deepseek", protocol: "chat-completions", baseUrl: "https://api.deepseek.com", modelId: "deepseek-flash",
});

/** One validation owner for both the settings client and host. */
export function parseAgentModelConfiguration(value: unknown): AgentModelConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("模型配置格式无效");
  const item = value as Record<string, unknown>;
  const keys = ["providerId", "protocol", "baseUrl", "modelId"];
  if (Object.keys(item).length !== keys.length || !Object.keys(item).every((key) => keys.includes(key))
    || !["deepseek", "openai-compatible"].includes(String(item.providerId)) || item.protocol !== "chat-completions"
    || typeof item.baseUrl !== "string" || item.baseUrl.length > 2048
    || typeof item.modelId !== "string" || !item.modelId.trim() || item.modelId !== item.modelId.trim()
    || item.modelId.length > 160 || /[\u0000-\u001f\u007f]/.test(item.modelId)) throw new Error("模型配置格式无效");
  const url = new URL(item.baseUrl);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash) throw new Error("服务地址需使用 HTTPS，本地测试可使用 HTTP");
  return Object.freeze({ providerId: item.providerId as AgentModelConfiguration["providerId"], protocol: "chat-completions", baseUrl: url.href.replace(/\/$/, ""), modelId: item.modelId });
}
