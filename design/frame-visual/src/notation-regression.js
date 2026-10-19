import { ENGRAVING_CASES } from "./fixtures/engraving-regression.js";
import { renderStaff } from "./score/vexflow-staff-renderer.js";
import { runTablatureRegression } from "./tablature-regression.js";

const results = document.getElementById("results");
const checks = [];
const assert = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const approx = (a, b) => Math.abs(a - b) < 0.001;
try {
  const tabOnly = new URLSearchParams(location.search).get("notation") === "tablature";
  if (tabOnly) {
    document.title = "六线谱记谱回归";
    document.querySelector("h1").textContent = "六线谱记谱回归";
    checks.push(...await runTablatureRegression(document.getElementById("cases")));
  }
  for (const fixture of tabOnly ? [] : ENGRAVING_CASES) {
    const drawing = await renderStaff(fixture.snapshot);
    const article = document.createElement("article");
    article.id = fixture.id;
    const title = document.createElement("h2");
    title.textContent = fixture.title;
    const viewport = document.createElement("div");
    viewport.className = "drawing";
    viewport.append(drawing.svg);
    article.append(title, viewport);
    document.getElementById("cases").append(article);
    const pageRoots = [...drawing.svg.querySelectorAll("[data-score-page] > svg")];
    assert(`${fixture.id}: complete engine SVG roots retained`, pageRoots.length === drawing.layout.pages.length
      && pageRoots.every(page => page.getAttribute("font-family")?.includes("Bravura")));
    const musicTexts = [...drawing.svg.querySelectorAll("text")].filter(text => /[\uE000-\uF8FF]/u.test(text.textContent));
    assert(`${fixture.id}: rendered music uses Bravura`, musicTexts.length > 0
      && musicTexts.every(text => getComputedStyle(text).fontFamily.split(",")[0].replaceAll('"', '').trim() === "Bravura"));
    const expected = fixture.snapshot.measures.flatMap(measure => measure.events.map(event => event.id));
    assert(`${fixture.id}: event identity/geometry`, JSON.stringify(drawing.interaction.events.map(event => event.eventId)) === JSON.stringify(expected));
    assert(`${fixture.id}: SVG hit rectangles`, drawing.svg.querySelectorAll("[data-event-id]").length === expected.length);
    assert(`${fixture.id}: geometry stays inside page`, drawing.interaction.events.every(event => event.y >= 0 && event.y + event.height <= drawing.layout.height));
    const centerY = id => { const event = drawing.interaction.events.find(event => event.eventId === id); return event.y + event.height / 2; };
    const renderedEvent = id => [...drawing.svg.querySelectorAll(".vf-stavenote")].find(note => note.id === `vf-event-${id}`);
    const eventGlyphs = id => renderedEvent(id)?.textContent ?? "";
    const glyphY = (id, glyph) => {
      const text = [...(renderedEvent(id)?.querySelectorAll("text") ?? [])].find(node => node.textContent === glyph);
      if (!text) return NaN;
      const point = new DOMPoint(Number(text.getAttribute("x")), Number(text.getAttribute("y")));
      return point.matrixTransform(drawing.svg.getScreenCTM().inverse().multiply(text.getScreenCTM())).y;
    };
    const measure = drawing.interaction.measures[0];
    if (fixture.id === "pitch") {
      assert("E4 bottom line", approx(centerY("pitch-e4"), measure.staffBottom));
      assert("F5 top line", approx(centerY("pitch-f5"), measure.staffBottom - 4 * measure.lineSpacing));
      assert("C4 lower ledger line", approx(centerY("pitch-c4"), measure.staffBottom + measure.lineSpacing));
      assert("A5 upper ledger line", approx(centerY("pitch-a5"), measure.staffBottom - 5 * measure.lineSpacing));
      for (const id of ["pitch-c4", "pitch-e4", "pitch-f5", "pitch-a5"]) {
        assert(`${id}: final notehead baseline matches pitch`, approx(glyphY(id, "\uE0A4"), centerY(id)));
      }
    }
    if (fixture.id === "rests") {
      assert("whole rest at fourth line", approx(centerY("whole-r"), measure.staffBottom - 3 * measure.lineSpacing));
      const half = drawing.interaction.measures[1];
      assert("half rest at third line", approx(centerY("half-r1"), half.staffBottom - 2 * half.lineSpacing));
      assert("whole rest uses hanging glyph at fourth line", approx(glyphY("whole-r", "\uE4E3"), measure.staffBottom - 3 * measure.lineSpacing));
      assert("half rest uses standing glyph at third line", approx(glyphY("half-r1", "\uE4E4"), half.staffBottom - 2 * half.lineSpacing));
    }
    if (fixture.id === "durations") {
      assert("whole note uses open whole head", eventGlyphs("whole-e-0").includes("\uE0A2"));
      assert("half note uses open half head", eventGlyphs("half-e-0").includes("\uE0A3"));
      assert("quarter note uses filled head", eventGlyphs("quarter-e-0").includes("\uE0A4"));
      const beams = [...drawing.svg.querySelectorAll(".vf-beam")];
      assert("eighth notes have one beam; sixteenth notes have two", beams.length === 8
        && beams.slice(0, 4).every(beam => beam.querySelectorAll(':scope > path').length === 1)
        && beams.slice(4).every(beam => beam.querySelectorAll(':scope > path').length === 2));
    }
    if (fixture.id === "dotted") assert("dotted note contains augmentation dot", eventGlyphs("dotted-e").includes("\uE1E7"));
    const accidentals = id => [...eventGlyphs(id)].filter(glyph => ["\uE260", "\uE261", "\uE262"].includes(glyph)).join("");
    if (fixture.id === "sharp-key") {
      assert("G key inherits F sharp without repeated accidental", accidentals("sharp-1") === "" && accidentals("sharp-2") === "");
      assert("G key natural and returning sharp are explicit", accidentals("natural-1") === "\uE261" && accidentals("sharp-3") === "\uE262");
      assert("new measure resets to key signature", accidentals("sharp-reset") === "");
    }
    if (fixture.id === "flat") assert("flat context suppresses repetition and restores natural", accidentals("flat-1") === "\uE260"
      && accidentals("flat-2") === "" && accidentals("flat-natural") === "\uE261" && accidentals("flat-3") === "\uE260");
    if (fixture.id === "simple" || fixture.id === "compound") {
      assert(`${fixture.id}: beam group count`, drawing.svg.querySelectorAll(".vf-beam").length === (fixture.id === "simple" ? 4 : 2));
      const groupSize = fixture.id === "simple" ? 2 : 3;
      assert(`${fixture.id}: actual beam membership`, [...drawing.svg.querySelectorAll(".vf-beam")]
        .every(beam => beam.querySelectorAll(".vf-stem").length === groupSize));
    }
    if (fixture.id === "empty") {
      assert("empty measure has four beat anchors", drawing.interaction.anchors.length === 4);
      assert("empty measure has no stave notes", drawing.svg.querySelectorAll(".vf-stavenote").length === 0);
    }
    if (fixture.id === "overflow") assert("only fifth event marked overfull", drawing.svg.querySelectorAll('[data-rule-warning="overfull"]').length === 1);
    if (fixture.id === "pages") {
      assert("long score has multiple A4 pages", drawing.layout.pages.length > 1 && drawing.layout.pages.every(page => page.width === 700 && page.height === 990));
      assert("page geometry follows page offset", drawing.interaction.measures.filter(item => item.pageIndex > 0).every(item => item.y >= item.pageIndex * 1010));
    }
  }
  assert("Bravura and Academico loaded", ["Bravura", "Academico"].every(name => [...document.fonts].some(font => font.family.replaceAll('"', '') === name && font.status === "loaded")));
  const failures = checks.filter(check => !check.passed);
  results.dataset.testState = failures.length ? "failed" : "passed";
  results.textContent = `${checks.length - failures.length}/${checks.length} checks passed\n` + (failures.length ? failures.map(check => `FAIL: ${check.name}`).join("\n") : "浏览器坐标与结构检查通过；字形及连梁仍需截图人工核对。");
  const evidence = document.createElement("script");
  evidence.type = "application/json";
  evidence.id = "regression-evidence";
  evidence.textContent = JSON.stringify(checks);
  document.body.append(evidence);
} catch (error) {
  results.dataset.testState = "failed";
  results.textContent = error.stack ?? String(error);
}
