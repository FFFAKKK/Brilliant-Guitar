import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_APPLICATION_SETTINGS, readLegacyApplicationSettings } from "../contracts/application-settings.ts";
import type { ApplicationSettingsV1 } from "../contracts/application-settings.ts";
import type { DeleteTimePolicy } from "../contracts/note-input.ts";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import type { WorkbenchClient } from "../services/workbench-client.ts";
import { issueFromError } from "../workbench/issue-from-error.ts";

function initialSettings(): ApplicationSettingsV1 {
  try { return readLegacyApplicationSettings(localStorage); }
  catch { return DEFAULT_APPLICATION_SETTINGS; }
}

export function useApplicationSettings(client: WorkbenchClient, runtime?: WorkbenchTaskRuntime) {
  const legacy = useRef(initialSettings());
  const [settings, setSettings] = useState<ApplicationSettingsV1>(legacy.current);
  const settingsRef = useRef<ApplicationSettingsV1>(legacy.current);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const readyRef = useRef(false);

  const reportFailure = useCallback((error: unknown, fallback: string) => {
    const issue = issueFromError(error, { code: "config.unavailable", message: fallback,
      severity: "warning", source: "host", target: { scope: "workbench" }, retryable: true });
    setMessage(issue.message);
    runtime?.feedback.report(issue);
  }, [runtime?.feedback]);

  const persist = useCallback((next: ApplicationSettingsV1) => {
    setSaving(true);
    const task = writeQueue.current.catch(() => undefined)
      .then(() => client.writeApplicationSettings(next))
      .catch((error: unknown) => { reportFailure(error, "设置已在本次会话生效，但配置文件保存失败"); })
      .finally(() => { if (writeQueue.current === task) setSaving(false); });
    writeQueue.current = task;
  }, [client, reportFailure]);

  useEffect(() => {
    let active = true;
    void client.readApplicationSettings().then(async (snapshot) => {
      if (!active) return;
      const next = snapshot.persisted ? snapshot.settings : legacy.current;
      settingsRef.current = next;
      setSettings(next);
      if (!snapshot.persisted) await client.writeApplicationSettings(next);
      if (!active) return;
      if (snapshot.recoveredFromInvalid) {
        setMessage("原配置文件格式无效，已保留隔离副本并恢复兼容设置");
      }
    }).catch((error: unknown) => {
      if (active) reportFailure(error, "无法读取配置文件，当前使用兼容设置");
    }).finally(() => {
      if (!active) return;
      readyRef.current = true;
      setReady(true);
    });
    return () => { active = false; };
  }, [client, reportFailure]);

  const update = useCallback((transform: (current: ApplicationSettingsV1) => ApplicationSettingsV1) => {
    if (!readyRef.current) return;
    setMessage("");
    const next = transform(settingsRef.current);
    settingsRef.current = next;
    setSettings(next);
    persist(next);
  }, [persist]);

  const reset = useCallback(() => {
    if (!readyRef.current) return;
    setSaving(true);
    const task = writeQueue.current.catch(() => undefined)
      .then(() => client.resetApplicationSettings())
      .then((next) => {
        settingsRef.current = next;
        setSettings(next);
        setMessage("已恢复默认设置");
      }).catch((error: unknown) => {
        reportFailure(error, "无法恢复默认设置");
      }).finally(() => { if (writeQueue.current === task) setSaving(false); });
    writeQueue.current = task;
  }, [client, reportFailure]);

  return {
    settings,
    ready,
    saving,
    message,
    setAnimationsEnabled: (animationsEnabled: boolean) => update((current) => ({
      ...current, ui: { ...current.ui, animationsEnabled },
    })),
    setRuleWarningsVisible: (ruleWarningsVisible: boolean) => update((current) => ({
      ...current, ui: { ...current.ui, ruleWarningsVisible },
    })),
    setDeleteTimePolicy: (deleteTimePolicy: DeleteTimePolicy) => update((current) => ({
      ...current, editing: { ...current.editing, deleteTimePolicy },
    })),
    reset,
  };
}
