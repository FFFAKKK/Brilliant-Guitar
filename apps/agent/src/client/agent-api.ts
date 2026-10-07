import { isStandaloneAgentSnapshot, type StandaloneAgentSnapshot } from "../contracts/host.ts";

export async function requestAgent(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/${path}`, body === undefined ? { cache: "no-store" } : {
    method: path.startsWith("model-config") || path.startsWith("model-credential") ? "PUT" : "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "请求失败，请重试";
    throw new Error(error);
  }
  return value;
}

export function decodeSnapshot(value: unknown): StandaloneAgentSnapshot {
  if (!isStandaloneAgentSnapshot(value)) throw new Error("Agent 状态格式无效，请重新连接");
  return value;
}
