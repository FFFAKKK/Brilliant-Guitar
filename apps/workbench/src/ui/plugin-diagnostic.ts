import type { UiPluginManifest } from "./plugin-manifest.ts";

export type UiPluginFailureCode =
  | "UI-PLG-001"
  | "UI-PLG-002"
  | "UI-PLG-003"
  | "UI-PLG-004"
  | "UI-PLG-005"
  | "UI-PLG-006"
  | "UI-PLG-007"
  | "UI-PLG-008"
  | "UI-PLG-009"
  | "UI-PLG-010"
  | "UI-PLG-011"
  | "UI-PLG-012";

export type UiPluginFailureStage =
  | "manifest"
  | "requirements"
  | "contributions"
  | "permissions"
  | "registration"
  | "resolution";

export interface UiPluginIdentity {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface UiPluginFailureSubject {
  readonly kind: "plugin" | "capability" | "projection" | "component" | "command";
  readonly id: string;
  readonly ownerPluginId?: string;
}

export interface UiPluginDiagnostic {
  readonly reportId: string;
  readonly occurredAt: number;
  readonly code: UiPluginFailureCode;
  readonly stage: UiPluginFailureStage;
  readonly plugin: UiPluginIdentity;
  readonly subject?: UiPluginFailureSubject;
  readonly message: string;
  readonly detail: string;
  readonly recoverable: boolean;
}

export interface UiPluginFailureInput {
  readonly code: UiPluginFailureCode;
  readonly stage: UiPluginFailureStage;
  readonly plugin: UiPluginIdentity;
  readonly subject?: UiPluginFailureSubject;
  readonly message: string;
  readonly detail: string;
  readonly cause?: unknown;
}

let reportSequence = 0;

function reportId(now = Date.now()): string {
  reportSequence = (reportSequence + 1) % 10_000;
  const stamp = new Date(now).toISOString().replace(/\D/g, "").slice(0, 14);
  return `BG-UI-${stamp}-${reportSequence.toString().padStart(4, "0")}`;
}

export function uiPluginIdentity(manifest: Partial<UiPluginManifest> | null | undefined): UiPluginIdentity {
  return {
    id: typeof manifest?.id === "string" && manifest.id ? manifest.id : "unknown.plugin",
    name: typeof manifest?.name === "string" && manifest.name ? manifest.name : "未知界面插件",
    version: typeof manifest?.version === "string" && manifest.version ? manifest.version : "unknown",
  };
}

export class UiPluginHostError extends Error {
  readonly diagnostic: UiPluginDiagnostic;

  constructor(input: UiPluginFailureInput) {
    super(input.detail, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "UiPluginHostError";
    this.diagnostic = Object.freeze({
      reportId: reportId(),
      occurredAt: Date.now(),
      code: input.code,
      stage: input.stage,
      plugin: input.plugin,
      ...(input.subject ? { subject: input.subject } : {}),
      message: input.message,
      detail: input.detail,
      recoverable: true,
    });
  }
}

export function isUiPluginHostError(error: unknown): error is UiPluginHostError {
  return error instanceof UiPluginHostError;
}

export function serializeUiPluginDiagnostic(diagnostic: UiPluginDiagnostic): string {
  const subject = diagnostic.subject
    ? `${diagnostic.subject.kind}:${diagnostic.subject.id}${diagnostic.subject.ownerPluginId ? ` (owner=${diagnostic.subject.ownerPluginId})` : ""}`
    : "none";
  return [
    `reportId=${diagnostic.reportId}`,
    `errorCode=${diagnostic.code}`,
    `occurredAt=${new Date(diagnostic.occurredAt).toISOString()}`,
    `stage=${diagnostic.stage}`,
    `plugin=${diagnostic.plugin.id}@${diagnostic.plugin.version}`,
    `subject=${subject}`,
    `message=${diagnostic.message}`,
    `detail=${diagnostic.detail}`,
  ].join("\n");
}

export class UiPluginDiagnosticStore {
  #snapshot: readonly UiPluginDiagnostic[] = Object.freeze([]);
  readonly #fingerprints = new Set<string>();
  readonly #listeners = new Set<() => void>();

  readonly list = (): readonly UiPluginDiagnostic[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  report(diagnostic: UiPluginDiagnostic): void {
    const subject = diagnostic.subject;
    const fingerprint = [diagnostic.code, diagnostic.plugin.id, diagnostic.stage,
      subject?.kind ?? "", subject?.id ?? "", subject?.ownerPluginId ?? "", diagnostic.detail].join("|");
    if (this.#fingerprints.has(fingerprint)) return;
    this.#fingerprints.add(fingerprint);
    this.#snapshot = Object.freeze([...this.#snapshot, diagnostic]);
    queueMicrotask(() => { for (const listener of this.#listeners) listener(); });
  }
}
