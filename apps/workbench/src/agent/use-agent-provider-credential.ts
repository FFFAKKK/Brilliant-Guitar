import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentProviderCredentialSnapshot } from "../contracts/agent-provider-credential.ts";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import type { WorkbenchClient } from "../services/workbench-client.ts";
import { issueFromError } from "../workbench/issue-from-error.ts";

export type AgentCredentialControlStatus =
  | "idle"
  | "checking"
  | "configured"
  | "missing"
  | "saving"
  | "deleting"
  | "unavailable"
  | "error";

export interface AgentCredentialControlSnapshot {
  readonly status: AgentCredentialControlStatus;
  readonly present: boolean;
  readonly message: string;
}

const IDLE_CREDENTIAL: AgentCredentialControlSnapshot = Object.freeze({
  status: "idle",
  present: false,
  message: "选择需要 API Key 的 Provider 后可配置凭据",
});

function controlSnapshot(snapshot: AgentProviderCredentialSnapshot): AgentCredentialControlSnapshot {
  return { status: snapshot.status, present: snapshot.present, message: snapshot.message };
}

export function useAgentProviderCredential(
  client: WorkbenchClient,
  providerId: string | null,
  required: boolean,
  runtime?: WorkbenchTaskRuntime,
) {
  const [snapshot, setSnapshot] = useState<AgentCredentialControlSnapshot>(IDLE_CREDENTIAL);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!required || providerId === null) {
      setSnapshot(IDLE_CREDENTIAL);
      return;
    }
    setSnapshot({ status: "checking", present: false, message: "正在检查系统凭据库…" });
    void client.readAgentProviderCredentialStatus(providerId).then((next) => {
      if (current === generation.current) setSnapshot(controlSnapshot(next));
    }).catch((error: unknown) => {
      if (current !== generation.current) return;
      const issue = issueFromError(error, { code: "agent-credential.read-failed", message: "无法读取 Provider 凭据状态",
        severity: "warning", source: "host", target: { scope: "workbench" }, retryable: true });
      setSnapshot({ status: "error", present: false, message: issue.message });
      runtime?.feedback.report(issue);
    });
  }, [client, providerId, required, runtime?.feedback]);

  const save = useCallback(async (secret: string): Promise<boolean> => {
    if (!required || providerId === null) return false;
    const current = ++generation.current;
    setSnapshot((previous) => ({ status: "saving", present: previous.present, message: "正在保存到系统凭据库…" }));
    try {
      const next = await client.setAgentProviderCredential(providerId, secret);
      if (current === generation.current) setSnapshot(controlSnapshot(next));
      return current === generation.current;
    } catch (error) {
      if (current !== generation.current) return false;
      const issue = issueFromError(error, { code: "agent-credential.write-failed", message: "无法保存 Provider 凭据",
        severity: "error", source: "host", target: { scope: "workbench" }, retryable: true });
      setSnapshot({ status: "error", present: false, message: issue.message });
      runtime?.feedback.report(issue);
      return false;
    }
  }, [client, providerId, required, runtime?.feedback]);

  const remove = useCallback(async (): Promise<boolean> => {
    if (!required || providerId === null) return false;
    const current = ++generation.current;
    setSnapshot((previous) => ({ status: "deleting", present: previous.present, message: "正在删除系统凭据…" }));
    try {
      const next = await client.deleteAgentProviderCredential(providerId);
      if (current === generation.current) setSnapshot(controlSnapshot(next));
      return current === generation.current;
    } catch (error) {
      if (current !== generation.current) return false;
      const issue = issueFromError(error, { code: "agent-credential.delete-failed", message: "无法删除 Provider 凭据",
        severity: "error", source: "host", target: { scope: "workbench" }, retryable: true });
      setSnapshot((previous) => ({ status: "error", present: previous.present, message: issue.message }));
      runtime?.feedback.report(issue);
      return false;
    }
  }, [client, providerId, required, runtime?.feedback]);

  return { snapshot, save, remove };
}
