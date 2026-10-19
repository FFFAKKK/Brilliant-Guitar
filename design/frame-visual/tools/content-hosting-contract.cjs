// Rechecks saved CUA observations. Does not launch a browser or qualify later source without recapture.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const base = path.resolve(__dirname, ".."), evidence = path.join(base, "evidence/revision-12");
const read = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(path.join(evidence, "browser-review.json")), before = read(path.join(evidence, "current-source-before.json"));
assert.deepEqual(read(path.join(evidence, "current-source-after.json")), before, "stable observed source set");
for (const [file,value] of Object.entries(before)) assert.equal(hash(path.join(base,file)),value,"observed source: " + file);
const baseline = read(path.join(evidence,"source-baseline.json")), concurrent = read(path.join(evidence,"concurrent-changes.json"));
const owned = new Set(["structure-preview.html","sidebar-review.html","src/fixtures/layout-edit-state.js","src/fixtures/structure-preview.js"]);
for (const [file,value] of Object.entries(baseline)) {
  if (owned.has(file)) continue;
  assert.equal(hash(path.join(base,file)),concurrent.existing[file]?.after ?? value,"baseline or preserved concurrent source: " + file);
  if (concurrent.existing[file]) assert.equal(hash(path.join(evidence,"concurrent-source",file)),concurrent.existing[file].after);
}
for (const file of concurrent.new) assert.equal(hash(path.join(base,file)),before[file],"new concurrent source retained: " + file);
const near = (a,b,label) => assert.ok(Math.abs(a-b)<.6,label + ": " + a + " / " + b);
const apart = (a,b) => !a || !b || !a.visible || !b.visible || a.right<=b.x+.6 || b.right<=a.x+.6 || a.bottom<=b.y+.6 || b.bottom<=a.y+.6;
const get = (group,label) => { const row = report[group].find(r=>r.label===label);assert.ok(row,label);return row; };
const control = (row,id) => {const node=row.controls.find(n=>n.id===id);assert.ok(node,row.label+": "+id);return node;};
const input = (label,id) => control(get("flows",label),"hosting-input-"+id).value;
const scroll = (label,id) => get("flows",label).scroll.find(n=>n.id===id);
for (const [group,count] of Object.entries({flows:57,capacity:40,frames:16,originalScenes:96,keyboard:8})) assert.equal(report[group].length,count,group+": complete set");
for (const row of [...report.flows,...report.capacity,...report.frames,...report.originalScenes]) {
  assert.ok(row.rootOverflow<.6,row.label+": root fits");assert.deepEqual(row.duplicateIds,[],row.label+": unique DOM IDs");
  assert.equal(new Set(row.contents.map(n=>n.id)).size,row.contents.length,row.label+": unique visible content identities");
  assert.equal(row.paperWhite,"rgb(255, 255, 255)",row.label+": white paper");
  const m=row.metrics;near(m.shell.width,row.viewport.width,row.label+": actual viewport");near(m.paper.x+m.paper.width/2,row.viewport.width/2,row.label+": centered paper");
  assert.ok(m.stage.width>0 && m.stage.height>0,row.label+": positive stage");
  for (const key of ["left","right","top","iconRail","pageRail","voice","voiceTitle","merge"]) assert.ok(apart(m.stage,m[key]),row.label+": stage distinct from "+key);
  for (const area of row.scroll) {assert.equal(area.scrollbar,"none",row.label+": hidden scrollbar");if(area.id!=="score-scroll")assert.ok(area.overflowX<.6,row.label+": content fits "+area.class);}
  for (const node of row.contents) assert.equal(node.border,"0px",row.label+": transparent card edge");
  for (const node of row.controls) {assert.equal(node.border,"0px",row.label+": transparent control edge "+node.id);assert.equal(node.animation,"0s");assert.equal(node.transition,"0s");}
}
for(const width of [1280,1024,800,640])for(const sample of ["normal","single","empty","hidden","no-results","long","fixed-high","half-limit","missing","unavailable"]) {
  const height=width===800?600:width===640?480:720,row=get("capacity",sample+"-"+width+"x"+height);assert.equal(row.viewport.width,width);assert.equal(row.viewport.height,height);
}
const origin=get("flows","normal");
for (const row of report.flows.slice(0,30)) for(const key of ["x","y","width","height"]) near(row.metrics.paper[key],origin.metrics.paper[key],row.label+": fixed paper "+key);
for (const prefix of ["structure","runtime"]) {
  const first=get("frames",prefix+"-normal");
  for(const row of report.frames.filter(r=>r.label.startsWith(prefix+"-")&&!r.label.includes("resize")))for(const key of ["x","y","width","height"])near(row.metrics.paper[key],first.metrics.paper[key],row.label+": fixed paper "+key);
  const opened=get("frames",prefix+"-left-open");near(opened.metrics.left.width,opened.metrics.right.width,prefix+": symmetric defaults");
  assert.equal(control(get("frames",prefix+"-cancel-workspace-retained"),"layout-size-left").value,"300");
}
const runtimeOrigin=get("frames","runtime-cancel-workspace-retained");
for(const row of report.frames.filter(r=>r.label.includes("runtime-resize")))for(const key of ["width","height","y"])near(row.metrics.paper[key],runtimeOrigin.metrics.paper[key],row.label+": retained "+key);
assert.equal(get("flows","page1-list").modes[0].mode,"list");assert.equal(get("flows","page2-visible-grid").modes[0].page,"left-2");assert.equal(get("flows","page2-visible-grid").modes[0].mode,"grid");
assert.equal(get("flows","cancel-page2-tabs-restored").modes[0].mode,"tabs");assert.equal(get("flows","right-page3-still-mixed").modes.find(n=>n.side==="right").mode,"mixed");
for(const label of ["grid-input-restored","B-visible-right","cancel-B-restored-left","confirmed-B-right-list","B-input-after-rejoin"])assert.equal(input(label,"B"),"移动后保留的输入",label+": identity input retained");
assert.equal(input("tabs-input-restored","D"),"页签输入保留");assert.equal(input("tab-reading-restored-settled","I"),"长页签输入保留");
assert.equal(control(get("flows","tabs-first"),"hosting-content-prev-left").disabled,true);assert.equal(control(get("flows","tabs-last"),"hosting-content-next-left").disabled,true);
for(const id of ["hosting-prev-left","hosting-next-left","hosting-content-prev-left","hosting-content-next-left"])assert.equal(control(get("flows","single-boundaries"),id).disabled,true);
for(const label of ["fixed-move-disabled","missing-move-disabled","half-limit-selected"])assert.equal(control(get("flows",label),"hosting-move").disabled,true);
assert.equal(control(get("flows","half-limit-resolved"),"hosting-move").disabled,false);
assert.match(get("flows","B-moved-result").result,/右栏.*页面三/);assert.match(get("flows","cancel-workspace-retained").result,/撤回/);assert.match(get("flows","move-confirmed").result,/已确认/);
assert.equal(control(get("flows","cancel-workspace-retained"),"layout-size-left").value,"300");assert.equal(control(get("flows","cancel-workspace-retained"),"layout-size-top").value,"64");
assert.equal(get("flows","search-empty").library.length,0);assert.equal(get("flows","search-cleared").library.length,11);
assert.match(get("flows","B-icon-hidden").library.find(n=>n.id==="B").text,/图标已隐藏/);assert.ok(!get("flows","B-icon-hidden").controls.some(n=>n.id==="hosting-rail-B"));
assert.match(get("flows","B-removed").library.find(n=>n.id==="B").text,/未加入/);assert.match(get("flows","B-rejoined").library.find(n=>n.id==="B").text,/已加入/);
assert.ok(!get("flows","all-icons-hidden").controls.some(n=>/^hosting-rail-[A-K]$/.test(n.id)));assert.ok(get("flows","hidden-A-recovered").controls.some(n=>n.id==="hosting-rail-A"));
assert.equal(get("flows","list-fold-retained").contents.find(n=>n.id==="I").open,false);
near(scroll("tab-end-settled","hosting-scroll-right").scrollTop,scroll("tab-reading-restored-settled","hosting-scroll-right").scrollTop,"settled tab reading restored");assert.ok(scroll("tab-end-settled","hosting-scroll-right").scrollTop>0);
assert.deepEqual(get("flows","native-grid-drag").contents.filter(n=>["A","B","C"].includes(n.id)).map(n=>n.id),["A","C","B"]);assert.match(get("flows","native-grid-drag-result").result,/顺序已调整/);
assert.deepEqual(get("flows","native-self-drop-rejected").contents.map(n=>n.id),["A","B","C"]);assert.match(get("flows","native-self-drop-rejected").result,/落点无效/);
assert.equal(report.attempts.length,2,"cross-section native attempts retained separately; not counted as passed input");
for(const step of report.keyboard){assert.equal(step.focusVisible,true);assert.equal(step.outline,"solid");assert.equal(step.color,"rgb(143, 183, 255)");assert.equal(step.disabled,false);}
for(const row of [...report.frames,...report.originalScenes])assert.equal(row.neutral,false,row.label+": no neutral content injected");
const provenance=read(path.join(base,"copy-provenance.json")),original=path.resolve(base,"../..",provenance.source);
for(const [file,value]of Object.entries(provenance.sourceHashes))assert.equal(hash(path.join(original,file)),value,"original unchanged: "+file);
const score=read(path.join(base,"fixtures/score-provenance.json"));assert.equal(hash(score.source),score.sourceSHA256);assert.equal(hash(path.join(base,"fixtures/approved-score.svg")),score.assetSHA256);
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"),"cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf");
const tests=fs.readFileSync(path.join(evidence,"node-tests.txt"),"utf8");assert.match(tests,/tests 233/);assert.match(tests,/pass 233/);assert.match(tests,/fail 0/);
const syntax=read(path.join(evidence,"syntax-review.json"));assert.equal(syntax.passed,true);
const sources=["content-hosting-review.html","content-hosting.md","src/fixtures/content-hosting-state.js","src/fixtures/content-hosting-view.js","styles/content-hosting.css","tests/content-hosting-visual.test.js","src/fixtures/layout-edit-state.js","src/fixtures/structure-preview.js","structure-preview.html","sidebar-review.html","README.md","tools/content-hosting-contract.cjs"];
const accepted={sources:Object.fromEntries(sources.map(file=>[file,hash(path.join(base,file))])),evidence:Object.fromEntries(["browser-review.json","node-tests.txt","syntax-review.json","dom-sampler.js","current-source-before.json","current-source-after.json","concurrent-changes.json","review.md"].map(file=>[file,hash(path.join(evidence,file))]))};
const seal=path.join(evidence,"source-hashes.json");
if(process.argv.includes("--record")){assert.ok(!fs.existsSync(seal),"never overwrite a historical seal");fs.writeFileSync(seal,JSON.stringify(accepted,null,2)+"\n");}
else assert.deepEqual(read(seal),accepted,"sealed sources and evidence unchanged");
const verification={revision:12,result:"passed",browserRecords:209,flows:57,capacity:40,frames:16,originalScenes:96,keyboard:8,nodeTests:233,syntaxFiles:syntax.count,stableSources:Object.keys(before).length,concurrentExisting:Object.keys(concurrent.existing).length,concurrentNew:concurrent.new.length,scope:"neutral in-memory framework visual review only; external plugin UI/real persistence and system scaling remain separate"};
fs.writeFileSync(path.join(evidence,"verification.json"),JSON.stringify(verification,null,2)+"\n");console.log(JSON.stringify(verification));
