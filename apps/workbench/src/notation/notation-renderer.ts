import type { StaffLayout } from "./staff-layout.ts";
import type { InputSequenceAnchor } from "../contracts/note-input.ts";

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
  readonly staffTop?: number;
  readonly staffBottom: number;
  readonly lineSpacing: number;
  /** Nominal rhythmic boundary and actual sequence tail, in rendered coordinates. */
  readonly nominalEndX?: number;
  readonly actualEndX?: number;
}

export interface NotationInteractionGeometry {
  readonly anchors: readonly EditAnchorGeometry[];
  readonly events: readonly EventGeometry[];
  readonly measures: readonly MeasureGeometry[];
}

export interface RenderedNotation {
  readonly svg: SVGSVGElement;
  readonly interaction: NotationInteractionGeometry;
}

/** Return a detached drawing; the component adopts it only if the request is still current. */
export interface NotationRenderer {
  render(layout: StaffLayout, theme: NotationTheme, signal?: AbortSignal): Promise<RenderedNotation>;
}
