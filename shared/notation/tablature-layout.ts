import { staffSpaces } from "./engraving-metrics.ts";
import { flowScoreMeasures, rhythmicMeasureWidth, SCORE_PAPER, TEMPO_TOP_RESERVE } from "./paper-flow.ts";
import type { PaperMeasureLayout } from "./paper-flow.ts";
import { isTablatureView } from "./tablature-model.ts";
import type { TablatureMeasure, TablatureView } from "./tablature-model.ts";

export interface TablatureLayout {
  readonly width: number;
  readonly height: number;
  readonly staffSpace: number;
  readonly stringCount: number;
  readonly tempoBpm: number;
  readonly measures: readonly PaperMeasureLayout<TablatureMeasure>[];
}

/** String count changes geometry; it does not select an instrument or compute pitch. */
export function layoutTablaturePages(view: TablatureView): readonly TablatureLayout[] {
  if (!isTablatureView(view)) throw new Error("Invalid tablature view");
  // Tab uses VexFlow's 13/10 line-spacing ratio. Its rhythm lane is below the strings.
  // A larger Tab stave and clear fret numerals form one engraving scale; host
  // zoom still belongs to the original reading viewport.
  const tabStaffSpace = staffSpaces(1.2);
  const stringHeight = (view.stringCount - 1) * 1.3;
  return flowScoreMeasures(view.measures, {
    firstY: SCORE_PAPER.firstStaveY + TEMPO_TOP_RESERVE,
    pageY: SCORE_PAPER.firstStaveY + staffSpaces(4),
    systemHeight: tabStaffSpace * (stringHeight + 16),
    bottomReserve: tabStaffSpace * (stringHeight + 13),
    justifySystems: true,
    width: (measure, _index, beginsSystem) => rhythmicMeasureWidth(measure, beginsSystem ? 7 : 0,
      event => event.content.kind === "note" ? Math.max(0, String(event.content.position.fret).length - 1) : 0) * 1.2,
  }).map(measures => ({ width: SCORE_PAPER.width, height: SCORE_PAPER.height,
    staffSpace: tabStaffSpace, stringCount: view.stringCount, tempoBpm: view.tempoBpm, measures }));
}
