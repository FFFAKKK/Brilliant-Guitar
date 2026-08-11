import {
  collectCurrentCoreSurfaceTrace,
  type Cvn3SurfaceTrace,
} from "./cvn-3-surface";

/**
 * CVN-4 established the additive Core command surface. Later accepted command
 * stages update this current-surface fixture without changing its runtime-export
 * checkpoint or any CVN-4 behavior assertion.
 */
export type Cvn4SurfaceTrace = Cvn3SurfaceTrace;

export function collectCvn4SurfaceTrace(): Cvn4SurfaceTrace {
  return collectCurrentCoreSurfaceTrace();
}

export function serializeCvn4SurfaceTrace(trace: Cvn4SurfaceTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
