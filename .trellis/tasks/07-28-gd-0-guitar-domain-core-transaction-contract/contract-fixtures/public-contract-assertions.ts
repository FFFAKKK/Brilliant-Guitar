type ContractEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type ContractAssert<Value extends true> = Value;

type FactoryParametersAreFrozen = ContractAssert<
  ContractEqual<
    Parameters<typeof CommandBus.createIntegrated>,
    [ScoreDocument, KernelIntegratedCatalog]
  >
>;

type FactoryResultIsFrozen = ContractAssert<
  ContractEqual<
    ReturnType<typeof CommandBus.createIntegrated>,
    IntegratedCommandBusCreationResult
  >
>;

type RegistryHasNoStaticGateway = ContractAssert<
  ContractEqual<"createGateway" extends keyof typeof KernelRegistry ? true : false, false>
>;

type GatewayRetainsSummary = ContractAssert<
  ContractEqual<
    IntegratedKernelModuleGateway["summary"],
    KernelModuleGateway["summary"]
  >
>;

type GatewayRetainsSelect = ContractAssert<
  ContractEqual<
    IntegratedKernelModuleGateway["select"],
    KernelModuleGateway["select"]
  >
>;

type GatewayRetainsSubscribe = ContractAssert<
  ContractEqual<
    IntegratedKernelModuleGateway["subscribe"],
    KernelModuleGateway["subscribe"]
  >
>;

type ReplayParametersAreFrozen = ContractAssert<
  ContractEqual<
    Parameters<typeof replayKernelCommands>,
    [ScoreDocument, readonly unknown[], KernelIntegratedCatalog]
  >
>;

type ReplayResultIsFrozen = ContractAssert<
  ContractEqual<ReturnType<typeof replayKernelCommands>, ReplayKernelCommandsResult>
>;

type AvailabilityDiscriminantsExist = ContractAssert<
  ContractEqual<
    KernelWriteAvailability["status"] | KernelValidationAvailability["status"],
    "writable" | "read-only" | "complete" | "incomplete"
  >
>;

declare const contractRegistry: KernelRegistry;
declare const contractIntegratedBus: IntegratedCommandBus;

const contractIntegratedGatewayResult: IntegratedKernelModuleGatewayCreationResult =
  contractRegistry.createGateway("module.fixture", contractIntegratedBus);

void contractIntegratedGatewayResult;
