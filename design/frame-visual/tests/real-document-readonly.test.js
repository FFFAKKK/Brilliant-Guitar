import assert from "node:assert/strict";
import test from "node:test";
import { createReadonlyScoreDocumentSession } from "../src/vendor/desktop-plugin-settings.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { mountBackupPluginStartupPreview } from "../src/plugin-startup-preview.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";
import { createCoreScoreView } from "../src/score/core-score-view.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { createStartupTestShell } from "./support/plugin-startup-fixtures.js";
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function session(id="one",version=0,title="未命名乐谱") {
  return {documentId:id,documentVersion:version,title,measureCount:1,undoDepth:0,redoDepth:0,
    notation:{...structuredClone(STAFF_FIXTURE),measures:structuredClone(STAFF_FIXTURE.measures.slice(0,1)).map(measure=>({...measure,events:[]}))},
    playbackSource:{kind:"unsupported",projectionVersion:1,documentId:id,documentVersion:version,code:"playback.readonly-test",message:"只读测试"}};
}
function documents({warnings=[]}={}) {
  let current=session(), fail=false, opens=0; const calls=[];
  const source=createReadonlyScoreDocumentSession({client:{usesNativeFiles:()=>true,
    async read(){calls.push("read");if(fail)throw new Error("读取失败");return current;},
    async create(input,id,expected){calls.push("new");assert.equal(expected,current.documentId);current=session("new");return current;},
    async createGuarded(input,id,expected){calls.push("new");assert.deepEqual(expected,{kind:"document",documentId:current.documentId,documentVersion:current.documentVersion});current=session("new");return current;},
    async openNativeDocumentGuarded(expected){assert.deepEqual(expected,{kind:"document",documentId:current.documentId,documentVersion:current.documentVersion});calls.push("open");current=session(opens++ ? "opened-two" : "opened",1,opens > 1 ? "作品 B" : "作品 A");
      current={...current,measureCount:opens+1,notation:{...current.notation,tempoBpm:opens>1?132:72,
        measures:Array.from({length:opens+1},(_,index)=>({...current.notation.measures[0],id:`measure-${index}`,voiceId:`voice-${index}`}))}};
      return {session:current,name:"piece.bgp.json",savedVersion:1,...(warnings.length?{warnings}:{})};}},createId:()=>"request"});
  return {source,calls,fail(value){fail=value;},set(value){current=value;}};
}
function renderer(target) {
  return async ()=>{const svg=target.ownerDocument.createElement("svg");Object.defineProperty(svg.style,"removeProperty",{value:()=>{}});
    return {svg,layout:{width:1000,height:1414,pages:[]},interaction:{events:[{id:"one-event"}],anchors:[],measures:[]}};};
}
test("post-open metadata warnings use the existing graphical status and preserve accepted score and saved state",()=>withTestDocument(async()=>{
  const warning={code:"file.recent-unavailable",message:"作品已打开，最近记录未能更新",severity:"warning",source:"file",target:{scope:"component",componentId:"navigation.file"},retryable:true};
  const f=documents({warnings:[warning]}),root=document.createElement("main");document.body.append(root);
  const runtime=createBackupUiRuntime({root,documentSession:f.source,documentActions:f.source});
  try {
    await flush();assert.equal((await runtime.execute("notation.core.document.open")).ok,true);await flush();
    assert.equal(runtime.document.snapshot().documentId,"opened");assert.equal(f.source.snapshot().status,"ready");
    const status=root.querySelector(".v-doc-state");assert.equal(status.dataset.save,"saved");assert.equal(status.dataset.warning,"true");
    assert.equal(status.textContent,"");assert.match(status.title,/最近记录未能更新/);assert.equal(status.getAttribute("aria-label"),status.title);
    assert.equal((await runtime.execute("notation.core.document.new")).ok,true);await flush();assert.equal(status.dataset.warning,"false");
    assert.deepEqual(f.source.snapshot().warnings,[]);
  } finally {runtime.dispose();f.source.dispose();root.remove();}
}));
test("the actual backup composition mounts an initially empty real read port, refreshes file identity and uses the sole command router",()=>withTestDocument(async()=>{
  const f=documents(),root=document.createElement("main");document.body.append(root);
  const runtime=createBackupUiRuntime({root,documentSession:f.source,documentActions:f.source});
  await flush();assert.equal(runtime.document.snapshot().documentId,"one");assert.equal(root.querySelector(".v-stage").getAttribute("aria-label"),"未命名乐谱 · 谱面舞台");
  assert.equal(root.querySelector("[data-document-measures]").textContent,"1 小节");
  assert.equal(root.querySelector("[data-document-tempo]").textContent,"96");
  assert.equal([...root.querySelectorAll(".v-slot-label")].find(node=>node.textContent==="1 / 1").hidden,true);
  assert.equal((await runtime.execute("notation.core.document.open")).ok,true);await flush();
  assert.equal(runtime.document.snapshot().documentId,"opened");assert.equal(root.querySelector(".v-stage").getAttribute("aria-label"),"作品 A · 谱面舞台");
  assert.equal(root.querySelector(".v-doc-state").textContent,"");assert.equal(root.querySelector(".v-doc-state").dataset.save,"saved");
  assert.equal(root.querySelector("[data-document-measures]").textContent,"2 小节");assert.equal(root.querySelector("[data-document-tempo]").textContent,"72");
  const cell=root.querySelector(".core-score-view");
  assert.equal((await runtime.execute("notation.core.document.open")).ok,true);await flush();
  assert.equal(runtime.document.snapshot().documentId,"opened-two");assert.equal(root.querySelector(".core-score-view"),cell);
  root.querySelector("#module-panel-trigger").dispatchEvent(new Event("click"));assert.equal(root.querySelector(".v-stage").getAttribute("aria-label"),"作品 B · 谱面舞台");
  assert.equal(root.querySelector("[data-document-measures]").textContent,"3 小节");assert.equal(root.querySelector("[data-document-tempo]").textContent,"132");
  f.fail(true);assert.equal((await runtime.execute("notation.core.document.reload")).ok,false);await flush();
  assert.equal(root.querySelector("[data-document-measures]").textContent,"3 小节");assert.equal(root.querySelector("[data-document-tempo]").textContent,"132");
  f.fail(false);assert.equal((await runtime.execute("notation.core.document.reload")).ok,true);await flush();
  assert.equal((await runtime.execute("notation.core.document.new")).ok,true);await flush();assert.equal(runtime.document.snapshot().documentId,"new");
  assert.equal(root.querySelector("[data-document-measures]").textContent,"1 小节");assert.equal(root.querySelector("[data-document-tempo]").textContent,"96");
  assert.deepEqual(f.calls,["read","open","open","read","read","new"]);runtime.dispose();f.source.dispose();assert.equal(root.querySelector(".core-score-view"),null);
}));
test("process-mode startup and return keep the same document owner; final disposal ends its subscriptions",()=>withTestDocument(async()=>{
  const {root,workspaceRoot}=createStartupTestShell(document),f=documents();let creates=0;
  const preview=mountBackupPluginStartupPreview({root,workspaceRoot,store:{read:()=>null,write(){}},sessionMode:"process",createDocumentSession(){creates++;return f.source;}});
  root.querySelector("#startup-open").dispatchEvent(new Event("click"));await flush();
  assert.equal(creates,1);assert.equal(workspaceRoot.querySelector(".v-stage").getAttribute("aria-label"),"未命名乐谱 · 谱面舞台");
  workspaceRoot.querySelector(".v-app-mark").dispatchEvent(new Event("click"));await flush();
  root.querySelector("#startup-open").dispatchEvent(new Event("click"));await flush();
  assert.equal(creates,1);assert.deepEqual(f.calls,["read"]);preview.dispose();assert.equal(f.source.snapshot().status,"disposed");
}));
test("an initial real-source read failure renders retry and rereads the host without falling back to fixture",()=>withTestDocument(async()=>{
  const f=documents();f.fail(true);const projection=createDocumentStaffProjection({readSession:f.source.read,subscribe:f.source.subscribe,retrySession:f.source.reload});
  projection.start();const target=document.createElement("section");document.body.append(target);
  const view=createCoreScoreView({score:projection.read,renderSnapshot:renderer(target)}).mount(target);await flush();
  assert.equal(projection.snapshot().status,"error");assert.equal(target.dataset.readState,"error");assert.equal(target.querySelector(".score-view-svg"),null);
  const retry=target.querySelector("button");assert.equal(retry.textContent,"");assert.equal(retry.getAttribute("aria-label"),"重新读取作品");
  f.fail(false);retry.dispatchEvent(new Event("click"));await flush();await flush();assert.equal(target.dataset.renderState,"ready");
  assert.equal(projection.snapshot().documentId,"one");assert.equal(f.calls.filter(x=>x==="read").length,2);view.dispose();projection.dispose();f.source.dispose();
}));
test("a failed reread preserves the accepted SVG and geometry; retry and unsupported documents have distinct effects",()=>withTestDocument(async()=>{
  const f=documents(),projection=createDocumentStaffProjection({readSession:f.source.read,subscribe:f.source.subscribe,retrySession:f.source.reload});projection.start();
  const target=document.createElement("section");document.body.append(target);const view=createCoreScoreView({score:projection.read,renderSnapshot:renderer(target)}).mount(target);await flush();
  const svg=target.querySelector(".score-view-svg"),geometry=target._scoreInteraction;assert.ok(svg);
  f.fail(true);await f.source.reload();await flush();assert.equal(target.querySelector(".score-view-svg"),svg);assert.equal(target._scoreInteraction,geometry);assert.equal(target.dataset.readState,"error");
  assert.ok(target.querySelector(".score-view-read-error"));const retry=target.querySelector(".score-view-read-error").querySelector("button");retry.focus();
  f.fail(false);retry.dispatchEvent(new Event("click"));await flush();await flush();assert.equal(target.dataset.readState,"ready");
  assert.equal(document.activeElement,target,"successful host reload keeps keyboard ownership after removing retry");
  f.set({...session("other"),notation:{kind:"unsupported",message:"该谱式暂不支持"}});await f.source.reload();await flush();
  assert.equal(target.dataset.readState,"unsupported");assert.equal(target.querySelector(".score-view-svg"),null);assert.match(target.textContent,/该谱式暂不支持/);
  view.dispose();projection.dispose();f.source.dispose();
}));
test("late rendering after document switch or disposal cannot write old SVG or geometry",()=>withTestDocument(async()=>{
  let publish,resolve;let current=STAFF_FIXTURE;const score={snapshot:()=>current,subscribe(fn){publish=fn;return ()=>{publish=null;};}};
  const target=document.createElement("section");document.body.append(target);let count=0;
  const view=createCoreScoreView({score,renderSnapshot:async()=>{count++;if(count===1)return new Promise(yes=>{resolve=yes;});return renderer(target)();}}).mount(target);
  await flush();current={...STAFF_FIXTURE,measures:STAFF_FIXTURE.measures.slice(0,1)};publish(current);await flush();const accepted=target.querySelector(".score-view-svg");
  resolve(await renderer(target)());await flush();assert.equal(target.querySelector(".score-view-svg"),accepted);view.dispose();assert.equal(publish,null);assert.equal(target.children.length,0);
}));
