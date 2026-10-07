import { useEffect, useRef, useState } from "react";
import { DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { Icon } from "./icons.tsx";

interface Props {
  readonly snapshot: StandaloneAgentSnapshot;
  readonly action: (path: string, body: unknown) => Promise<unknown>;
  readonly onClose: () => void;
}

export function SettingsDialog({ snapshot, action, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(snapshot.configuration);
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const active = ["running", "cancelling"].includes(snapshot.session.status) || snapshot.testingConnection;
  const changed = JSON.stringify(draft) !== JSON.stringify(snapshot.configuration) || Boolean(apiKey);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function perform(operation: () => Promise<void>) {
    setPending(true); setNotice(""); setFailed(false);
    try { await operation(); } catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : "请求未完成"); }
    finally { setPending(false); }
  }

  return <dialog className="settings-dialog" ref={dialog} onClose={onClose} aria-labelledby="settings-title">
    <div className="dialog-heading"><div><span className="eyebrow">模型连接</span><h2 id="settings-title">Agent 设置</h2></div>
      <button className="icon-button" aria-label="关闭设置" onClick={() => dialog.current?.close()}><Icon name="close"/></button></div>
    <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); void perform(async () => {
      const configuration = parseAgentModelConfiguration(draft);
      await action("model-config", configuration);
      setDraft(configuration);
      if (apiKey) { const credential = apiKey; setApiKey(""); await action("model-credential", { apiKey: credential }); }
      setNotice("配置已保存。手动启用后即可对话。");
    }); }}>
      <fieldset disabled={active || pending}>
        <label>模型服务<select value={draft.providerId} onChange={(event) => {
          const providerId = event.target.value === "deepseek" ? "deepseek" : "openai-compatible";
          setDraft(providerId === "deepseek" ? DEFAULT_DEEPSEEK_CONFIGURATION : { ...draft, providerId }); setNotice("");
        }}><option value="deepseek">DeepSeek</option><option value="openai-compatible">其他 OpenAI 兼容服务</option></select></label>
        <label>服务地址<input type="url" value={draft.baseUrl} required maxLength={2048} spellCheck={false} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}/></label>
        <label>模型 ID<input value={draft.modelId} required maxLength={160} spellCheck={false} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}/></label>
        <label><span>API Key <span className="field-state">{snapshot.credentialPresent ? "已配置" : "未配置"}</span></span>
          <input type="password" value={apiKey} autoComplete="new-password" placeholder={snapshot.credentialPresent ? "留空保留当前密钥" : "粘贴你的服务密钥"} onChange={(event) => setApiKey(event.target.value)}/></label>
        <p className="field-help">密钥仅保存在当前宿主进程内，退出后需要重新填写。更换服务地址会清除原密钥。</p>
        <button className="primary-button save-button" type="submit">保存配置</button>
      </fieldset>
    </form>
    <div className="connection-controls"><div><strong>{snapshot.session.enabled ? "Agent 已启用" : "Agent 已停用"}</strong><p>启用后，发送消息或测试连接才会调用模型。</p></div>
      <button disabled={pending || !snapshot.credentialPresent || active || changed} onClick={() => void perform(async () => { await action("session/enable", { enabled: !snapshot.session.enabled }); })}>{snapshot.session.enabled ? "停用" : "启用 Agent"}</button></div>
    <div className="dialog-footer"><span className="notice" role="status" data-failed={failed}>{active ? "任务正在运行，请先停止再修改配置。" : notice || "配置与聊天记录仅在本次运行中保留。"}</span>
      {snapshot.testingConnection ? <button onClick={() => void action("session/cancel", {}).catch(() => undefined)}>停止测试</button>
        : <button disabled={pending || active || !snapshot.session.enabled || changed} onClick={() => void perform(async () => {
          const value = await action("model-test", {});
          const connected = typeof value === "object" && value !== null && "connected" in value && value.connected === true;
          setFailed(!connected); setNotice(connected ? "连接成功，可以开始对话。" : "连接失败，请检查密钥、地址和模型 ID。");
        })}>测试连接</button>}
    </div>
  </dialog>;
}
