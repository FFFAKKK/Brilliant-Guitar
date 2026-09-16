import { test } from 'node:test';
import assert = require('node:assert/strict');
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import type { EditorAction, EditorState } from '../../apps/notation-ui/contracts';
import { EditorService } from '../../apps/notation-ui/host/editor-service';
import { FileStore } from '../../apps/notation-ui/host/file-store';
import { createUiServer } from '../../apps/notation-ui/host/server';
import { ScoreViewRegistry, type ScoreViewProvider } from '../../apps/notation-ui/browser/score-views';
import { shiftPitch } from '../../apps/notation-ui/plugins/standard-notation/input';
import { createKernelClient } from '../../apps/notation-ui/browser/kernel-client';

const addonPath = resolve(process.env.BG_NATIVE_ADDON ?? 'target/integrated-v2/brilliant_kernel_node.node');
const evidenceRoot = resolve('.local-evidence/notation-ui/tests'); mkdirSync(evidenceRoot, { recursive: true });
const directory = () => mkdtempSync(join(evidenceRoot, 'run-'));
function setup() { const files = new FileStore(directory()); return { files, service: new EditorService(files, addonPath) }; }
function act(service: EditorService, action: EditorAction) {
  const state = service.read(); return service.execute({ sessionId: state.sessionId, version: state.version, action });
}
const pitch = (step: 'C' | 'D' | 'E' | 'G', octave = 4) => ({ step, octave, alter: 0 as const });

test('real Native: atomic rest/note edits, history, deletion, save and fresh session', () => {
  const { files, service } = setup();
  const initial = service.read(); assert.equal(initial.needsSave, true); assert.equal(initial.canUndo, false);
  const eventId = initial.events[0]!.id;
  act(service, { kind: 'pitch', eventId, pitch: pitch('C') });
  assert.equal(service.read().version, 1);
  act(service, { kind: 'pitch', eventId, pitch: pitch('D') });
  assert.deepEqual(act(service, { kind: 'undo' }).events[0]!.pitch, pitch('C'));
  assert.deepEqual(act(service, { kind: 'redo' }).events[0]!.pitch, pitch('D'));
  act(service, { kind: 'rest', eventId });
  assert.equal(service.read().events[0]!.pitch, null);
  assert.deepEqual(act(service, { kind: 'undo' }).events[0]!.pitch, pitch('D'));
  const saved = act(service, { kind: 'save', name: '旋律.score.json' });
  assert.equal(saved.needsSave, false);
  assert.equal(act(service, { kind: 'save' }).needsSave, false, 'repeat save and no-op checkpoint succeed');
  const fresh = new EditorService(files, addonPath);
  const reopened = act(fresh, { kind: 'open', name: '旋律.score.json' });
  assert.deepEqual(reopened.events, saved.events);
  assert.equal(reopened.canUndo, false); assert.equal(reopened.needsSave, false);
  act(fresh, { kind: 'pitch', eventId, pitch: pitch('E') });
  assert.deepEqual(act(fresh, { kind: 'undo' }).events, saved.events);
  assert.equal(fresh.read().needsSave, false);
  const evidence = service.evidence();
  assert.equal(evidence.backend, 'native-v2'); assert.equal(evidence.sessions, 1);
  for (const operation of ['submit', 'read', 'undo', 'redo', 'markPersisted']) assert.ok(evidence.operations[operation]! > 0);
  writeFileSync(join(files.directory, 'evidence.json'), JSON.stringify({ saved, evidence, fresh: fresh.evidence() }, null, 2));
});

test('invalid pitch, stale version and stale session preserve all visible state and redo', () => {
  const { service } = setup(), eventId = service.read().events[0]!.id;
  act(service, { kind: 'pitch', eventId, pitch: pitch('C') });
  act(service, { kind: 'undo' });
  const before = service.read();
  for (const action of [
    { kind: 'pitch', eventId, pitch: { step: 'X', octave: 4, alter: 0 } },
    { kind: 'pitch', eventId, pitch: pitch('C', 9) },
    { kind: 'rest', eventId: 'missing' },
  ]) {
    assert.throws(() => service.execute({ sessionId: before.sessionId, version: before.version, action }));
    assert.deepEqual(service.read(), before);
  }
  assert.throws(() => service.execute({ sessionId: before.sessionId, version: 0, action: { kind: 'redo' } }));
  assert.deepEqual(service.read(), before);
  act(service, { kind: 'new' }); const after = service.read();
  assert.throws(() => service.execute({ sessionId: before.sessionId, version: 0, action: { kind: 'undo' } }));
  assert.deepEqual(service.read(), after);
});

test('blank first save works; file failures do not clear dirty state or overwrite another file', () => {
  const { files, service } = setup();
  assert.equal(act(service, { kind: 'save', name: '空白.score.json' }).needsSave, false);
  const eventId = service.read().events[0]!.id;
  act(service, { kind: 'pitch', eventId, pitch: pitch('G') });
  const before = service.read();
  writeFileSync(join(files.directory, '占用.score.json'), 'must remain');
  assert.throws(() => act(service, { kind: 'save', name: '占用.score.json' }));
  assert.throws(() => act(service, { kind: 'save', name: '../escape.score.json' }));
  writeFileSync(join(files.directory, '空白.score.json'), 'externally changed');
  assert.throws(() => act(service, { kind: 'save' }));
  assert.deepEqual(service.read(), before);
  assert.equal(readFileSync(join(files.directory, '空白.score.json'), 'utf8'), 'externally changed');
  assert.equal(readFileSync(join(files.directory, '占用.score.json'), 'utf8'), 'must remain');
  assert.equal(readdirSync(files.directory).some(name => name.startsWith('.saving-')), false);
  assert.equal(act(service, { kind: 'save', name: '另存.score.json' }).needsSave, false);
});

test('malformed and unsupported documents never replace the working session', () => {
  const { files, service } = setup();
  act(service, { kind: 'save', name: '基础.score.json' });
  const document = JSON.parse(files.read('基础.score.json')) as { extensions: unknown[] };
  document.extensions.push({ namespace: 'other.guitar', owner: { kind: 'score' }, schemaVersion: 1, payload: { retained: true } });
  writeFileSync(join(files.directory, '吉他.score.json'), JSON.stringify(document));
  writeFileSync(join(files.directory, '损坏.score.json'), '{');
  const before = service.read();
  for (const name of ['吉他.score.json', '损坏.score.json']) {
    const bytes = files.read(name);
    assert.throws(() => act(service, { kind: 'open', name }));
    assert.deepEqual(service.read(), before); assert.equal(files.read(name), bytes);
  }
});

test('view registration rejects duplicates and incompatible contexts; input crosses octave boundaries', () => {
  const { service } = setup();
  const registry = new ScoreViewRegistry();
  const provider: ScoreViewProvider = { id: 'builtin.test-view', name: 'Test', supports: state => state.notation === 'standard-quarter-v1',
    create: async () => ({ render() {}, async key() {}, destroy() {} }) };
  registry.register(provider); assert.throws(() => registry.register(provider));
  assert.equal(registry.available(service.read()).length, 1);
  assert.throws(() => registry.get('unknown', service.read()));
  assert.throws(() => registry.get(provider.id, { ...service.read(), notation: 'unsupported' as EditorState['notation'] }));
  assert.deepEqual(shiftPitch({ step: 'B', octave: 4, alter: 0 }, 1), pitch('C', 5));
  assert.equal(shiftPitch(pitch('C', 3), -1), null);
  assert.equal(shiftPitch({ step: 'B', octave: 6, alter: 0 }, 1), null);
});

test('plugin imports and browser bundle exclude kernel internals and host code', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const pluginFiles = walk('apps/notation-ui/plugins').filter(path => path.endsWith('.ts'));
  for (const path of pluginFiles) {
    const text = readFileSync(path, 'utf8');
    for (const imported of text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
      assert.doesNotMatch(imported[1]!, /core-kernel|\/host\/|node:|kernel-client/);
    }
  }
  for (const path of walk('apps/notation-ui/host').filter(path => path.endsWith('.ts'))) {
    if (path.endsWith('native-backend.ts')) continue;
    const imports = [...readFileSync(path, 'utf8').matchAll(/from\s*['"]([^'"]*core-kernel[^'"]*)['"]/g)].map(match => match[1]!);
    assert.ok(imports.every(value => value.endsWith('core-kernel/index') || value.endsWith('core-kernel/module-sdk/index')), path);
  }
  const inputs = Object.keys((JSON.parse(readFileSync('dist-ui/browser-meta.json', 'utf8')) as { inputs: object }).inputs);
  assert.ok(inputs.some(path => path.includes('vexflow')));
  assert.ok(inputs.every(path => !/core-kernel|\/host\/|node:/.test(path)), 'browser contains only UI, plugins, and renderer');
});

test('HTTP boundary rejects cross-origin writes and serves only allowed assets', async t => {
  const { server } = createUiServer({ addonPath, dataDirectory: directory(), assetsDirectory: resolve('dist-ui/public') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url + '/api/state', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await fetch(url + '/api/action', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/package.json')).status, 404);
  const state = await (await fetch(url + '/api/state')).json() as EditorState;
  const result = await fetch(url + '/api/action', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Brilliant-Client': 'notation-ui-v1', Origin: url,
  }, body: JSON.stringify({ sessionId: state.sessionId, version: state.version,
    action: { kind: 'pitch', eventId: state.events[0]!.id, pitch: pitch('C') } }) });
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json() as EditorState).events[0]!.pitch, pitch('C'));
});

test('the actual browser client transports versioned edit intents to the Native host', async t => {
  const { server } = createUiServer({ addonPath, dataDirectory: directory(), assetsDirectory: resolve('dist-ui/public') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => originalFetch(new URL(String(input), `http://127.0.0.1:${address.port}`), options);
  t.after(() => { globalThis.fetch = originalFetch; server.closeAllConnections(); server.close(); });
  const client = createKernelClient();
  const state = await client.read();
  const edited = await client.execute({ sessionId: state.sessionId, version: state.version,
    action: { kind: 'pitch', eventId: state.events[0]!.id, pitch: pitch('C') } });
  assert.deepEqual(edited.events[0]!.pitch, pitch('C'));
  assert.equal(edited.version, 1); assert.deepEqual(await client.files(), []);
});

test('actual host process restart reopens the physical file and allows further editing', { timeout: 20000 }, async () => {
  const data = directory();
  async function start(): Promise<{ child: ChildProcess; url: string }> {
    const child = spawn(process.execPath, ['dist-ui/server.cjs', '--port', '0', '--addon', addonPath, '--data', data], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolveStarted, reject) => {
      let text = '', errors = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('host startup timed out: ' + errors)); }, 8000);
      child.stderr!.on('data', bytes => { errors += String(bytes); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`host exited ${code}: ${errors}`)); });
      child.stdout!.on('data', bytes => {
        text += String(bytes);
        if (text.includes('\n')) { clearTimeout(timer); resolveStarted({ child, url: (JSON.parse(text.split('\n')[0]!) as { url: string }).url }); }
      });
    });
  }
  const stop = async (child: ChildProcess) => { const exited = once(child, 'exit'); child.kill(); await exited; };
  const post = async (url: string, action: EditorAction) => {
    const state = await (await fetch(url + '/api/state')).json() as EditorState;
    const response = await fetch(url + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brilliant-Client': 'notation-ui-v1' },
      body: JSON.stringify({ sessionId: state.sessionId, version: state.version, action }) });
    assert.equal(response.status, 200, await response.clone().text()); return await response.json() as EditorState;
  };
  const first = await start(); let saved: EditorState;
  try {
    const state = await (await fetch(first.url + '/api/state')).json() as EditorState;
    await post(first.url, { kind: 'pitch', eventId: state.events[0]!.id, pitch: pitch('G', 5) });
    saved = await post(first.url, { kind: 'save', name: '重启验证.score.json' });
  } finally { await stop(first.child); }
  const second = await start();
  try {
    const reopened = await post(second.url, { kind: 'open', name: '重启验证.score.json' });
    assert.notEqual(reopened.sessionId, saved.sessionId); assert.deepEqual(reopened.events, saved.events);
    await post(second.url, { kind: 'pitch', eventId: reopened.events[0]!.id, pitch: pitch('E') });
    assert.deepEqual((await post(second.url, { kind: 'undo' })).events, saved.events);
    writeFileSync(join(data, 'restart-evidence.json'), JSON.stringify({ before: saved, after: reopened }, null, 2));
  } finally { await stop(second.child); }
});
