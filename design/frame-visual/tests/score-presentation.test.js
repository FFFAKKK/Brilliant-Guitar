import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { TABLATURE_FIXTURE } from "../src/fixtures/tablature-snapshot.js";
import { createStaffProjectionPort } from "../src/score/staff-read-port.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";
import { createScorePresentation, SCORE_PRESENTATION_COMMAND } from "../src/score/score-presentation.js";
import { createCoreScoreView } from "../src/score/core-score-view.js";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { createScoreSelection } from "../src/score/score-selection.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { loadCoreSelectionPluginForTest, renderSelectionFixture, settle } from "./support/score-selection-fixture.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { createHorizontalSlotPresentation } from "../src/host/horizontal-slot-presentation.js";
import { prepareBackupPlugin, createBackupFormalPlatform, configureBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";

const pair = version => ({ documentId: "one-piece", documentVersion: version,
  notation: STAFF_FIXTURE, tablature: TABLATURE_FIXTURE });

test("preview Tab positions agree with standard guitar tuning and octave-transposed written pitches", () => {
  // E4 B3 G3 D3 A2 E2, numbered from the highest string.
  const soundingOpenStrings = [64, 59, 55, 50, 45, 40];
  const naturalSemitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  for (const [measureIndex, measure] of STAFF_FIXTURE.measures.entries()) {
    for (const [eventIndex, event] of measure.events.entries()) {
      const tabEvent = TABLATURE_FIXTURE.measures[measureIndex].events[eventIndex];
      assert.equal(tabEvent.id, event.id);
      if (event.content.kind === "rest") {
        assert.equal(tabEvent.content.kind, "rest"); continue;
      }
      const { pitch } = event.content, { position } = tabEvent.content;
      const sounding = soundingOpenStrings[position.stringNumber - 1]
        + TABLATURE_FIXTURE.capoFret + position.fret;
      const written = 12 * (pitch.octave + 1) + naturalSemitones[pitch.step] + pitch.alter;
      assert.equal(written, sounding + 12, event.id + " must use the guitar written octave");
    }
  }
});

test("presentation changes only view preference; canonical score, identity and version remain the same", async () => {
  const source = createDocumentStaffProjection({ readSession: async () => pair(3) });
  await source.refresh();
  const original = source.read.snapshot(), display = createScorePresentation(source.read);
  assert.equal(display.select({ kind: "tablature" }).ok, true);
  assert.equal(display.read.snapshot().kind, "tablature");
  assert.equal(source.read.snapshot(), original);
  assert.equal(display.read.status().documentId, "one-piece");
  assert.equal(display.read.status().documentVersion, 3);
  assert.equal(display.select({ kind: "staff" }).ok, true);
  assert.equal(display.read.snapshot(), original);
  display.dispose(); source.dispose();
});

test("mixed Tab/staff and invalid Tab reject the complete read without advancing accepted version", async () => {
  let current = pair(1);
  const source = createDocumentStaffProjection({ readSession: async () => current });
  await source.refresh();
  const accepted = source.read.snapshot(), acceptedTab = source.read.notation("tablature");
  for (const tab of [{ ...TABLATURE_FIXTURE, staffId: "other-staff" }, { ...TABLATURE_FIXTURE, stringCount: 0 }]) {
    current = { ...pair(9), tablature: tab };
    assert.equal((await source.refresh()).ok, false);
    assert.equal(source.snapshot().documentVersion, 1);
    assert.equal(source.read.snapshot(), accepted);
    assert.equal(source.read.notation("tablature"), acceptedTab);
  }
  current = pair(2);
  assert.equal((await source.refresh()).ok, true);
  current = pair(1);
  assert.equal((await source.refresh()).code, "score.document-projection.stale");
  source.dispose();
});

test("legacy hosts disable Tab with a reason and never substitute demo positions", () => {
  const source = createStaffProjectionPort({ snapshot: STAFF_FIXTURE });
  const display = createScorePresentation(source.read);
  assert.equal(display.choices()[1].enabled, false);
  assert.match(display.choices()[1].message, /未提供/);
  assert.equal(display.select({ kind: "tablature" }).code, "score.presentation.unavailable");
  assert.equal(display.read.snapshot().kind, "staff");
  assert.equal(display.select({ kind: "staff", snapshot: TABLATURE_FIXTURE }).code, "score.presentation.invalid-payload");
  display.dispose(); source.dispose();
});

test("display can render a valid Tab when the staff projection is unsupported", async () => {
  const source = createDocumentStaffProjection({ readSession: async () =>
    ({ ...pair(0), notation: { kind: "unsupported", message: "五线谱暂不可用" } }) });
  await source.refresh();
  const display = createScorePresentation(source.read);
  assert.equal(display.choices()[0].enabled, false);
  assert.equal(display.select({ kind: "tablature" }).ok, true);
  assert.equal(display.read.status().status, "ready");
  assert.equal(display.read.snapshot().kind, "tablature");
  display.dispose(); source.dispose();
});

test("a replaced staff-only document exits Tab instead of reusing the prior document's positions", async () => {
  let current = pair(0);
  const source = createDocumentStaffProjection({ readSession: async () => current });
  await source.refresh();
  const display = createScorePresentation(source.read);
  display.select({ kind: "tablature" });
  current = { documentId: "replacement", documentVersion: 0, notation: STAFF_FIXTURE };
  await source.refresh();
  assert.equal(display.read.snapshot().kind, "staff");
  assert.equal(display.choices()[1].enabled, false);
  assert.equal(display.read.status().documentId, "replacement");
  display.dispose(); source.dispose();
});

test("Tab read failure retains accepted music and delegates local retry to the original document reader", async () => {
  let fail = false, reads = 0;
  const source = createDocumentStaffProjection({ readSession: async () => {
    reads++; if (fail) throw new Error("temporary read failure"); return pair(0);
  } });
  await source.refresh();
  const display = createScorePresentation(source.read);
  display.select({ kind: "tablature" });
  const accepted = display.read.snapshot();
  fail = true; await source.refresh();
  assert.equal(display.read.status().status, "error");
  assert.equal(display.read.snapshot(), accepted);
  assert.equal(display.choices()[1].enabled, false);
  fail = false; assert.equal((await display.read.retry()).ok, true);
  assert.equal(display.read.status().status, "ready");
  assert.equal(display.read.snapshot().kind, "tablature");
  display.dispose(); assert.equal(display.read.retry().code, "score.presentation.disposed");
  assert.equal(reads, 3); source.dispose();
});

test("rapid presentation changes keep paper geometry, invalidate old hits and reject late drawings", () =>
  withTestDocument(async ({ document }) => {
    const source = createStaffProjectionPort({ snapshot: STAFF_FIXTURE, tablature: TABLATURE_FIXTURE });
    const selection = createScoreSelection({ score: source.read }), display = createScorePresentation(source.read);
    const element = document.createElement("section"); document.body.append(element);
    const calls = [];
    const view = createCoreScoreView({ score: display.read, selection: selection.read,
      execute: () => ({ ok: true }), renderSnapshot: (snapshot, { signal }) =>
        new Promise(resolve => calls.push({ snapshot, signal, resolve })) });
    try {
      view.mount(element); await settle();
      const original = renderSelectionFixture(calls[0].snapshot); calls[0].resolve(original); await settle();
      const geometry = element.style.getPropertyValue("aspect-ratio");
      display.select({ kind: "tablature" }); await settle();
      assert.equal(element.querySelector(".score-view-svg"), original.svg);
      assert.equal(element.style.getPropertyValue("aspect-ratio"), geometry);
      assert.equal(element._scoreInteraction, undefined);
      assert.equal(element.getAttribute("aria-busy"), "true");
      display.select({ kind: "staff" }); await settle();
      assert.equal(calls[1].signal.aborted, true);
      const latest = renderSelectionFixture(calls[2].snapshot); calls[2].resolve(latest); await settle();
      calls[1].resolve(renderSelectionFixture(calls[1].snapshot)); await settle();
      assert.equal(element.querySelector(".score-view-svg"), latest.svg);
      assert.equal(element.dataset.notationKind, "staff");
      display.select({ kind: "tablature" }); await settle();
      calls[3].resolve(renderSelectionFixture(calls[3].snapshot)); await settle();
      assert.equal(element.dataset.notationKind, "tablature");
      assert.equal(element.getAttribute("aria-label"), "六线谱（Tab）");
      assert.equal(element.style.getPropertyValue("aspect-ratio"), geometry);
    } finally { view.dispose(); display.dispose(); selection.dispose(); source.dispose(); }
  }));

test("actual formal plugin renders its top-slot controls and keeps their instance across sidebar folding", () =>
  withTestDocument(async ({ document }) => {
    const source = createStaffProjectionPort({ snapshot: STAFF_FIXTURE, tablature: TABLATURE_FIXTURE });
    const { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
    const root = document.createElement("div"); document.body.append(root);
    const runtime = createWorkspaceRuntime({ root, plugins: [createCoreScorePlugin({ score: source.read })],
      requiredViewSlots: ["stage"], enableAnimations: false,
      pluginWiring: { prepare: prepareBackupPlugin, create: createBackupFormalPlatform,
        configure: (platform, plugins) => configureBackupFormalPlatform(platform, { plugins }) } });
    try {
      await settle();
      const cell = root.querySelector('[data-component="notation.core.presentation"]');
      assert.ok(cell); assert.equal(cell.dataset.variant, "top");
      const button = cell.querySelector('[data-notation-choice="tablature"]');
      assert.equal(button.disabled, false);
      button.click(); await settle();
      const paper = root.querySelector(".core-score-view");
      assert.equal(paper.dataset.notationKind, "tablature");
      const before = runtime.workspace.snapshot();
      assert.equal(runtime.execute("frame.workspace.region.toggle", { region: "top" }).ok, true);
      assert.equal(runtime.workspace.snapshot().topOpen, false);
      assert.equal(runtime.execute("frame.workspace.region.toggle", { region: "top" }).ok, true);
      assert.equal(runtime.workspace.snapshot().topOpen, true);
      assert.equal(root.querySelector('[data-component="notation.core.presentation"]'), cell);
      assert.equal(button.getAttribute("aria-pressed"), "true");
      assert.equal(runtime.workspace.snapshot().leftWidth, before.leftWidth);
      assert.equal(runtime.execute(SCORE_PRESENTATION_COMMAND, { kind: "staff" }).ok, true);
      await settle(); assert.equal(root.querySelector(".core-score-view"), paper);
      assert.equal(paper.dataset.notationKind, "staff");
    } finally { runtime.dispose(); source.dispose(); }
    assert.equal(root.childNodes.length, 0);
  }));

test("horizontal host uses declared default slots, reports visibility and releases both regions once", () => {
  const calls = [], elements = new Map();
  const entry = (id, defaultSlot) => ({ id, componentId: id, kind: "slotItem", slots: ["top", "bottom"], defaultSlot, minWidth: 32 });
  const catalog = createUiContributionCatalog({
    platform: { facets: () => [{ pluginId: "test", value: { modules: [
      { id: "test.top", componentId: "test.top", slots: ["top", "bottom"] },
      { id: "test.bottom", componentId: "test.bottom", slots: ["top", "bottom"] },
    ], pages: [] } }] },
    components: { get: id => ({ ...entry(id, id.endsWith("top") ? "top" : "bottom"), owner: "test", role: "status" }) },
  });
  const host = createHorizontalSlotPresentation({ catalog, components: {
    has: id => elements.has(id),
    ensure(id, variant) { calls.push(["mount", id, variant]);
      const element = { classList: { add() {} }, style: { setProperty() {} } }; elements.set(id, element); return element; },
    setVisible: (id, visible) => calls.push(["visible", id, visible]),
    release(id) { calls.push(["release", id]); elements.delete(id); },
  } });
  const region = () => ({ element: { append() {} } });
  const regions = { top: region(), bottom: region() };
  host.render({ topOpen: false, voiceOpen: false }, regions);
  assert.equal(calls.length, 0);
  host.render({ topOpen: true, voiceOpen: true }, regions);
  host.render({ topOpen: false, voiceOpen: false }, regions);
  host.render({ topOpen: true, voiceOpen: true }, regions);
  assert.deepEqual(calls.filter(item => item[0] === "mount"), [["mount", "test.top", "top"], ["mount", "test.bottom", "bottom"]]);
  host.dispose(); host.dispose();
  assert.equal(calls.filter(item => item[0] === "release").length, 2);
});
