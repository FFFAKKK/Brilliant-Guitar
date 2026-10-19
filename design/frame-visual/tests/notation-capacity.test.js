import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { timingStats } from "../tools/capacity-statistics.js";
import { timingStats as existingStats } from "../tools/foundation-capacity.mjs";
import { runNotationCapacity, validateNotationCapacityInputs } from "../tools/notation-capacity.js";
import { createNotationCapacityFiles } from "../scripts/notation-capacity-assets.mjs";
import { captureFoundationSnapshot } from "../scripts/foundation-boundary-check.mjs";
import { hash, projectRoot, isWithin } from "../scripts/author-validation-kit.mjs";

const policy = JSON.parse(await readFile(new URL("../notation-capacity-policy-v0.1.json", import.meta.url), "utf8"));
const cases = await Promise.all(policy.cases.map(async item => ({ name: item.name,
  snapshot: JSON.parse(await readFile(new URL(`../evidence/document-capacity-20261008/run-02/${item.name}.projection.json`, import.meta.url), "utf8")) })));
const testPolicy = () => ({ ...structuredClone(policy), warmups: 0, iterations: 2 });
function harness(options = {}) {
  let clock = 0, stopped = 0, cleared = 0, adopted = 0;
  const ports = { now: () => ++clock, initialize: async () => {},
    observeBlocking: () => ({ available: options.available !== false, take: () => options.longTasks ?? [], stop: () => { stopped++; } }),
    async render(snapshot) {
      const expected = policy.cases.find(item => item.measures === snapshot.measures.length && item.events === snapshot.measures.flatMap(measure => measure.events).length);
      return { svg: {}, layout: { height: 10000, pages: Array(expected.pages).fill({}) }, interaction: {
        measures: snapshot.measures.map(measure => ({ measureId: measure.id })),
        events: snapshot.measures.flatMap(measure => measure.events.map(event => ({ eventId: event.id, x: 1, y: 1, width: 1, height: 1 }))) } };
    },
    adopt: (_, __, expected) => { adopted++; return { pageRoots: expected.pages, fontsVerified: true, nodes: 10 }; },
    paint: async () => {}, clear: () => { cleared++; } };
  return { ports, state: () => ({ stopped, cleared, adopted }) };
}

test("browser and prior Node measurements share one nearest-rank implementation and retain slow values", () => {
  assert.equal(timingStats, existingStats); const samples = Array(24).fill(1).concat(1000);
  const stats = timingStats(samples); assert.equal(stats.max, 1000); assert.equal(stats.mean, 40.96); assert.equal(samples.at(-1), 1000);
  for (const input of [[], [NaN], [-1], [Infinity]]) assert.throws(() => timingStats(input));
});

test("input validation rejects missing cases, duplicate IDs and invalid sampling before acquiring browser resources", () => {
  validateNotationCapacityInputs(cases, policy);
  assert.throws(() => validateNotationCapacityInputs(cases.slice(1), policy));
  const duplicate = structuredClone(cases); duplicate[1].snapshot.measures[1].events[0].id = duplicate[1].snapshot.measures[0].events[0].id;
  assert.throws(() => validateNotationCapacityInputs(duplicate, policy));
  assert.throws(() => validateNotationCapacityInputs(cases, { ...policy, iterations: 0 }));
});

test("complete controlled samples retain all four scales and cannot grant G6 or minimum-device qualification", async () => {
  const h = harness(), result = await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports });
  assert.equal(result.status, "baseline-only"); assert.equal(result.assessment, "within-engineering-limits");
  assert.equal(result.qualificationG6, "pending"); assert.equal(result.minimumDeviceQualification, "pending");
  assert.equal(result.cases.length, 4); assert.ok(result.cases.every(item => item.samples.length === 2 && item.stats.renderToAdoptMs.count === 2));
  assert.deepEqual(h.state(), { stopped: 1, cleared: 9, adopted: 8 });
});

test("missing event geometry is rejected before SVG adoption and cleanup still runs", async () => {
  const h = harness(), render = h.ports.render;
  h.ports.render = async snapshot => { const drawing = await render(snapshot); drawing.interaction.measures = []; return drawing; };
  const result = await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports });
  assert.equal(result.status, "failed"); assert.match(result.error, /music\/geometry/);
  assert.equal(h.state().adopted, 0); assert.equal(h.state().stopped, 1);
});

test("font verification and complete root adoption are required even for nonempty output", async () => {
  for (const fields of [{ fontsVerified: false }, { pageRoots: 0 }]) {
    const h = harness(); h.ports.adopt = () => ({ fontsVerified: true, pageRoots: 1, nodes: 10, ...fields });
    const result = await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports });
    assert.equal(result.status, "failed"); assert.match(result.error, /adopted SVG/); assert.equal(h.state().stopped, 1);
  }
});

test("a late render after cancellation cannot adopt DOM or count as a successful sample", async () => {
  const h = harness(), controller = new AbortController(), render = h.ports.render;
  h.ports.render = async snapshot => { const drawing = await render(snapshot); controller.abort(); return drawing; };
  const result = await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports, signal: controller.signal });
  assert.equal(result.status, "cancelled"); assert.equal(h.state().adopted, 0); assert.equal(result.cases[0].samples.length, 0);
});

test("cancellation releases the runner while initialization is pending and handles a later rejection", async () => {
  const h = harness(), controller = new AbortController(); let rejectInitialization;
  h.ports.initialize = () => new Promise((_, reject) => { rejectInitialization = reject; });
  const running = runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports, signal: controller.signal });
  await Promise.resolve(); controller.abort();
  const result = await running; assert.equal(result.status, "cancelled"); assert.equal(h.state().stopped, 1); assert.equal(h.state().adopted, 0);
  rejectInitialization(new Error("late font rejection")); await Promise.resolve();
});

test("render failure preserves previous raw samples and releases observation instead of returning success", async () => {
  const h = harness(), render = h.ports.render; let count = 0;
  h.ports.render = snapshot => { if (++count === 2) throw new Error("drawing failed"); return render(snapshot); };
  const result = await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports });
  assert.equal(result.status, "failed"); assert.equal(result.cases[0].samples.length, 1); assert.equal(h.state().stopped, 1);
});

test("threshold exceedance and unavailable long-task observation never become an unqualified pass", async () => {
  const h = harness({ longTasks: [101] }), limits = testPolicy(); limits.cases[0].renderToAdoptP95Ms = 0;
  const result = await runNotationCapacity({ cases, policy: limits, ports: h.ports });
  assert.equal(result.assessment, "exceeded"); assert.ok(result.failures.includes("main-thread-long-task"));
  assert.ok(result.failures.includes("empty:render-to-adopt-p95")); assert.ok(result.longTasksMs.includes(101));
  const unavailable = await runNotationCapacity({ cases, policy: testPolicy(), ports: harness({ available: false }).ports });
  assert.equal(unavailable.assessment, "incomplete"); assert.equal(unavailable.qualificationG6, "pending");
});

test("invalid clocks and cleanup errors fail the report while every independent release is attempted", async () => {
  const h = harness(); h.ports.now = () => NaN;
  assert.equal((await runNotationCapacity({ cases, policy: testPolicy(), ports: h.ports })).status, "failed");
  const cleanup = harness(); cleanup.ports.clear = () => { throw new Error("clear failed"); };
  const result = await runNotationCapacity({ cases, policy: testPolicy(), ports: cleanup.ports });
  assert.equal(result.status, "failed"); assert.equal(result.assessment, "incomplete"); assert.equal(cleanup.state().stopped, 1);
  assert.ok(result.cleanupErrors.includes("clear failed"));
});

test("generated classic harness embeds fingerprinted real projections and consumes the original renderer/font loader", async () => {
  const { files, manifest } = await createNotationCapacityFiles();
  const current = await captureFoundationSnapshot();
  for (const source of manifest.sources.filter(source => source.path.includes("/evidence/document-capacity-20261008/run-02/"))) {
    assert.equal(current.files.find(file => file.path === source.path)?.sha256, source.sha256, "candidate fingerprint must include the actual fixture bytes");
  }
  for (const path of ["design/frame-visual/src/score/vexflow-staff-renderer.js", "design/frame-visual/src/score/vexflow-runtime.js",
    "design/frame-visual/src/vendor/shared-notation/vexflow-renderer.js", "design/frame-visual/src/vendor/vexflow-bravura.js"]) {
    assert.ok(manifest.sources.some(source => source.path === path));
  }
  assert.ok(manifest.sources.every(source => !source.path.includes("/host/") && !source.path.includes("plugin-platform")));
  const html = files.get("notation-capacity-preview.html").toString();
  const data = JSON.parse(html.match(/<script id="capacity-inputs" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.policy.minimumTarget.cpuPhysicalCores, 4); assert.equal(data.policy.minimumTarget.ramGiB, 8);
  assert.equal(data.policy.minimumTarget.referenceDeviceId, null); assert.equal(data.cases[3].snapshot.measures.length, 512);
  for (const artifact of manifest.artifacts) assert.equal(hash(files.get(artifact.path)), artifact.sha256);
  assert.ok(!files.get("vendor/notation-capacity-preview.js").toString().includes("import.meta"));
});

test("the drawing generator is deterministic from root and an unrelated cwd without rebuilding product assets", async t => {
  const parent = join(projectRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "notation-capacity-"));
  t.after(async () => { const canonical = await realpath(directory); assert.ok(isWithin(await realpath(parent), canonical)); await rm(canonical, { recursive: true, force: true }); });
  const generator = fileURLToPath(new URL("../scripts/build-notation-capacity.mjs", import.meta.url));
  const original = hash(await readFile(new URL("../vendor/plugin-startup-preview.js", import.meta.url)));
  for (const cwd of [projectRoot, directory]) {
    const result = await promisify(execFile)(process.execPath, [generator, "--check"], { cwd, windowsHide: true });
    assert.match(result.stdout, /Notation capacity verified/);
  }
  assert.equal(hash(await readFile(new URL("../vendor/plugin-startup-preview.js", import.meta.url))), original);
});
