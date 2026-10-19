import type { StaffLayout } from "./staff-layout.ts";
import type { InputSequenceAnchor } from "./note-properties.ts";

export interface NotationTheme {
  readonly ink: string;
  readonly muted: string;
  readonly fontFamily: string;
}

export interface EditAnchorGeometry {
  readonly measureId: string;
  readonly anchor: InputSequenceAnchor;
  readonly offsetUnits: number;
  readonly x: number;
  readonly y: number;
  readonly y1: number;
  readonly y2: number;
}

export interface EventGeometry {
  readonly measureId: string;
  readonly eventId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MeasureGeometry {
  readonly measureId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly staffBottom: number;
  readonly lineSpacing: number;
  /** Present on Tab; all line positions come from the rendered stave. */
  readonly stringYs?: readonly number[];
}

export interface NotationInteractionGeometry {
  readonly anchors: readonly EditAnchorGeometry[];
  readonly events: readonly EventGeometry[];
  readonly measures: readonly MeasureGeometry[];
}

/** The rhythm caret stays on the staff; pitch is previewed by a separate ghost note. */
export function rhythmCaretCenterY(anchor: Pick<EditAnchorGeometry, "y1" | "y2">): number {
  return (anchor.y1 + anchor.y2) / 2;
}

export interface RenderedNotation<Geometry extends NotationInteractionGeometry = NotationInteractionGeometry> {
  /** Adopt this complete root: it carries music-font inheritance and page coordinates. */
  readonly svg: SVGSVGElement;
  readonly interaction: Geometry;
}

/** Return a detached drawing; the component adopts it only if the request is still current. */
export interface NotationRenderer<Layout = StaffLayout, Geometry extends NotationInteractionGeometry = NotationInteractionGeometry> {
  render(layout: Layout, theme: NotationTheme, signal?: AbortSignal): Promise<RenderedNotation<Geometry>>;
}
