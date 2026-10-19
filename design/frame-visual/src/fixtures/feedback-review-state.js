/* In-memory visual fixtures only. No business transport, feedback SDK or persistence. */
const CONTENT_FIELDS = ["enabled", "widths", "iconOrder", "hiddenIcons", "presentation", "contentHosting"];
export const FEEDBACK_SAMPLES = ["normal", "saving", "save-failed", "unknown", "config-fallback", "hidden-source", "provider-missing", "long"];
const contentSnapshot = state => Object.fromEntries(CONTENT_FIELDS.filter(key => Object.hasOwn(state, key)).map(key => [key, structuredClone(state[key])]));
const selected = state => state.schemeBook.entries.find(entry => entry.id === state.schemeBook.current);
const editable = state => state.assembly === true;
const report = (status, summary, detail, code = status) => ({ status, summary, detail, code, seen: false });

export function applyFeedbackReview(state, params) {
  if (params.get("feedbackReview") !== "1") return false;
  const sample = FEEDBACK_SAMPLES.includes(params.get("feedbackSample")) ? params.get("feedbackSample") : "normal";
  const base = contentSnapshot(state);
  state.schemeBook = { current: "base", entries: [
    { id: "base", name: "默认方案", builtin: true, content: base },
    { id: "personal", name: "我的工作区", builtin: false, content: structuredClone(base) },
  ] };
  state.preset = "默认方案"; state.custom = false;
  state.rightPage = 3; state.rightOpen = state.reviewLayout = true;
  state.feedbackReview = { sample, editor: null, operation: null, serial: 0, epoch: 0,
    message: "", fieldError: "", detailsOpen: false, scroll: 0, providerAvailable: sample !== "provider-missing", report: null };
  const memory = state.feedbackReview;
  if (["saving", "save-failed", "unknown"].includes(sample)) {
    state.assembly = true;
    openSchemeEditor(state, "save"); memory.editor.name = "练习工作区";
    submitScheme(state);
    if (sample !== "saving") settleScheme(state, memory.operation.token, sample === "unknown" ? "unknown" : "error");
  }
  if (sample === "config-fallback") memory.report = report("error", "部分布局配置未载入", "已使用可用的基础布局。原配置仍保留，进入内容编辑后可选择基础方案。", "configuration-unavailable");
  if (["hidden-source", "provider-missing", "long"].includes(sample)) {
    memory.report = report("error", sample === "long" ? "一个较长的来源名称报告了尚未解决的重要问题，需要主动展开查看完整内容" : "1 项问题待处理",
      sample === "provider-missing" ? "反馈呈现提供者不可用，当前使用框架基础文字呈现。问题记录保留；恢复提供者需由工程处理。"
        : "来源当前不可见。操作未完成；原内容保留。可先查看问题，再决定回到来源处理。关闭详情不会解决问题。", "source-unavailable");
    if (sample === "hidden-source") state.rightOpen = false;
  }
  return true;
}

export function validateSchemeName(state, value, excludedId) {
  const name = String(value ?? "").trim().normalize("NFC");
  if (!name) return { name, error: "请输入方案名称。" };
  if (Array.from(name).length > 40) return { name, error: "名称最多 40 个字符。" };
  if (/[\u0000-\u001f\u007f/\\]/u.test(name)) return { name, error: "名称不能包含换行、控制字符或斜杠。" };
  if (state.schemeBook.entries.some(entry => entry.id !== excludedId && entry.name.normalize("NFC").toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))) return { name, error: "这个名称已使用，请换一个。" };
  return { name, error: "" };
}

export function openSchemeEditor(state, kind) {
  const memory = state.feedbackReview, entry = selected(state);
  if (!memory || !editable(state) || memory.operation?.status === "pending" || memory.operation?.status === "unknown" || !["save", "rename", "delete"].includes(kind)) return false;
  if (kind !== "save" && entry.builtin) return false;
  memory.editor = { kind, target: entry.id, name: kind === "save" ? "" : entry.name };
  memory.fieldError = ""; memory.message = "";
  return true;
}

export function submitScheme(state) {
  const memory = state.feedbackReview;
  if (!memory?.editor || !editable(state) || memory.operation?.status === "pending" || memory.operation?.status === "unknown") return null;
  const { kind, target } = memory.editor;
  const entry = selected(state);
  if (entry.id !== target || (kind !== "save" && entry.builtin)) return null;
  const checked = kind === "delete" ? { name: entry.name, error: "" } : validateSchemeName(state, memory.editor.name, kind === "rename" ? target : null);
  memory.fieldError = checked.error;
  if (checked.error) return null;
  const token = ++memory.serial;
  memory.operation = { token, epoch: memory.epoch, status: "pending", kind, target, name: checked.name, content: contentSnapshot(state) };
  memory.report = report("progress", kind === "delete" ? "正在移除方案…" : "正在整理方案…", "本预览只模拟内存操作；不会写入磁盘。", "scheme-pending");
  return token;
}

function applyProposal(state, operation) {
  const book = state.schemeBook;
  if (book.current !== operation.target) return false;
  const entry = selected(state);
  if (!entry || (operation.kind !== "save" && entry.builtin)) return false;
  if (operation.kind === "save") {
    const id = "visual-scheme-" + operation.token;
    book.entries.push({ id, name: operation.name, builtin: false, content: structuredClone(operation.content) }); book.current = id;
  } else if (operation.kind === "rename") entry.name = operation.name;
  else { book.entries = book.entries.filter(item => item.id !== entry.id); book.current = "base"; Object.assign(state, structuredClone(selected(state).content)); }
  state.preset = selected(state).name; state.custom = !selected(state).builtin;
  return true;
}

export function settleScheme(state, token, outcome = "success") {
  const memory = state.feedbackReview, operation = memory?.operation;
  if (!operation || token !== operation.token || operation.status !== "pending") return false;
  if (outcome === "unknown") {
    operation.status = "unknown";
    memory.report = report("unknown", "结果待核对", "没有收到明确结局，操作可能已完成。先核对这一任务的结果，不重复提交。", "scheme-unknown");
    return true;
  }
  if (outcome === "error") {
    memory.operation = null;
    memory.report = report("error", "方案未保存", "本次操作明确未完成。名称与原方案保留，可以在原处修正后再次提交。", "scheme-rejected");
    return true;
  }
  if (!editable(state) || operation.epoch !== memory.epoch || !applyProposal(state, operation)) return false;
  memory.operation = memory.editor = null;
  memory.report = null;
  memory.message = operation.kind === "delete" ? "方案已移除，随本次布局一起确认。" : "方案已更新，随本次布局一起确认。";
  return true;
}

export function reconcileScheme(state) {
  const memory = state.feedbackReview, operation = memory?.operation;
  if (!operation || operation.status !== "unknown") return false;
  // Fixture result lookup; never repeat the original operation.
  const applied = editable(state) && operation.epoch === memory.epoch && applyProposal(state, operation);
  memory.operation = memory.editor = null; memory.report = null;
  memory.message = applied ? "结果已核对，方案变化等待布局确认。" : "任务结局已核对；当前布局保持取消后的状态。";
  return true;
}

export function closeSchemeEditor(state) {
  const memory = state.feedbackReview;
  if (!memory?.editor || memory.operation?.status === "unknown") return false;
  memory.editor = null; memory.fieldError = "";
  if (memory.operation?.status === "pending") { memory.operation = null; memory.report = null; }
  return true;
}

export function finishFeedbackEdit(state, confirm) {
  const memory = state.feedbackReview;
  if (!memory) return true;
  if (confirm && memory.operation) {
    memory.message = memory.operation.status === "unknown" ? "先核对这一任务的结果，再确认布局。" : "方案正在处理，完成后再确认布局。";
    return false;
  }
  memory.epoch += 1;
  memory.editor = null; memory.fieldError = "";
  if (memory.operation?.status === "pending") { memory.operation = null; memory.report = null; }
  memory.message = confirm ? "内容与方案已确认。" : "内容与方案已撤回；工作区调整保留。";
  return true;
}

export function runFeedbackAction(state, action, value) {
  const memory = state.feedbackReview;
  if (!memory) return false;
  if (action === "feedback-details") { memory.detailsOpen = !memory.detailsOpen; if (memory.detailsOpen && memory.report) memory.report.seen = true; return true; }
  if (action === "feedback-close") { memory.detailsOpen = false; return true; }
  if (action === "feedback-check") return reconcileScheme(state);
  if (action === "scheme-editor-cancel") return closeSchemeEditor(state);
  if (action === "scheme-editor") return openSchemeEditor(state, value);
  if (action === "scheme-select") {
    if (!editable(state) || memory.operation || memory.editor) return false;
    const entry = state.schemeBook.entries.find(item => item.id === value);
    if (!entry) return false;
    Object.assign(state, structuredClone(entry.content)); state.schemeBook.current = entry.id;
    state.preset = entry.name; state.custom = !entry.builtin; memory.message = "方案变化等待布局确认。";
    if (memory.report?.code === "configuration-unavailable") memory.report = null;
    return true;
  }
  return false;
}

export function feedbackTitle(state) {
  const item = state.feedbackReview?.report;
  if (!item) return { label: state.status, status: "idle", attention: false };
  return { label: item.status === "unknown" ? "结果待核对" : item.status === "progress" ? "方案处理中" : "1 项问题待处理", status: item.status, attention: item.status !== "progress" };
}
