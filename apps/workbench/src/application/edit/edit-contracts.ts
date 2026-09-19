import type { EditIntent } from "../../input/edit-intent.ts";

export type FocusDirective =
  | { readonly kind: "keep-selection"; readonly eventId: string }
  | { readonly kind: "after-insert"; readonly eventId: string }
  | { readonly kind: "at-measure-start"; readonly measureId: string }
  | { readonly kind: "at-measure-end"; readonly measureId: string }
  | { readonly kind: "at-offset"; readonly measureId: string; readonly offsetUnits: number }
  | { readonly kind: "clear" };

export interface EditOperationRequest<Payload = EditIntent> {
  readonly requestId: string;
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly payload: Payload;
}

export type EditOperationStatus = "committed" | "rejected" | "stale" | "retryable";

export interface EditOperationResult<Projection = unknown> {
  readonly status: EditOperationStatus;
  readonly projection?: Projection;
  readonly focus?: FocusDirective;
  readonly warnings?: readonly string[];
  readonly message?: string;
}

