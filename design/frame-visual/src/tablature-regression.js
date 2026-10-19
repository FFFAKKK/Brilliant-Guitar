import { TABLATURE_ENGRAVING_CASES } from "./fixtures/tablature-engraving-regression.js";
import { renderTablature } from "./score/vexflow-tablature-renderer.js";

// Actual browser/font checks. DOM doubles cannot validate ink or line knockouts.
export async function runTablatureRegression(root) {
  const checks = [];
  const assert = (name, condition) => checks.push({ name, passed: Boolean(condition) });
  const textContext = document.createElement("canvas").getContext("2d");
  const boundsInDrawing = (element, svg) => {
    let box = element.getBBox();
    if (element.tagName.toLowerCase() === "text") {
      // SVG getBBox includes the font's entire em/line box. Bravura's is much
      // taller than its rest ink; compare actual ink at the rendered baseline.
      const style = getComputedStyle(element);
      textContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = textContext.measureText(element.textContent);
      box = { x: Number(element.getAttribute("x")) - metrics.actualBoundingBoxLeft,
        y: Number(element.getAttribute("y")) - metrics.actualBoundingBoxAscent,
        width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
        height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
    }
    const matrix = svg.getScreenCTM().inverse().multiply(element.getScreenCTM());
    const start = new DOMPoint(box.x, box.y).matrixTransform(matrix);
    const end = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
    return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
  };
  for (const fixture of TABLATURE_ENGRAVING_CASES) {
    const drawing = await renderTablature(fixture.snapshot);
    const article = document.createElement("article");
    article.id = fixture.id;
    const title = document.createElement("h2"); title.textContent = fixture.title;
    const viewport = document.createElement("div"); viewport.className = "drawing"; viewport.append(drawing.svg);
    article.append(title, viewport); root.append(article);
    const renderedEvents = [...drawing.svg.querySelectorAll(".vf-tabnote,.vf-stavenote")];
    for (const measure of fixture.snapshot.measures) for (const event of measure.events) {
      const geometry = drawing.interaction.events.find(item => item.eventId === event.id);
      const measureGeometry = drawing.interaction.measures.find(item => item.measureId === measure.id);
      const group = renderedEvents.find(item => item.id === `vf-event-${event.id}`);
      const glyph = [...(group?.querySelectorAll("text") ?? [])]
        .find(text => event.content.kind === "note" ? text.textContent === String(event.content.position.fret)
          : /[\uE4E0-\uE4FF]/u.test(text.textContent));
      assert(`${event.id}: actual glyph and accepted identity`, glyph && geometry && measureGeometry);
      if (!glyph || !geometry || !measureGeometry) continue;
      const ink = boundsInDrawing(glyph, drawing.svg);
      // SVG font bounds and canvas ink metrics can differ slightly by engine.
      const tolerance = 1;
      assert(`${event.id}: hit covers actual ink`, ink.x >= geometry.x - tolerance
        && ink.x + ink.width <= geometry.x + geometry.width + tolerance
        && ink.y >= geometry.y - tolerance && ink.y + ink.height <= geometry.y + geometry.height + tolerance);
      if (event.content.kind === "note") {
        const stringY = measureGeometry.stringYs[event.content.position.stringNumber - 1];
        assert(`${event.id}: ink centered on declared string`, Math.abs(ink.y + ink.height / 2 - stringY) < tolerance);
        assert(`${event.id}: fret numeral remains readable relative to string spacing`,
          ink.height / measureGeometry.lineSpacing >= 0.72 && ink.height / measureGeometry.lineSpacing <= 1.12);
        const knockout = group.querySelector("rect");
        const mask = knockout && boundsInDrawing(knockout, drawing.svg);
        assert(`${event.id}: measured line knockout`, mask && mask.y <= ink.y + tolerance
          && mask.y + mask.height >= ink.y + ink.height - tolerance
          && mask.x <= ink.x + tolerance && mask.x + mask.width >= ink.x + ink.width - tolerance);
        assert(`${event.id}: long-note enclosure preserves whole and half distinction`,
          Boolean(group.querySelector(".vf-tab-long-duration")) === [1, 2].includes(event.duration.base));
        if (event.duration.base !== 1 && event.content.position.stringNumber < fixture.snapshot.stringCount) {
          assert(`${event.id}: rhythm extends from the note's string`,
            [...group.querySelectorAll(":scope > path")].some(path => boundsInDrawing(path, drawing.svg).y < measureGeometry.staffBottom));
        }
      } else {
        const centerLine = Math.floor((fixture.snapshot.stringCount - 1) / 2);
        const supportY = measureGeometry.stringYs[centerLine - (event.duration.base === 1 ? 1 : 0)];
        const baseline = new DOMPoint(Number(glyph.getAttribute("x")), Number(glyph.getAttribute("y")))
          .matrixTransform(drawing.svg.getScreenCTM().inverse().multiply(glyph.getScreenCTM())).y;
        assert(`${event.id}: rest baseline uses central strings`, Math.abs(baseline - supportY) < tolerance);
        assert(`${event.id}: rest ink inside Tab staff`, ink.y >= measureGeometry.stringYs[0] - tolerance
          && ink.y + ink.height <= measureGeometry.staffBottom + tolerance);
        if ([1, 2].includes(event.duration.base)) {
          assert(`${event.id}: whole hangs and half stands on a real string`, event.duration.base === 1
            ? Math.abs(ink.y - supportY) < tolerance && ink.y + ink.height > supportY
            : ink.y < supportY && Math.abs(ink.y + ink.height - supportY) < tolerance);
        } else {
          const knockout = group.querySelector("rect");
          const mask = knockout && boundsInDrawing(knockout, drawing.svg);
          assert(`${event.id}: strings knocked out behind rest ink`, mask && mask.y <= ink.y + tolerance
            && mask.y + mask.height >= ink.y + ink.height - tolerance
            && mask.x <= ink.x + tolerance && mask.x + mask.width >= ink.x + ink.width - tolerance);
        }
      }
      const stems = [...(group.querySelectorAll(".vf-stem path"))];
      assert(`${event.id}: stems below strings`, stems.every(path =>
        boundsInDrawing(path, drawing.svg).y > measureGeometry.staffBottom));
      if (event.duration.dots) {
        const dot = [...group.querySelectorAll("text")].find(text => text.textContent === "\uE1E7");
        assert(`${event.id}: augmentation dot retained`, dot);
        if (dot && event.content.kind === "rest") {
          const dotInk = boundsInDrawing(dot, drawing.svg);
          assert(`${event.id}: rest dot shares music font and scale`,
            getComputedStyle(dot).fontFamily === getComputedStyle(glyph).fontFamily
            && getComputedStyle(dot).fontSize === getComputedStyle(glyph).fontSize);
          assert(`${event.id}: rest dot sits right of ink`, dotInk.x > ink.x + ink.width);
          assert(`${event.id}: rest dot clear of strings`, measureGeometry.stringYs.every(y =>
            y < dotInk.y - tolerance || y > dotInk.y + dotInk.height + tolerance));
          assert(`${event.id}: hit covers rest dot`, dotInk.x + dotInk.width <= geometry.x + geometry.width + tolerance
            && dotInk.y >= geometry.y - tolerance && dotInk.y + dotInk.height <= geometry.y + geometry.height + tolerance);
        }
      }
    }
    assert(`${fixture.id}: geometry and rhythm inside pages`, drawing.interaction.events.every(event => {
      const measure = drawing.interaction.measures.find(item => item.measureId === event.measureId);
      return event.y >= measure.pageIndex * 1010 && event.y + event.height <= measure.pageIndex * 1010 + 990;
    }));
    for (const page of drawing.layout.pages) {
      for (const system of new Set(page.measures.map(measure => measure.system))) {
        const row = page.measures.filter(measure => measure.system === system);
        assert(`${fixture.id}: system ${system} fills paper margins`,
          Math.abs(row[0].x - 60) < 0.001 && Math.abs(row.at(-1).x + row.at(-1).width - 640) < 0.001);
      }
    }
    const beams = [...drawing.svg.querySelectorAll(".vf-beam")];
    assert(`${fixture.id}: beam ink below strings`, beams.every(beam => {
      const ink = boundsInDrawing(beam, drawing.svg);
      const measure = drawing.interaction.measures.find(item => ink.x >= item.x && ink.x < item.x + item.width
        && ink.y >= item.staffBottom && ink.y <= item.y + item.height);
      return Boolean(measure);
    }));
    if (fixture.id === "tab-durations") assert("Tab eighth/sixteenth beam groups retained", beams.length === 8);
    if (fixture.id === "tab-rests") assert("whole/half use ordinary rest glyphs on existing strings",
      drawing.svg.textContent.includes("\uE4E3") && drawing.svg.textContent.includes("\uE4E4")
      && !drawing.svg.textContent.includes("\uE4F4") && !drawing.svg.textContent.includes("\uE4F5"));
    if (fixture.id === "tab-pages") assert("Tab system rhythm reserve survives pagination", drawing.layout.pages.length > 1);
  }
  return checks;
}
