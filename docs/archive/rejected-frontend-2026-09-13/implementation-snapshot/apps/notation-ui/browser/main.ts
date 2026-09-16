import type { EditorAction, EditorState } from '../contracts';
import { ApiError, createKernelClient } from './kernel-client';
import { ScoreViewRegistry, type ScoreView } from './score-views';
import { standardNotation } from '../plugins/standard-notation';

const client = createKernelClient();
const registry = new ScoreViewRegistry(); registry.register(standardNotation);
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = element<HTMLElement>('workspace');
const message = element<HTMLElement>('message');
const saveDialog = element<HTMLDialogElement>('save-dialog');
const openDialog = element<HTMLDialogElement>('open-dialog');
let state: EditorState;
let selected = '';
let view: ScoreView | undefined;
let queue = Promise.resolve();
let ready = false;

function freezeState(value: EditorState): EditorState {
  value.events.forEach(event => { if (event.pitch) Object.freeze(event.pitch); Object.freeze(event); });
  Object.freeze(value.events); return Object.freeze(value);
}
function showMessage(text: string, error = false) {
  message.textContent = text; message.classList.toggle('error', error);
  message.setAttribute('role', error ? 'alert' : 'status');
}
function render() {
  element('score-title').textContent = state.filename?.replace(/\.score\.json$/, '') ?? state.title;
  const status = element('save-status'); status.textContent = state.needsSave ? '未保存' : '已保存';
  status.classList.toggle('unsaved', state.needsSave);
  element<HTMLButtonElement>('undo').disabled = !state.canUndo;
  element<HTMLButtonElement>('redo').disabled = !state.canRedo;
  document.title = `${state.needsSave ? '● ' : ''}${state.filename?.replace(/\.score\.json$/, '') ?? state.title} · Brilliant Guitar`;
  view?.render();
}
function accept(next: EditorState) {
  const replaced = state?.sessionId !== next.sessionId;
  state = freezeState(next);
  if (replaced || !state.events.some(event => event.id === selected)) selected = state.events[0]!.id;
  render();
}
function enqueue(operation: () => void | Promise<void>) {
  queue = queue.then(async () => {
    try { await operation(); }
    catch (error) {
      if (error instanceof ApiError && error.state) accept(error.state);
      showMessage(error instanceof Error ? error.message : '操作失败，请重试。', true);
    }
  });
}
async function execute(action: EditorAction): Promise<EditorState> {
  try {
    const next = await client.execute({ sessionId: state.sessionId, version: state.version, action });
    accept(next); showMessage(''); return next;
  } catch (error) {
    if (!(error instanceof ApiError)) throw new Error('本地宿主连接中断。请恢复宿主后刷新，未保存内容可能无法恢复。');
    throw error;
  }
}
function focusScore() { root.focus({ preventScroll: true }); }
function hasUnsavedWork(): boolean {
  return !!state?.needsSave && (state.filename !== null || state.version > 0);
}
function confirmLeave(): boolean {
  return !hasUnsavedWork() || window.confirm('当前乐谱尚未保存。确定放弃这些未保存内容吗？');
}
function suggestFilename() { return `乐谱 ${new Date().toLocaleDateString('sv-SE')}.score.json`; }
function askSave() {
  element<HTMLInputElement>('filename').value = state.filename?.replace(/\.score\.json$/, '') ?? suggestFilename().replace(/\.score\.json$/, '');
  element('save-error').textContent = ''; saveDialog.showModal(); element<HTMLInputElement>('filename').select();
}
function save() {
  if (!state.filename) { askSave(); return; }
  enqueue(async () => { await execute({ kind: 'save' }); showMessage(`已保存到本机：${state.filename}`); focusScore(); });
}
element('new').addEventListener('click', () => enqueue(async () => {
  if (!confirmLeave()) return;
  await execute({ kind: 'new' }); focusScore();
}));
element('save').addEventListener('click', save);
element('save-as').addEventListener('click', askSave);
element('undo').addEventListener('click', () => enqueue(async () => { await execute({ kind: 'undo' }); focusScore(); }));
element('redo').addEventListener('click', () => enqueue(async () => { await execute({ kind: 'redo' }); focusScore(); }));
element('delete').addEventListener('click', () => enqueue(async () => { await execute({ kind: 'rest', eventId: selected }); focusScore(); }));
element('open').addEventListener('click', () => enqueue(async () => {
  const files = await client.files();
  const list = element('file-list'); list.replaceChildren();
  element('open-error').textContent = '';
  if (!files.length) { const text = document.createElement('p'); text.textContent = '还没有保存的乐谱。先写几个音符，再保存第一份作品。'; list.append(text); }
  for (const file of files) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'file-row';
    const name = document.createElement('strong'); name.textContent = file.name;
    const date = document.createElement('span'); date.textContent = new Date(file.modified).toLocaleString('zh-CN');
    button.append(name, date);
    button.addEventListener('click', () => enqueue(async () => {
      if (!confirmLeave()) return;
      try { await execute({ kind: 'open', name: file.name }); openDialog.close(); focusScore(); }
      catch (error) { element('open-error').textContent = error instanceof Error ? error.message : '打开失败'; throw error; }
    })); list.append(button);
  }
  openDialog.showModal();
}));
element<HTMLFormElement>('save-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = element<HTMLInputElement>('filename').value.trim().replace(/\.score\.json$/, '') + '.score.json';
  enqueue(async () => {
    try {
      await execute({ kind: 'save', name }); saveDialog.close(); showMessage(`已保存到本机：${name}`); focusScore();
    } catch (error) { element('save-error').textContent = error instanceof Error ? error.message : '保存失败'; throw error; }
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => button.addEventListener('click', () => {
  button.closest('dialog')!.close(); focusScore();
}));
document.addEventListener('keydown', event => {
  if (!ready || event.isComposing || saveDialog.open || openDialog.open) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); enqueue(async () => {
      const redo = event.shiftKey;
      if (redo ? state.canRedo : state.canUndo) await execute({ kind: redo ? 'redo' : 'undo' }); focusScore();
    }); }
    if (event.key.toLowerCase() === 'y') { event.preventDefault(); enqueue(async () => { if (state.canRedo) await execute({ kind: 'redo' }); focusScore(); }); }
    return;
  }
  if (event.altKey || !(target instanceof Node) || !root.contains(target)) return;
  if (/^[a-gr]$/i.test(event.key) || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault(); const key = event.key;
    enqueue(async () => { await view?.key(key); focusScore(); });
  }
});
window.addEventListener('beforeunload', event => { if (hasUnsavedWork()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (!event.persisted) view?.destroy(); });

async function start() {
  state = freezeState(await client.read()); selected = state.events[0]!.id;
  const selector = element<HTMLSelectElement>('view-select');
  for (const provider of registry.available(state)) {
    const option = document.createElement('option'); option.value = provider.id; option.textContent = provider.name; selector.append(option);
  }
  async function mount() {
    view?.destroy();
    view = await registry.get(selector.value, state).create({
      container: element('view-container'), read: () => state, selection: () => selected,
      select: id => { if (state.events.some(event => event.id === id)) { selected = id; render(); focusScore(); } },
      edit: execute, enqueue,
    }); render();
  }
  selector.addEventListener('change', () => enqueue(mount));
  await mount(); ready = true;
  element('loading').hidden = true;
  document.querySelectorAll<HTMLButtonElement>('[data-startup]').forEach(button => button.disabled = false);
  render(); focusScore();
}
start().catch(error => { element('loading').textContent = '工作台未能启动'; showMessage(error instanceof Error ? error.message : '加载失败', true); });
