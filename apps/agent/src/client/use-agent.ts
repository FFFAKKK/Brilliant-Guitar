import { useCallback, useEffect, useRef, useState } from "react";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { decodeSnapshot, requestAgent } from "./agent-api.ts";

export function useAgent() {
  const [snapshot, setSnapshot] = useState<StandaloneAgentSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const latestSequence = useRef(-1);
  const connectionEpoch = useRef(0);
  const accept = useCallback((value: unknown) => {
    const next = decodeSnapshot(value);
    if (next.sequence < latestSequence.current) return;
    latestSequence.current = next.sequence;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    const initialEpoch = connectionEpoch.current;
    const events = new EventSource("/api/session/events");
    events.onopen = () => { if (!disposed) {
      ++connectionEpoch.current;
      latestSequence.current = -1;
      setConnected(true); setError("");
    } };
    events.onmessage = (event) => {
      if (disposed) return;
      try { accept(JSON.parse(event.data)); } catch { setError("Agent 状态格式无效，请刷新页面"); }
    };
    events.onerror = () => { if (!disposed) setConnected(false); };
    void requestAgent("session").then((value) => { if (!disposed && initialEpoch === connectionEpoch.current) accept(value); }).catch(() => {
      if (!disposed) setError("无法连接 Agent，请确认独立宿主正在运行");
    });
    return () => { disposed = true; events.close(); };
  }, [accept]);

  const action = useCallback(async (path: string, body: unknown): Promise<unknown> => {
    setError("");
    const epoch = connectionEpoch.current;
    try {
      const value = await requestAgent(path, body);
      if (path !== "model-test" && epoch === connectionEpoch.current) accept(value);
      return value;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "请求未完成");
      throw failure;
    }
  }, [accept]);

  return { snapshot, connected, error, action, clearError: () => setError("") };
}
