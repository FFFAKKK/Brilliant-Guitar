// Generated readonly notation capacity tool; edit tools, not this bundle.
"use strict";
(() => {
  // src/vendor/shared-notation/note-properties.js
  var record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  var NOTE_BASES = [1, 2, 4, 8, 16];
  var PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"];
  function isInputDuration(v) {
    return record(v) && NOTE_BASES.includes(v.base) && (v.dots === 0 || v.dots === 1);
  }
  function isEventProperties(v) {
    return record(v) && isInputContent(v.content) && (isInputDuration(v.duration) || v.content.kind === "rest" && record(v.duration) && v.duration.base === 32 && v.duration.dots === 0);
  }
  function isInputContent(v) {
    if (!record(v))
      return false;
    if (v.kind === "rest")
      return true;
    const p = v.pitch;
    return v.kind === "note" && record(p) && PITCH_STEPS.includes(p.step) && typeof p.octave === "number" && Number.isInteger(p.octave) && p.octave >= 2 && p.octave <= 6 && [-1, 0, 1].includes(p.alter);
  }
  var durationUnits = (duration) => 64 / duration.base * (duration.dots ? 1.5 : 1);
  var capacityUnits = (measure) => 64 * measure.meter.numerator / measure.meter.denominator;

  // src/vendor/shared-notation/vexflow-note-spec.js
  function eventNoteSpec(event, clef = "treble") {
    const pitch = event.content.kind === "note" ? event.content.pitch : null;
    return {
      keys: [pitch ? `${pitch.step.toLowerCase()}/${pitch.octave}` : "r/4"],
      duration: `${event.duration.base}${event.duration.dots ? "d" : ""}${pitch ? "" : "r"}`,
      autoStem: true,
      clef
    };
  }

  // src/vendor/shared-notation/overfull-events.js
  function overfullEventIds(measure) {
    if (!measure.ruleWarnings.some((warning) => warning.code === "rule.sequence-exceeds-measure"))
      return /* @__PURE__ */ new Set();
    const capacity = capacityUnits(measure);
    let offset = 0;
    const ids = /* @__PURE__ */ new Set();
    for (const event of measure.events) {
      offset += durationUnits(event.duration);
      if (offset > capacity)
        ids.add(event.id);
    }
    return ids;
  }

  // src/vendor/shared-notation/rule-warning-description.js
  function greatestCommonDivisor(a, b) {
    let left = Math.abs(a), right = Math.abs(b);
    while (right)
      [left, right] = [right, left % right];
    return left || 1;
  }
  function fractionText(numerator, denominator) {
    const divisor = greatestCommonDivisor(numerator, denominator);
    const top = numerator / divisor, bottom = denominator / divisor;
    return bottom === 1 ? String(top) : `${top}/${bottom}`;
  }
  function describeMeasureRuleWarnings(number, measure) {
    const warning = measure.ruleWarnings.find((item) => item.code === "rule.sequence-exceeds-measure");
    if (!warning)
      return null;
    const beats = fractionText(warning.overflow.numerator * measure.meter.denominator, warning.overflow.denominator);
    return `\u7B2C ${number} \u5C0F\u8282\u8D85\u51FA ${beats} \u62CD`;
  }

  // src/vendor/shared-notation/key-signature.js
  var KEY_SPECS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  var FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
  function keySignatureSpec(fifths) {
    return KEY_SPECS[fifths + 7] ?? "C";
  }
  function keySignatureAlterForStep(fifths, step) {
    if (!Number.isSafeInteger(fifths) || fifths === 0 || fifths < -7 || fifths > 7)
      return 0;
    const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
    return order.slice(0, Math.abs(fifths)).includes(step) ? fifths > 0 ? 1 : -1 : 0;
  }
  function keySignatureStates(view) {
    const states = [];
    let current = 0;
    let changeIndex = 0;
    for (let measureIndex = 0; measureIndex < view.measures.length; measureIndex += 1) {
      const previousFifths = current;
      const change = view.keySignatureChanges?.[changeIndex];
      const changed = change?.measureIndex === measureIndex;
      if (changed) {
        current = change.fifths;
        changeIndex += 1;
      }
      states.push({ fifths: current, previousFifths, changed });
    }
    return states;
  }

  // src/vendor/shared-notation/rhythmic-anchors.js
  function trailingGhostDurations(measure) {
    let remaining = capacityUnits(measure) - measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
    const durations = [];
    for (const base of [1, 2, 4, 8, 16, 32, 64]) {
      while (remaining >= 64 / base) {
        durations.push(String(base));
        remaining -= 64 / base;
      }
    }
    return durations;
  }
  function rhythmicAnchors(measure, geometry) {
    const { noteStart, noteEnd, centers, tailX, tailY, cursorY, lineSpacing, scale } = geometry;
    const capacity = capacityUnits(measure);
    const used = measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
    const xForOffset = (offset2) => noteStart + (noteEnd - noteStart) * Math.min(1, Math.max(0, offset2 / capacity));
    const make = (anchor, offsetUnits, x, y) => ({
      measureId: measure.id,
      anchor,
      offsetUnits,
      x: x * scale,
      y: y * scale,
      y1: (cursorY - lineSpacing * 0.85) * scale,
      y2: (cursorY + lineSpacing * 0.85) * scale
    });
    const startX = centers.length ? Math.max(noteStart - 6, centers[0].x - lineSpacing) : tailX;
    const anchors = [make({ kind: "start" }, 0, startX, centers[0]?.y ?? tailY)];
    let offset = 0;
    measure.events.forEach((event, index) => {
      offset += durationUnits(event.duration);
      const next = centers[index + 1];
      const x = next === void 0 ? tailX : (centers[index].x + next.x) / 2;
      anchors.push(make({ kind: "after-event", eventId: event.id }, offset, x, next?.y ?? tailY));
    });
    const beat = 64 / measure.meter.denominator;
    const last = measure.events.at(-1);
    const tailAnchor = last ? { kind: "after-event", eventId: last.id } : { kind: "start" };
    for (let remaining = (Math.floor(used / beat) + 1) * beat; remaining < capacity; remaining += beat) {
      anchors.push(make(tailAnchor, remaining, xForOffset(remaining), tailY));
    }
    return anchors;
  }

  // src/vendor/shared-notation/vexflow-surface.js
  function throwIfRenderAborted(signal) {
    if (signal?.aborted)
      throw new DOMException("The notation render was superseded", "AbortError");
  }
  function loadNotationEngine(load, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => {
        cleanup();
        reject(new DOMException("The notation render was superseded", "AbortError"));
      };
      const cleanup = () => signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(() => {
        throwIfRenderAborted(signal);
        return load();
      }).then((engine) => {
        cleanup();
        if (signal?.aborted)
          abort();
        else
          resolve(engine);
      }, (error) => {
        cleanup();
        reject(error);
      });
    });
  }
  function createEngravingSurface(engine, layout, theme2) {
    const { Renderer, default: VexFlow } = engine;
    const staging = document.createElement("div");
    const renderer2 = new Renderer(staging, Renderer.Backends.SVG);
    renderer2.resize(layout.width, layout.height);
    const context = renderer2.getContext();
    context.setFillStyle(theme2.ink).setStrokeStyle(theme2.ink);
    const scale = (layout.staffSpace ?? VexFlow.STAVE_LINE_DISTANCE) / VexFlow.STAVE_LINE_DISTANCE;
    const drawing = context.openGroup("notation-engraving");
    if (!drawing)
      throw new Error("Notation renderer returned no SVG group");
    drawing.setAttribute("transform", `scale(${scale})`);
    return { staging, context, scale, drawing };
  }

  // src/vendor/shared-notation/vexflow-renderer.js
  function createVexflowRenderer(loadEngravingEngine) {
    return {
      async render(layout, theme2, signal) {
        const throwIfAborted = () => throwIfRenderAborted(signal);
        throwIfAborted();
        const engine = await loadNotationEngine(loadEngravingEngine, signal);
        const { Stave, BarlineType, StaveNote, GhostNote, Voice, Formatter, Dot, Accidental, Beam } = engine;
        throwIfAborted();
        const { staging, context, scale, drawing } = createEngravingSurface(engine, layout, theme2);
        const drawingElement = drawing;
        const anchors = [], events = [], measures = [];
        for (const paperMeasure of layout.measures) {
          throwIfAborted();
          const item = { ...paperMeasure, x: paperMeasure.x / scale, y: paperMeasure.y / scale, width: paperMeasure.width / scale };
          const stave = new Stave(item.x, item.y, item.width);
          if (!item.beginsSystem)
            stave.setBegBarType(BarlineType.NONE);
          if (item.beginsSystem)
            stave.addClef(layout.clef);
          if (item.showKeySignature)
            stave.addKeySignature(keySignatureSpec(item.keySignatureFifths), item.keySignatureFifths !== item.previousKeySignatureFifths ? keySignatureSpec(item.previousKeySignatureFifths) : void 0);
          if (item.showMeter)
            stave.addTimeSignature(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`);
          if (item.number === 1 && item.beginsSystem) {
            stave.setTempo({ duration: "q", bpm: layout.tempoBpm }, -30);
          }
          stave.setContext(context).draw();
          const capacity = 64 * item.measure.meter.numerator / item.measure.meter.denominator;
          const used = item.measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
          const overfullIds = overfullEventIds(item.measure);
          const noteStartX = stave.getNoteStartX() + 8, noteEndX = stave.getNoteEndX() - 3;
          const xForOffset = (offset) => noteStartX + (noteEndX - noteStartX) * Math.min(1, Math.max(0, offset / capacity));
          let tailX = xForOffset(used);
          let tailY = stave.getYForLine(2);
          const accidentalState = /* @__PURE__ */ new Map();
          const notes = item.measure.events.map((event) => {
            const pitch = event.content.kind === "note" ? event.content.pitch : null;
            const note = new StaveNote(eventNoteSpec(event, layout.clef));
            if (event.duration.dots)
              Dot.buildAndAttach([note]);
            if (pitch) {
              const key = `${pitch.step}/${pitch.octave}`;
              const inherited = accidentalState.get(key) ?? keySignatureAlterForStep(item.keySignatureFifths, pitch.step);
              if (inherited !== pitch.alter)
                note.addModifier(new Accidental(pitch.alter === 1 ? "#" : pitch.alter === -1 ? "b" : "n"), 0);
              accidentalState.set(key, pitch.alter);
            }
            note.setAttribute("id", `event-${event.id}`);
            return note;
          });
          if (notes.length) {
            const ghosts = trailingGhostDurations(item.measure).map((duration) => new GhostNote(duration));
            const voice = new Voice({ numBeats: item.measure.meter.numerator, beatValue: item.measure.meter.denominator }).setMode(Voice.Mode.SOFT).addTickables([...notes, ...ghosts]);
            const beams = Beam.generateBeams(notes, {
              groups: Beam.getDefaultBeamGroups(`${item.measure.meter.numerator}/${item.measure.meter.denominator}`)
            });
            new Formatter().joinVoices([voice]).formatToStave([voice], stave);
            const renderedNoteStart = drawingElement.querySelectorAll(".vf-stavenote").length;
            voice.draw(context, stave);
            const renderedNotes = Array.from(drawingElement.querySelectorAll(".vf-stavenote")).slice(renderedNoteStart);
            renderedNotes.forEach((element, index) => {
              if (overfullIds.has(item.measure.events[index]?.id ?? "")) {
                element.dataset.ruleWarning = "overfull";
              }
            });
            beams.forEach((beam) => beam.setContext(context).draw());
            tailX = ghosts[0]?.getAbsoluteX() ?? stave.getNoteEndX() - 3;
            tailY = notes.at(-1)?.getYs()[0] ?? tailY;
          }
          const cursorY = stave.getYForLine(2);
          const noteXs = notes.map((note) => (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2);
          anchors.push(...rhythmicAnchors(item.measure, {
            noteStart: noteStartX,
            noteEnd: noteEndX,
            tailX,
            tailY,
            cursorY,
            lineSpacing: stave.getSpacingBetweenLines(),
            scale,
            centers: notes.map((note, index) => ({ x: noteXs[index], y: note.getYs()[0] ?? cursorY }))
          }));
          const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          hit.setAttribute("x", String(item.x));
          hit.setAttribute("y", String(item.y));
          hit.setAttribute("width", String(item.width));
          hit.setAttribute("height", "140");
          hit.setAttribute("fill", "none");
          hit.setAttribute("stroke", "none");
          hit.setAttribute("data-measure-id", item.measure.id);
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
          measures.push({
            measureId: item.measure.id,
            x: item.x * scale,
            y: item.y * scale,
            width: item.width * scale,
            height: 140 * scale,
            staffBottom: stave.getYForLine(4) * scale,
            lineSpacing: stave.getSpacingBetweenLines() * scale
          });
          notes.forEach((note, index) => {
            const box = note.getBoundingBox(), event = item.measure.events[index];
            const eventHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            eventHit.setAttribute("x", String(box.getX() - 4));
            eventHit.setAttribute("y", String(box.getY() - 4));
            eventHit.setAttribute("width", String(Math.max(18, box.getW() + 8)));
            eventHit.setAttribute("height", String(Math.max(24, box.getH() + 8)));
            eventHit.setAttribute("rx", "4");
            eventHit.setAttribute("class", "event-hit");
            eventHit.setAttribute("fill", "none");
            eventHit.setAttribute("stroke", "none");
            eventHit.setAttribute("pointer-events", "all");
            eventHit.setAttribute("data-event-id", event.id);
            if (warningDescription && overfullIds.has(event.id)) {
              const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
              title.textContent = warningDescription;
              eventHit.append(title);
            }
            drawing.append(eventHit);
            const spacing = stave.getSpacingBetweenLines(), centerX = noteXs[index], centerY = note.getYs()[0] ?? cursorY;
            const focusSize = spacing * 1.45;
            events.push({
              measureId: item.measure.id,
              eventId: event.id,
              x: (centerX - focusSize / 2) * scale,
              y: (centerY - focusSize / 2) * scale,
              width: focusSize * scale,
              height: focusSize * scale
            });
          });
          context.save();
          context.setFont(theme2.fontFamily, layout.staffSpace ? "16px" : "11px").setFillStyle(theme2.muted);
          if (item.beginsSystem && item.number > 1)
            context.fillText(String(item.number), item.x + 2, item.y + 16);
          context.restore();
        }
        context.closeGroup();
        throwIfAborted();
        const svg = staging.querySelector("svg");
        if (!svg)
          throw new Error("Notation renderer returned no drawing");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        return { svg, interaction: { anchors, events, measures } };
      }
    };
  }

  // src/vendor/shared-notation/engraving-metrics.js
  var ENGRAVING = {
    paperUnitsPerMm: 10 / 3,
    staffHeightMm: 7.03
  };
  var STAFF_SPACE = ENGRAVING.staffHeightMm * ENGRAVING.paperUnitsPerMm / 4;
  var staffSpaces = (count) => count * STAFF_SPACE;

  // src/vendor/shared-notation/clef-pitch-range.js
  function clefPitchRange(clef) {
    if (clef === "bass")
      return { bottom: 18, top: 26 };
    if (clef === "alto")
      return { bottom: 24, top: 32 };
    if (clef === "tenor")
      return { bottom: 22, top: 30 };
    return { bottom: 30, top: 38 };
  }

  // src/vendor/shared-notation/paper-flow.js
  var SCORE_PAPER = {
    format: "A4",
    orientation: "portrait",
    width: 700,
    height: 990,
    margin: 60,
    firstStaveY: 60 - staffSpaces(4)
  };
  var TEMPO_TOP_RESERVE = staffSpaces(7);
  function rhythmicMeasureWidth(measure, prefixSpaces, extraSpaces) {
    if (!measure.events.length)
      return staffSpaces(prefixSpaces + 11);
    let remaining = capacityUnits(measure), body = 2;
    for (const event of measure.events) {
      const duration = durationUnits(event.duration);
      remaining -= duration;
      body += 2.6 + 1.2 * Math.sqrt(duration / 16) + event.duration.dots * 0.65 + extraSpaces(event);
    }
    body += 1.2 * Math.sqrt(Math.max(0, remaining) / 16);
    return staffSpaces(prefixSpaces + Math.max(11, body));
  }
  function flowScoreMeasures(items, options) {
    const pages = [];
    let measures = [];
    let x = SCORE_PAPER.margin, y = options.firstY, system = 0;
    const contentWidth = SCORE_PAPER.width - SCORE_PAPER.margin * 2;
    for (const [index, measure] of items.entries()) {
      let beginsSystem = x === SCORE_PAPER.margin;
      let width = Math.min(contentWidth, options.width(measure, index, beginsSystem));
      if (x + width > SCORE_PAPER.width - SCORE_PAPER.margin) {
        x = SCORE_PAPER.margin;
        y += options.systemHeight;
        system++;
        beginsSystem = true;
        width = Math.min(contentWidth, options.width(measure, index, true));
      }
      if (y + options.bottomReserve > SCORE_PAPER.height - SCORE_PAPER.margin && measures.length) {
        pages.push(measures);
        measures = [];
        x = SCORE_PAPER.margin;
        y = options.pageY;
        system = 0;
        beginsSystem = true;
      }
      const previous = items[index - 1];
      measures.push({
        measure,
        number: index + 1,
        system,
        x,
        y,
        width,
        beginsSystem,
        showMeter: beginsSystem || !previous || previous.meter.numerator !== measure.meter.numerator || previous.meter.denominator !== measure.meter.denominator
      });
      x += width;
    }
    if (measures.length)
      pages.push(measures);
    if (options.justifySystems)
      for (const page of pages) {
        let start = 0;
        while (start < page.length) {
          let end = start + 1;
          while (end < page.length && page[end].system === page[start].system)
            end++;
          const naturalWidth = page.slice(start, end).reduce((sum, measure) => sum + measure.width, 0);
          const factor = contentWidth / naturalWidth;
          let systemX = SCORE_PAPER.margin;
          for (let index = start; index < end; index++) {
            const current = page[index];
            const justifiedWidth = index === end - 1 ? SCORE_PAPER.width - SCORE_PAPER.margin - systemX : current.width * factor;
            page[index] = { ...current, x: systemX, width: justifiedWidth };
            systemX += justifiedWidth;
          }
          start = end;
        }
      }
    return pages;
  }

  // src/vendor/shared-notation/score-page-layout.js
  function measureWidth(measure, beginsSystem, keySignatureFifths, keySignatureChanged) {
    const showKeySignature = beginsSystem || keySignatureChanged;
    const prefix = (beginsSystem ? 7 : 0) + (showKeySignature ? 1.2 * Math.abs(keySignatureFifths) : 0);
    return rhythmicMeasureWidth(measure, prefix, (event) => event.content.kind === "note" && event.content.pitch.alter ? 1 : 0);
  }
  function layoutScorePages(view) {
    const pitches = view.measures.flatMap((measure) => measure.events.flatMap((event) => event.content.kind === "note" ? [event.content.pitch.octave * 7 + PITCH_STEPS.indexOf(event.content.pitch.step)] : []));
    const range = clefPitchRange(view.clef);
    const topExtra = staffSpaces(Math.max(0, Math.max(range.top, ...pitches) - range.top) / 2);
    const bottomExtra = staffSpaces(Math.max(0, range.bottom - Math.min(range.bottom, ...pitches)) / 2);
    const systemHeight = staffSpaces(18) + topExtra + bottomExtra;
    const keySignatures = keySignatureStates(view);
    return flowScoreMeasures(view.measures, {
      firstY: SCORE_PAPER.firstStaveY + topExtra + TEMPO_TOP_RESERVE,
      pageY: SCORE_PAPER.firstStaveY + topExtra,
      systemHeight,
      bottomReserve: staffSpaces(14) + bottomExtra,
      width: (measure, index, beginsSystem) => {
        const key = keySignatures[index];
        return measureWidth(measure, beginsSystem, key.fifths, key.changed);
      }
    }).map((placements) => {
      const measures = placements.map((item) => {
        const keySignature = keySignatures[item.number - 1];
        return {
          ...item,
          keySignatureFifths: keySignature.fifths,
          previousKeySignatureFifths: keySignature.previousFifths,
          showKeySignature: item.beginsSystem || keySignature.changed
        };
      });
      return {
        width: SCORE_PAPER.width,
        height: SCORE_PAPER.height,
        staffSpace: STAFF_SPACE,
        clef: view.clef,
        tempoBpm: view.tempoBpm,
        measures
      };
    });
  }

  // src/vendor/shared-notation/compose-notation-pages.js
  function composeNotationPages(pages, drawings, signal) {
    if (signal?.aborted)
      throw new DOMException("The notation render was superseded", "AbortError");
    if (!pages.length || pages.length !== drawings.length)
      throw new Error("Notation pages and drawings must match");
    const gap = 20, width = pages[0].width;
    const height = pages.reduce((sum, page) => sum + page.height, 0) + gap * (pages.length - 1);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("score-engraving");
    const anchors = [];
    const events = [];
    const measures = [];
    let offset = 0;
    drawings.forEach((drawing, index) => {
      const page = pages[index];
      const group = document.createElementNS(svg.namespaceURI, "g");
      group.setAttribute("data-score-page", String(index + 1));
      group.setAttribute("transform", `translate(0 ${offset})`);
      const paper = document.createElementNS(svg.namespaceURI, "rect");
      paper.setAttribute("width", String(page.width));
      paper.setAttribute("height", String(page.height));
      paper.setAttribute("fill", "white");
      group.append(paper, drawing.svg);
      svg.append(group);
      anchors.push(...drawing.interaction.anchors.map((item) => ({ ...item, pageIndex: index, y: item.y + offset, y1: item.y1 + offset, y2: item.y2 + offset })));
      events.push(...drawing.interaction.events.map((item) => ({ ...item, pageIndex: index, y: item.y + offset })));
      measures.push(...drawing.interaction.measures.map((item) => ({
        ...item,
        pageIndex: index,
        y: item.y + offset,
        staffBottom: item.staffBottom + offset,
        ...item.stringYs ? { stringYs: item.stringYs.map((y) => y + offset) } : {}
      })));
      offset += page.height + gap;
    });
    const interaction = { anchors, events, measures };
    return { svg, layout: { width, height, pages }, interaction };
  }

  // src/vendor/shared-notation/notation-model.js
  function isExactFraction(value) {
    if (typeof value !== "object" || value === null)
      return false;
    const fraction = value;
    return typeof fraction.numerator === "number" && Number.isSafeInteger(fraction.numerator) && typeof fraction.denominator === "number" && Number.isSafeInteger(fraction.denominator) && fraction.denominator > 0;
  }
  function isStaffRuleWarning(value) {
    if (typeof value !== "object" || value === null)
      return false;
    const warning = value;
    return warning.code === "rule.sequence-exceeds-measure" && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration) && isExactFraction(warning.overflow);
  }
  function isNotationView(value) {
    if (typeof value !== "object" || value === null)
      return false;
    const view = value;
    if (view.kind === "unsupported")
      return typeof view.message === "string" && view.message.length > 0;
    if (view.kind !== "staff" || !["treble", "bass", "alto", "tenor"].includes(view.clef) || typeof view.partId !== "string" || !view.partId || typeof view.staffId !== "string" || !view.staffId || typeof view.tempoBpm !== "number" || !Number.isFinite(view.tempoBpm) || view.tempoBpm <= 0 || view.keySignatureChanges !== void 0 && !Array.isArray(view.keySignatureChanges) || !Array.isArray(view.measures) || !view.measures.length)
      return false;
    const ids = /* @__PURE__ */ new Set();
    const measuresValid = view.measures.every((measure) => {
      if (typeof measure !== "object" || measure === null)
        return false;
      const item = measure;
      if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.voiceId !== "string" || !item.voiceId || ids.has(item.voiceId) || typeof item.meter !== "object" || item.meter === null)
        return false;
      ids.add(item.id);
      ids.add(item.voiceId);
      if (!Array.isArray(item.events) || !Array.isArray(item.ruleWarnings) || !item.ruleWarnings.every(isStaffRuleWarning))
        return false;
      for (const raw of item.events) {
        if (typeof raw !== "object" || raw === null)
          return false;
        const event = raw;
        if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !isEventProperties(event))
          return false;
        ids.add(event.id);
      }
      const meter = item.meter;
      return typeof meter.numerator === "number" && Number.isInteger(meter.numerator) && meter.numerator >= 1 && meter.numerator <= 32 && typeof meter.denominator === "number" && [1, 2, 4, 8, 16, 32, 64].includes(meter.denominator);
    });
    if (!measuresValid)
      return false;
    const measures = view.measures;
    let previousIndex = -1;
    return (view.keySignatureChanges ?? []).every((raw) => {
      if (typeof raw !== "object" || raw === null)
        return false;
      const change = raw;
      if (typeof change.measureId !== "string" || !change.measureId || typeof change.measureIndex !== "number" || !Number.isSafeInteger(change.measureIndex) || change.measureIndex <= previousIndex || change.measureIndex >= measures.length || measures[change.measureIndex]?.id !== change.measureId || typeof change.fifths !== "number" || !Number.isSafeInteger(change.fifths) || change.fifths < -7 || change.fifths > 7)
        return false;
      previousIndex = change.measureIndex;
      return true;
    });
  }

  // src/score/notation-model.js
  function normalizeStaffSnapshot(input) {
    if (!input || !Array.isArray(input.measures) || !input.measures.length) {
      throw new TypeError("\u4E94\u7EBF\u8C31\u5FEB\u7167\u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u5C0F\u8282");
    }
    if (!isNotationView(input) || input.kind !== "staff") {
      throw new TypeError("\u4E94\u7EBF\u8C31\u5FEB\u7167\u6216\u4E8B\u4EF6\u65E0\u6548\uFF08\u97F3\u9AD8\u3001\u65F6\u503C\u3001\u62CD\u53F7\u3001\u8EAB\u4EFD\u6216\u8C03\u53F7\u5408\u540C\u4E0D\u5339\u914D\uFF09");
    }
    return deepFreeze(structuredClone(input));
  }
  function deepFreeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  // src/score/vexflow-runtime.js
  var loading;
  function loadVexFlow() {
    if (loading) return loading;
    if (typeof document === "undefined") return Promise.reject(new Error("\u4E94\u7EBF\u8C31\u7ED8\u5236\u9700\u8981\u6D4F\u89C8\u5668 document"));
    loading = (globalThis.VexFlow ? Promise.resolve(globalThis.VexFlow) : new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("src/vendor/vexflow-bravura.js", document.baseURI).href;
      script.async = true;
      script.onload = () => globalThis.VexFlow ? resolve(globalThis.VexFlow) : reject(new Error("VexFlow \u5168\u5C40\u5BF9\u8C61\u672A\u52A0\u8F7D"));
      script.onerror = () => reject(new Error("VexFlow \u7ED8\u5236\u5F15\u64CE\u52A0\u8F7D\u5931\u8D25"));
      document.head.append(script);
    })).then(async (engine) => {
      if (!document.fonts?.load) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BB0\u8C31\u5B57\u4F53\u52A0\u8F7D\u68C0\u67E5");
      const faces = await Promise.all([
        document.fonts.load("40px Bravura"),
        document.fonts.load("12px Academico")
      ]);
      if (faces.some((group) => group.length === 0 || group.some((face) => face.status !== "loaded"))) {
        throw new Error("Bravura \u6216 Academico \u8BB0\u8C31\u5B57\u4F53\u672A\u52A0\u8F7D");
      }
      return { ...engine, default: engine.default ?? engine };
    }).catch((error) => {
      loading = void 0;
      throw error;
    });
    return loading;
  }

  // src/score/vexflow-staff-renderer.js
  var renderer = createVexflowRenderer(loadVexFlow);
  var theme = Object.freeze({ ink: "#14161a", muted: "#62666d", fontFamily: "Academico" });
  async function renderStaff(input, { signal } = {}) {
    const pages = layoutScorePages(normalizeStaffSnapshot(input));
    const drawings = [];
    for (const page of pages) drawings.push(await renderer.render(page, theme, signal));
    return composeNotationPages(pages, drawings, signal);
  }

  // tools/capacity-statistics.js
  function timingStats(samples) {
    if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) throw new TypeError("Invalid timing samples");
    const sorted = [...samples].sort((a, b) => a - b);
    const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
    return {
      count: samples.length,
      median: percentile(0.5),
      p95: percentile(0.95),
      max: sorted.at(-1),
      mean: samples.reduce((sum, value) => sum + value, 0) / samples.length
    };
  }

  // tools/notation-capacity.js
  var finite = (value) => Number.isFinite(value) && value >= 0;
  var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function guard(signal) {
    if (signal?.aborted) throw new DOMException("Capacity run cancelled", "AbortError");
  }
  function abortable(operation, signal) {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        signal?.removeEventListener("abort", cancel);
        reject(new DOMException("Capacity run cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      Promise.resolve().then(() => {
        guard(signal);
        return operation();
      }).then((value) => {
        signal?.removeEventListener("abort", cancel);
        if (signal?.aborted) cancel();
        else resolve(value);
      }, (error) => {
        signal?.removeEventListener("abort", cancel);
        reject(error);
      });
    });
  }
  function validateNotationCapacityInputs(cases, policy) {
    if (!policy?.id || !Number.isSafeInteger(policy.warmups) || policy.warmups < 0 || policy.warmups > 10 || !Number.isSafeInteger(policy.iterations) || policy.iterations < 1 || policy.iterations > 100 || !finite(policy.engineFontInitializationMaxMs) || !finite(policy.maxLongTaskMs) || !Array.isArray(cases) || cases.length !== 4 || policy.cases?.length !== cases.length) throw new TypeError("Invalid capacity policy/input");
    const names = /* @__PURE__ */ new Set();
    cases.forEach((item, index) => {
      const expected = policy.cases[index], measures = item.snapshot?.measures;
      const events = measures?.flatMap((measure) => measure.events) ?? [];
      if (names.has(item.name) || item.name !== expected.name || measures?.length !== expected.measures || events.length !== expected.events || !finite(expected.renderToAdoptP95Ms) || !Number.isSafeInteger(expected.pages) || expected.pages < 1 || new Set(measures.map((measure) => measure.id)).size !== measures.length || new Set(events.map((event) => event.id)).size !== events.length) throw new TypeError(`Invalid capacity case: ${item.name}`);
      names.add(item.name);
    });
  }
  function assertCapacityDrawing(drawing, item, expected) {
    const eventIds = item.snapshot.measures.flatMap((measure) => measure.events.map((event) => event.id));
    if (!drawing?.svg || drawing.layout?.pages?.length !== expected.pages || !equal(drawing.interaction?.events?.map((event) => event.eventId), eventIds) || !equal(drawing.interaction?.measures?.map((measure) => measure.measureId), item.snapshot.measures.map((measure) => measure.id)) || drawing.interaction.events.some((event) => ![event.x, event.y, event.width, event.height].every(finite) || event.y + event.height > drawing.layout.height)) throw new Error(`Drawing lost music/geometry: ${item.name}`);
  }
  async function runNotationCapacity({ cases, policy, ports, signal, onProgress = () => {
  } }) {
    validateNotationCapacityInputs(cases, policy);
    const report = {
      at: (/* @__PURE__ */ new Date()).toISOString(),
      status: "failed",
      assessment: "incomplete",
      qualificationG6: "pending",
      policyId: policy.id,
      minimumDeviceQualification: "pending",
      warmups: policy.warmups,
      iterations: policy.iterations,
      percentileMethod: "nearest-rank",
      scope: "Actual renderer + complete SVG adoption; two RAF callbacks are paint opportunities, not proof of compositor presentation",
      cases: [],
      failures: [],
      longTasksMs: [],
      blockingObservationAvailable: false
    };
    let observation;
    const collect = () => {
      const values = observation.take();
      if (!Array.isArray(values) || values.some((value) => !finite(value))) throw new Error("Invalid blocking observation");
      report.longTasksMs.push(...values);
      return values;
    };
    try {
      guard(signal);
      observation = ports.observeBlocking();
      report.blockingObservationAvailable = observation.available === true;
      const started = ports.now();
      await abortable(() => ports.initialize(), signal);
      guard(signal);
      report.engineFontInitializationMs = ports.now() - started;
      if (!finite(report.engineFontInitializationMs)) throw new Error("Invalid initialization clock");
      collect();
      for (const [caseIndex, item] of cases.entries()) {
        const expected = policy.cases[caseIndex], result2 = {
          name: item.name,
          measures: expected.measures,
          events: expected.events,
          pages: expected.pages,
          samples: []
        };
        report.cases.push(result2);
        for (let index = -policy.warmups; index < policy.iterations; index++) {
          guard(signal);
          onProgress({ name: item.name, index, iterations: policy.iterations });
          try {
            collect();
            const start = ports.now(), drawing = await abortable(() => ports.render(item.snapshot, { signal }), signal);
            guard(signal);
            const rendered = ports.now();
            assertCapacityDrawing(drawing, item, expected);
            const adopted = ports.adopt(drawing, item, expected);
            const adoptionEnd = ports.now();
            if (adopted.pageRoots !== expected.pages || adopted.fontsVerified !== true || !Number.isSafeInteger(adopted.nodes) || adopted.nodes < 1) {
              throw new Error(`Invalid adopted SVG/font verification: ${item.name}`);
            }
            await abortable(() => ports.paint(signal), signal);
            guard(signal);
            const paintEnd = ports.now(), longTasksMs = collect();
            const sample = {
              renderMs: rendered - start,
              validateAndAdoptMs: adoptionEnd - rendered,
              renderToAdoptMs: adoptionEnd - start,
              paintOpportunityMs: paintEnd - adoptionEnd,
              nodes: adopted.nodes,
              longTasksMs
            };
            if (![sample.renderMs, sample.validateAndAdoptMs, sample.renderToAdoptMs, sample.paintOpportunityMs].every(finite)) throw new Error("Invalid sample clock");
            if (index >= 0) result2.samples.push(sample);
          } finally {
            ports.clear();
          }
        }
        result2.stats = Object.fromEntries(["renderMs", "validateAndAdoptMs", "renderToAdoptMs", "paintOpportunityMs", "nodes"].map((key) => [key, timingStats(result2.samples.map((sample) => sample[key]))]));
      }
      await abortable(() => ports.paint(signal), signal);
      guard(signal);
      collect();
      report.status = "baseline-only";
      if (report.engineFontInitializationMs > policy.engineFontInitializationMaxMs) report.failures.push("engine-font-initialization");
      for (const [index, item] of report.cases.entries()) {
        if (item.stats.renderToAdoptMs.p95 > policy.cases[index].renderToAdoptP95Ms) report.failures.push(`${item.name}:render-to-adopt-p95`);
      }
      if (report.longTasksMs.some((duration) => duration > policy.maxLongTaskMs)) report.failures.push("main-thread-long-task");
      report.assessment = report.failures.length ? "exceeded" : report.blockingObservationAvailable ? "within-engineering-limits" : "incomplete";
    } catch (error) {
      report.status = error?.name === "AbortError" ? "cancelled" : "failed";
      report.error = error?.message ?? String(error);
    } finally {
      for (const release of [() => ports.clear(), () => observation?.stop()]) {
        try {
          release();
        } catch (error) {
          report.status = "failed";
          report.assessment = "incomplete";
          (report.cleanupErrors ??= []).push(error?.message ?? String(error));
        }
      }
    }
    return report;
  }

  // tools/notation-capacity-page.js
  var data = JSON.parse(document.getElementById("capacity-inputs").textContent);
  var stage = document.getElementById("drawing");
  var status = document.getElementById("status");
  var run = document.getElementById("run");
  var stop = document.getElementById("stop");
  var download = document.getElementById("download");
  var controller = null;
  var result = null;
  var urls = /* @__PURE__ */ new Set();
  function paint(signal) {
    return new Promise((resolve, reject) => {
      let first, second;
      const cancelled = () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
        signal?.removeEventListener("abort", cancelled);
        reject(new DOMException("Capacity run cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", cancelled, { once: true });
      if (signal?.aborted || document.visibilityState !== "visible") {
        cancelled();
        return;
      }
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          signal?.removeEventListener("abort", cancelled);
          resolve();
        });
      });
    });
  }
  function observeBlocking() {
    const values = [];
    const available = globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask") === true;
    const observer = available ? new PerformanceObserver((list) => values.push(...list.getEntries().map((entry) => entry.duration))) : null;
    observer?.observe({ type: "longtask", buffered: false });
    return { available, take() {
      values.push(...(observer?.takeRecords() ?? []).map((entry) => entry.duration));
      return values.splice(0);
    }, stop() {
      observer?.disconnect();
    } };
  }
  function adopt(drawing, item, expected) {
    if (document.visibilityState !== "visible") throw new DOMException("Page hidden", "AbortError");
    stage.replaceChildren(drawing.svg);
    const roots = [...drawing.svg.querySelectorAll("[data-score-page] > svg")];
    const texts = [...drawing.svg.querySelectorAll("text")].filter((text) => /[\uE000-\uF8FF]/u.test(text.textContent));
    const actualIds = [...drawing.svg.querySelectorAll("[data-event-id]")].map((element) => element.getAttribute("data-event-id"));
    const expectedIds = item.snapshot.measures.flatMap((measure) => measure.events.map((event) => event.id));
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error("Adopted SVG event identity changed");
    const fontsVerified = roots.length === expected.pages && roots.every((root) => root.getAttribute("font-family")?.includes("Bravura")) && texts.length > 0 && texts.every((text) => getComputedStyle(text).fontFamily.split(",")[0].replaceAll('"', "").trim() === "Bravura");
    return { pageRoots: roots.length, fontsVerified, nodes: drawing.svg.querySelectorAll("*").length + 1 };
  }
  run.addEventListener("click", async () => {
    if (controller || document.visibilityState !== "visible") return;
    const current = new AbortController();
    controller = current;
    result = null;
    run.disabled = true;
    stop.disabled = false;
    download.disabled = true;
    const timeout = setTimeout(() => current.abort(), 3e5);
    try {
      result = await runNotationCapacity({
        ...data,
        signal: current.signal,
        ports: {
          now: () => performance.now(),
          initialize: loadVexFlow,
          render: renderStaff,
          adopt,
          paint,
          observeBlocking,
          clear: () => stage.replaceChildren()
        },
        onProgress: ({ name, index, iterations }) => {
          status.textContent = `${name} \xB7 ${index < 0 ? "\u9884\u70ED" : `${index + 1}/${iterations}`}`;
        }
      });
      result.candidate = data.candidate;
      result.policy = data.policy;
      result.environment = {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        approximateDeviceMemoryGiB: navigator.deviceMemory ?? null,
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        visibility: document.visibilityState,
        minimumReferenceDeviceVerified: false
      };
      status.textContent = `${result.status} \xB7 ${result.assessment} \xB7 G6 pending`;
      document.getElementById("summary").textContent = result.cases.map((item) => `${item.name}: ${item.stats ? `${item.stats.renderToAdoptMs.p95.toFixed(1)} ms p95` : "\u672A\u5B8C\u6210"}`).join("\n");
      download.disabled = false;
    } catch (error) {
      status.textContent = `failed \xB7 ${error?.message ?? String(error)} \xB7 G6 pending`;
    } finally {
      clearTimeout(timeout);
      controller = null;
      run.disabled = false;
      stop.disabled = true;
    }
  });
  stop.addEventListener("click", () => controller?.abort());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") controller?.abort();
  });
  download.addEventListener("click", () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + "\n"], { type: "application/json" }));
    urls.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notation-capacity-${Date.now()}.json`;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
    }, 1e3);
  });
  addEventListener("pagehide", () => {
    controller?.abort();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    stage.replaceChildren();
  });
})();
