// Layer A syntax/name-resolution scaffold only.
//
// These opaque declarations let authoritative Markdown `public-contract`
// fences parse and type-check as one proposed surface. They deliberately do
// not model the accepted Core V1 shapes. The mandatory Layer B assertion in
// `real-core-drift-assertions.ts` imports the real public root and is the only
// fixture that proves compatibility with accepted Core declarations.

interface ScoreDocument {
  readonly __syntaxOnlyScoreDocument?: never;
}

type JsonObject = Readonly<Record<string, unknown>>;

type ExtensionOwner =
  | { readonly kind: "score" }
  | { readonly kind: "part"; readonly partId: string };

type KernelSeverity = "error" | "warning";

interface KernelIssueLocation {
  readonly path: string;
}

type ScoreSupportResult = unknown;
type CommandFailure = { readonly code: string };
type CommandBusCreationFailure = { readonly code: string };
type ReadResult<Value> = { readonly __syntaxOnlyReadValue?: Value };

interface KernelReadState {
  readonly __syntaxOnlyKernelReadState?: never;
}

type MarkPersistedResult = unknown;
type EventSubscriptionResult = unknown;

declare class CommandBus {
  static create(initialDocument: ScoreDocument): unknown;
}

type KernelRegistryAccessFailure = { readonly code: string };
type KernelGatewayResult<Value> = {
  readonly __syntaxOnlyGatewayValue?: Value;
};
type RegistrySummary = unknown;
type CommandResult = unknown;
type CoreSelectorResult = unknown;

declare class KernelModuleGateway {
  summary(): KernelGatewayResult<RegistrySummary>;
  submit(input: unknown): KernelGatewayResult<CommandResult>;
  undo(): KernelGatewayResult<CommandResult>;
  redo(): KernelGatewayResult<CommandResult>;
  read(): KernelGatewayResult<ReadResult<KernelReadState>>;
  subscribe(handler: unknown): KernelGatewayResult<EventSubscriptionResult>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult>;
}

declare class KernelRegistry {}
