import type { EditAnchorGeometry, EventGeometry, MeasureGeometry, NotationRenderer } from "./notation-renderer.ts";
import type { TablatureEvent } from "./tablature-model.ts";
import type { TablatureLayout } from "./tablature-layout.ts";
import { overfullEventIds } from "./overfull-events.ts";
import { describeMeasureRuleWarnings } from "./rule-warning-description.ts";
import { capacityUnits, durationUnits } from "./note-properties.ts";
import { eventNoteSpec } from "./vexflow-note-spec.ts";
import { rhythmicAnchors, trailingGhostDurations } from "./rhythmic-anchors.ts";
import { createEngravingSurface, loadNotationEngine, throwIfRenderAborted } from "./vexflow-surface.ts";
import type { EngravingEngine } from "./vexflow-surface.ts";

export interface TablatureEventGeometry extends EventGeometry {
  readonly content: TablatureEvent["content"];
}
export interface TablatureMeasureGeometry extends MeasureGeometry {
  readonly stringYs: readonly number[];
}
export interface TablatureInteractionGeometry {
  readonly anchors: readonly EditAnchorGeometry[];
  readonly events: readonly TablatureEventGeometry[];
  readonly measures: readonly TablatureMeasureGeometry[];
}

/** Single-note/rest rendering; input is the validated instrument-neutral projection. */
export function createTablatureRenderer(load: () => Promise<EngravingEngine>):
  NotationRenderer<TablatureLayout, TablatureInteractionGeometry> {
  return { async render(layout, theme, signal) {
    const engine = await loadNotationEngine(load, signal);
    throwIfRenderAborted(signal);
    const { TabStave, TabNote, StaveNote, GhostNote, Voice, Formatter, Beam, Dot, Clef, BarlineType, Stem } = engine;
    const { Glyphs } = engine.default;
    // GP8's below-staff rhythm lane is for stems/beams, not rests.
    // Keep the rest baseline on the upper central string. VexFlow's R key
    // moves a whole rest one line above a half rest, preserving hang/stand.
    class TablatureStave extends TabStave {
      override getYForNote(line: number): number {
        return this.getYForLine(Math.floor((this.getNumLines() - 1) / 2) + 3 - line);
      }
    }
    class TablatureRest extends StaveNote {
      declare private restHead: InstanceType<typeof engine.NoteHead>;
      override buildNoteHeads() {
        // One font for the head and its attached dot. At this size a quarter
        // rest occupies roughly two Tab spaces, matching the reference sample.
        this.setFont({ ...this.fontInfo, size: "36px" });
        const heads = super.buildNoteHeads();
        this.restHead = heads[0]!;
        return heads;
      }
      override getGlyphWidth(): number {
        // Bravura's eighth-rest hook extends beyond its advance width.
        // Reserve that ink during formatting as well as during hit testing,
        // so the engine places a dot to its right instead of over the hook.
        return Math.max(this.restHead.getWidth(), this.restHead.getTextMetrics().actualBoundingBoxRight);
      }
      override drawNoteHeads(): void {
        const head = this.restHead, metrics = head.getTextMetrics();
        // Whole/half rests use the actual supporting string, not a ledger
        // glyph. Other rests need a narrow knockout so strings cannot cut
        // through their ink. Use the same metrics as the accepted hit bounds.
        if (!["1", "2"].includes(this.duration)) {
          const padding = 1.5;
          this.checkContext().clearRect(this.getNoteHeadBeginX() - metrics.actualBoundingBoxLeft - padding,
            head.getY() + head.getYShift() - metrics.actualBoundingBoxAscent - padding,
            metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + padding * 2,
            metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + padding * 2);
        }
        super.drawNoteHeads();
      }
      inkBounds() {
        // VexFlow retains old children after formatting resets. Capture the
        // current head from buildNoteHeads rather than searching those children.
        const head = this.restHead;
        const metrics = head.getTextMetrics(), box = this.getBoundingBox(), headBox = head.getBoundingBox();
        // Element's advance-width box omits the ledger glyph's side bearings.
        // Keep modifiers in the union, and include the actual rendered ink.
        // NoteHead has no independent TickContext; its drawn box carries the
        // absolute X assigned by StaveNote.draw, unlike inherited Note.getX().
        const x = Math.min(box.getX(), headBox.getX() - metrics.actualBoundingBoxLeft);
        const y = Math.min(box.getY(), headBox.getY());
        const right = Math.max(box.getX() + box.getW(), headBox.getX() + metrics.actualBoundingBoxRight);
        const bottom = Math.max(box.getY() + box.getH(), headBox.getY() + metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
        return { x, y, width: right - x, height: bottom - y };
      }
    }
    // VexFlow's TabNote bounding box is inherited from an empty Element, not its digits.
    // Read the actual digit Element used by drawPositions; do not measure a second label.
    class PositionedTabNote extends TabNote {
      override updateWidth(): void {
        super.updateWidth();
        this.width = 0;
        for (const digit of this.fretElement) {
          // Keep the caller's loaded font; the larger engraving size and ink
          // centering must not replace the public theme with a system font.
          digit.setFont({ ...digit.fontInfo, family: theme.fontFamily, size: "16px" });
          const metrics = digit.getTextMetrics();
          // Center the ink rather than the advance width or a guessed baseline.
          digit.setYShift((metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
          digit.setXShift((metrics.width + metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2);
          this.width = Math.max(this.width, digit.getWidth() + (["1", "2"].includes(this.duration) ? 6 : 0));
        }
      }
      digitBounds() {
        const digit = this.fretElement[0]!;
        const metrics = digit.getTextMetrics();
        const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
        const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        return { x: this.getAbsoluteX() - width / 2,
          y: this.getYs()[0]! + this.renderOptions.yShift - height / 2, width, height };
      }
      override drawPositions(): void {
        const ctx = this.checkContext(), bounds = this.digitBounds();
        const padding = ["1", "2"].includes(this.duration) ? 3 : 1.5;
        // VexFlow's fixed 6px knockout does not cover the measured digit ink.
        ctx.clearRect(bounds.x - padding, bounds.y - padding,
          bounds.width + padding * 2, bounds.height + padding * 2);
        const digit = this.fretElement[0]!;
        digit.renderText(ctx, this.getAbsoluteX() - digit.getWidth() / 2,
          this.getYs()[0]! + this.renderOptions.yShift);
        // GP8 offers enclosures for both whole and half notes. A half note
        // retains its stem; a whole note has none, so duration stays distinct.
        if (["1", "2"].includes(this.duration)) {
          const group = ctx.openGroup("tab-long-duration");
          if (!group) throw new Error("Tab long-note marker returned no SVG group");
          const ring = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
          for (const [name, value] of Object.entries({ cx: this.getAbsoluteX(),
            cy: this.getYs()[0]! + this.renderOptions.yShift,
            rx: bounds.width / 2 + 2, ry: bounds.height / 2 + 2 })) ring.setAttribute(name, String(value));
          ring.setAttribute("fill", "none"); ring.setAttribute("stroke", theme.ink);
          ring.setAttribute("stroke-width", "1");
          group.appendChild(ring); ctx.closeGroup();
        }
      }
    }
    const { staging, context, scale, drawing } = createEngravingSurface(engine, layout, theme);
    const anchors: EditAnchorGeometry[] = [], events: TablatureEventGeometry[] = [], measures: TablatureMeasureGeometry[] = [];
    for (const paperMeasure of layout.measures) {
      throwIfRenderAborted(signal);
      const item = { ...paperMeasure, x: paperMeasure.x / scale, y: paperMeasure.y / scale, width: paperMeasure.width / scale };
      const stave = new TablatureStave(item.x, item.y, item.width, { numLines: layout.stringCount });
      if (!item.beginsSystem) stave.setBegBarType(BarlineType.NONE);
      if (item.beginsSystem && [4, 6].includes(layout.stringCount)) {
        const clef = new Clef("tab");
        clef.line = (layout.stringCount - 1) / 2;
        if (layout.stringCount === 4) clef.setText(Glyphs.fourStringTabClef);
        stave.addModifier(clef);
      }
      if (item.showMeter) stave.addTimeSignature(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`);
      if (item.number === 1 && item.beginsSystem) stave.setTempo({ duration: "q", bpm: layout.tempoBpm }, -30);
      stave.setContext(context).draw();
      const spacing = stave.getSpacingBetweenLines();
      const stringYs = Array.from({ length: layout.stringCount }, (_value, index) => stave.getYForLine(index));
      const cursorY = (stringYs[0]! + stringYs.at(-1)!) / 2;
      const noteStart = stave.getNoteStartX() + 8, noteEnd = stave.getNoteEndX() - 3;
      const used = item.measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
      let tailX = noteStart + (noteEnd - noteStart) * Math.min(1, used / capacityUnits(item.measure));
      let tailY = cursorY;
      const notes = item.measure.events.map(event => {
        const note = event.content.kind === "note"
          ? new PositionedTabNote({ positions: [{ str: event.content.position.stringNumber, fret: event.content.position.fret }],
            duration: `${event.duration.base}${event.duration.dots ? "d" : ""}`,
            stemDirection: Stem.DOWN }, event.duration.base !== 1)
          : new TablatureRest(eventNoteSpec({ ...event, content: { kind: "rest" } }));
        if (note instanceof PositionedTabNote) {
          // Stem-only Tab rhythm: whole has no stem, half has a shorter stem than quarter.
          // Otherwise TabNote(true) draws the same stem for whole/half/quarter.
          note.renderOptions.drawDots = true;
          note.renderOptions.drawStemThroughStave = true;
          if (event.duration.base === 2) {
            note.setStemLength(Stem.HEIGHT / 2);
            note.checkStem().setExtension(note.getStemExtension());
          }
        }
        if (event.duration.dots) Dot.buildAndAttach([note]);
        note.setAttribute("id", `event-${event.id}`);
        return note;
      });
      const overfull = overfullEventIds(item.measure);
      const warning = describeMeasureRuleWarnings(item.number, item.measure);
      if (notes.length) {
        const ghosts = trailingGhostDurations(item.measure).map(duration => new GhostNote(duration));
        const voice = new Voice({ numBeats: item.measure.meter.numerator, beatValue: item.measure.meter.denominator })
          .setMode(Voice.Mode.SOFT).addTickables([...notes, ...ghosts]);
        const beams = Beam.generateBeams(notes, {
          groups: Beam.getDefaultBeamGroups(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`),
          maintainStemDirections: true,
        });
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(context, stave);
        beams.forEach(beam => beam.setContext(context).draw());
        tailX = ghosts[0]?.getAbsoluteX() ?? noteEnd;
        tailY = notes.at(-1)?.getYs()[0] ?? cursorY;
      }
      const centers = notes.map(note => ({ x: note instanceof PositionedTabNote
        ? note.getAbsoluteX() : (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2,
        y: note.getYs()[0] ?? cursorY }));
      anchors.push(...rhythmicAnchors(item.measure, { noteStart, noteEnd, centers, tailX, tailY, cursorY, lineSpacing: spacing, scale }));
      const top = stringYs[0]! - spacing * 5, bottom = stringYs.at(-1)! + spacing * 6;
      measures.push({ measureId: item.measure.id, x: item.x * scale, y: top * scale,
        width: item.width * scale, height: (bottom - top) * scale,
        staffBottom: stringYs.at(-1)! * scale, lineSpacing: spacing * scale, stringYs: stringYs.map(y => y * scale) });
      const measureHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      measureHit.setAttribute("x", String(item.x)); measureHit.setAttribute("y", String(top));
      measureHit.setAttribute("width", String(item.width)); measureHit.setAttribute("height", String(bottom - top));
      measureHit.setAttribute("fill", "none"); measureHit.setAttribute("stroke", "none");
      measureHit.setAttribute("pointer-events", "all"); measureHit.setAttribute("data-measure-id", item.measure.id);
      drawing.append(measureHit);
      notes.forEach((note, index) => {
        const event = item.measure.events[index]!;
        const bounds = note instanceof PositionedTabNote ? note.digitBounds() : note.inkBounds();
        const padding = spacing * 0.25;
        const geometry = { measureId: item.measure.id, eventId: event.id, content: event.content,
          x: (bounds.x - padding) * scale, y: (bounds.y - padding) * scale,
          width: (bounds.width + padding * 2) * scale, height: (bounds.height + padding * 2) * scale };
        events.push(geometry);
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        for (const [name, value] of Object.entries({ x: geometry.x / scale, y: geometry.y / scale,
          width: geometry.width / scale, height: geometry.height / scale })) hit.setAttribute(name, String(value));
        hit.setAttribute("class", "event-hit"); hit.setAttribute("data-event-id", event.id);
        hit.setAttribute("data-duration-base", String(event.duration.base));
        hit.setAttribute("fill", "none"); hit.setAttribute("stroke", "none"); hit.setAttribute("pointer-events", "all");
        if (overfull.has(event.id)) {
          hit.setAttribute("data-rule-warning", "overfull");
          // Element.getSVGElement searches the live document and can hit a prior drawing.
          // This task is detached: annotate only the root produced by this render.
          const rendered = Array.from(drawing.querySelectorAll("[id]"))
            .find(element => element.getAttribute("id") === `vf-event-${event.id}`);
          rendered?.setAttribute("data-rule-warning", "overfull");
          if (warning) {
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = warning; hit.append(title);
          }
        }
        drawing.append(hit);
      });
      context.save();
      context.setFont(theme.fontFamily, "16px").setFillStyle(theme.muted);
      if (item.beginsSystem && item.number > 1) context.fillText(String(item.number), item.x + 2, item.y + 16);
      context.restore();
    }
    context.closeGroup(); throwIfRenderAborted(signal);
    const svg = staging.querySelector("svg");
    if (!svg) throw new Error("Tablature renderer returned no drawing");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    return { svg, interaction: { anchors, events, measures } };
  } };
}
