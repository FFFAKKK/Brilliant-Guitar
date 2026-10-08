import type { JsonObject, JsonValue } from "@earendil-works/pi-ai";

export function projectPiJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(projectPiJsonValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, projectPiJsonValue(child)]));
  }
  throw new Error("模型流包含不可序列化的 JSON 值");
}

export function projectPiJsonObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("模型工具参数必须是 JSON 对象");
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, projectPiJsonValue(child)]));
}
