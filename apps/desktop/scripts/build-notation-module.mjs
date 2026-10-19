// Generated from the authentic compiled module and its actual callback executor.
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dirname, "../../..");
const { build } = createRequire(resolve(root, "design/frame-visual/package.json"))("esbuild");
const temporary = resolve(root, ".tmp/native-notation-module");
await mkdir(temporary, { recursive: true });
const bundle = resolve(temporary, "oracle.mjs");
await build({ stdin: { contents: `
export { compileKeySignatureModuleCatalogV1 } from "./src/first-party-modules/key-signature.ts";
export { compileFirstPartyModuleCatalogV1 } from "./src/first-party-modules/catalog.ts";
export { GUITAR_INSTRUMENT_PROFILE_V2, GUITAR_TUNING_PRESETS_V1 } from "./src/first-party-modules/guitar-domain.ts";
export { resolveKernelIntegratedRuntimeAssembly } from "./src/core-kernel/registry/domain-availability.ts";
export { captureHostInstalledContributionsV1 } from "./src/core-kernel/native/integrated-catalog-capture.ts";
export { createNativeContributionExecutorV2 } from "./src/core-kernel/native/integrated-executor.ts";
`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: bundle });
const sdk = await import(pathToFileURL(bundle));
const compiled = sdk.compileKeySignatureModuleCatalogV1();
if (!compiled.ok) throw new Error("Official catalog did not compile");
const resolved = sdk.resolveKernelIntegratedRuntimeAssembly(compiled.catalog);
if (!resolved.ok) throw new Error("Official assembly did not resolve");
const catalog = sdk.captureHostInstalledContributionsV1(compiled.catalog);
if (!catalog) throw new Error("Official metadata could not be captured");
const assembly = { apiVersion: 2, catalog: catalog.projection,
  commands: resolved.state.catalogState.contributions.flatMap(x => x.commands.map(c => c.descriptor)),
  effects: resolved.state.catalogState.contributions.flatMap(x => x.effects.map(e => e.descriptor)), inventory: null };
const callback = sdk.createNativeContributionExecutorV2(resolved.state);
const namespace = assembly.commands[0].source.moduleId;
const fixture = JSON.parse(await readFile(resolve(root, "crates/brilliant-kernel-session/src/wasm/fixtures/session.json"), "utf8"));
const initial = JSON.parse(fixture.initial).document;
const rows = [];
function add(request) {
  rows.push({ request, response: JSON.parse(callback(Buffer.from(JSON.stringify(request))).toString("utf8")) });
  return rows.at(-1).response;
}
function run(document, partId, measureId, change) {
  const command = { commandVersion: 1, commandId: assembly.commands[0].commandId,
    target: { kind: "part", partId }, payload: { measureId, change } };
  const result = add({ operation: "prepare", document, documentVersion: 3, command });
  if (result.ok && result.prepared.status === "changed") {
    add({ operation: "transform", document, documentVersion: 3,
      contributionId: assembly.commands[0].source.contributionId, effect: result.prepared.effectRequests[0] });
  }
}
// Every legal value, inherit/no-op, ordering, redundant changes, malformed data,
// future and unknown blocks, plus non-scalar UTF-16 IDs and payloads.
for (const fifths of Array.from({length: 15}, (_, i) => i - 7)) run(initial, "part-1", "measure-1", {kind: "set", fifths});
run(initial, "part-1", "measure-1", {kind: "inherit"});
run(initial, "missing-part", "measure-1", {kind: "set", fifths: 2});
run(initial, "part-1", "missing-measure", {kind: "set", fifths: 2});
for (const change of [{kind:"set",fifths:8},{kind:"set",fifths:1.5},{kind:"set",fifths:"1"},
  {kind:"inherit",extra:0},{kind:"set",fifths:1,extra:0},{kind:"unknown"}]) run(initial, "part-1", "measure-1", change);
function block(changes, schemaVersion=1, owner={kind:"part",partId:"part-1"}) {
  return {namespace, schemaVersion, owner, payload:{changes}};
}
const ordered = structuredClone(initial);
ordered.measureDefinitions = ["z","a","m"].map(id => ({id,meter:{numerator:4,denominator:4}}));
ordered.parts[0].measureContents = ordered.measureDefinitions.map((m,i) => ({measureId:m.id,voices:[{
  id:`v${i}`,defaultStaffId:"staff-1",sequence:{start:{numerator:0,denominator:1},events:[]}}]}));
ordered.extensions = [block([{measureId:"a",fifths:-2},{measureId:"m",fifths:0},{measureId:"z",fifths:1}])];
for (const id of ["z","a","m"]) for (const change of [{kind:"set",fifths:0},{kind:"set",fifths:-2},{kind:"inherit"}]) run(ordered,"part-1",id,change);
const mutations = [[], [block([{measureId:"measure-1",fifths:1}])],
  [block([{measureId:"measure-1",fifths:0}])], [block([{measureId:"unknown",fifths:1}])],
  [block([{measureId:"measure-1",fifths:8}])], [block([{measureId:"measure-1",fifths:1}],2)],
  [block([],1,{kind:"score"})], [block([],1,{kind:"part",partId:"unknown"})],
  [block([{measureId:"measure-1",fifths:1},{measureId:"measure-1",fifths:2}])],
  [{namespace:"opaque.example",schemaVersion:1,owner:{kind:"score"},payload:{text:"\ud800",nested:[1,{a:2}]}}]];
for (const extensions of mutations) {
  const document = {...initial, extensions};
  add({operation:"assess",document,documentVersion:3,coreAssessment:{status:"supported",diagnostics:[]}});
}
const surrogate = structuredClone(initial);
surrogate.measureDefinitions[0].id = "\ud800";
surrogate.parts[0].measureContents[0].measureId = "\ud800";
run(surrogate,"part-1","\ud800",{kind:"set",fifths:1});
run(ordered,"part-1","a",{kind:"set",fifths:-2});
const directory = resolve(root, "apps/desktop/src-tauri/src/application/key_signature");
await mkdir(directory, {recursive:true});
for (const [name,value] of [["assembly.json",assembly],["oracle.json",rows]]) {
  const path = resolve(directory,name), bytes = JSON.stringify(value,null,2)+"\n";
  if (process.argv.includes("--check")) {
    if (await readFile(path,"utf8") !== bytes) throw new Error(`${name} differs from official module`);
  } else await writeFile(path,bytes);
}
console.log(`Official notation module: ${rows.length} callback cases; metadata ${process.argv.includes("--check")?"verified":"generated"}`);

// The product uses the original complete first-party catalog, never a hand-made list.
const product = sdk.compileFirstPartyModuleCatalogV1();
if (!product.ok) throw new Error("First-party catalog did not compile");
const productState = sdk.resolveKernelIntegratedRuntimeAssembly(product.catalog);
if (!productState.ok) throw new Error("First-party assembly did not resolve");
const captured = sdk.captureHostInstalledContributionsV1(product.catalog);
const productAssembly = { apiVersion: 2, catalog: captured.projection,
  commands: productState.state.catalogState.contributions.flatMap(x => x.commands.map(c => c.descriptor)),
  effects: productState.state.catalogState.contributions.flatMap(x => x.effects.map(e => e.descriptor)), inventory: null };
const execute = sdk.createNativeContributionExecutorV2(productState.state);
const cases = [];
const guitar = sdk.GUITAR_INSTRUMENT_PROFILE_V2.id;
const contributionId = `${guitar}.editing.v1`;
const guitarDocument = structuredClone(initial);
guitarDocument.parts[0].instrument = { name: "Guitar", writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 } };
guitarDocument.parts[0].measureContents[0].voices[0].sequence.events = [
  ...["a","b"].map((id,i) => ({id:`event-${id}`,duration:{base:4,dots:0},
    content:{kind:"notes",notes:[{id:`note-${id}`,writtenPitch:{step:"E",alter:0,octave:3+i}}]}})),
  {id:"event-rest",duration:{base:8,dots:1},content:{kind:"rest"}},
];
function call(request) {
  const response = JSON.parse(execute(Buffer.from(JSON.stringify(request))).toString("utf8"));
  cases.push({ request, response }); return response;
}
function assess(document) {
  return call({operation:"assess",document,documentVersion:7,coreAssessment:{status:"supported",diagnostics:[]}});
}
function editGuitar(document, suffix, payload, partId="part-1") {
  const command = {commandVersion:1,commandId:`${guitar}.${suffix}`,target:{kind:"part",partId},payload};
  const result = call({operation:"prepare",document,documentVersion:7,command});
  if (!result.ok || result.prepared.status !== "changed") return document;
  const next = structuredClone(document);
  for (const effect of result.prepared.effectRequests) {
    if (effect.requestKind === "core.note.replace-written-pitch") {
      for (const part of next.parts) for (const measure of part.measureContents) for (const voice of measure.voices)
        for (const event of voice.sequence.events) for (const note of event.content.notes ?? [])
          if (note.id === effect.target.noteId) note.writtenPitch = effect.writtenPitch;
    } else {
      const transformed = call({operation:"transform",document,documentVersion:7,contributionId,effect});
      if (!transformed.ok) return document;
      const block = {namespace:guitar,owner:effect.owner,schemaVersion:transformed.transformed.schemaVersion,
        payload:transformed.transformed.payload};
      next.extensions = next.extensions.filter(x => x.namespace !== guitar || x.owner.partId !== partId);
      next.extensions.push(block);
    }
  }
  assess(next); return next;
}
assess(guitarDocument);
const initialized = editGuitar(guitarDocument,"initialize",{});
editGuitar(initialized,"initialize",{});
for (let stringNumber=1; stringNumber<=6; stringNumber++) for (const fret of [0,1,12,24,25,43,44,67,68,100,1000,Number.MAX_SAFE_INTEGER]) {
  editGuitar(initialized,"set-position",{noteId:"note-a",position:{stringNumber,fret}});
}
let positioned = editGuitar(initialized,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:0}});
positioned = editGuitar(positioned,"set-position",{noteId:"note-b",position:{stringNumber:6,fret:12}});
editGuitar(positioned,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:0}});
editGuitar(positioned,"set-position",{noteId:"note-a",position:null});
for (const preset of sdk.GUITAR_TUNING_PRESETS_V1) editGuitar(positioned,"set-tuning",{tuning:preset.tuning});
for (const technique of [
  ...["hammer-on","pull-off","slide"].flatMap(kind => [
    {id:"technique-a",kind,fromNoteId:"note-a",toNoteId:"note-b"},
    {id:"technique-a",kind,fromNoteId:"note-b",toNoteId:"note-a"},
  ]),
  {id:"technique-a",kind:"bend",noteId:"note-a",semitones:1},
  {id:"technique-a",kind:"bend",noteId:"note-a",semitones:2},
  {id:"technique-a",kind:"vibrato",noteId:"note-a"},
]) {
  const withTechnique = editGuitar(positioned,"set-technique",{technique});
  editGuitar(withTechnique,"set-technique",{technique});
  editGuitar(withTechnique,"set-position",{noteId:"note-a",position:null});
  editGuitar(withTechnique,"remove-technique",{techniqueId:"technique-a"});
}
editGuitar(positioned,"remove-technique",{techniqueId:"missing"});
for (const payload of [
  {noteId:"missing",position:{stringNumber:1,fret:0}},
  {noteId:"note-a",position:{stringNumber:0,fret:0}},
  {noteId:"note-a",position:{stringNumber:7,fret:0}},
  {noteId:"note-a",position:{stringNumber:1,fret:-1}},
  {noteId:"note-a",position:{stringNumber:1,fret:1.5}},
  {noteId:"note-a",position:{stringNumber:1,fret:0,extra:1}},
  {noteId:"note-a",position:null,extra:1},
]) editGuitar(positioned,"set-position",payload);
editGuitar(guitarDocument,"set-position",{noteId:"note-a",position:{stringNumber:1,fret:0}});
editGuitar(guitarDocument,"initialize",{},"missing");
editGuitar(initial,"initialize",{});
editGuitar(initialized,"set-tuning",{tuning:[]});
for (const mutate of [
  d => { d.extensions[0].payload.extra=true; },
  d => { d.extensions[0].payload.stringCount=4; },
  d => { d.extensions[0].payload.placements[0].noteId="missing"; },
  d => { d.extensions[0].payload.placements.reverse(); },
  d => { d.extensions[0].payload.placements[0].fret=1; },
  d => { d.parts[0].instrument.writtenToSounding.chromaticSemitones=0; },
  d => { d.extensions[0].owner={kind:"score"}; },
  d => { d.extensions[0].schemaVersion=3; d.extensions[0].payload={future:"\ud800"}; },
  d => { d.extensions.push(block([{measureId:"measure-1",fifths:2}])); },
  d => { d.extensions.push({namespace:"opaque.example",schemaVersion:1,owner:{kind:"score"},payload:{opaque:"\ud800"}}); },
]) { const d=structuredClone(positioned); mutate(d); assess(d); }
// Old schema remains exact; a real edit migrates it atomically, no-op does not.
const legacy=structuredClone(positioned);
legacy.extensions[0].schemaVersion=1;
legacy.extensions[0].payload.fretCount=24;
assess(legacy);
editGuitar(legacy,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:0}});
editGuitar(legacy,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:67}});
for (const mutate of [
  d => { d.extensions[0].payload.fretCount=null; },
  d => { d.extensions[0].payload.fretCount=37; },
  d => { d.extensions[0].payload.capoFret=25; },
  d => { d.extensions[0].payload.placements[0].fret=25; },
]) { const d=structuredClone(legacy); mutate(d); assess(d); }
const physical=structuredClone(positioned);
physical.extensions[0].payload.fretCount=24;
editGuitar(physical,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:67}});
const capo=structuredClone(initialized);
capo.extensions[0].payload.capoFret=2;
editGuitar(capo,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:65}});
editGuitar(capo,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:66}});
const hugeCapo=structuredClone(initialized);
hugeCapo.extensions[0].payload.capoFret=Number.MAX_SAFE_INTEGER;
editGuitar(hugeCapo,"set-position",{noteId:"note-a",position:{stringNumber:6,fret:1}});
const utf16=structuredClone(initialized);
utf16.parts[0].measureContents[0].voices[0].sequence.events[0].content.notes[0].id="\ud800";
editGuitar(utf16,"set-position",{noteId:"\ud800",position:{stringNumber:6,fret:12}});
// Same-string simultaneous notes must reject as a domain fact; missing placement is legal.
const chord=structuredClone(positioned);
const events=chord.parts[0].measureContents[0].voices[0].sequence.events;
events[0].content.notes.push(events[1].content.notes[0]); events.splice(1,1); assess(chord);
const productDirectory = resolve(root,"apps/desktop/src-tauri/src/application/official_domains");
await mkdir(productDirectory,{recursive:true});
for (const [name,value] of [["assembly.json",productAssembly],["guitar-profile.json",sdk.GUITAR_INSTRUMENT_PROFILE_V2],
  ["oracle.json",cases],["guitar-document.json",positioned]]) {
  const path=resolve(productDirectory,name), bytes=JSON.stringify(value,null,2)+"\n";
  if (process.argv.includes("--check")) {
    if (await readFile(path,"utf8") !== bytes) throw new Error(`${name} differs from official first-party modules`);
  } else await writeFile(path,bytes);
}
console.log(`Official fixed first-party modules: ${cases.length} callback cases; profile and assembly ${process.argv.includes("--check")?"verified":"generated"}`);
