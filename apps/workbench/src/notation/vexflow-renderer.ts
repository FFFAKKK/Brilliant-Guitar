import { durationUnits } from "../contracts/note-input.ts";
import type { NotationRenderer } from "./notation-renderer.ts";
import type { EditAnchorGeometry, EventGeometry, MeasureGeometry } from "./notation-renderer.ts";
import { eventNoteSpec } from "./vexflow-note-spec.ts";
import { loadEngravingEngine } from "./engraving-engine.ts";
import { overfullEventIds } from "./overfull-events.ts";
import { describeMeasureRuleWarnings } from "./rule-warning-description.ts";
import { keySignatureAlterForStep, keySignatureSpec } from "./key-signature.ts";

export const vexflowRenderer: NotationRenderer = {
  async render(layout, theme, signal) {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("The notation render was superseded", "AbortError");
    };
    throwIfAborted();
    const { Renderer, Stave, BarlineType, StaveNote, GhostNote, Voice, Formatter, Dot, Accidental, Beam, default: VexFlow } = await loadEngravingEngine();
    throwIfAborted();
    const staging = document.createElement("div");
    const renderer = new Renderer(staging, Renderer.Backends.SVG);
    renderer.resize(layout.width, layout.height);
    const context = renderer.getContext();
    context.setFillStyle(theme.ink).setStrokeStyle(theme.ink);
    // Keep VexFlow's glyph/font metrics intact. Scale the entire engraving together,
    // rather than separately moving clefs, numerals, rests or noteheads with CSS.
    const scale = (layout.staffSpace ?? VexFlow.STAVE_LINE_DISTANCE) / VexFlow.STAVE_LINE_DISTANCE;
    const drawing = context.openGroup("notation-engraving");
    if (!drawing) throw new Error("Notation renderer returned no SVG group");
    const drawingElement = drawing as SVGGElement;
    drawing.setAttribute("transform", `scale(${scale})`);
    const anchors: EditAnchorGeometry[] = [], events: EventGeometry[] = [], measures: MeasureGeometry[] = [];
    for (const paperMeasure of layout.measures) {
      throwIfAborted();
      const item = { ...paperMeasure, x: paperMeasure.x / scale, y: paperMeasure.y / scale, width: paperMeasure.width / scale };
      const stave = new Stave(item.x, item.y, item.width);
      // Adjacent measures share one barline, rather than drawing it twice.
      if (!item.beginsSystem) stave.setBegBarType(BarlineType.NONE);
      if (item.beginsSystem) stave.addClef(layout.clef);
      if (item.showKeySignature) stave.addKeySignature(keySignatureSpec(item.keySignatureFifths),
        item.keySignatureFifths !== item.previousKeySignatureFifths
          ? keySignatureSpec(item.previousKeySignatureFifths) : undefined);
      if (item.showMeter) stave.addTimeSignature(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`);
      if (item.number === 1 && item.beginsSystem) {
        stave.setTempo({ duration: "q", bpm: layout.tempoBpm }, -30);
      }
      stave.setContext(context).draw();
      const capacity = 64 * item.measure.meter.numerator / item.measure.meter.denominator;
      const used = item.measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
      const overfullIds = overfullEventIds(item.measure);
      const noteStartX = stave.getNoteStartX() + 8, noteEndX = stave.getNoteEndX() - 3;
      const xForOffset = (offset: number) => noteStartX + (noteEndX - noteStartX) * Math.min(1, Math.max(0, offset / capacity));
      let tailX = xForOffset(used);
      let tailY = stave.getYForLine(2);
      const accidentalState = new Map<string, number>();
      const notes = item.measure.events.map((event) => {
        const pitch = event.content.kind === "note" ? event.content.pitch : null;
        const note = new StaveNote(eventNoteSpec(event, layout.clef));
        if (event.duration.dots) Dot.buildAndAttach([note]);
        if (pitch) {
          const key = `${pitch.step}/${pitch.octave}`;
          const inherited = accidentalState.get(key) ?? keySignatureAlterForStep(item.keySignatureFifths, pitch.step);
          if (inherited !== pitch.alter) note.addModifier(new Accidental(pitch.alter === 1 ? "#" : pitch.alter === -1 ? "b" : "n"), 0);
          accidentalState.set(key, pitch.alter);
        }
        note.setAttribute("id", `event-${event.id}`);
        return note;
      });
      if (notes.length) {
        let remaining = capacity - used;
        const ghosts = [];
        for (const base of [1, 2, 4, 8, 16, 32, 64]) {
          while (remaining >= 64 / base) { ghosts.push(new GhostNote(String(base))); remaining -= 64 / base; }
        }
        const voice = new Voice({ numBeats: item.measure.meter.numerator, beatValue: item.measure.meter.denominator })
          .setMode(Voice.Mode.SOFT).addTickables([...notes, ...ghosts]);
        const beams = Beam.generateBeams(notes, {
          groups: Beam.getDefaultBeamGroups(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`),
        });
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        const renderedNoteStart = drawingElement.querySelectorAll(".vf-stavenote").length;
        voice.draw(context, stave);
        const renderedNotes = Array.from(drawingElement.querySelectorAll(".vf-stavenote"))
          .slice(renderedNoteStart);
        renderedNotes.forEach((element, index) => {
          if (overfullIds.has(item.measure.events[index]?.id ?? "")) {
            (element as SVGGElement).dataset.ruleWarning = "overfull";
          }
        });
        beams.forEach((beam) => beam.setContext(context).draw());
        tailX = ghosts[0]?.getAbsoluteX() ?? stave.getNoteEndX() - 3;
        tailY = notes.at(-1)?.getYs()[0] ?? tailY;
      }
      const cursorY = stave.getYForLine(2), halfHeight = stave.getSpacingBetweenLines() * 0.85;
      const noteXs = notes.map((note) => (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2);
      const startX = noteXs.length ? Math.max(stave.getNoteStartX() + 2, noteXs[0]! - stave.getSpacingBetweenLines()) : tailX;
      const scaledAnchor = (anchor: EditAnchorGeometry["anchor"], offsetUnits: number, x: number, y: number): EditAnchorGeometry => ({
        measureId: item.measure.id, anchor, offsetUnits, x: x * scale, y: y * scale,
        y1: (cursorY - halfHeight) * scale, y2: (cursorY + halfHeight) * scale,
      });
      anchors.push(scaledAnchor({ kind: "start" }, 0, startX, notes[0]?.getYs()[0] ?? tailY));
      let eventOffset = 0;
      notes.forEach((note, index) => {
        eventOffset += durationUnits(item.measure.events[index]!.duration);
        const nextX = noteXs[index + 1];
        const x = nextX === undefined ? tailX : (noteXs[index]! + nextX) / 2;
        const y = nextX === undefined ? tailY : notes[index + 1]?.getYs()[0] ?? note.getYs()[0] ?? cursorY;
        anchors.push(scaledAnchor({ kind: "after-event", eventId: item.measure.events[index]!.id }, eventOffset, x, y));
      });
      const beat = 64 / item.measure.meter.denominator;
      const tailAnchor = item.measure.events.at(-1)
        ? { kind: "after-event" as const, eventId: item.measure.events.at(-1)!.id } : { kind: "start" as const };
      for (let offset = (Math.floor(used / beat) + 1) * beat; offset < capacity; offset += beat) {
        anchors.push(scaledAnchor(tailAnchor, offset, xForOffset(offset), tailY));
      }
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("x", String(item.x)); hit.setAttribute("y", String(item.y));
      hit.setAttribute("width", String(item.width)); hit.setAttribute("height", "140");
      hit.setAttribute("fill", "none"); hit.setAttribute("stroke", "none"); hit.setAttribute("data-measure-id", item.measure.id);
      hit.setAttribute("pointer-events", "all");
      hit.setAttribute("data-staff-bottom", String(stave.getYForLine(4) * scale));
      hit.setAttribute("data-line-spacing", String(stave.getSpacingBetweenLines() * scale));
      const warningDescription = describeMeasureRuleWarnings(item.number, item.measure);
      if (warningDescription) {
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = warningDescription;
        hit.append(title);
      }
      drawing.append(hit);
      measures.push({ measureId: item.measure.id, x: item.x * scale, y: item.y * scale,
        width: item.width * scale, height: 140 * scale, staffBottom: stave.getYForLine(4) * scale,
        lineSpacing: stave.getSpacingBetweenLines() * scale });
      notes.forEach((note, index) => {
        const box = note.getBoundingBox(), event = item.measure.events[index]!;
        const eventHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        eventHit.setAttribute("x", String(box.getX() - 4)); eventHit.setAttribute("y", String(box.getY() - 4));
        eventHit.setAttribute("width", String(Math.max(18, box.getW() + 8))); eventHit.setAttribute("height", String(Math.max(24, box.getH() + 8)));
        eventHit.setAttribute("rx", "4"); eventHit.setAttribute("class", "event-hit");
        eventHit.setAttribute("fill", "none"); eventHit.setAttribute("stroke", "none");
        eventHit.setAttribute("pointer-events", "all");
        eventHit.setAttribute("data-event-id", event.id);
        if (warningDescription && overfullIds.has(event.id)) {
          const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = warningDescription;
          eventHit.append(title);
        }
        drawing.append(eventHit);
        const spacing = stave.getSpacingBetweenLines(), centerX = noteXs[index]!, centerY = note.getYs()[0] ?? cursorY;
        const focusSize = spacing * 1.45;
        events.push({ measureId: item.measure.id, eventId: event.id,
          x: (centerX - focusSize / 2) * scale, y: (centerY - focusSize / 2) * scale,
          width: focusSize * scale, height: focusSize * scale });
      });
      context.save();
      context.setFont(theme.fontFamily, layout.staffSpace ? "16px" : "11px").setFillStyle(theme.muted);
      // System-start numbers are sufficient for orientation in a reading view.
      if (item.beginsSystem && item.number > 1) context.fillText(String(item.number), item.x + 2, item.y + 16);
      context.restore();
    }
    context.closeGroup();
    throwIfAborted();
    const svg = staging.querySelector("svg");
    if (!svg) throw new Error("Notation renderer returned no drawing");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return { svg, interaction: { anchors, events, measures } };
  },
};
