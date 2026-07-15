import type { ScoreEntityTarget } from "../commands/contracts";

export type ScoreAddress = ScoreEntityTarget;

export type MeasurePoint = {
  readonly kind: "measure";
  readonly measureId: string;
};

export type PartMeasurePoint = {
  readonly kind: "part-measure";
  readonly partId: string;
  readonly measureId: string;
};

export type VoiceEventPoint = {
  readonly kind: "voice-event";
  readonly voiceId: string;
  readonly eventId: string;
};

export type ScorePoint = MeasurePoint | PartMeasurePoint | VoiceEventPoint;

export type ScoreRange =
  | {
      readonly kind: "measure-range";
      readonly start: MeasurePoint;
      readonly end: MeasurePoint;
    }
  | {
      readonly kind: "part-measure-range";
      readonly start: PartMeasurePoint;
      readonly end: PartMeasurePoint;
    }
  | {
      readonly kind: "voice-event-range";
      readonly start: VoiceEventPoint;
      readonly end: VoiceEventPoint;
    };
