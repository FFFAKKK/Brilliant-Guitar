import { invoke, isTauri } from "@tauri-apps/api/core";
import type { UiPluginDiagnostic } from "../ui/plugin-diagnostic.ts";

export interface PersistedPluginDiagnostic {
  readonly reportId: string;
  readonly occurredAt: number;
  readonly code: string;
  readonly stage: string;
  readonly operation: string;
  readonly moduleId?: string;
  readonly contributionId?: string;
  readonly message: string;
}

const MAX_PERSISTED_DIAGNOSTICS = 256;
const identifierPattern = /^[A-Za-z0-9._-]+$/;

function boundedIdentifier(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit && identifierPattern.test(value);
}

function captureDiagnostic(value: unknown): PersistedPluginDiagnostic | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const allowed = new Set(["reportId", "occurredAt", "code", "stage", "operation",
    "moduleId", "contributionId", "message"]);
  let keys: readonly PropertyKey[];
  try { keys = Reflect.ownKeys(value); } catch { return null; }
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
  if (!boundedIdentifier(source.reportId, 96)
    || !Number.isSafeInteger(source.occurredAt) || (source.occurredAt as number) < 0
    || !boundedIdentifier(source.code, 96)
    || !boundedIdentifier(source.stage, 40)
    || !boundedIdentifier(source.operation, 40)
    || (source.moduleId !== undefined && !boundedIdentifier(source.moduleId, 128))
    || (source.contributionId !== undefined && !boundedIdentifier(source.contributionId, 128))
    || typeof source.message !== "string" || source.message.length === 0 || source.message.length > 256) return null;
  return Object.freeze({
    reportId: source.reportId,
    occurredAt: source.occurredAt as number,
    code: source.code,
    stage: source.stage,
    operation: source.operation,
    ...(source.moduleId === undefined ? {} : { moduleId: source.moduleId }),
    ...(source.contributionId === undefined ? {} : { contributionId: source.contributionId }),
    message: source.message,
  });
}

/** Captures untrusted desktop transport data without exposing mutable host objects. */
export function capturePersistedPluginDiagnostics(value: unknown, limit: number): readonly PersistedPluginDiagnostic[] | null {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PERSISTED_DIAGNOSTICS || !Array.isArray(value)
    || value.length > limit) return null;
  const captured: PersistedPluginDiagnostic[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return null;
    const diagnostic = captureDiagnostic(value[index]);
    if (!diagnostic) return null;
    captured.push(diagnostic);
  }
  return Object.freeze(captured);
}

/** Diagnostic persistence is best-effort and must never block plugin isolation. */
export function persistUiPluginDiagnostic(diagnostic: UiPluginDiagnostic): void {
  if (!isTauri()) return;
  void invoke<PersistedPluginDiagnostic>("workbench_plugin_diagnostic_v1", {
    diagnostic: {
      reportId: diagnostic.reportId,
      occurredAt: diagnostic.occurredAt,
      code: diagnostic.code,
      stage: diagnostic.stage,
      operation: "ui-plugin",
      moduleId: diagnostic.plugin.id,
      contributionId: diagnostic.subject?.id,
    },
  }).catch(() => undefined);
}

export async function readPersistedPluginDiagnostics(limit = 128): Promise<readonly PersistedPluginDiagnostic[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PERSISTED_DIAGNOSTICS) {
    throw new RangeError(`Plugin diagnostic limit must be between 1 and ${MAX_PERSISTED_DIAGNOSTICS}`);
  }
  if (!isTauri()) return [];
  try {
    const value: unknown = await invoke("workbench_read_plugin_diagnostics_v1", { limit });
    return capturePersistedPluginDiagnostics(value, limit) ?? [];
  } catch {
    return [];
  }
}
