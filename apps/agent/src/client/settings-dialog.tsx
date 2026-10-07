import { useEffect, useRef, useState } from "react";
import { DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration, parseAgentModelConnection, type AgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { matchesModelConnection, parseModelCatalog, type AgentModelCatalog } from "../contracts/model-catalog.ts";
import { Icon } from "./icons.tsx";
import { decodeSnapshot } from "./agent-api.ts";

interface Props {
  readonly snapshot: StandaloneAgentSnapshot;
  readonly action: (path: string, body: unknown, signal?: AbortSignal) => Promise<unknown>;
  readonly onClose: () => void;
}

export function SettingsDialog({ snapshot, action, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(snapshot.configuration);
  const selected = snapshot.connections.profiles.find((profile) => profile.id === snapshot.connections.selectedProfileId)!;
  const [profileId, setProfileId] = useState<string | null>(selected.id);
  const [profileName, setProfileName] = useState(selected.name);
  const [rememberCredential, setRememberCredential] = useState(selected.credentialRemembered);
  const [modelSearch, setModelSearch] = useState("");
  const [testResult, setTestResult] = useState("");
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
  const changed = profileId !== selected.id || profileName !== selected.name || rememberCredential !== selected.credentialRemembered || JSON.stringify(draft) !== JSON.stringify(snapshot.configuration) || Boolean(apiKey);
  let sameTarget = false;
  try { sameTarget = matchesModelConnection(parseAgentModelConnection({ providerId: draft.providerId, protocol: draft.protocol, baseUrl: draft.baseUrl }), snapshot.configuration); } catch { /* Incomplete editable URL. */ }
  const credentialAvailable = Boolean(apiKey) || (profileId === selected.id && sameTarget && snapshot.credentialPresent);
  const canRemember = snapshot.storage.configuration === "file" && snapshot.storage.credentialProtection === "windows-dpapi";
  const filteredModels = models.filter((model) => model.id.toLowerCase().includes(modelSearch.trim().toLowerCase()));
  const recentModels = profileId === selected.id && sameTarget ? selected.recentModels : [];
  const preset = draft.providerId === "deepseek" ? "deepseek" : draft.baseUrl === "https://api.openai.com/v1" ? "openai" : "custom";
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => { mounted.current = false; catalogAbort.current?.abort(); };
  }, []);

  function updateTarget(configuration: AgentModelConfiguration) {
    catalogAbort.current?.abort();
    setDraft(configuration); setApiKey(""); setModels([]); setCustomModel(true); setNotice(""); setFailed(false);
    modelEdited.current = false;
    setRememberCredential(false); setModelSearch(""); setTestResult("");
  }

  function loadProfile(value: StandaloneAgentSnapshot) {
    const profile = value.connections.profiles.find((item) => item.id === value.connections.selectedProfileId)!;
    updateTarget(profile.configuration); setProfileId(profile.id); setProfileName(profile.name); setRememberCredential(profile.credentialRemembered);
  }

  function chooseModel(modelId: string) {
    modelEdited.current = true; setDraft({ ...draft, modelId }); setTestResult("");
    setCustomModel(!models.some((model) => model.id === modelId));
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
      const saved = decodeSnapshot(await action("profiles/save", { profileId, name: profileName, configuration, rememberCredential, ...(apiKey ? { apiKey } : {}) }));
      setApiKey(""); setDraft(configuration);
      const profile = saved.connections.profiles.find((item) => item.id === saved.connections.selectedProfileId)!;
      setProfileId(profile.id); setProfileName(profile.name); setRememberCredential(profile.credentialRemembered); setTestResult("");
      setNotice("配置已保存。手动启用后即可对话。");
    }); }}>
      <fieldset disabled={active || pending}>
        <label>已保存的连接<select aria-label="已保存的连接" value={profileId ?? ""} onChange={(event) => void perform(async () => {
          catalogAbort.current?.abort();
          const value = decodeSnapshot(await action("profiles/select", { profileId: event.target.value })); loadProfile(value);
          setNotice("连接已切换，手动启用后即可使用。");
        })}>{profileId === null && <option value="">新连接（尚未保存）</option>}{snapshot.connections.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
        <div className="profile-actions"><button type="button" className="text-button" onClick={() => { updateTarget(DEFAULT_DEEPSEEK_CONFIGURATION); setProfileId(null); setProfileName(""); }}>新建连接</button>
          <button type="button" className="text-button danger-button" disabled={profileId === null || snapshot.connections.profiles.length <= 1} onClick={() => void perform(async () => {
            const value = decodeSnapshot(await action("profiles/delete", { profileId })); loadProfile(value); setNotice("连接已删除。");
          })}>删除连接</button></div>
        <label>连接名称<input aria-label="连接名称" value={profileName} required maxLength={80} placeholder="例如：我的 DeepSeek" onChange={(event) => setProfileName(event.target.value)}/></label>
        <label>模型服务<select aria-label="模型服务" value={preset} onChange={(event) => {
          updateTarget(event.target.value === "deepseek" ? DEFAULT_DEEPSEEK_CONFIGURATION : { providerId: "openai-compatible", protocol: "chat-completions", baseUrl: event.target.value === "openai" ? "https://api.openai.com/v1" : "", modelId: "" });
        }}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义 OpenAI 兼容服务</option></select></label>
        <label>服务地址<input type="url" value={draft.baseUrl} required maxLength={2048} spellCheck={false} onChange={(event) => updateTarget({ ...draft, baseUrl: event.target.value })}/></label>
        <label><span>API Key <span className="field-state">{profileId === selected.id && sameTarget && snapshot.credentialPresent ? "已配置" : "未配置"}</span></span>
          <input type="password" value={apiKey} autoComplete="new-password" placeholder={profileId === selected.id && sameTarget && snapshot.credentialPresent ? "留空保留当前密钥" : "粘贴你的服务密钥"} onChange={(event) => { setApiKey(event.target.value); setModels([]); setCustomModel(true); setNotice(""); setTestResult(""); }}/></label>
        <label className="checkbox-field"><input type="checkbox" checked={rememberCredential} disabled={!canRemember && !rememberCredential} onChange={(event) => setRememberCredential(event.target.checked)}/><span>记住此连接的密钥</span></label>
        <p className="field-help">{canRemember ? "勾选后使用当前 Windows 用户的系统加密保护。未勾选时，密钥仅在本次运行中保留。" : "当前宿主不支持记住密钥，退出后需重新填写。"} 更换服务地址会清除原密钥。</p>
        <div className="model-field-heading"><label htmlFor="model-id">模型</label>
          <button type="button" className="text-button" disabled={!credentialAvailable} onClick={() => void perform(discoverModels)}>{discovering ? "正在获取…" : models.length ? "刷新列表" : "获取模型"}</button></div>
        {models.length > 0 && !customModel
          ? <><input type="search" aria-label="搜索模型" placeholder="搜索供应商模型" value={modelSearch} onChange={(event) => setModelSearch(event.target.value)}/>
            <select id="model-id" aria-label="模型" value={draft.modelId} onChange={(event) => chooseModel(event.target.value)}>
              {!filteredModels.some((model) => model.id === draft.modelId) && <option value={draft.modelId}>{draft.modelId}（当前选择）</option>}{filteredModels.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select>
            {filteredModels.length === 0 && <span className="notice">没有匹配模型，可清除搜索或手动填写。</span>}</>
          : <input id="model-id" aria-label="模型 ID" value={draft.modelId} placeholder="获取模型列表，或填写模型 ID"
            required maxLength={160} spellCheck={false}
            onChange={(event) => { modelEdited.current = true; setDraft({ ...draft, modelId: event.target.value }); setTestResult(""); }} />}
        <div className="model-field-help"><span>{models.length ? `供应商返回 ${models.length} 个模型` : "填写地址与密钥后，可直接获取模型。"}</span>
          {models.length > 0 && <button type="button" className="text-button" onClick={() => {
            if (customModel && !models.some((model) => model.id === draft.modelId)) setDraft({ ...draft, modelId: models[0]!.id });
            setCustomModel(!customModel); modelEdited.current = true;
          }}>{customModel ? "从列表选择" : "自定义模型"}</button>}</div>
        {recentModels.length > 0 && <div className="recent-models"><span>最近选择</span>{recentModels.map((id) => <button key={id} type="button" className="text-button" title={id} onClick={() => chooseModel(id)}>{id}</button>)}</div>}
        <button className="primary-button save-button" type="submit">保存配置</button>
      </fieldset>
    </form>
    <div className="connection-controls"><div><strong>{snapshot.session.enabled ? "Agent 已启用" : "Agent 已停用"}</strong><p>启用后，发送消息或测试连接才会调用模型。</p></div>
      <button disabled={pending || !snapshot.credentialPresent || active || changed} onClick={() => void perform(async () => { await action("session/enable", { enabled: !snapshot.session.enabled }); })}>{snapshot.session.enabled ? "停用" : "启用 Agent"}</button></div>
    {testResult && <p className="notice">生成接口：{testResult}</p>}
    <div className="dialog-footer"><span className="notice" role="status" data-failed={failed}>{active ? "任务正在运行，请先停止再修改配置。" : notice || snapshot.storage.notice || (snapshot.conversations.storage === "file" ? "连接设置和聊天记录保存在本机。" : "聊天记录仅在本次运行中保留。")}</span>
      {discovering ? <button onClick={() => catalogAbort.current?.abort()}>停止获取</button>
        : snapshot.testingConnection ? <button onClick={() => void action("session/cancel", {}).catch(() => undefined)}>停止测试</button>
        : <button disabled={pending || active || !snapshot.session.enabled || changed} onClick={() => void perform(async () => {
          const value = await action("model-test", {});
          const connected = typeof value === "object" && value !== null && "connected" in value && value.connected === true;
          setFailed(!connected); setNotice(connected ? "连接成功，可以开始对话。" : "连接失败，请检查密钥、地址和模型 ID。");
          setTestResult(connected ? "连接成功" : "连接失败");
        })}>测试连接</button>}
    </div>
  </dialog>;
}
