import assert from "node:assert/strict";
import test from "node:test";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { isRecentDocumentsSnapshotV1 } from "../src/contracts/recent-documents.ts";
import type { WorkbenchIssue } from "../src/contracts/workbench-issue.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { NativeFileResult } from "../src/services/workbench-host-bridge.ts";
import { readyPlaybackSource } from "./playback-fixture.ts";
const id="00000000-0000-4000-8000-000000000001";
const entry={id,name:"作品A",location:"C:\\scores\\A.json",lastOpenedAt:1};
const catalog={apiVersion:1 as const,entries:[entry]};
const score=(documentId="one",documentVersion=0):ScoreSessionRead=>({documentId,documentVersion,title:documentId==="one"?"未命名乐谱":"作品A",measureCount:1,undoDepth:0,redoDepth:0,
  notation:{kind:"staff",partId:"part",staffId:"staff",clef:"treble",tempoBpm:96,keySignatureChanges:[],measures:[{id:"measure",voiceId:"voice",meter:{numerator:4,denominator:4},events:[],ruleWarnings:[]}]},
  playbackSource:readyPlaybackSource(documentId,documentVersion)});
const warning=(code="file.recent-unavailable"):WorkbenchIssue=>({code,message:"作品已打开，最近记录未能更新",severity:"warning",source:"file",target:{scope:"component",componentId:"navigation.file"},retryable:true});
function fixture(handler:(name:string,args:Record<string,unknown>)=>unknown|Promise<unknown>) {
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const bridge=new TauriWorkbenchHostBridge(async<T>(name:string,args?:Record<string,unknown>):Promise<T>=>{calls.push({name,args:args??{}});return await handler(name,args??{}) as T;});
  const client=new WorkbenchClient(bridge),source=createReadonlyScoreDocumentSession({client,initialization:"read-existing"});
  return {calls,bridge,client,source};
}

test("recent list/remove/open/retry use real client envelopes, one workspace and no frontend path submission",async()=>{
  const f=fixture(name=>{
    if(name==="workbench_read_v1")return null;
    if(name==="workbench_open_recent_document_guarded_v1")return {session:score("opened",3),name:"A",savedVersion:3,warnings:[warning()]};
    if(["workbench_list_recent_documents_v1","workbench_remove_recent_document_v1","workbench_record_current_file_v1"].includes(name))return catalog;
    throw new Error("Unexpected IPC "+name);
  });
  try {
    await f.source.read();assert.deepEqual(await f.source.recent.list(),catalog);assert.deepEqual(await f.source.recent.remove(id),catalog);
    assert.equal((await f.source.openRecent(id)).ok,true);assert.equal(f.source.snapshot().documentId,"opened");assert.equal(f.source.snapshot().saved,true);
    assert.equal(f.source.snapshot().status,"ready");assert.equal(f.source.snapshot().message,null);assert.equal(f.source.snapshot().warnings.length,1);
    assert.deepEqual(await f.source.recent.retryRegistration(),catalog);assert.equal(f.source.snapshot().warnings.length,0);assert.equal(f.source.snapshot().documentVersion,3);
    const workspaceId=f.calls[0]?.args.workspaceId;
    assert.deepEqual(f.calls,[{name:"workbench_read_v1",args:{workspaceId}},
      {name:"workbench_list_recent_documents_v1",args:{}},{name:"workbench_remove_recent_document_v1",args:{recordId:id}},
      {name:"workbench_open_recent_document_guarded_v1",args:{workspaceId,recordId:id,expected:{kind:"empty"}}},
      {name:"workbench_record_current_file_v1",args:{workspaceId,expected:{kind:"document",documentId:"opened",documentVersion:3}}}]);
  } finally {f.source.dispose();}
});

test("ordinary guarded open warnings survive cancellation and failed metadata retry without failing the document",async()=>{
  let cancel=false,fail=true;
  const f=fixture(name=>{
    if(name==="workbench_read_v1")return score();
    if(name==="workbench_open_file_guarded_v1")return cancel?null:{session:score("saved",2),name:"A",savedVersion:2,warnings:[warning(),warning("file.recovery-unavailable")]};
    if(name==="workbench_record_current_file_v1"){if(fail)throw {message:"metadata unavailable",status:503};return catalog;}
    throw new Error("Unexpected IPC "+name);
  });
  try {
    await f.source.read();assert.equal((await f.source.open()).ok,true);const before=f.source.snapshot();
    assert.equal(before.warnings.length,2);cancel=true;assert.deepEqual(await f.source.open(),{ok:true,changed:false,cancelled:true});assert.deepEqual(f.source.snapshot(),before);
    await assert.rejects(f.source.recent.retryRegistration(),/metadata unavailable/);assert.deepEqual(f.source.snapshot(),before);
    fail=false;await f.source.recent.retryRegistration();assert.deepEqual(f.source.snapshot().warnings.map(x=>x.code),["file.recovery-unavailable"]);
    assert.equal(f.source.snapshot().documentId,"saved");assert.equal(f.source.snapshot().saved,true);assert.equal(f.source.snapshot().status,"ready");
  } finally {f.source.dispose();}
});

test("recent opens obey unsaved protection and host conflicts retain accepted document and warnings",async()=>{
  let current:ScoreSessionRead|null=null,opened=false;
  const f=fixture(name=>{
    if(name==="workbench_read_v1")return current;
    if(name==="workbench_open_recent_document_guarded_v1"){
      if(opened)throw {message:"当前作品已改变",status:409};opened=true;current=score("saved",1);return {session:current,name:"A",savedVersion:1,warnings:[warning()]};
    }
    throw new Error("Unexpected IPC "+name);
  });
  try {
    await f.source.read();assert.equal((await f.source.openRecent(id)).ok,true);const before=f.source.snapshot();
    current=score("saved",2);assert.equal((await f.source.openRecent(id)).ok,false);
    assert.equal(f.source.snapshot().documentId,before.documentId);assert.equal(f.source.snapshot().documentVersion,1);assert.deepEqual(f.source.snapshot().warnings,before.warnings);
    await f.source.reload();const count=f.calls.length;assert.equal((await f.source.openRecent(id)).ok,false);assert.equal(f.calls.length,count);
    assert.equal(f.source.snapshot().dirty,true);
  } finally {f.source.dispose();}
});

test("late recent catalog and open responses cannot notify or update disposed owners",async()=>{
  let finishList!:(value:unknown)=>void,finishOpen!:(value:unknown)=>void;
  const list=new Promise(resolve=>{finishList=resolve;}),open=new Promise(resolve=>{finishOpen=resolve;});
  const f=fixture(name=>{if(name==="workbench_read_v1")return null;if(name==="workbench_list_recent_documents_v1")return list;if(name==="workbench_open_recent_document_guarded_v1")return open;throw new Error(name);});
  await f.source.read();let notices=0;f.source.subscribeState(()=>notices++);
  const listing=f.source.recent.list(),opening=f.source.openRecent(id);f.source.dispose();const stopped=notices;
  const listRejected=assert.rejects(listing,/已释放/);finishList(catalog);finishOpen({session:score(),name:"A",savedVersion:0,warnings:[warning()]});
  await listRejected;const result=await opening;assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,"document.disposed");
  assert.equal(notices,stopped);assert.deepEqual(f.source.snapshot().warnings,[]);await assert.rejects(f.source.recent.remove(id),/已释放/);
});

test("a pending registration retry blocks document replacement and respects disposal",async()=>{
  let finish!:(value:unknown)=>void;const retry=new Promise(resolve=>{finish=resolve;});
  const f=fixture(name=>{if(name==="workbench_read_v1")return score();if(name==="workbench_record_current_file_v1")return retry;throw new Error(name);});
  await f.source.read();const registering=f.source.recent.retryRegistration();assert.equal(f.source.snapshot().busy,true);
  assert.equal((await f.source.openRecent(id)).ok,false);const rejected=assert.rejects(registering,/已释放/);f.source.dispose();finish(catalog);await rejected;
  assert.deepEqual(f.calls.map(x=>x.name),["workbench_read_v1","workbench_record_current_file_v1"]);
});

test("unsupported recent ports and invalid record IDs do not fall back to raw paths or legacy open",async()=>{
  const f=fixture(name=>{throw new Error("No IPC expected "+name);});
  Object.defineProperties(f.bridge,{listRecentDocuments:{value:undefined},removeRecentDocument:{value:undefined},openRecentDocumentGuarded:{value:undefined},recordCurrentFile:{value:undefined}});
  try {
    await assert.rejects(f.client.listRecentDocuments(),/不支持/);await assert.rejects(f.client.removeRecentDocument(id),/不支持/);
    await assert.rejects(f.client.openRecentDocumentGuarded(id,{kind:"empty"}),/不支持/);
    for(const invalid of ["C:\\score.json","../score.json","", "------------------------------------"]){
      await assert.rejects(f.client.removeRecentDocument(invalid),/ID无效/);await assert.rejects(f.client.openRecentDocumentGuarded(invalid,{kind:"empty"}),/参数无效/);
    }
    await assert.rejects(f.client.recordCurrentFile({kind:"empty"}),/作品身份/);assert.deepEqual(f.calls,[]);
  } finally {f.source.dispose();}
});

test("recent snapshots and file warnings are bounded and validated at the actual client boundary",async()=>{
  assert.equal(isRecentDocumentsSnapshotV1(catalog),true);
  for(const value of [null,{...catalog,apiVersion:2},{...catalog,extra:true},{...catalog,entries:[entry,{...entry,name:"duplicate"}]},
    {...catalog,entries:[{...entry,lastOpenedAt:Number.MAX_SAFE_INTEGER+1}]},{...catalog,entries:Array.from({length:21},(_,index)=>({...entry,id:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`}))}])assert.equal(isRecentDocumentsSnapshotV1(value),false);
  let value:unknown={...catalog,apiVersion:2};const f=fixture(name=>{if(name==="workbench_list_recent_documents_v1")return value;return value;});
  try {
    await assert.rejects(f.client.listRecentDocuments(),/结果无效/);
    for(const warnings of [[{...warning(),severity:"error"}],Array.from({length:5},()=>warning()),[{}]]) {
      value={session:score(),name:"A",savedVersion:0,warnings} as unknown as NativeFileResult;
      await assert.rejects(f.client.openRecentDocumentGuarded(id,{kind:"empty"}),/警告结果无效/);
    }
    value=null;await assert.rejects(f.client.openRecentDocumentGuarded(id,{kind:"empty"}),/打开结果无效/);
  } finally {f.source.dispose();}
});
