import {
  CommandBus,
  KernelModuleGateway,
  KernelRegistry,
  type CommandBusCreationResult,
  type CommandResult,
  type CoreSelectorResult,
  type EventSubscriptionResult,
  type KernelGatewayResult,
  type KernelHistoryState,
  type KernelModuleGatewayCreationResult,
  type KernelReadState,
  type MarkPersistedResult,
  type ReadResult,
  type RegistrySummary,
  type ScoreEntityOwnership,
  type ScoreMetadata,
  type ScoreRangeSelection,
  type SelectedScoreEntity,
} from "../../../../src/core-kernel/index";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Assert<Value extends true> = Value;

type GatewayDiscriminants = Assert<
  Equal<KernelGatewayResult<unknown>["status"], "authorized" | "rejected">
>;
type AuthorizedGatewayKeys = Assert<
  Equal<
    keyof Extract<KernelGatewayResult<unknown>, { readonly status: "authorized" }>,
    "status" | "value"
  >
>;
type RejectedGatewayKeys = Assert<
  Equal<
    keyof Extract<KernelGatewayResult<unknown>, { readonly status: "rejected" }>,
    "status" | "failure"
  >
>;

type RegistryGatewayParameters = Assert<
  Equal<Parameters<KernelRegistry["createGateway"]>, [string, CommandBus]>
>;
type RegistryGatewayResult = Assert<
  Equal<
    ReturnType<KernelRegistry["createGateway"]>,
    KernelModuleGatewayCreationResult
  >
>;
type RegistryHasNoStaticGateway = Assert<
  Equal<"createGateway" extends keyof typeof KernelRegistry ? true : false, false>
>;

type GatewaySummaryResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["summary"]>,
    KernelGatewayResult<RegistrySummary>
  >
>;
type GatewayReadResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["read"]>,
    KernelGatewayResult<ReadResult<KernelReadState>>
  >
>;
type GatewaySubmitResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["submit"]>,
    KernelGatewayResult<CommandResult>
  >
>;
type GatewayUndoResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["undo"]>,
    KernelGatewayResult<CommandResult>
  >
>;
type GatewayRedoResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["redo"]>,
    KernelGatewayResult<CommandResult>
  >
>;
type GatewaySubscribeResult = Assert<
  Equal<
    ReturnType<KernelModuleGateway["subscribe"]>,
    KernelGatewayResult<EventSubscriptionResult>
  >
>;

declare const gateway: KernelModuleGateway;

const metadataSelection: KernelGatewayResult<ReadResult<ScoreMetadata>> =
  gateway.select({ selectorId: "core.selector.score-metadata" });
const entitySelection: KernelGatewayResult<ReadResult<SelectedScoreEntity>> =
  gateway.select({ selectorId: "core.selector.score-entity", address: {} });
const ownershipSelection: KernelGatewayResult<ReadResult<ScoreEntityOwnership>> =
  gateway.select({
    selectorId: "core.selector.score-entity-ownership",
    address: {},
  });
const rangeSelection: KernelGatewayResult<ReadResult<ScoreRangeSelection>> =
  gateway.select({ selectorId: "core.selector.score-range", range: {} });
const historySelection: KernelGatewayResult<ReadResult<KernelHistoryState>> =
  gateway.select({ selectorId: "core.selector.history-state" });
const dirtySelection: KernelGatewayResult<ReadResult<boolean>> = gateway.select({
  selectorId: "core.selector.dirty-state",
});
const catchAllSelection: KernelGatewayResult<CoreSelectorResult> =
  gateway.select({ selectorId: "fixture.unknown" });

type BusCreateResult = Assert<
  Equal<ReturnType<typeof CommandBus.create>, CommandBusCreationResult>
>;
type BusSubmitParameters = Assert<
  Equal<Parameters<CommandBus["submit"]>, [unknown]>
>;
type BusSubmitResult = Assert<
  Equal<ReturnType<CommandBus["submit"]>, CommandResult>
>;
type BusUndoResult = Assert<Equal<ReturnType<CommandBus["undo"]>, CommandResult>>;
type BusRedoResult = Assert<Equal<ReturnType<CommandBus["redo"]>, CommandResult>>;
type BusReadResult = Assert<
  Equal<ReturnType<CommandBus["read"]>, ReadResult<KernelReadState>>
>;
type BusMarkPersistedParameters = Assert<
  Equal<Parameters<CommandBus["markPersisted"]>, [unknown]>
>;
type BusMarkPersistedResult = Assert<
  Equal<ReturnType<CommandBus["markPersisted"]>, MarkPersistedResult>
>;
type BusSubscribeParameters = Assert<
  Equal<Parameters<CommandBus["subscribe"]>, [unknown]>
>;
type BusSubscribeResult = Assert<
  Equal<ReturnType<CommandBus["subscribe"]>, EventSubscriptionResult>
>;

type MarkPersistedDiscriminants = Assert<
  Equal<MarkPersistedResult["status"], "updated" | "no-op" | "rejected">
>;
type EventSubscriptionDiscriminants = Assert<
  Equal<EventSubscriptionResult["status"], "subscribed" | "rejected">
>;

void [
  metadataSelection,
  entitySelection,
  ownershipSelection,
  rangeSelection,
  historySelection,
  dirtySelection,
  catchAllSelection,
];
