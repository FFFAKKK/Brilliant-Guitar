import {
  collectCurrentCoreSurfaceTrace,
  type Cvn3SurfaceTrace,
} from "./cvn-3-surface";

/**
 * CVN-4 owns the current additive Core command surface. Its fixture begins
 * from the accepted 49/10/10 checkpoint and is updated only at CVN-4 closure.
 */
export type Cvn4SurfaceTrace = Cvn3SurfaceTrace;

export function collectCvn4SurfaceTrace(): Cvn4SurfaceTrace {
  return collectCurrentCoreSurfaceTrace();
}

export function serializeCvn4SurfaceTrace(trace: Cvn4SurfaceTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
