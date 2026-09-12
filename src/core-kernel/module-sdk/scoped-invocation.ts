// Private trusted-host seam. The fallback closure never crosses a guest boundary.
import type { CompiledDomainCommandContributionV1 } from "./contracts";
import type { KernelIntegratedCatalog } from "../registry/integrated-contracts";

export interface ScopedExecutionPolicyV1 {
  readonly catalog: KernelIntegratedCatalog;
  readonly invoke: ScopedCallbackInvokerV1;
}

export type ScopedCallbackOperationV1 = "commandDecode" | "commandPrepare" | "effectDecode" | "effectTransform" | "validate" | "classify";
export type ScopedCallbackInvokerV1 = (
  contribution: CompiledDomainCommandContributionV1,
  operation: ScopedCallbackOperationV1,
  definitionId: string | null,
  args: readonly unknown[],
  fallback: () => unknown,
) => unknown;

export const invokeScopedCallbackV1: ScopedCallbackInvokerV1 = (_source, _operation, _id, _args, fallback) => fallback();
