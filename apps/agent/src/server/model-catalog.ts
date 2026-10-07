import type { AgentModelConnection } from "@brilliant-guitar/agent-runtime";
import { parseSupplierModels, type AgentModelCatalog } from "../contracts/model-catalog.ts";

export class ModelCatalogError extends Error {
  readonly code: "catalog-unauthorized" | "catalog-unavailable" | "catalog-invalid" | "catalog-timeout" | "catalog-cancelled" | "catalog-failed";
  constructor(code: ModelCatalogError["code"], message: string) { super(message); this.code = code; }
}

/** Metadata transport only: no Pi generation, configuration mutation, or automatic activation. */
export async function fetchModelCatalog(connection: AgentModelConnection, apiKey: string, options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {}): Promise<AgentModelCatalog> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 10000);
  const signal = AbortSignal.any([timeout, ...(options.signal ? [options.signal] : [])]);
  try {
    const response = await fetch(`${connection.baseUrl}/models`, {
      method: "GET", headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal, redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new ModelCatalogError("catalog-unauthorized", "模型列表鉴权失败，请检查 API Key 与服务地址。");
      if (response.status === 404 || response.status === 405 || response.status === 501) throw new ModelCatalogError("catalog-unavailable", "此服务不支持模型列表，请手动填写模型 ID。");
      throw new ModelCatalogError("catalog-failed", "模型列表获取失败，请稍后重试或手动填写模型 ID。");
    }
    if (!response.body) throw new ModelCatalogError("catalog-invalid", "供应商返回的模型列表格式无效，请手动填写模型 ID。");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1048576) throw new ModelCatalogError("catalog-invalid", "模型列表超过大小限制，请手动填写模型 ID。");
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    let models: AgentModelCatalog["models"];
    try { models = parseSupplierModels(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
    catch { throw new ModelCatalogError("catalog-invalid", "供应商返回的模型列表格式无效，请手动填写模型 ID。"); }
    if (JSON.stringify(models).includes(apiKey)) throw new ModelCatalogError("catalog-invalid", "供应商返回的模型列表格式无效，请手动填写模型 ID。");
    if (signal.aborted) throw new Error("aborted");
    return { connection, models };
  } catch (error) {
    if (options.signal?.aborted) throw new ModelCatalogError("catalog-cancelled", "模型列表获取已取消。");
    if (timeout.aborted) throw new ModelCatalogError("catalog-timeout", "模型列表获取超时，请重试或手动填写模型 ID。");
    if (error instanceof ModelCatalogError) throw error;
    throw new ModelCatalogError("catalog-failed", "无法获取模型列表，请检查服务地址或手动填写模型 ID。");
  }
}
