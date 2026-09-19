import { useEffect, useRef, useState } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";
import { WorkbenchClient } from "../services/workbench-client";
import { readOrCreateInitialScore } from "../services/initial-score";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { ApplicationCapabilityDirectory } from "../contracts/application-capability.ts";
import { issueFromError } from "./issue-from-error.ts";

/** The workbench owns the atomic read; views receive disposable projections. */
export function useWorkbenchSession(
  capabilities: ApplicationCapabilityDirectory,
  runtime?: WorkbenchTaskRuntime,
) {
  const [client] = useState(() => new WorkbenchClient(undefined, capabilities));
  const [requestId] = useState(() => crypto.randomUUID());
  const [session, setSession] = useState<ScoreSessionRead | null>(null);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<WorkbenchIssue | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ attempt: number; result: Promise<ScoreSessionRead> } | null>(null);
  useEffect(() => {
    let active = true;
    const token = runtime?.operations.begin("score.session-load", "workbench");
    let succeeded = false;
    setLoading(true);
    setError(null);
    // StrictMode repeats effects. Share the same request rather than creating twice.
    if (pending.current?.attempt !== attempt) pending.current = {
      attempt, result: readOrCreateInitialScore(client, requestId),
    };
    void pending.current.result.then((result) => { succeeded = true; if (active) setSession(result); })
      .catch((error: unknown) => {
        if (!active) return;
        const issue = issueFromError(error, { code: "session.load-failed", message: "暂时无法加载乐谱",
          severity: "error", source: "bridge", target: { scope: "workbench" }, retryable: true });
        setError(issue); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue, true);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        if (succeeded && token) runtime?.operations.finish(token);
      });
    return () => { active = false; };
  }, [attempt, client, requestId, runtime?.feedback.report, runtime?.operations.begin, runtime?.operations.fail, runtime?.operations.finish]);
  return { client, session, setSession, loadEpoch,
    replaceSession: (fresh: ScoreSessionRead) => { setLoadEpoch((value) => value + 1); setSession(fresh); },
    loading, error: error?.message ?? "",
    retryLabel: "重新加载",
    retry: () => setAttempt((value) => value + 1) };
}
