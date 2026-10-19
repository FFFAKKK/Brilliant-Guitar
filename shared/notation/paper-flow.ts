import { capacityUnits, durationUnits } from "./note-properties.ts";
import type { EventDuration } from "./note-properties.ts";
import { staffSpaces } from "./engraving-metrics.ts";

/** Rhythm and paper flow do not require a pitch or an instrument. */
export interface RhythmicMeasure {
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly events: readonly { readonly duration: EventDuration }[];
}
export const SCORE_PAPER = {
  format: "A4", orientation: "portrait", width: 700, height: 990,
  margin: 60, firstStaveY: 60 - staffSpaces(4),
} as const;
export const TEMPO_TOP_RESERVE = staffSpaces(7);

export function rhythmicMeasureWidth<T extends RhythmicMeasure>(
  measure: T, prefixSpaces: number, extraSpaces: (event: T["events"][number]) => number,
): number {
  if (!measure.events.length) return staffSpaces(prefixSpaces + 11);
  let remaining = capacityUnits(measure), body = 2;
  for (const event of measure.events) {
    const duration = durationUnits(event.duration);
    remaining -= duration;
    body += 2.6 + 1.2 * Math.sqrt(duration / 16) + event.duration.dots * 0.65 + extraSpaces(event);
  }
  body += 1.2 * Math.sqrt(Math.max(0, remaining) / 16);
  return staffSpaces(prefixSpaces + Math.max(11, body));
}

export interface PaperMeasureLayout<T> {
  readonly measure: T;
  readonly number: number;
  readonly system: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly beginsSystem: boolean;
  readonly showMeter: boolean;
}

/** The existing natural-width pagination shared by staff and Tab. */
export function flowScoreMeasures<T extends RhythmicMeasure>(items: readonly T[], options: {
  readonly firstY: number;
  readonly pageY: number;
  readonly systemHeight: number;
  readonly bottomReserve: number;
  readonly width: (measure: T, index: number, beginsSystem: boolean) => number;
  /** Distribute a system's spare width without shrinking its minimum measures. */
  readonly justifySystems?: boolean;
}): readonly (readonly PaperMeasureLayout<T>[])[] {
  const pages: PaperMeasureLayout<T>[][] = [];
  let measures: PaperMeasureLayout<T>[] = [];
  let x: number = SCORE_PAPER.margin, y = options.firstY, system = 0;
  const contentWidth = SCORE_PAPER.width - SCORE_PAPER.margin * 2;
  for (const [index, measure] of items.entries()) {
    let beginsSystem = x === SCORE_PAPER.margin;
    let width = Math.min(contentWidth, options.width(measure, index, beginsSystem));
    if (x + width > SCORE_PAPER.width - SCORE_PAPER.margin) {
      x = SCORE_PAPER.margin; y += options.systemHeight; system++; beginsSystem = true;
      width = Math.min(contentWidth, options.width(measure, index, true));
    }
    if (y + options.bottomReserve > SCORE_PAPER.height - SCORE_PAPER.margin && measures.length) {
      pages.push(measures); measures = [];
      x = SCORE_PAPER.margin; y = options.pageY; system = 0; beginsSystem = true;
    }
    const previous = items[index - 1];
    measures.push({ measure, number: index + 1, system, x, y, width, beginsSystem,
      showMeter: beginsSystem || !previous || previous.meter.numerator !== measure.meter.numerator
        || previous.meter.denominator !== measure.meter.denominator });
    x += width;
  }
  if (measures.length) pages.push(measures);
  if (options.justifySystems) for (const page of pages) {
    let start = 0;
    while (start < page.length) {
      let end = start + 1;
      while (end < page.length && page[end]!.system === page[start]!.system) end++;
      const naturalWidth = page.slice(start, end).reduce((sum, measure) => sum + measure.width, 0);
      const factor = contentWidth / naturalWidth;
      let systemX = SCORE_PAPER.margin;
      for (let index = start; index < end; index++) {
        const current = page[index]!;
        const justifiedWidth = index === end - 1 ? SCORE_PAPER.width - SCORE_PAPER.margin - systemX
          : current.width * factor;
        page[index] = { ...current, x: systemX, width: justifiedWidth };
        systemX += justifiedWidth;
      }
      start = end;
    }
  }
  return pages;
}
