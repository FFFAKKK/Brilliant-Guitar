import { PITCH_STEPS } from "./note-properties.ts";
import type { StaffMeasure, StaffView } from "./notation-model.ts";
import type { MeasureLayout, StaffLayout } from "./staff-layout.ts";
import { STAFF_SPACE, staffSpaces } from "./engraving-metrics.ts";
import { clefPitchRange } from "./clef-pitch-range.ts";
import { keySignatureStates } from "./key-signature.ts";
import { flowScoreMeasures, rhythmicMeasureWidth, SCORE_PAPER, TEMPO_TOP_RESERVE } from "./paper-flow.ts";

export { SCORE_PAPER } from "./paper-flow.ts";

export function fitScorePaper(size: Readonly<{ width: number; height: number }>) {
  const gutter = size.width <= 920 ? 20 : 40;
  const width = Number.isFinite(size.width) ? Math.max(0, size.width - gutter * 2) : 0;
  const height = Number.isFinite(size.height) ? Math.max(0, size.height) : 0;
  const scale = Math.min(width / SCORE_PAPER.width, height / SCORE_PAPER.height);
  return { scale, width: SCORE_PAPER.width * scale, height: SCORE_PAPER.height * scale, gutter };
}

function measureWidth(measure: StaffMeasure, beginsSystem: boolean, keySignatureFifths: number, keySignatureChanged: boolean) {
  const showKeySignature = beginsSystem || keySignatureChanged;
  const prefix = (beginsSystem ? 7 : 0) + (showKeySignature ? 1.2 * Math.abs(keySignatureFifths) : 0);
  return rhythmicMeasureWidth(measure, prefix,
    event => event.content.kind === "note" && event.content.pitch.alter ? 1 : 0);
}

/** Natural-width measures flow across systems and pages, never stretching an empty bar. */
export function layoutScorePages(view: StaffView): readonly StaffLayout[] {
  const pitches = view.measures.flatMap((measure) => measure.events.flatMap((event) =>
    event.content.kind === "note" ? [event.content.pitch.octave * 7 + PITCH_STEPS.indexOf(event.content.pitch.step)] : []));
  const range = clefPitchRange(view.clef);
  const topExtra = staffSpaces(Math.max(0, Math.max(range.top, ...pitches) - range.top) / 2);
  const bottomExtra = staffSpaces(Math.max(0, range.bottom - Math.min(range.bottom, ...pitches)) / 2);
  const systemHeight = staffSpaces(18) + topExtra + bottomExtra;
  const keySignatures = keySignatureStates(view);
  return flowScoreMeasures(view.measures, {
    firstY: SCORE_PAPER.firstStaveY + topExtra + TEMPO_TOP_RESERVE,
    pageY: SCORE_PAPER.firstStaveY + topExtra, systemHeight, bottomReserve: staffSpaces(14) + bottomExtra,
    width: (measure, index, beginsSystem) => {
      const key = keySignatures[index]!;
      return measureWidth(measure, beginsSystem, key.fifths, key.changed);
    },
  }).map(placements => {
    const measures: MeasureLayout[] = placements.map(item => {
      const keySignature = keySignatures[item.number - 1]!;
      return { ...item,
      keySignatureFifths: keySignature.fifths, previousKeySignatureFifths: keySignature.previousFifths,
        showKeySignature: item.beginsSystem || keySignature.changed };
    });
    return { width: SCORE_PAPER.width, height: SCORE_PAPER.height, staffSpace: STAFF_SPACE,
      clef: view.clef, tempoBpm: view.tempoBpm, measures };
  });
}
