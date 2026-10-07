import { isAgentModelId, parseAgentModelConnection, type AgentModelConnection } from "@brilliant-guitar/agent-runtime";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";

export interface AgentModelCatalogRequest {
  readonly connection: AgentModelConnection;
  readonly apiKey?: string;
}

export interface AgentModelCatalog {
  readonly connection: AgentModelConnection;
  readonly models: readonly { readonly id: string }[];
}

export const MODEL_CATALOG_LIMIT = 500;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("模型列表格式无效");
  return value as Record<string, unknown>;
}

export function parseModelCatalogRequest(value: unknown): AgentModelCatalogRequest {
  const item = object(value);
  if (!Object.hasOwn(item, "connection") || !Object.keys(item).every((key) => ["connection", "apiKey"].includes(key))
    || (Object.hasOwn(item, "apiKey") && !isAgentProviderCredentialSecret(item.apiKey))) throw new Error("模型查询格式无效");
  return { connection: parseAgentModelConnection(item.connection), ...(typeof item.apiKey === "string" ? { apiKey: item.apiKey } : {}) };
}

/** Strip provider metadata at the host boundary, validate IDs, preserve provider order. */
export function parseSupplierModels(value: unknown): AgentModelCatalog["models"] {
  const data = object(value).data;
  if (!Array.isArray(data) || data.length > MODEL_CATALOG_LIMIT) throw new Error("模型列表格式无效或超过限制");
  const ids = new Set<string>();
  for (const value of data) {
    const id = object(value).id;
    if (!isAgentModelId(id)) throw new Error("模型列表包含无效模型 ID");
    ids.add(id);
  }
  return [...ids].map((id) => ({ id }));
}

export function parseModelCatalog(value: unknown): AgentModelCatalog {
  const item = object(value);
  if (Object.keys(item).length !== 2 || !Object.keys(item).every((key) => ["connection", "models"].includes(key))
    || !Array.isArray(item.models) || item.models.some((model) => Object.keys(object(model)).length !== 1)) throw new Error("模型列表格式无效");
  return { connection: parseAgentModelConnection(item.connection), models: parseSupplierModels({ data: item.models }) };
}

export function matchesModelConnection(left: AgentModelConnection, right: AgentModelConnection): boolean {
  return left.providerId === right.providerId && left.protocol === right.protocol && left.baseUrl === right.baseUrl;
}
