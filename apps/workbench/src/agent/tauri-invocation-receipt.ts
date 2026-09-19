import { invoke } from "@tauri-apps/api/core";

import { isCapabilityResult } from "../contracts/capability.ts";
import type { AgentInvocationReceiptLookup, AgentInvocationReceiptPort } from "./recovery-coordinator.ts";
import {
  capabilityRequestForInvocation,
  normalizeCapabilityResultForInvocation,
} from "./prepared-mutation.ts";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class AgentInvocationReceiptProtocolError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function acceptsUnknownData(_value: unknown): _value is unknown {
  return true;
}

function hostIssueCode(error: unknown): string | null {
  const candidate = record(error);
  const issue = record(candidate?.issue);
  return typeof issue?.code === "string" ? issue.code : null;
}

function errorMessage(error: unknown, fallback: string): string {
  const candidate = record(error);
  if (typeof candidate?.message === "string") return candidate.message;
  return error instanceof Error ? error.message : fallback;
}

function decodeLookup(value: unknown): AgentInvocationReceiptLookup {
  const candidate = record(value);
  if (candidate?.status === "not-started") return { status: "not-started" };
  if (candidate?.status === "started") return { status: "started" };
  if (candidate?.status === "resolved" && isCapabilityResult(candidate.result, acceptsUnknownData)) {
    return { status: "resolved", result: candidate.result };
  }
  throw new AgentInvocationReceiptProtocolError(
    "Capability receipt service returned an invalid lookup result",
  );
}

export class TauriAgentInvocationReceiptPort implements AgentInvocationReceiptPort {
  private readonly invokeCommand: Invoke;

  constructor(invokeCommand: Invoke = invoke) {
    this.invokeCommand = invokeCommand;
  }

  async lookup(input: Parameters<AgentInvocationReceiptPort["lookup"]>[0]): Promise<AgentInvocationReceiptLookup> {
    try {
      const request = capabilityRequestForInvocation(input.invocation, input.workspace);
      const value = await this.invokeCommand<unknown>(
        "workbench_agent_invocation_receipt_v1",
        { request },
      );
      const decoded = decodeLookup(value);
      if (decoded.status !== "resolved") return decoded;
      if (decoded.result.invocationId !== request.invocationId
        || decoded.result.capabilityId !== request.capabilityId
        || decoded.result.contractVersion !== request.contractVersion) {
        throw new AgentInvocationReceiptProtocolError(
          "Capability receipt identity does not match the prepared execution",
        );
      }
      return {
        status: "resolved",
        result: normalizeCapabilityResultForInvocation(input.invocation, decoded.result),
      };
    } catch (error) {
      if (error instanceof AgentInvocationReceiptProtocolError) throw error;
      if (hostIssueCode(error) === "capability-receipt.identity-conflict") {
        return {
          status: "identity-conflict",
          message: errorMessage(error, "Capability receipt identity conflicts with the Invocation"),
        };
      }
      return {
        status: "unavailable",
        message: errorMessage(error, "Capability receipt service is unavailable"),
      };
    }
  }
}
