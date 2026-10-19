import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createTablatureRenderer } from "../src/vendor/shared-notation/tablature-renderer.js";
import { layoutTablaturePages } from "../src/vendor/shared-notation/tablature-layout.js";
import { composeNotationPages } from "../src/vendor/shared-notation/compose-notation-pages.js";
import { createVexflowRenderer } from "../src/vendor/shared-notation/vexflow-renderer.js";
import { layoutScorePages } from "../src/vendor/shared-notation/score-page-layout.js";
import { renderTablature } from "../src/score/vexflow-tablature-renderer.js";
import { withEngravingDocument } from "./support/vexflow-test-environment.js";
import ts from "../../../node_modules/typescript/lib/typescript.js";

const theme = { ink: "#14161a", muted: "#62666d", fontFamily: "Academico" };
const note = (id, str, fret, base = 4, dots = 0) => ({ id, duration: { base, dots },
  content: { kind: "note", noteId: "note-" + id, position: { stringNumber: str, fret } } });
function tab(stringCount = 6, events = [note("e1", 1, 0), note("e2", stringCount, 12)]) {
  return { kind: "tablature", partId: "p", staffId: "s", tempoBpm: 96, stringCount, fretCount: 24, capoFret: 0,
    measures: [{ id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events }] };
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}

test("the real Tab renderer preserves long exact numeric ink and same-render hit bounds", () => withEngravingDocument(async ({ engine }) => {
  // Geometry-only projection: acceptance of these musical pitches remains the domain's job.
  const values = [67, 1000, Number.MAX_SAFE_INTEGER];
  const input = { ...tab(6, values.map((fret, index) => note("large-" + index, 6, fret))), fretCount: null };
  const page = layoutTablaturePages(input)[0];
  const drawing = await createTablatureRenderer(async () => engine).render(page, theme);
  const scale = page.staffSpace / engine.default.STAVE_LINE_DISTANCE;
  const digits = drawing.svg.querySelectorAll(".vf-tabnote").map(group => group.querySelector("text"));
  assert.deepEqual(digits.map(text => text.textContent), values.map(String));
  for (const [index, text] of digits.entries()) {
    const hit = drawing.interaction.events[index];
    const left = Number(text.getAttribute("x")) * scale;
    assert.equal(hit.content.noteId, "note-large-" + index);
    assert.ok(Number.isFinite(hit.width) && hit.width > 0);
    assert.ok(hit.x < left && hit.x + hit.width > left + text.textContent.length * 8 * scale);
  }
}));

for (const count of [4, 6]) {
  test(`real ${count}-line Tab draws 0/12 on their source strings with same-digit hit bounds`, () => withEngravingDocument(async ({ engine }) => {
    const input = tab(count), page = layoutTablaturePages(input)[0];
    const drawing = await createTablatureRenderer(async () => engine).render(page, theme);
    const lines = drawing.svg.querySelector(".vf-stave").querySelectorAll("path").filter(path => {
      const points = path.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
      return points.length === 4 && points[0] !== points[2] && points[1] === points[3];
    });
    assert.equal(lines.length, count);
    const measure = drawing.interaction.measures[0], scale = page.staffSpace / engine.default.STAVE_LINE_DISTANCE;
    assert.equal(measure.stringYs.length, count);
    close(measure.stringYs.at(-1), measure.staffBottom);
    for (let index = 1; index < count; index++) close(measure.stringYs[index] - measure.stringYs[index - 1], measure.lineSpacing);
    const digits = drawing.svg.querySelectorAll(".vf-tabnote").map(group => group.querySelector("text"));
    assert.deepEqual(digits.map(text => text.textContent), ["0", "12"]);
    for (const [index, text] of digits.entries()) {
      const geometry = drawing.interaction.events[index], position = input.measures[0].events[index].content.position;
      assert.equal(geometry.content.noteId, input.measures[0].events[index].content.noteId);
      // The explicit Canvas double has ascent 7 / descent 3. Center its ink,
      // not its old advance-height baseline; SVG serializes three decimals.
      close(Number(text.getAttribute("y")) * scale - (7 - 3) / 2 * scale,
        measure.stringYs[position.stringNumber - 1], 0.001);
      close(geometry.y + geometry.height / 2, measure.stringYs[position.stringNumber - 1]);
      const left = Number(text.getAttribute("x")) * scale;
      assert.ok(geometry.x < left && geometry.x + geometry.width > left + text.textContent.length * 8 * scale,
        "hit covers the exact measured digit element, including both digits");
      assert.equal(text.getAttribute("font-family"), "Academico", "numeric ink uses the entry's loaded text font");
    }
    const clef = drawing.svg.querySelector(".vf-clef").querySelector("text");
    assert.equal(clef.textContent, count === 4 ? engine.Glyphs.fourStringTabClef : engine.Glyphs.sixStringTabClef);
    assert.equal(drawing.svg.getAttribute("font-family"), "Bravura,Academico");
    assert.equal(drawing.svg.querySelector(".vf-notation-engraving").getAttribute("transform"), `scale(${scale})`);
  }));
}

test("Tab rests stay visible with distinct real whole/half/quarter/32nd glyphs; dots, flags and beams execute", () => withEngravingDocument(async ({ engine }) => {
  const events = [1, 2, 4, 32].map((base, i) => ({ id: "r" + i, duration: { base, dots: 0 }, content: { kind: "rest" } }));
  events.push(note("dotted", 2, 9, 8, 1), note("eighth", 3, 10, 8), note("sixteenth", 4, 11, 16));
  const page = layoutTablaturePages(tab(6, events))[0];
  const drawing = await createTablatureRenderer(async () => engine).render(page, theme);
  const rests = drawing.svg.querySelectorAll(".vf-stavenote");
  assert.equal(rests.length, 4);
  assert.equal(new Set(rests.map(rest => rest.querySelector("text").textContent)).size, 4);
  assert.ok(drawing.svg.querySelectorAll(".vf-tabnote").every(group => group.querySelector("text")));
  assert.ok(drawing.svg.querySelectorAll("text").some(text => text.textContent === engine.Glyphs.augmentationDot));
  assert.ok(drawing.svg.querySelectorAll(".vf-stem").length >= 1, "actual Tab stems execute");
  assert.equal(drawing.interaction.events.length, events.length);
  const offsets = drawing.interaction.anchors.filter(a => a.anchor.kind === "after-event").map(a => a.offsetUnits);
  assert.deepEqual(offsets, [64, 96, 112, 114, 126, 134, 138]);
  assert.ok(drawing.interaction.events.every(box => box.width > 0 && box.height > 0));
}));

test("empty Tab bars expose real lines, start/beat anchors and no invented music", () => withEngravingDocument(async ({ engine }) => {
  const drawing = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(tab(4, []))[0], theme);
  assert.equal(drawing.svg.querySelectorAll(".vf-tabnote").length, 0);
  assert.equal(drawing.svg.querySelectorAll(".vf-stavenote").length, 0);
  assert.deepEqual(drawing.interaction.anchors.map(a => a.offsetUnits), [0, 16, 32, 48]);
  assert.equal(drawing.interaction.events.length, 0);
  assert.ok(drawing.interaction.measures[0].stringYs.length === 4);
}));

test("unfinished and dotted Tab rhythm uses formatted tail tickables without drawing extra notes", () => withEngravingDocument(async ({ engine }) => {
  const drawing = await createTablatureRenderer(async () => engine).render(
    layoutTablaturePages(tab(6, [note("a", 1, 1, 8, 1), note("b", 6, 22, 16)]))[0], theme);
  assert.deepEqual(drawing.interaction.anchors.map(a => a.offsetUnits), [0, 12, 16, 32, 48]);
  assert.equal(drawing.svg.querySelectorAll(".vf-tabnote").length, 2);
  assert.ok(drawing.interaction.anchors.every(a => Number.isFinite(a.x) && Number.isFinite(a.y)));
}));

test("whole, half and quarter Tab notes have distinct stem rhythm instead of three identical digits", () => withEngravingDocument(async ({ engine }) => {
  const drawing = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(
    tab(6, [note("whole", 1, 5, 1), note("half", 1, 5, 2), note("quarter", 1, 5, 4)]))[0], theme);
  const groups = drawing.svg.querySelectorAll(".vf-tabnote");
  assert.equal(groups[0].querySelectorAll(".vf-stem").length, 0);
  const stemHeight = group => {
    const numbers = group.querySelector(".vf-stem").querySelector("path").getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
    return Math.abs(numbers[3] - numbers[1]);
  };
  assert.ok(stemHeight(groups[1]) > 0 && stemHeight(groups[1]) < stemHeight(groups[2]));
  assert.equal(drawing.svg.querySelector('[data-event-id="half"]').getAttribute("data-duration-base"), "2");
}));

test("compound-meter short Tab notes draw real grouped beams and ungrouped flags", () => withEngravingDocument(async ({ engine }) => {
  const input = tab(6, Array.from({ length: 6 }, (_, i) => note("b" + i, i + 1, i, 8)));
  input.measures[0].meter = { numerator: 6, denominator: 8 };
  const drawing = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(input)[0], theme);
  assert.equal(drawing.svg.querySelectorAll(".vf-beam").length, 2);
  const single = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(tab(4, [note("flag", 2, 2, 16)]))[0], theme);
  assert.ok(single.svg.querySelectorAll("text").some(text => text.textContent === engine.Glyphs.flag16thDown));
}));

test("overfull Tab flags the actual event hit without clipping or losing its rhythmic offset", () => withEngravingDocument(async ({ engine }) => {
  const input = tab(4, [note("full", 1, 1, 1), note("overflow", 4, 2)]);
  input.measures[0].ruleWarnings = [{ code: "rule.sequence-exceeds-measure",
    nominalDuration: { numerator: 1, denominator: 1 }, actualDuration: { numerator: 5, denominator: 4 },
    overflow: { numerator: 1, denominator: 4 } }];
  const drawing = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(input)[0], theme);
  const hit = drawing.svg.querySelector('[data-event-id="overflow"]');
  assert.equal(hit.getAttribute("data-rule-warning"), "overfull");
  assert.match(hit.querySelector("title").textContent, /超出 1 拍/);
  assert.equal(drawing.interaction.events.length, 2);
  assert.equal(drawing.interaction.anchors.at(-1).offsetUnits, 80);
}));

test("detached overfull Tab cannot mutate an adopted prior drawing with the same event IDs", () => withEngravingDocument(async ({ document, engine }) => {
  const prior = document.createElementNS("http://www.w3.org/2000/svg", "g");
  prior.setAttribute("id", "vf-event-overflow");
  document.body.append(prior);
  const input = tab(4, [note("full", 1, 1, 1), note("overflow", 4, 2)]);
  input.measures[0].ruleWarnings = [{ code: "rule.sequence-exceeds-measure",
    nominalDuration: { numerator: 1, denominator: 1 }, actualDuration: { numerator: 5, denominator: 4 },
    overflow: { numerator: 1, denominator: 4 } }];
  const drawing = await createTablatureRenderer(async () => engine).render(layoutTablaturePages(input)[0], theme);
  assert.equal(prior.getAttribute("data-rule-warning"), null);
  const current = drawing.svg.querySelector('[id="vf-event-overflow"]');
  assert.equal(current.getAttribute("data-rule-warning"), "overfull");
  assert.equal(prior.parentNode, document.body);
}));

test("multiple Tab pages retain engine roots and shift strings/events/anchors by the same offset", () => withEngravingDocument(async ({ engine }) => {
  const input = tab();
  input.measures = Array.from({ length: 160 }, (_, i) => ({ id: "m" + i, voiceId: "v" + i, meter: { numerator: 4, denominator: 4 },
    ruleWarnings: [], events: [note("e-" + i, i % 6 + 1, i % 24)] }));
  const pages = layoutTablaturePages(input);
  assert.ok(pages.length > 1);
  const renderer = createTablatureRenderer(async () => engine);
  const drawings = [];
  for (const page of pages) drawings.push(await renderer.render(page, theme));
  const merged = composeNotationPages(pages, drawings);
  assert.equal(merged.svg.querySelectorAll("svg").length, pages.length);
  assert.equal(merged.interaction.events.length, 160);
  const offset = pages[0].height + 20, measure = merged.interaction.measures.find(m => m.pageIndex === 1);
  const original = drawings[1].interaction.measures[0];
  close(measure.y, original.y + offset); close(measure.staffBottom, original.staffBottom + offset);
  assert.deepEqual(measure.stringYs, original.stringYs.map(y => y + offset));
  const anchor = merged.interaction.anchors.find(a => a.pageIndex === 1), oldAnchor = drawings[1].interaction.anchors[0];
  close(anchor.y1, oldAnchor.y1 + offset); close(anchor.y2, oldAnchor.y2 + offset);
  const event = merged.interaction.events.find(e => e.pageIndex === 1);
  close(event.y, drawings[1].interaction.events[0].y + offset);
  const pageGroups = merged.svg.querySelectorAll("[data-score-page]");
  assert.equal(pageGroups[1].getAttribute("transform"), `translate(0 ${offset})`);
  assert.equal(pageGroups[1].children[1], drawings[1].svg, "adopt the complete root object");
  assert.equal(drawings[1].svg.getAttribute("font-family"), drawings[0].svg.getAttribute("font-family"));
}));

test("Tab and staff engine waits cancel promptly and observe late rejection without adopting a drawing", () => withEngravingDocument(async ({ document }) => {
  for (const [renderer, layout] of [
    [createTablatureRenderer, layoutTablaturePages(tab())[0]],
    [createVexflowRenderer, { width: 700, height: 990, clef: "treble", tempoBpm: 96, measures: [] }],
  ]) {
    let reject, loadCount = 0;
    const controller = new AbortController();
    const pending = renderer(() => { loadCount++; return new Promise((_resolve, failure) => { reject = failure; }); })
      .render(layout, theme, controller.signal);
    await Promise.resolve(); await Promise.resolve(); assert.equal(loadCount, 1);
    controller.abort(); await assert.rejects(pending, { name: "AbortError" });
    reject(new Error("late load failure")); await Promise.resolve(); await Promise.resolve();
    assert.equal(document.body.querySelectorAll("svg").length, 0);
    const before = new AbortController(); before.abort();
    await assert.rejects(renderer(() => { throw new Error("must not load"); }).render(layout, theme, before.signal), { name: "AbortError" });
  }
}));

test("cancel during engraving never publishes the completed Tab or adopts cancelled pages", () => withEngravingDocument(async ({ engine }) => {
  const controller = new AbortController(), original = engine.TabNote.prototype.draw;
  engine.TabNote.prototype.draw = function () { original.call(this); controller.abort(); };
  try {
    await assert.rejects(createTablatureRenderer(async () => engine).render(layoutTablaturePages(tab())[0], theme, controller.signal),
      { name: "AbortError" });
    assert.throws(() => composeNotationPages([], [], controller.signal), { name: "AbortError" });
  } finally { engine.TabNote.prototype.draw = original; }
}));

test("engine synchronous throws and async failures reject through the same render promise", async () => {
  const page = layoutTablaturePages(tab())[0];
  for (const load of [() => { throw new Error("font failed"); }, () => Promise.reject(new Error("font failed"))]) {
    await assert.rejects(createTablatureRenderer(load).render(page, theme), /font failed/);
  }
});

test("backup Tab drawing port validates before loading and uses the original two-font entry", () => withEngravingDocument(async ({ document, engine }) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "VexFlow"), loaded = [];
  Object.defineProperty(globalThis, "VexFlow", { configurable: true, value: engine.default });
  document.fonts = { load: async name => { loaded.push(name); return [{ status: "loaded" }]; } };
  try {
    await assert.rejects(renderTablature({ ...tab(), stringCount: 0 }), /Invalid tablature view/);
    assert.deepEqual(loaded, []);
    const drawing = await renderTablature(tab(4));
    assert.equal(drawing.interaction.measures[0].stringYs.length, 4);
    assert.equal(drawing.interaction.events.length, 2);
    assert.equal(drawing.svg.querySelectorAll("svg").length, 1);
    assert.deepEqual(loaded, ["40px Bravura", "12px Academico"]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "VexFlow", previous); else delete globalThis.VexFlow;
  }
}));

test("shared pagination extraction retains the accepted staff page geometry on all real capacity inputs", async () => {
  const reference = JSON.parse(await readFile(new URL("../evidence/tablature-rendering-20261011/staff-layout-before.json", import.meta.url), "utf8"));
  for (const item of reference) {
    const input = JSON.parse(await readFile(new URL("../evidence/document-capacity-20261008/run-02/" + item.projectionFile, import.meta.url), "utf8"));
    const pages = layoutScorePages(input);
    assert.equal(pages.length, item.pages);
    assert.equal(createHash("sha256").update(JSON.stringify(sorted(pages))).digest("hex"), item.sha256);
  }
});

test("shared surface and rhythm extraction preserve original staff glyph positions and interaction", () => withEngravingDocument(async ({ engine }) => {
  const before = await readFile(new URL("../evidence/tablature-rendering-20261011/before/shared__notation__vexflow-renderer.ts", import.meta.url), "utf8");
  const baseline = ts.transpileModule(before, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
    .outputText.replace(/from "\.\/([^"]+)\.ts"/g, (_match, name) =>
      `from "${new URL("../src/vendor/shared-notation/" + name + ".js", import.meta.url).href}"`);
  const oldRenderer = (await import("data:text/javascript;base64," + Buffer.from(baseline).toString("base64"))).createVexflowRenderer(async () => engine);
  const newRenderer = createVexflowRenderer(async () => engine);
  for (const filename of ["empty", "staff-16"]) {
    const input = JSON.parse(await readFile(new URL("../evidence/document-capacity-20261008/run-02/" + filename + ".projection.json", import.meta.url), "utf8"));
    const page = layoutScorePages(input)[0];
    const first = await oldRenderer.render(page, theme), second = await newRenderer.render(page, theme);
    assert.deepEqual(second.interaction, first.interaction);
    const glyphs = svg => svg.querySelectorAll("text").map(text => ({
      text: text.textContent, x: text.getAttribute("x"), y: text.getAttribute("y"),
      font: text.getAttribute("font-family"), size: text.getAttribute("font-size"),
    }));
    assert.deepEqual(glyphs(second.svg), glyphs(first.svg));
    assert.deepEqual(second.svg.querySelectorAll("path").map(path => path.getAttribute("d")),
      first.svg.querySelectorAll("path").map(path => path.getAttribute("d")));
  }
}));

test("shared Tab source never imports the workbench, guitar, UI router or React", async () => {
  for (const name of await readdir(new URL("../../../shared/notation/", import.meta.url))) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(new URL("../../../shared/notation/" + name, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from|import)\s*(?:\([^)]*)?["'][^"']*(?:apps\/workbench|modules\/guitar|react|ui\/command-router)/);
  }
});
