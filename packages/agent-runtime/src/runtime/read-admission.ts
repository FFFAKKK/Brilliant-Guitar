import { isCapabilityResult, type CapabilityTransportRequest } from "../contracts/capability.ts";
import { isAgentInputPreviewV1, resultJsonBytes, type AgentInputPreviewPort, type AgentInputPreviewV1,
  type AgentReadPreview, type AgentReadResultLimitV1, type ReadAdmissionPolicyV1, type ToolFeedbackAdmissionReportV1 } from "../contracts/tool-feedback-admission.ts";
import type { AgentProviderRequest } from "./provider.ts";
import { snapshotAgentValue } from "./tool-feedback.ts";

type CompletedPreview = Extract<AgentReadPreview, { readonly status: "ready" }>;
export interface AdmittedRead {
  readonly request: CapabilityTransportRequest;
  readonly limit: AgentReadResultLimitV1;
  readonly result: CompletedPreview["result"];
}
export interface ReadAdmissionResult {
  readonly report: ToolFeedbackAdmissionReportV1;
  readonly reads: readonly AdmittedRead[];
  readonly nextRequest: AgentProviderRequest | null;
}
export class ReadAdmissionContractError extends Error {}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key)
    && sameJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
export function matchesAdmittedRead(read: AdmittedRead, result: CompletedPreview["result"]): boolean {
  return result.invocationId === read.request.invocationId && result.capabilityId === read.request.capabilityId
    && result.contractVersion === read.request.contractVersion && resultJsonBytes(result.data) <= read.limit.maxResultJsonBytes
    && sameJson(result.data, read.result.data);
}

/** Allocation only. Authority, state transitions, execution and publication belong to the Controller. */
export function admitReadBatch(options: {
  readonly policy: ReadAdmissionPolicyV1;
  readonly runId: string;
  readonly turnId: string;
  readonly nextTurnId: string;
  readonly calls: readonly { readonly callId: string; readonly request: CapabilityTransportRequest }[];
  readonly inputPreview: AgentInputPreviewPort | undefined;
  readonly supported: boolean;
  readonly previewRead: (request: CapabilityTransportRequest, limit: AgentReadResultLimitV1) => AgentReadPreview;
  readonly build: (reads: readonly AdmittedRead[], excluded: ReadonlySet<string>) => AgentProviderRequest;
  readonly assertActive: () => void;
}): ReadAdmissionResult {
  const { calls, policy } = options;
  let latest: AgentInputPreviewV1 | null = null;
  let reads: AdmittedRead[] = [];
  const result = (status: ToolFeedbackAdmissionReportV1["status"], reason: ToolFeedbackAdmissionReportV1["reason"], nextRequest: AgentProviderRequest | null = null): ReadAdmissionResult => ({
    reads, nextRequest, report: { schemaVersion: 1, policyVersion: "immutable-query-v1", runId: options.runId, turnId: options.turnId, nextTurnId: options.nextTurnId,
      status, reason, inputPreview: latest, calls: calls.map((call, index) => ({ callId: call.callId, capabilityId: call.request.capabilityId,
        contractVersion: call.request.contractVersion, candidateInvocationId: call.request.invocationId,
        resultJsonByteLimit: reads[index]?.limit.maxResultJsonBytes ?? null,
        previewResultJsonBytes: reads[index] ? resultJsonBytes(reads[index]!.result.data) : null })) } });
  if (!options.inputPreview) return result("unsupported", "unsupported-provider");
  if (!options.supported) return result("unsupported", "unsupported-tool");
  const preview = (request: CapabilityTransportRequest, bytes: number): AdmittedRead | null => {
    options.assertActive();
    const limit = Object.freeze({ schemaVersion: 1 as const, maxResultJsonBytes: bytes });
    const candidate = options.previewRead(snapshotAgentValue(request), limit);
    options.assertActive();
    if (candidate.status === "unsupported") throw new ReadAdmissionContractError("unsupported-tool");
    if (candidate.status === "insufficient-limit") return null;
    if (candidate.status !== "ready" || !isCapabilityResult(candidate.result, (_data): _data is unknown => true) || candidate.result.status !== "completed"
      || candidate.result.invocationId !== request.invocationId || candidate.result.capabilityId !== request.capabilityId
      || candidate.result.contractVersion !== request.contractVersion || resultJsonBytes(candidate.result.data) > bytes) {
      throw new ReadAdmissionContractError("invalid-preview");
    }
    return snapshotAgentValue({ request, limit, result: candidate.result });
  };
  const excluded = new Set<string>();
  const evaluate = () => {
    options.assertActive();
    const request = snapshotAgentValue(options.build(reads, excluded));
    const plan = request.contextSelection;
    if (plan?.report.status === "invalid-context") return { request, reason: "invalid-context" as const };
    if (request.context.budget.exceeded) return { request, reason: "context-budget" as const };
    // Optional history is fixed by this allocator, never silently trimmed inside the input adapter.
    const fixed = snapshotAgentValue({ ...request, ...(plan ? { contextSelection: { ...plan, optionalRemovalOrder: [] } } : {}) });
    const measured = options.inputPreview!.preview(fixed);
    options.assertActive();
    if (!isAgentInputPreviewV1(measured) || measured.runId !== options.runId || measured.turnId !== options.nextTurnId
      || measured.inputTokenBudget !== request.context.budget.tokenBudget) throw new ReadAdmissionContractError("invalid-preview");
    latest = Object.freeze({ ...measured });
    return { request: fixed, removalOrder: plan?.optionalRemovalOrder ?? [], reason: measured.status === "ready" ? "fit" as const
      : measured.status === "input-limit-exceeded" ? "input-limit" as const
        : measured.status === "invalid-input" ? "invalid-preview" as const : "input-budget" as const };
  };

  // Validate every registered read (including its resource/session authorization) at a
  // non-body limit before building any maximum candidate for this batch.
  for (const call of calls) preview(call.request, 1);
  for (const call of calls) {
    const maximum = preview(call.request, policy.maxResultJsonBytes);
    if (maximum === null) return result("blocked", "input-limit");
    reads.push(maximum);
  }
  let measured = evaluate();
  // Freeze both initially omitted and subsequently removed optional context for all searches.
  for (const item of measured.request.contextSelection?.report.omitted ?? []) excluded.add(item.contextItemId);
  for (const id of measured.removalOrder ?? []) {
    if (measured.reason === "fit" || measured.reason === "invalid-context" || measured.reason === "invalid-preview") break;
    excluded.add(id);
    measured = evaluate();
  }
  if (measured.reason === "invalid-context" || measured.reason === "invalid-preview") return result("contract-error", measured.reason);
  if (measured.reason === "fit") return result("admitted", "fit", measured.request);

  const minimums: AdmittedRead[] = [];
  for (const call of calls) {
    let low = 1, high = policy.maxResultJsonBytes;
    let candidate = preview(call.request, high)!;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const next = preview(call.request, middle);
      if (next) { high = middle; candidate = next; } else low = middle + 1;
    }
    minimums.push(candidate.limit.maxResultJsonBytes === low ? candidate : preview(call.request, low)!);
  }
  reads = minimums;
  measured = evaluate();
  if (measured.reason !== "fit") return result(measured.reason === "invalid-context" || measured.reason === "invalid-preview" ? "contract-error" : "blocked", measured.reason);
  for (let index = 0; index < calls.length; ++index) {
    let low = reads[index]!.limit.maxResultJsonBytes, high = policy.maxResultJsonBytes;
    let accepted = reads[index]!;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      reads[index] = preview(calls[index]!.request, middle)!;
      const attempt = evaluate();
      if (attempt.reason === "invalid-context" || attempt.reason === "invalid-preview") return result("contract-error", attempt.reason);
      if (attempt.reason === "fit") { low = middle; accepted = reads[index]!; } else high = middle - 1;
    }
    reads[index] = accepted;
  }
  measured = evaluate();
  return measured.reason === "fit" ? result("admitted", "fit", measured.request) : result("contract-error", "invalid-preview");
}
