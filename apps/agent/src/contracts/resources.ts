export const MAX_TEXT_RESOURCE_BYTES = 32 * 1024;
export const MAX_TEXT_RESOURCES = 3;
export const MAX_TEXT_PAGE_CHARACTERS = 4096;
export const MAX_TEXT_PAGE_JSON_BYTES = 12 * 1024;
export const TEXT_RESOURCE_CAPABILITY_ID = "resource.read-text";

export interface TextResourceMetadata {
  readonly resourceId: string;
  readonly version: 1;
  readonly name: string;
  readonly byteLength: number;
  readonly characterCount: number;
}
export interface TextResourcesSnapshot { readonly sessionId: string; readonly items: readonly TextResourceMetadata[] }
export interface AddTextResourceRequest { readonly sessionId: string; readonly name: string; readonly text: string }
export interface ReadTextResourceInput { readonly resourceId: string; readonly start: number; readonly maxCharacters: number }
export interface ReadTextResourceResult {
  readonly resourceId: string;
  readonly version: 1;
  readonly name: string;
  readonly start: number;
  readonly nextStart: number;
  readonly totalCharacters: number;
  readonly text: string;
  readonly eof: boolean;
  readonly contentTrust: "user-provided";
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key));
}
function identity(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(value); }
export function validateTextResource(name: unknown, text: unknown): asserts text is string {
  if (typeof name !== "string" || name.length < 1 || name.length > 128 || name !== name.trim()
    || /[\\/\u0000-\u001f\u007f]/.test(name) || !/\.(txt|md)$/i.test(name)) throw new TextResourceInputError("请选择名称有效的 TXT 或 MD 文件");
  if (typeof text !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    || [...text].some((char) => { const code = char.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff; })) throw new TextResourceInputError("文件需为有效的 UTF-8 文本，不能包含二进制内容");
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_RESOURCE_BYTES) throw new TextResourceInputError("每份文本最多 32KiB，请选择较小的文件");
}

export function decodeTextResourceFile(name: string, bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_TEXT_RESOURCE_BYTES) throw new TextResourceInputError("每份文本最多 32KiB，请选择较小的文件");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new TextResourceInputError("无法读取文本，请将文件保存为 UTF-8 编码"); }
  validateTextResource(name, text);
  return text;
}

export function parseAddTextResource(value: unknown): AddTextResourceRequest {
  const item = object(value);
  if (!item || !keys(item, ["sessionId", "name", "text"]) || !isSessionId(item.sessionId) || typeof item.name !== "string") throw new TextResourceInputError("资料请求格式无效");
  validateTextResource(item.name, item.text);
  return { sessionId: item.sessionId, name: item.name, text: item.text };
}
export function parseRemoveTextResource(value: unknown): { readonly sessionId: string; readonly resourceId: string } {
  const item = object(value);
  if (!item || !keys(item, ["sessionId", "resourceId"]) || !isSessionId(item.sessionId) || !identity(item.resourceId)) throw new TextResourceInputError("资料请求格式无效");
  return { sessionId: item.sessionId, resourceId: item.resourceId };
}
export function isReadTextResourceInput(value: unknown): value is ReadTextResourceInput {
  const item = object(value);
  return item !== null && keys(item, ["resourceId", "start", "maxCharacters"]) && identity(item.resourceId)
    && Number.isSafeInteger(item.start) && Number(item.start) >= 0
    && Number.isSafeInteger(item.maxCharacters) && Number(item.maxCharacters) >= 1 && Number(item.maxCharacters) <= MAX_TEXT_PAGE_CHARACTERS;
}
export function isTextResourcesSnapshot(value: unknown): value is TextResourcesSnapshot {
  const item = object(value);
  if (!item || !keys(item, ["sessionId", "items"]) || !isSessionId(item.sessionId) || !Array.isArray(item.items) || item.items.length > MAX_TEXT_RESOURCES) return false;
  const ids = new Set<string>();
  return item.items.every((candidate: unknown) => {
    const resource = object(candidate);
    if (!resource || !keys(resource, ["resourceId", "version", "name", "byteLength", "characterCount"]) || !identity(resource.resourceId)
      || ids.has(resource.resourceId) || resource.version !== 1 || typeof resource.name !== "string"
      || !Number.isSafeInteger(resource.byteLength) || Number(resource.byteLength) < 0 || Number(resource.byteLength) > MAX_TEXT_RESOURCE_BYTES
      || !Number.isSafeInteger(resource.characterCount) || Number(resource.characterCount) < 0 || Number(resource.characterCount) > Number(resource.byteLength)) return false;
    try { validateTextResource(resource.name, ""); } catch { return false; }
    ids.add(resource.resourceId); return true;
  });
}
import { isSessionId } from "@brilliant-guitar/agent-runtime";

export class TextResourceInputError extends Error {
  readonly code = "invalid-input";
}
