import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { DocumentReplacementPrecondition } from "../src/contracts/document-replacement.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import type { ReadonlyDocumentInitialization } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { readyPlaybackSource } from "./playback-fixture.ts";
import { isDocumentReplacementPrecondition } from "../src/contracts/document-replacement.ts";
const score = (id = "one", version = 0, title = "未命名乐谱"): ScoreSessionRead => ({
  documentId: id, documentVersion: version, title, measureCount: 1, undoDepth: 0, redoDepth: 0,
  notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [],
    measures: [{ id: "measure", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, events: [], ruleWarnings: [] }] },
  playbackSource: readyPlaybackSource(id, version),
});
function fixture(initial: ScoreSessionRead | null = score(), initialization: ReadonlyDocumentInitialization = "ensure-document") {
  let current = initial, failure: Error | null = null, opened: ScoreSessionRead | null = score("opened", 2, "作品 A");
  const calls: string[] = [];
  const client = { async read() { calls.push("read"); if (failure) throw failure; return current; },
    async create(input: unknown, id: string, expected: string | null) { calls.push("create"); assert.deepEqual(input,{title:"",measureCount:1}); assert.equal(expected, current?.documentId ?? null); current = score(id); return current; },
    async createGuarded(input: unknown, id: string, expected: DocumentReplacementPrecondition) {
      assert.deepEqual(expected, current ? {kind:"document", documentId:current.documentId, documentVersion:current.documentVersion} : {kind:"empty"});
      return client.create(input, id, current?.documentId ?? null);
    },
    async openNativeDocumentGuarded(expected: DocumentReplacementPrecondition) {
      assert.deepEqual(expected, current ? {kind:"document", documentId:current.documentId, documentVersion:current.documentVersion} : {kind:"empty"});
      calls.push("open"); if (!opened) return null; current = opened; return { session: opened, name: "piece.bgp.json", savedVersion: opened.documentVersion }; },
    usesNativeFiles() { return true; } };
  const source = createReadonlyScoreDocumentSession({ client, createId: () => "request", initialization });
  return { source, client, calls, setCurrent(value: ScoreSessionRead | null) { current = value; }, fail(error: Error | null) { failure = error; }, cancelOpen() { opened = null; } };
}
test("readonly session deduplicates initialization and only creates an empty real score when the host has none", async () => {
  const f = fixture(null); const [a,b] = await Promise.all([f.source.read(), f.source.read()]);
  assert.equal(a,b); assert.deepEqual(f.calls,["read","create"]); assert.equal(a?.notation.kind,"staff");
  assert.equal(f.source.snapshot().dirty,false); assert.equal(f.source.snapshot().saved,false);
  await f.source.read(); assert.equal(f.calls.length,2); f.source.dispose();
});
test("native open cancellation preserves accepted identity, and saved works can be switched without an editable UI copy", async () => {
  const f=fixture(); await f.source.read(); f.cancelOpen(); const before=f.source.snapshot();
  assert.deepEqual(await f.source.open(),{ok:true,changed:false,cancelled:true}); assert.deepEqual(f.source.snapshot(),before);
  const fresh=fixture(); await fresh.source.read(); await fresh.source.open();
  assert.equal(fresh.source.snapshot().title,"作品 A"); assert.equal(fresh.source.snapshot().saved,true); assert.equal(fresh.source.canReplace(),true);
  assert.equal((await fresh.source.newScore()).ok,true); assert.equal(fresh.source.snapshot().saved,false);
  f.source.dispose(); fresh.source.dispose();
});
test("recovered unsaved work and invalid new inputs cannot reach replacement IPC", async () => {
  const f=fixture(score("recover",3,"恢复作品")); await f.source.read();
  assert.equal((await f.source.open()).ok,false); assert.equal((await f.source.newScore()).ok,false); assert.deepEqual(f.calls,["read"]);
  const clean=fixture(); await clean.source.read(); assert.equal((await clean.source.newScore({title:"bad",measureCount:0})).ok,false);
  assert.equal((await clean.source.newScore({title:"bad",measureCount:1,discard:true})).ok,false); assert.deepEqual(clean.calls,["read"]);
  f.source.dispose(); clean.source.dispose();
});
test("read failures preserve accepted identity, block replacements and allow a real retry", async () => {
  const f=fixture(); await f.source.read(); let notices=0; f.source.subscribe(()=>notices++);
  f.fail(new Error("host unavailable")); assert.equal((await f.source.reload()).ok,false); assert.equal(f.source.snapshot().documentId,"one");
  assert.equal(f.source.canReplace(),false); await assert.rejects(f.source.read(),/host unavailable/);
  f.fail(null); f.setCurrent(score("two",0,"另一份作品")); assert.equal((await f.source.reload()).ok,true);
  assert.equal((await f.source.read())?.documentId,"two"); assert.equal(notices,2); assert.equal(f.calls.filter(x=>x==="read").length,3); f.source.dispose();
});
test("older host results cannot replace the last accepted version or file checkpoint", async () => {
  const f=fixture(); await f.source.read(); await f.source.open(); f.setCurrent(score("opened",1,"旧结果"));
  assert.equal((await f.source.reload()).ok,false); assert.equal(f.source.snapshot().documentVersion,2); assert.equal(f.source.snapshot().saved,true); f.source.dispose();
});
test("pending operations reject overlap and dispose ignores late reads and observer delivery", async () => {
  let resolve!: (value:ScoreSessionRead|null)=>void; const pending=new Promise<ScoreSessionRead|null>(yes=>resolve=yes);
  const f=fixture(); f.client.read=()=>pending;
  let notifications=0; f.source.subscribeState(()=>notifications++); const result=f.source.read();
  assert.equal((await f.source.open()).ok,false); f.source.dispose(); const stopped=notifications;
  resolve(score()); await assert.rejects(result,/已释放/); assert.equal(notifications,stopped);
  assert.equal(f.source.snapshot().status,"disposed"); assert.equal((await f.source.reload()).ok,false);
});
test("the actual Tauri bridge and client preserve workspace identity and native command envelopes", async () => {
  const calls: {name:string;args:Record<string,unknown>}[]=[]; let current:ScoreSessionRead|null=null;
  const bridge=new TauriWorkbenchHostBridge(async <T>(name:string,args?:Record<string,unknown>):Promise<T> => {
    calls.push({name,args:args??{}}); if(name==="workbench_read_v1") return current as T;
    if(name==="workbench_create_v1") { current=score(); return current as T; }
    if(name==="workbench_open_file_guarded_v1") { current=score("file",0,"文件作品"); return {session:current,name:"piece.bgp.json",savedVersion:0} as T; }
    throw new Error("Unexpected IPC: "+name);
  });
  const source=createReadonlyScoreDocumentSession({client:new WorkbenchClient(bridge)});
  await source.read(); await source.open();
  assert.deepEqual(calls.map(x=>x.name),["workbench_read_v1","workbench_create_v1","workbench_open_file_guarded_v1"]);
  const [read,create,open]=calls; assert.ok(read && create && open);
  assert.equal((create.args.request as {workspaceId:string}).workspaceId,read.args.workspaceId);
  assert.equal(open.args.workspaceId,read.args.workspaceId); assert.equal(source.snapshot().documentId,"file"); source.dispose();
});

test("a one-bar version-zero recovery containing music or an unsupported projection is protected", async () => {
  const note=score(); const notation=note.notation;
  assert.equal(notation.kind,"staff"); if(notation.kind!=="staff") throw new Error("fixture");
  const recovered={...note,notation:{...notation,measures:notation.measures.map(measure=>({...measure,events:[{id:"rest",duration:{base:4,dots:0},content:{kind:"rest"}}]}))}} as ScoreSessionRead;
  const f=fixture(recovered); await f.source.read(); assert.equal(f.source.canReplace(),false); assert.equal((await f.source.open()).ok,false); assert.deepEqual(f.calls,["read"]); f.source.dispose();
});

test("readonly document status projects tempo from the accepted atomic result and preserves it on failure", async () => {
  const f=fixture();assert.equal(f.source.snapshot().tempoBpm,null);await f.source.read();assert.equal(f.source.snapshot().tempoBpm,96);
  const next=score("metadata",1,"速度作品");
  const playback=readyPlaybackSource(next.documentId,next.documentVersion);
  if(playback.kind!=="ready")throw new Error("fixture");
  if(next.notation.kind!=="staff")throw new Error("fixture");
  // Metadata, drawing and playback must represent the same atomic host snapshot.
  f.setCurrent({...next,notation:{...next.notation,tempoBpm:120},metadata:{title:next.title,authors:[],tempoBpm:120},playbackSource:{...playback,bpm:120}});
  assert.equal((await f.source.reload()).ok,true);assert.equal(f.source.snapshot().tempoBpm,120);
  f.fail(new Error("读取失败"));assert.equal((await f.source.reload()).ok,false);assert.equal(f.source.snapshot().tempoBpm,120);
  f.fail(null);f.setCurrent({...score("unsupported"),notation:{kind:"unsupported",message:"暂不支持"}});
  assert.equal((await f.source.reload()).ok,true);assert.equal(f.source.snapshot().tempoBpm,null);
  f.source.dispose();assert.equal(f.source.snapshot().tempoBpm,null);
});

test("startup preparation deduplicates an empty host read without creating a document", async () => {
  const f = fixture(null, "read-existing");
  try {
    assert.deepEqual(await Promise.all([f.source.read(), f.source.read()]), [null, null]);
    assert.deepEqual(f.calls, ["read"]);
    assert.equal(f.source.snapshot().status, "empty");
    assert.equal(f.source.snapshot().busy, false);
    assert.equal(f.source.canReplace(), true);
    assert.equal(await f.source.read(), null);
    assert.deepEqual(f.calls, ["read"], "accepted absence is cached, not an implicit new-score request");
  } finally { f.source.dispose(); }
});

test("prepared empty startup can cancel or open directly without an intermediate empty score", async () => {
  const cancelled = fixture(null, "read-existing");
  try {
    await cancelled.source.read(); cancelled.cancelOpen();
    const before = cancelled.source.snapshot();
    assert.deepEqual(await cancelled.source.open(), { ok: true, changed: false, cancelled: true });
    assert.deepEqual(cancelled.source.snapshot(), before);
    assert.deepEqual(cancelled.calls, ["read", "open"]);
  } finally { cancelled.source.dispose(); }
  const opened = fixture(null, "read-existing");
  try {
    await opened.source.read();
    assert.deepEqual(await opened.source.open(), { ok: true, changed: true });
    assert.deepEqual(opened.calls, ["read", "open"]);
    assert.equal(opened.source.snapshot().documentId, "opened");
    assert.equal(opened.source.snapshot().saved, true);
  } finally { opened.source.dispose(); }
});

test("prepared startup creates exactly one real empty document only on explicit newScore", async () => {
  const f = fixture(null, "read-existing");
  try {
    await f.source.read(); assert.deepEqual(f.calls, ["read"]);
    assert.deepEqual(await f.source.newScore(), { ok: true, changed: true });
    assert.deepEqual(f.calls, ["read", "create"]);
    assert.equal(f.source.snapshot().status, "ready");
    assert.equal(f.source.snapshot().saved, false);
  } finally { f.source.dispose(); }
});

test("startup preparation reuses recovered content and retains original unsaved guards", async () => {
  const recovered = score("recovered", 3, "恢复作品"), f = fixture(recovered, "read-existing");
  try {
    assert.equal(await f.source.read(), recovered);
    assert.equal(f.source.snapshot().dirty, true);
    const opened = await f.source.open(), created = await f.source.newScore();
    assert.equal(opened.ok, false); if (!opened.ok) assert.equal(opened.code, "document.unsaved");
    assert.equal(created.ok, false); if (!created.ok) assert.equal(created.code, "document.unsaved");
    assert.deepEqual(f.calls, ["read"]);
    assert.equal(f.source.snapshot().documentId, "recovered");
  } finally { f.source.dispose(); }
});

test("failed startup preparation retries the same read-only policy without auto-creation", async () => {
  const f = fixture(null, "read-existing");
  try {
    f.fail(new Error("recovery unavailable"));
    await assert.rejects(f.source.read(), /recovery unavailable/);
    assert.equal(f.source.snapshot().status, "error");
    assert.equal(f.source.canReplace(), false);
    const opened = await f.source.open();
    assert.equal(opened.ok, false); if (!opened.ok) assert.equal(opened.code, "document.not-ready");
    f.fail(null);
    assert.deepEqual(await f.source.reload(), { ok: true, changed: true });
    assert.equal(await f.source.read(), null);
    assert.deepEqual(f.calls, ["read", "read"]);
    assert.equal(f.source.snapshot().status, "empty");
    assert.equal(f.source.canReplace(), true);
  } finally { f.source.dispose(); }
  const synchronous = fixture(null, "read-existing");
  try {
    synchronous.client.read = () => { throw new Error("synchronous host failure"); };
    await assert.rejects(synchronous.source.read(), /synchronous host failure/);
    assert.equal(synchronous.source.snapshot().busy, false);
    synchronous.client.read = async () => null;
    assert.equal((await synchronous.source.reload()).ok, true);
    assert.equal(synchronous.source.snapshot().status, "empty");
    assert.deepEqual(synchronous.calls, []);
  } finally { synchronous.source.dispose(); }
});

test("startup preparation preserves the actual client and Tauri read-to-open envelope", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args: args ?? {} });
    if (name === "workbench_read_v1") return null as T;
    if (name === "workbench_open_file_guarded_v1") return { session: score("selected-file"), name: "selected.bgp.json", savedVersion: 0 } as T;
    throw new Error("Unexpected startup IPC: " + name);
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge), initialization: "read-existing" });
  try {
    assert.equal(await source.read(), null);
    assert.equal((await source.open()).ok, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_open_file_guarded_v1"]);
    assert.equal(calls[0]?.args.workspaceId, calls[1]?.args.workspaceId);
    assert.equal(source.snapshot().documentId, "selected-file");
  } finally { source.dispose(); }
});

test("pending startup preparation rejects competing intents and ignores results after disposal", async () => {
  let finish!: (value: ScoreSessionRead | null) => void;
  const pending = new Promise<ScoreSessionRead | null>(resolve => { finish = resolve; });
  const f = fixture(null, "read-existing"); f.client.read = () => pending;
  let notices = 0; f.source.subscribeState(() => notices++);
  const reading = f.source.read();
  for (const result of [await f.source.open(), await f.source.newScore()]) {
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "document.busy");
  }
  f.source.dispose(); const stopped = notices;
  finish(null); await assert.rejects(reading, /已释放/);
  assert.equal(notices, stopped);
  assert.equal(f.source.snapshot().status, "disposed");
  assert.deepEqual(f.calls, []);
});

test("unknown startup initialization is refused before any host operation", () => {
  const f = fixture(null);
  try {
    assert.throws(() => Reflect.apply(createReadonlyScoreDocumentSession, undefined, [{ client: f.client, initialization: "unknown" }]), /initialization/);
    assert.deepEqual(f.calls, []);
  } finally { f.source.dispose(); }
});

test("default initialization cannot issue a late create after disposal while its read was pending", async () => {
  let finish!: (value: ScoreSessionRead | null) => void;
  const pending = new Promise<ScoreSessionRead | null>(resolve => { finish = resolve; });
  const f = fixture(null); f.client.read = () => pending;
  const reading = f.source.read();
  f.source.dispose(); finish(null);
  await assert.rejects(reading, /已释放/);
  assert.deepEqual(f.calls, [], "a create that has not been issued must be stopped after disposal");
  assert.equal(f.source.snapshot().status, "disposed");
});

test("explicit startup new uses a mandatory empty precondition through the actual client and bridge", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({name, args: args ?? {}});
    if (name === "workbench_read_v1") return null as T;
    if (name === "workbench_create_guarded_v1") return score("new") as T;
    throw new Error("Unexpected IPC: " + name);
  });
  const source = createReadonlyScoreDocumentSession({client: new WorkbenchClient(bridge), initialization: "read-existing", createId: () => "new-request"});
  try {
    await source.read(); assert.equal((await source.newScore()).ok, true);
    assert.deepEqual(calls, [
      {name:"workbench_read_v1", args:{workspaceId: calls[0]?.args.workspaceId}},
      {name:"workbench_create_guarded_v1", args:{request:{workspaceId:calls[0]?.args.workspaceId, input:{title:"",measureCount:1}, requestId:"new-request", expected:{kind:"empty"}}}},
    ]);
    assert.equal(source.snapshot().documentId, "new");
  } finally { source.dispose(); }
});

test("guarded open captures the accepted version and preserves its checkpoint on host conflict until reload", async () => {
  let current = score(); let opening = 0;
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const expected: unknown[] = [], calls: string[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push(name);
    if (name === "workbench_read_v1") return current as T;
    if (name === "workbench_open_file_guarded_v1") {
      expected.push(args?.expected);
      if (++opening === 1) {current=score("saved",1); return {session:current,name:"saved",savedVersion:1} as T;}
      await waiting;
      throw {status:409,message:"当前作品已改变，请重新读取后重试",issue:{code:"document.stale",message:"当前作品已改变，请重新读取后重试",severity:"error",source:"host",target:{scope:"workbench"},retryable:true}};
    }
    throw new Error("Unsafe fallback: " + name);
  });
  const source = createReadonlyScoreDocumentSession({client:new WorkbenchClient(bridge)});
  try {
    await source.read(); assert.equal((await source.open()).ok,true);
    const before = source.snapshot(), pending = source.open();
    current = score("saved",2,"宿主期间修改");
    assert.equal((await source.newScore()).ok,false);
    finish(); const result = await pending;
    assert.equal(result.ok,false); if (!result.ok) assert.match(result.message,/已改变/);
    assert.equal(source.snapshot().documentId,before.documentId);
    assert.equal(source.snapshot().documentVersion,1); assert.equal(source.snapshot().saved,true);
    assert.equal(source.canReplace(),false);
    assert.deepEqual(expected,[{kind:"document",documentId:"one",documentVersion:0},{kind:"document",documentId:"saved",documentVersion:1}]);
    assert.deepEqual(calls,["workbench_read_v1","workbench_open_file_guarded_v1","workbench_open_file_guarded_v1"]);
    assert.equal((await source.reload()).ok,true); assert.equal(source.snapshot().documentVersion,2);
    assert.equal(source.snapshot().saved,false); assert.equal(source.snapshot().dirty,true);
  } finally { finish(); source.dispose(); }
});

test("unknown guarded desktop commands fail without attempting legacy replacement", async () => {
  const calls: string[]=[];
  const bridge=new TauriWorkbenchHostBridge(async <T>(name:string):Promise<T>=>{
    calls.push(name); if(name==="workbench_read_v1")return score() as T;
    throw "Command not found";
  });
  const source=createReadonlyScoreDocumentSession({client:new WorkbenchClient(bridge)});
  try {
    await source.read(); assert.equal((await source.open()).ok,false);
    assert.equal(source.snapshot().documentId,"one"); await source.reload();
    assert.equal((await source.newScore()).ok,false);
    assert.deepEqual(calls,["workbench_read_v1","workbench_open_file_guarded_v1","workbench_read_v1","workbench_create_guarded_v1"]);
  } finally {source.dispose();}
});

test("missing guarded bridge ports and malformed preconditions fail before any legacy request", async () => {
  const bridge=new TauriWorkbenchHostBridge(async <T>():Promise<T>=>{throw new Error("No request expected");});
  Object.defineProperties(bridge,{createGuarded:{value:undefined},openNativeDocumentGuarded:{value:undefined}});
  const client=new WorkbenchClient(bridge), input={title:"",measureCount:1};
  await assert.rejects(client.createGuarded(input,"id",{kind:"empty"}),/不支持受保护/);
  await assert.rejects(client.openNativeDocumentGuarded({kind:"empty"}),/不支持受保护/);
  for(const invalid of [null,{},[],{kind:"empty",documentId:"hidden"},{kind:"document",documentId:"x",documentVersion:-1},
    {kind:"document",documentId:"x",documentVersion:Number.MAX_SAFE_INTEGER+1},{kind:"document",documentId:"",documentVersion:0},
    {kind:"document",documentId:"x".repeat(257),documentVersion:0},{kind:"document",documentId:"x",documentVersion:1,extra:true}]) {
    assert.equal(isDocumentReplacementPrecondition(invalid),false);
    await assert.rejects(client.openNativeDocumentGuarded(invalid as DocumentReplacementPrecondition),/预条件无效/);
  }
  assert.equal(isDocumentReplacementPrecondition({kind:"document",documentId:"x",documentVersion:0}),true);
});

test("an accepted guarded reopen may restore an earlier disk revision of the same ID while reload cannot", async () => {
  let current=score(), opens=0;
  const expected: unknown[]=[];
  const bridge=new TauriWorkbenchHostBridge(async <T>(name:string,args?:Record<string,unknown>):Promise<T>=>{
    if(name==="workbench_read_v1")return current as T;
    if(name==="workbench_open_file_guarded_v1") {
      expected.push(args?.expected); current=score("same-file",opens++===0?2:0,"磁盘作品");
      return {session:current,name:"same-file",savedVersion:current.documentVersion} as T;
    }
    throw new Error("Unexpected IPC: "+name);
  });
  const source=createReadonlyScoreDocumentSession({client:new WorkbenchClient(bridge)});
  try {
    await source.read(); assert.equal((await source.open()).ok,true);
    assert.equal(source.snapshot().documentVersion,2);
    assert.equal((await source.open()).ok,true);
    assert.equal(source.snapshot().documentVersion,0); assert.equal(source.snapshot().saved,true);
    assert.deepEqual(expected[1],{kind:"document",documentId:"same-file",documentVersion:2});
    current=score("same-file",1); assert.equal((await source.reload()).ok,true);
    current=score("same-file",0); assert.equal((await source.reload()).ok,false);
    assert.equal(source.snapshot().documentVersion,1);
  } finally {source.dispose();}
});

test("synchronous state-observer disposal prevents not-yet-issued document and registration requests", async () => {
  for (const action of ["new", "open", "recent", "reload", "register"] as const) {
    const calls: string[] = [];
    const file = { session: score("opened"), name: "A", savedVersion: 0 };
    const client = {
      async read() { calls.push("read"); return score(); },
      async create() { calls.push("create"); return score(); },
      async createGuarded() { calls.push("createGuarded"); return score(); },
      async openNativeDocumentGuarded() { calls.push("open"); return file; },
      async openRecentDocumentGuarded() { calls.push("recent"); return file; },
      async recordCurrentFile() { calls.push("register"); return { apiVersion: 1 as const, entries: [] }; },
      usesNativeFiles: () => true,
    };
    const source = createReadonlyScoreDocumentSession({ client, initialization: "read-existing" });
    await source.read(); source.subscribeState(() => { if (source.snapshot().busy) source.dispose(); });
    if (action === "register") await assert.rejects(source.recent.retryRegistration(), /已释放/);
    else {
      const result = await (action === "new" ? source.newScore() : action === "open" ? source.open()
        : action === "recent" ? source.openRecent("00000000-0000-4000-8000-000000000001") : source.reload());
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "document.disposed");
    }
    assert.deepEqual(calls, ["read"], action); source.dispose();
  }
});
