import { PITCH_STEPS } from "../contracts/note-input.ts";
import type { StaffMeasure, StaffView } from "../contracts/notation.ts";
import type { MeasureLayout, StaffLayout } from "./staff-layout.ts";
import { durationUnits } from "../contracts/note-input.ts";
import { STAFF_SPACE, staffSpaces } from "./engraving-metrics.ts";

/** Logical paper geometry, independent of the component's screen dimensions. */
export const SCORE_PAPER = {
  format: "A4", orientation: "portrait", width: 700, height: 990,
  margin: 60, firstStaveY: 60 - staffSpaces(4),
} as const;

export function fitScorePaper(size: Readonly<{ width: number; height: number }>) {
  const gutter = size.width <= 920 ? 20 : 40;
  const width = Number.isFinite(size.width) ? Math.max(0, size.width - gutter * 2) : 0;
  const height = Number.isFinite(size.height) ? Math.max(0, size.height) : 0;
  const scale = Math.min(width / SCORE_PAPER.width, height / SCORE_PAPER.height);
  return { scale, width: SCORE_PAPER.width * scale, height: SCORE_PAPER.height * scale, gutter };
}

function measureWidth(measure: StaffMeasure, beginsSystem: boolean) {
  const prefix = beginsSystem ? 7 : 0;
  if (!measure.events.length) return staffSpaces(prefix + 11);
  const capacity = 64 * measure.meter.numerator / measure.meter.denominator;
  let remaining = capacity;
  let body = 2;
  for (const event of measure.events) {
    const duration = durationUnits(event.duration);
    remaining -= duration;
    // Reserve glyph/accidental/dot space, then add a rhythmic spacing weight.
    body += 2.6 + 1.2 * Math.sqrt(duration / 16) + event.duration.dots * 0.65
      + (event.content.kind === "note" && event.content.pitch.alter ? 1 : 0);
  }
  body += 1.2 * Math.sqrt(Math.max(0, remaining) / 16);
  return staffSpaces(prefix + Math.max(11, body));
}

/** Natural-width measures flow across systems and pages, never stretching an empty bar. */
export function layoutScorePages(view: StaffView): readonly StaffLayout[] {
  const pitches = view.measures.flatMap((measure) => measure.events.flatMap((event) =>
    event.content.kind === "note" ? [event.content.pitch.octave * 7 + PITCH_STEPS.indexOf(event.content.pitch.step)] : []));
  // Treble staff top F5 and bottom E4; every diatonic step is half a staff space.
  const topExtra = staffSpaces(Math.max(0, Math.max(38, ...pitches) - 38) / 2);
  const bottomExtra = staffSpaces(Math.max(0, 30 - Math.min(30, ...pitches)) / 2);
  const systemHeight = staffSpaces(18) + topExtra + bottomExtra;
  const pages: StaffLayout[] = [];
  let measures: MeasureLayout[] = [];
  let x: number = SCORE_PAPER.margin;
  let y = SCORE_PAPER.firstStaveY + topExtra;
  let system = 0;
  const contentWidth = SCORE_PAPER.width - SCORE_PAPER.margin * 2;
  const finishPage = () => {
    pages.push({ width: SCORE_PAPER.width, height: SCORE_PAPER.height, staffSpace: STAFF_SPACE, clef: view.clef, measures });
    measures = [];
  };
  for (const [index, measure] of view.measures.entries()) {
    let beginsSystem = x === SCORE_PAPER.margin;
    let width = Math.min(contentWidth, measureWidth(measure, beginsSystem));
    if (x + width > SCORE_PAPER.width - SCORE_PAPER.margin) {
      x = SCORE_PAPER.margin;
      y += systemHeight;
      system++;
      beginsSystem = true;
      width = Math.min(contentWidth, measureWidth(measure, true));
    }
    if (y + staffSpaces(14) + bottomExtra > SCORE_PAPER.height - SCORE_PAPER.margin && measures.length) {
      finishPage();
      x = SCORE_PAPER.margin;
      y = SCORE_PAPER.firstStaveY + topExtra;
      system = 0;
      beginsSystem = true;
    }
    const previous = view.measures[index - 1];
    measures.push({ measure, number: index + 1, system, x, y, width, beginsSystem,
      showMeter: beginsSystem || !previous || previous.meter.numerator !== measure.meter.numerator
        || previous.meter.denominator !== measure.meter.denominator });
    x += width;
  }
  if (measures.length) finishPage();
  return pages;
}
