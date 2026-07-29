// Docs-only compile prelude for the accepted Core V1 public surface.
// It supplies existing names referenced by GD-0 fences; GD-0 declarations
// themselves must come from the authoritative Markdown snippets.

interface ScoreDocument {
  readonly documentId: string;
}

type JsonObject = Readonly<Record<string, unknown>>;

type ExtensionOwner =
  | { readonly kind: "score" }
  | { readonly kind: "part"; readonly partId: string };

type KernelSeverity = "error" | "warning";

interface KernelIssueLocation {
  readonly path: string;
}

type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | { readonly status: "unsupported"; readonly diagnostics: readonly unknown[] }
  | { readonly status: "invalid"; readonly diagnostics: readonly unknown[] };

type CommandFailure = {
  readonly code: "command.invalid-input";
};

type CommandBusCreationFailure = {
  readonly code: "command.invalid-initial-document";
};

type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: { readonly code: "read.failed" } };

interface KernelReadState {
  readonly snapshot: unknown;
}

type MarkPersistedResult =
  | { readonly status: "marked" }
  | { readonly status: "rejected" };

type EventSubscriptionResult =
  | { readonly status: "subscribed" }
  | { readonly status: "rejected" };

declare class CommandBus {
  static create(initialDocument: ScoreDocument): unknown;
}

type KernelRegistryAccessFailure = {
  readonly code: "registry.access-denied";
};

type KernelGatewayResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: KernelRegistryAccessFailure };

interface RegistrySummary {
  readonly moduleId: string;
}

type CommandResult = {
  readonly status: "committed" | "no-op" | "rejected";
};

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

type KernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: KernelModuleGateway }
  | { readonly ok: false; readonly failure: KernelRegistryAccessFailure };

declare class KernelRegistry {
  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult;
}
