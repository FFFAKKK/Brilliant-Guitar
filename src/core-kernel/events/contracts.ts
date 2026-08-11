import type { CoreCommandId } from "../commands/catalog";
import type { ScoreAddress } from "../domain/address";

export type KernelEventCause = "submit" | "undo" | "redo" | "mark-persisted";

interface KernelEventBase {
  readonly eventVersion: 1;
  readonly eventSequence: number;
  readonly documentId: string;
  readonly documentVersion: number;
}

export type KernelEvent =
  | (KernelEventBase & {
      readonly eventType: "core.document.committed";
      readonly cause: "submit" | "undo" | "redo";
      readonly commandId: CoreCommandId;
      readonly affectedEntities: readonly ScoreAddress[];
    })
  | (KernelEventBase & {
      readonly eventType: "core.session.dirty-state-changed";
      readonly cause: KernelEventCause;
      readonly dirty: boolean;
    });

export interface KernelCommandIdentity {
  readonly commandId: string;
  readonly source:
    | { readonly kind: "core" }
    | {
        readonly kind: "module";
        readonly moduleId: string;
        readonly contributionId: string;
      };
}

export type IntegratedKernelEvent =
  | (Omit<
      Extract<KernelEvent, { readonly eventType: "core.document.committed" }>,
      "commandId"
    > &
      KernelCommandIdentity)
  | Extract<
      KernelEvent,
      { readonly eventType: "core.session.dirty-state-changed" }
    >;

export type KernelEventHandler = (event: KernelEvent) => void;
export type KernelEventUnsubscribe = () => void;

export type EventSubscriptionResult =
  | {
      readonly status: "subscribed";
      readonly unsubscribe: KernelEventUnsubscribe;
    }
  | {
      readonly status: "rejected";
      readonly failure: { readonly code: "event.invalid-handler" };
    };
