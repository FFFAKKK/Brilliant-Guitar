import { useEffect, useRef, useState } from "react";
import { DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration, parseAgentModelConnection, type AgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { matchesModelConnection, parseModelCatalog, type AgentModelCatalog } from "../contracts/model-catalog.ts";
import { Icon } from "./icons.tsx";

interface Props {
  readonly snapshot: StandaloneAgentSnapshot;
  readonly action: (path: string, body: unknown, signal?: AbortSignal) => Promise<unknown>;
  readonly onClose: () => void;
}

export function SettingsDialog({ snapshot, action, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(snapshot.configuration);
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [models, setModels] = useState<AgentModelCatalog["models"]>([]);
  const [customModel, setCustomModel] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const modelEdited = useRef(false);
  const catalogAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const active = ["running", "cancelling"].includes(snapshot.session.status) || snapshot.testingConnection;
  const changed = JSON.stringify(draft) !== JSON.stringify(snapshot.configuration) || Boolean(apiKey);
  let sameTarget = false;
  try { sameTarget = matchesModelConnection(parseAgentModelConnection({ providerId: draft.providerId, protocol: draft.protocol, baseUrl: draft.baseUrl }), snapshot.configuration); } catch { /* Incomplete editable URL. */ }
  const credentialAvailable = Boolean(apiKey) || (sameTarget && snapshot.credentialPresent);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => { mounted.current = false; catalogAbort.current?.abort(); };
  }, []);

  function updateTarget(configuration: AgentModelConfiguration) {
    catalogAbort.current?.abort();
    setDraft(configuration); setApiKey(""); setModels([]); setCustomModel(true); setNotice(""); setFailed(false);
    modelEdited.current = false;
  }

  async function perform(operation: () => Promise<void>) {
    setPending(true); setNotice(""); setFailed(false);
    try { await operation(); } catch (error) { if (mounted.current) { setFailed(true); setNotice(error instanceof Error ? error.message : "请求未完成"); } }
    finally { if (mounted.current) setPending(false); }
  }

  async function discoverModels() {
    const connection = parseAgentModelConnection({ providerId: draft.providerId, protocol: draft.protocol, baseUrl: draft.baseUrl });
    const controller = new AbortController();
    catalogAbort.current?.abort(); catalogAbort.current = controller; setDiscovering(true);
    try {
      const value = await action("model-catalog", { connection, ...(apiKey ? { apiKey } : {}) }, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const catalog = parseModelCatalog(value);
      if (!matchesModelConnection(connection, catalog.connection)) throw new Error("服务地址已变化，请重新获取模型。");
      setModels(catalog.models);
      if (!catalog.models.length) { setCustomModel(true); setNotice("此服务没有返回可用模型，可以手动填写模型 ID。"); return; }
      if (catalog.models.some((model) => model.id === draft.modelId)) setCustomModel(false);
      else if (!modelEdited.current || !draft.modelId.trim()) { setDraft({ ...draft, modelId: catalog.models[0]!.id }); setCustomModel(false); }
      else setCustomModel(true);
      setNotice(`已获取 ${catalog.models.length} 个模型，选择后保存即可生效。`);
    } catch (error) {
      if (controller.signal.aborted) { if (mounted.current) { setFailed(false); setNotice("模型列表获取已取消。"); } }
      else throw error;
    } finally {
      if (catalogAbort.current === controller) { catalogAbort.current = null; if (mounted.current) setDiscovering(false); }
    }
  }

  return <dialog className="settings-dialog" ref={dialog} onClose={onClose} aria-labelledby="settings-title">
    <div className="dialog-heading"><div><span className="eyebrow">模型连接</span><h2 id="settings-title">Agent 设置</h2></div>
      <button className="icon-button" aria-label="关闭设置" onClick={() => { catalogAbort.current?.abort(); dialog.current?.close(); }}><Icon name="close"/></button></div>
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
          updateTarget(providerId === "deepseek" ? DEFAULT_DEEPSEEK_CONFIGURATION : { ...draft, providerId });
        }}><option value="deepseek">DeepSeek</option><option value="openai-compatible">其他 OpenAI 兼容服务</option></select></label>
        <label>服务地址<input type="url" value={draft.baseUrl} required maxLength={2048} spellCheck={false} onChange={(event) => updateTarget({ ...draft, baseUrl: event.target.value })}/></label>
        <label><span>API Key <span className="field-state">{sameTarget && snapshot.credentialPresent ? "已配置" : "未配置"}</span></span>
          <input type="password" value={apiKey} autoComplete="new-password" placeholder={sameTarget && snapshot.credentialPresent ? "留空保留当前密钥" : "粘贴你的服务密钥"} onChange={(event) => { setApiKey(event.target.value); setModels([]); setCustomModel(true); setNotice(""); }}/></label>
        <p className="field-help">密钥仅保存在当前宿主进程内，退出后需要重新填写。更换服务地址会清除原密钥。</p>
        <div className="model-field-heading"><label htmlFor="model-id">模型</label>
          <button type="button" className="text-button" disabled={!credentialAvailable} onClick={() => void perform(discoverModels)}>{discovering ? "正在获取…" : models.length ? "刷新列表" : "获取模型"}</button></div>
        {models.length > 0 && !customModel
          ? <select id="model-id" aria-label="模型" value={draft.modelId} onChange={(event) => { modelEdited.current = true; setDraft({ ...draft, modelId: event.target.value }); }}>{models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select>
          : <input id="model-id" aria-label="模型 ID" value={draft.modelId} placeholder="获取模型列表，或填写模型 ID"
            required maxLength={160} spellCheck={false}
            onChange={(event) => { modelEdited.current = true; setDraft({ ...draft, modelId: event.target.value }); }} />}
        <div className="model-field-help"><span>{models.length ? `供应商返回 ${models.length} 个模型` : "填写地址与密钥后，可直接获取模型。"}</span>
          {models.length > 0 && <button type="button" className="text-button" onClick={() => {
            if (customModel && !models.some((model) => model.id === draft.modelId)) setDraft({ ...draft, modelId: models[0]!.id });
            setCustomModel(!customModel); modelEdited.current = true;
          }}>{customModel ? "从列表选择" : "自定义模型"}</button>}</div>
        <button className="primary-button save-button" type="submit">保存配置</button>
      </fieldset>
    </form>
    <div className="connection-controls"><div><strong>{snapshot.session.enabled ? "Agent 已启用" : "Agent 已停用"}</strong><p>启用后，发送消息或测试连接才会调用模型。</p></div>
      <button disabled={pending || !snapshot.credentialPresent || active || changed} onClick={() => void perform(async () => { await action("session/enable", { enabled: !snapshot.session.enabled }); })}>{snapshot.session.enabled ? "停用" : "启用 Agent"}</button></div>
    <div className="dialog-footer"><span className="notice" role="status" data-failed={failed}>{active ? "任务正在运行，请先停止再修改配置。" : notice || "配置与聊天记录仅在本次运行中保留。"}</span>
      {discovering ? <button onClick={() => catalogAbort.current?.abort()}>停止获取</button>
        : snapshot.testingConnection ? <button onClick={() => void action("session/cancel", {}).catch(() => undefined)}>停止测试</button>
        : <button disabled={pending || active || !snapshot.session.enabled || changed} onClick={() => void perform(async () => {
          const value = await action("model-test", {});
          const connected = typeof value === "object" && value !== null && "connected" in value && value.connected === true;
          setFailed(!connected); setNotice(connected ? "连接成功，可以开始对话。" : "连接失败，请检查密钥、地址和模型 ID。");
        })}>测试连接</button>}
    </div>
  </dialog>;
}
