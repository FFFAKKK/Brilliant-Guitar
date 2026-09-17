import type { NotationInteractionGeometry } from "./notation-renderer.ts";
import type { StaffLayout } from "./staff-layout.ts";
import { capacityUnits, usedUnits } from "./input-position.ts";
import { describeMeasureRuleWarnings } from "./rule-warning-description.ts";

export interface OverfullHighlightGeometry {
  readonly measureId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly description: string;
}

/** Keep the proof mark below the staff and limit it to the excess rhythmic span. */
export function resolveOverfullHighlights(layout: StaffLayout, interaction: NotationInteractionGeometry): readonly OverfullHighlightGeometry[] {
  const highlights: OverfullHighlightGeometry[] = [];
  for (const item of layout.measures) {
    const actual = usedUnits(item.measure), capacity = capacityUnits(item.measure);
    if (actual <= capacity) continue;
    const description = describeMeasureRuleWarnings(item.number, item.measure);
    if (!description) continue;
    const measure = interaction.measures.find((geometry) => geometry.measureId === item.measure.id);
    if (!measure) continue;
    const fallbackStart = measure.x + measure.width * Math.min(1, capacity / Math.max(actual, 1));
    const start = measure.nominalEndX ?? fallbackStart;
    const end = measure.actualEndX ?? measure.x + measure.width;
    const left = Math.max(measure.x, Math.min(start, end));
    const right = Math.min(measure.x + measure.width, Math.max(start, end));
    if (right - left < 1) continue;
    highlights.push({
      measureId: item.measure.id,
      x: left,
      y: measure.staffBottom + measure.lineSpacing * 1.75,
      width: right - left,
      description,
    });
  }
  return highlights;
}
