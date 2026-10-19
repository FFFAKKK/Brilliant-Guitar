export type AnimationIntent = "content-transition" | "selection-transition" | "drag-settle" | "shape-transition";
export type AnimationTransformIntent = Exclude<AnimationIntent, "shape-transition">;
export type AnimationVariant = Readonly<{ type: "instant" }>
  | Readonly<{ type: "spring"; stiffness: number; damping: number }>
  | Readonly<{ type: "tween"; duration: number; ease: readonly number[]; fadeDuration?: number; exitDuration?: number }>;
export type AnimationShapeVariant = Readonly<{ type: "instant" }>
  | Readonly<{ type: "tween"; duration: number; ease: readonly number[] }>;
export interface AnimationDefinition<Intent extends AnimationIntent = AnimationIntent> {
  readonly defaultVariant: string;
  readonly variants: Readonly<Record<string, Intent extends "shape-transition" ? AnimationShapeVariant : AnimationVariant>>;
}
export type AnimationDefinitions = { readonly [Intent in AnimationIntent]?: AnimationDefinition<Intent> };
export interface AnimationContribution {
  readonly contractVersion: 1;
  readonly definitions: AnimationDefinitions;
}
export interface AnimationContributionInput {
  readonly contractVersion: 1;
  readonly definitions?: AnimationDefinitions | null;
}
export interface AnimationValues { readonly x?: number; readonly y?: number; readonly opacity?: number }
export interface AnimationRectangle { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly opacity?: number }
export type AnimationPlaceRequest = Readonly<{ intent: AnimationTransformIntent; target: string; to: AnimationValues }>
  | Readonly<{ intent: "shape-transition"; target: string; to: AnimationRectangle }>;
export type AnimationPlayRequest = Readonly<{ intent: AnimationTransformIntent; target: string; to: AnimationValues; from?: AnimationValues | null;
  velocity?: Readonly<{ x?: number; y?: number }> | null; immediate?: boolean | null }>
  | Readonly<{ intent: "shape-transition"; target: string; to: AnimationRectangle; from?: AnimationRectangle | null;
    velocity?: never; immediate?: boolean | null }>;
export interface AnimationTargetGrant { readonly node: HTMLElement; readonly intents: readonly AnimationIntent[] }
export interface AnimationPlayback { readonly finished: Promise<Readonly<{ status: "completed" | "interrupted" | "cancelled" | "engine-failed" }>> }
export interface AnimationPort {
  hold(request: Readonly<{ intent: "shape-transition"; target: string }>): AnimationRectangle;
  hold(request: Readonly<{ intent: AnimationTransformIntent; target: string }>): AnimationValues;
  place(request: AnimationPlaceRequest): void;
  play(request: AnimationPlayRequest): AnimationPlayback;
  cancel(): void;
  dispose(): void;
}
export interface ComponentAnimationPort { bind(targets: Readonly<Record<string, AnimationTargetGrant>>): AnimationPort }
export const ANIMATION_CONTRACT_VERSION: 1;
export const ANIMATION_API_VERSION: "ui-motion/1";
export const ANIMATION_SHAPE_EXTENT: 512;
export const ANIMATION_LIMITS: Readonly<Record<AnimationIntent, number>>;
export const ANIMATION_BUDGET: Readonly<{ targets: number; active: number; variants: number; velocity: number; springSeconds: number }>;
export function animationRecord(value: unknown, allowed: readonly string[], name: string): Record<string, unknown>;
export function validAnimationVariant(value: unknown): value is string;
export function captureAnimationContribution(value?: unknown): AnimationContribution;
export function captureAnimationPermissions(value?: unknown): readonly AnimationIntent[];
export function captureAnimationValues(value: unknown, intent: "shape-transition"): AnimationRectangle;
export function captureAnimationValues(value: unknown, intent: AnimationTransformIntent): AnimationValues;
export function captureAnimationValues(value: unknown, intent: AnimationIntent): AnimationValues | AnimationRectangle;
