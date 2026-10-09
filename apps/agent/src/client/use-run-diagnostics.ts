import { useCallback, useEffect, useRef, useState } from "react";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { requestAgent } from "./agent-api.ts";
import { DiagnosticsCoordinator, diagnosticsKey, type DiagnosticsIdentity, type DiagnosticsState } from "./diagnostics-coordinator.ts";

export function useRunDiagnostics(snapshot: StandaloneAgentSnapshot, open: boolean, connected: boolean, connectionEpoch: number) {
  const coordinator = useRef<DiagnosticsCoordinator | null>(null);
  const [state, setState] = useState<DiagnosticsState>({ key: "", phase: "closed", data: null });
  const profile = snapshot.connections.profiles.find((item) => item.id === snapshot.connections.selectedProfileId)!;
  const identity: DiagnosticsIdentity = { connectionEpoch, sessionId: snapshot.session.sessionId, runId: snapshot.session.runId,
    selectedProfileId: profile.id, configurationKey: JSON.stringify([profile.configuration, profile.inputPolicy, snapshot.credentialPresent]),
    enabled: snapshot.session.enabled, hostSequence: snapshot.sequence, running: ["running", "cancelling"].includes(snapshot.session.status) };
  const key = diagnosticsKey(identity);
  useEffect(() => {
    const next = new DiagnosticsCoordinator({ request: (signal) => requestAgent("run-diagnostics", undefined, signal), publish: setState });
    coordinator.current = next;
    return () => { next.dispose(); if (coordinator.current === next) coordinator.current = null; };
  }, []);
  useEffect(() => { coordinator.current?.update(open && connected ? identity : null); }, [open, connected, key, snapshot.sequence, identity.running]);
  const refresh = useCallback(() => coordinator.current?.refresh(), []);
  // Effects run after paint. Never render a previous identity for even one frame.
  const visible = open && connected && state.key === key ? state : { key, phase: "loading" as const, data: null };
  return { ...visible, disconnected: !connected, refresh };
}
