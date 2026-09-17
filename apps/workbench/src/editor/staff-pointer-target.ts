import type { InputPitch } from "../contracts/note-input.ts";
import type { StaffView } from "../contracts/notation.ts";
import { capacityUnits, pitchAtY, usedUnits } from "../notation/input-position.ts";
import type { EditAnchorGeometry, NotationInteractionGeometry } from "../notation/notation-renderer.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";

export type StaffPointerTarget =
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "caret"; readonly point: ScoreEditPoint; readonly pitch: InputPitch }
  | null;

export interface StaffPointerInput {
  readonly view: StaffView;
  readonly interaction: NotationInteractionGeometry;
  readonly measureId: string;
  readonly eventId?: string | null;
  readonly x: number;
  readonly y: number;
  readonly writeNow: boolean;
}

function pointFromAnchor(view: StaffView, geometry: EditAnchorGeometry, pitch: InputPitch): ScoreEditPoint | null {
  const measure = view.measures.find((item) => item.id === geometry.measureId);
  return measure ? { partId: view.partId, staffId: view.staffId, measureId: measure.id,
    voiceId: measure.voiceId, anchor: geometry.anchor, offsetUnits: geometry.offsetUnits, preferredPitch: pitch } : null;
}

/** Pure pointer targeting shared by the rendered score and interaction regression tests. */
export function resolveStaffPointerTarget(input: StaffPointerInput): StaffPointerTarget {
  const { view, interaction, measureId, eventId, x, y, writeNow } = input;
  if (eventId) {
    const exists = interaction.events.some((item) => item.measureId === measureId && item.eventId === eventId);
    return exists && !writeNow ? { kind: "event", eventId } : null;
  }
  const measureGeometry = interaction.measures.find((item) => item.measureId === measureId);
  const measure = view.measures.find((item) => item.id === measureId);
  if (!measureGeometry || !measure) return null;
  const pitch = pitchAtY(y, measureGeometry.staffBottom, measureGeometry.lineSpacing);
  const eventTargets = interaction.events.filter((item) => item.measureId === measureId)
    .map((item) => ({ kind: "event" as const, eventId: item.eventId,
      distance: Math.abs(item.x + item.width / 2 - x) }));
  const hasFreeTail = measure.events.length === 0 || usedUnits(measure) < capacityUnits(measure);
  const targets: ({ readonly kind: "event"; readonly eventId: string; readonly distance: number }
    | { readonly kind: "empty"; readonly anchor: EditAnchorGeometry; readonly distance: number })[] = [...eventTargets];
  interaction.anchors.filter((item) => item.measureId === measureId
    && (item.offsetUnits <= usedUnits(measure) || hasFreeTail))
    .forEach((anchor) => targets.push({ kind: "empty", anchor, distance: Math.abs(anchor.x - x) }));
  const nearest = targets.reduce<typeof targets[number] | null>((best, item) =>
    !best || item.distance < best.distance ? item : best, null);
  if (nearest?.kind === "event") return writeNow ? null : { kind: "event", eventId: nearest.eventId };
  if (!nearest) return null;
  const point = pointFromAnchor(view, nearest.anchor, pitch);
  return point ? { kind: "caret", point, pitch } : null;
}
