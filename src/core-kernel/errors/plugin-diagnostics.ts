/**
 * Host-side diagnostics for failures at the kernel/plugin boundary.
 *
 * The command wire contract keeps its existing stable error codes. This
 * companion record adds the context that a product needs to explain a failed
 * assembly or binding without placing plugin payloads in the error message.
 */

export type KernelPluginDiagnosticStage =
  | "assembly"
  | "binding"
  | "callback"
  | "core-read"
  | "transport";

export type KernelPluginDiagnosticOperation =
  | "create"
  | "prepare"
  | "transform"
  | "assess"
  | "migration"
  | "read";

export type KernelPluginDiagnosticCode =
  | "command.assembly-mismatch"
  | "command.invalid-requirement-inventory"
  | "command.required-contribution-unavailable"
  | "command.required-contribution-incompatible"
  | "command.contribution-semantic-invalid"
  | "command.contribution-contract-violation"
  | "command.contribution-effect-rejected"
  | "command.contribution-internal-error"
  | "wasm.invalid-addon"
  | "wasm.assembly-mismatch"
  | "wasm.invalid-binding"
  | "wasm.incomplete-binding"
  | "wasm.invalid-result"
  | "wasm.core-read-contract"
  | "wasm.execution-failed"
  | "kernel.unclassified-plugin-failure";

export interface KernelPluginDiagnostic {
  readonly reportId: string;
  readonly occurredAt: number;
  readonly code: KernelPluginDiagnosticCode;
  readonly stage: KernelPluginDiagnosticStage;
  readonly operation: KernelPluginDiagnosticOperation;
  readonly moduleId?: string;
  readonly contributionId?: string;
  readonly effectIndex?: number;
  readonly effectKind?: string;
  readonly failureCode?: string;
  readonly message: string;
}

export interface KernelPluginDiagnosticContext {
  readonly stage: KernelPluginDiagnosticStage;
  readonly operation: KernelPluginDiagnosticOperation;
  readonly moduleId?: string;
  readonly contributionId?: string;
  readonly effectIndex?: number;
  readonly effectKind?: string;
  readonly failureCode?: string;
}

const MAX_ENTRIES = 128;
let sequence = 0;

function reportId(): string {
  sequence = (sequence + 1) % 1_000_000;
  const random = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${sequence.toString(36)}`;
  return `kdiag-${random}`;
}

function normalizeCode(value: string): KernelPluginDiagnosticCode {
  if (value === "command.assembly-mismatch" || value === "command.invalid-requirement-inventory"
    || value === "command.required-contribution-unavailable" || value === "command.required-contribution-incompatible"
    || value === "command.contribution-semantic-invalid" || value === "command.contribution-contract-violation"
    || value === "command.contribution-effect-rejected" || value === "command.contribution-internal-error"
    || value === "wasm.invalid-addon" || value === "wasm.assembly-mismatch" || value === "wasm.invalid-binding" || value === "wasm.incomplete-binding"
    || value === "wasm.invalid-result" || value === "wasm.core-read-contract"
    || value === "wasm.execution-failed") return value;
  return "kernel.unclassified-plugin-failure";
}

function messageForCode(code: KernelPluginDiagnosticCode): string {
  switch (code) {
    case "command.assembly-mismatch": return "插件清单与内核装配不一致";
    case "command.invalid-requirement-inventory": return "插件需求清单无效或与已安装插件冲突";
    case "command.required-contribution-unavailable": return "乐谱所需插件贡献不可用";
    case "command.required-contribution-incompatible": return "插件不支持乐谱所需的扩展版本";
    case "command.contribution-semantic-invalid": return "插件拒绝了当前乐谱状态";
    case "command.contribution-contract-violation": return "插件返回结果违反内核协议";
    case "command.contribution-effect-rejected": return "插件请求的内核修改被拒绝";
    case "command.contribution-internal-error": return "插件执行时发生内部错误";
    case "wasm.invalid-addon": return "WASM 内核桥接组件无效";
    case "wasm.assembly-mismatch": return "WASM 插件与当前内核装配不匹配";
    case "wasm.invalid-binding": return "WASM 插件绑定或文件完整性校验失败";
    case "wasm.incomplete-binding": return "存在未绑定的必需 WASM 插件";
    case "wasm.invalid-result": return "WASM 插件返回了无效结果";
    case "wasm.core-read-contract": return "WASM 插件读取内核数据时违反协议";
    case "wasm.execution-failed": return "WASM 插件执行失败";
    default: return "插件与内核之间发生了未分类错误";
  }
}

export class KernelPluginDiagnosticLog {
  readonly #entries: KernelPluginDiagnostic[] = [];
  readonly #listeners = new Set<(entry: KernelPluginDiagnostic) => void>();

  append(input: {
    readonly code: string;
    readonly context: KernelPluginDiagnosticContext;
  }): KernelPluginDiagnostic {
    const code = normalizeCode(input.code);
    const entry: KernelPluginDiagnostic = Object.freeze({
      reportId: reportId(),
      occurredAt: Date.now(),
      code,
      stage: input.context.stage,
      operation: input.context.operation,
      ...(input.context.moduleId === undefined ? {} : { moduleId: input.context.moduleId }),
      ...(input.context.contributionId === undefined ? {} : { contributionId: input.context.contributionId }),
      ...(input.context.effectIndex === undefined ? {} : { effectIndex: input.context.effectIndex }),
      ...(input.context.effectKind === undefined ? {} : { effectKind: input.context.effectKind }),
      ...(input.context.failureCode === undefined ? {} : { failureCode: input.context.failureCode }),
      message: messageForCode(code),
    });
    this.#entries.push(entry);
    if (this.#entries.length > MAX_ENTRIES) this.#entries.splice(0, this.#entries.length - MAX_ENTRIES);
    for (const listener of [...this.#listeners]) {
      try { listener(entry); } catch { /* Diagnostics must never break the kernel boundary. */ }
    }
    return entry;
  }

  list(): readonly KernelPluginDiagnostic[] {
    return this.#entries.slice();
  }

  clear(): void {
    this.#entries.length = 0;
  }

  subscribe(listener: (entry: KernelPluginDiagnostic) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/** Process-local bounded log used by the desktop host and diagnostics panel. */
export const kernelPluginDiagnostics = new KernelPluginDiagnosticLog();

export function recordKernelPluginDiagnostic(
  code: string,
  context: KernelPluginDiagnosticContext,
): KernelPluginDiagnostic {
  return kernelPluginDiagnostics.append({ code, context });
}
