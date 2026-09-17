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
  if (!isTauri()) return [];
  try {
    return await invoke<PersistedPluginDiagnostic[]>("workbench_read_plugin_diagnostics_v1", { limit });
  } catch {
    return [];
  }
}
