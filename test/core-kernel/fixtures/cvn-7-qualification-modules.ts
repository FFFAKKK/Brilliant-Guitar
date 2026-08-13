import type {
  CompiledDomainCommandContributionV1,
  CompiledDomainCommandDefinitionV1,
  CompiledDomainCommandRegistrationEntryV1,
  CompiledModuleEffectDefinitionV1,
  DomainCommandDecodeInputV1,
  DomainCommandPreparationResultV1,
  DomainContributionReadViewV1,
  DomainSupportClassificationV1,
  ModuleEffectApplyInputV1,
  ModuleEffectApplyResultV1,
  OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";
import type { WrittenPitch } from "../../../src/core-kernel/index";

type OfficialModuleSdkApi = typeof import("../../../src/core-kernel/module-sdk/index");
type FixtureModule = "score" | "part";

interface FixtureCommand {
  readonly owner:
    | { readonly kind: "score"; readonly documentId: string }
    | { readonly kind: "part"; readonly partId: string };
  readonly noteId: string;
  readonly pitch: WrittenPitch;
  readonly marker: string;
}

interface FixtureEffectPayload {
  readonly marker: string;
  readonly generatorVersion: 1;
  readonly schemaVersion: 1 | 2;
}

export interface Cvn7QualificationModuleFixture {
  readonly manifest: {
    readonly startupManifestVersion: 1;
    readonly modules: readonly unknown[];
  };
  readonly registrationEntries: readonly CompiledDomainCommandRegistrationEntryV1[];
  readonly knownRequirementInventory: {
    readonly inventoryVersion: 1;
    readonly requirements: readonly unknown[];
  };
  readonly scoreCommandId: "fixture.cvn7.score.apply";
  readonly partCommandId: "fixture.cvn7.part.apply";
  readonly inputRegistrationOrder: readonly [
    "fixture.cvn7.score.module",
    "fixture.cvn7.part.module",
  ];
  readonly expectedCanonicalOrder: readonly [
    "fixture.cvn7.part.module",
    "fixture.cvn7.score.module",
  ];
  readonly resetTrace: () => void;
  readonly readTrace: () => readonly string[];
  readonly createScoreCommand: (
    documentId: string,
    noteId: string,
    pitch: WrittenPitch,
    marker: string,
  ) => unknown;
  readonly createPartCommand: (
    partId: string,
    noteId: string,
    pitch: WrittenPitch,
    marker: string,
  ) => unknown;
}

const IDENTITIES = Object.freeze({
  score: Object.freeze({
    moduleId: "fixture.cvn7.score.module",
    contributionId: "fixture.cvn7.score.contribution.v1",
    commandId: "fixture.cvn7.score.apply",
    effectKind: "fixture.cvn7.score.replace",
    namespace: "fixture.cvn7.score",
  }),
  part: Object.freeze({
    moduleId: "fixture.cvn7.part.module",
    contributionId: "fixture.cvn7.part.contribution.v1",
    commandId: "fixture.cvn7.part.apply",
    effectKind: "fixture.cvn7.part.replace",
    namespace: "fixture.cvn7.part",
  }),
} as const);

function unwrap<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") {
    throw new Error("CVN-7 official module fixture definition was rejected");
  }
  return result.value;
}

function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some(
        (key) => typeof key !== "string" || !expectedKeys.includes(key),
      )
    ) {
      return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const expectedKey of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, expectedKey);
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      result[expectedKey] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function isWrittenPitch(value: unknown): value is WrittenPitch {
  const fields = readExactDataRecord(value, ["step", "alter", "octave"]);
  if (fields === undefined) {
    return false;
  }
  return (
    (fields.step === "C" ||
      fields.step === "D" ||
      fields.step === "E" ||
      fields.step === "F" ||
      fields.step === "G" ||
      fields.step === "A" ||
      fields.step === "B") &&
    typeof fields.alter === "number" &&
    Number.isInteger(fields.alter) &&
    fields.alter >= -2 &&
    fields.alter <= 2 &&
    typeof fields.octave === "number" &&
    Number.isInteger(fields.octave) &&
    fields.octave >= 0 &&
    fields.octave <= 8
  );
}

function decodeCommandPayload(
  module: FixtureModule,
  input: DomainCommandDecodeInputV1,
): FixtureCommand | undefined {
  const payload = readExactDataRecord(input.payload, ["noteId", "pitch", "marker"]);
  const target = module === "score"
    ? readExactDataRecord(input.target, ["kind", "documentId"])
    : readExactDataRecord(input.target, ["kind", "partId"]);
  if (payload === undefined || target === undefined) {
    return undefined;
  }
  if (
    typeof payload.noteId !== "string" ||
    payload.noteId.length === 0 ||
    !isWrittenPitch(payload.pitch) ||
    typeof payload.marker !== "string"
  ) {
    return undefined;
  }
  if (module === "score") {
    return target.kind === "document" &&
      typeof target.documentId === "string" &&
      target.documentId.length > 0
      ? {
          owner: { kind: "score", documentId: target.documentId },
          noteId: payload.noteId,
          pitch: payload.pitch,
          marker: payload.marker,
        }
      : undefined;
  }
  return target.kind === "part" &&
    typeof target.partId === "string" &&
    target.partId.length > 0
    ? {
        owner: { kind: "part", partId: target.partId },
        noteId: payload.noteId,
        pitch: payload.pitch,
        marker: payload.marker,
      }
    : undefined;
}

function decodeEffectPayload(input: unknown): FixtureEffectPayload | undefined {
  const fields = readExactDataRecord(input, [
    "marker",
    "generatorVersion",
    "schemaVersion",
  ]);
  if (fields === undefined) {
    return undefined;
  }
  return typeof fields.marker === "string" &&
    fields.generatorVersion === 1 &&
    (fields.schemaVersion === 1 || fields.schemaVersion === 2)
    ? {
        marker: fields.marker,
        generatorVersion: 1,
        schemaVersion: fields.schemaVersion,
      }
    : undefined;
}

export function createCvn7QualificationModules(
  sdk: OfficialModuleSdkApi,
): Cvn7QualificationModuleFixture {
  const callbackTrace: string[] = [];
  const record = (family: string, module: FixtureModule): void => {
    callbackTrace.push(`${family}:${module}`);
  };

  const decodeCommand = (
    module: FixtureModule,
    input: DomainCommandDecodeInputV1,
  ) => {
    record("commandDecode", module);
    const command = decodeCommandPayload(module, input);
    return command === undefined
      ? ({ status: "invalid" } as const)
      : ({ status: "decoded", command } as const);
  };

  const prepareCommand = (
    module: FixtureModule,
    view: DomainContributionReadViewV1,
    command: FixtureCommand,
  ): DomainCommandPreparationResultV1 => {
    record("commandPrepare", module);
    const owner = command.owner.kind === "score"
      ? ({ kind: "score" } as const)
      : ({ kind: "part", partId: command.owner.partId } as const);
    return {
      status: "changed",
      effectRequests: [
        {
          requestVersion: 1,
          requestKind: "core.note.replace-written-pitch",
          target: { kind: "note", noteId: command.noteId },
          writtenPitch: command.pitch,
        },
        {
          requestVersion: 1,
          requestKind: "module.extension",
          effectKind: IDENTITIES[module].effectKind,
          namespace: IDENTITIES[module].namespace,
          owner,
          payload: {
            marker: command.marker,
            generatorVersion: 1,
            schemaVersion: 1,
          },
        },
      ],
      affected: [
        { kind: "note", noteId: command.noteId },
        module === "score"
          ? { kind: "document", documentId: view.documentId }
          : { kind: "part", partId: owner.kind === "part" ? owner.partId : "cvn7-p-00" },
      ],
    };
  };

  const createCommandDefinition = (
    module: FixtureModule,
  ): CompiledDomainCommandDefinitionV1 =>
    unwrap(
      sdk.defineDomainCommandV1<FixtureCommand>({
        descriptor: {
          descriptorVersion: 1,
          commandId: IDENTITIES[module].commandId,
          commandVersion: 1,
          source: {
            moduleId: IDENTITIES[module].moduleId,
            contributionId: IDENTITIES[module].contributionId,
          },
          targetKind: module === "score" ? "document" : "part",
          requiredCapabilities: ["command:execute", "score:read"],
          titleKey: `fixture.cvn7.${module}.command.apply.title`,
        },
        decode: (input) => decodeCommand(module, input),
        prepare: (view, command) => prepareCommand(module, view, command),
      }),
    );

  const createEffectDefinition = (
    module: FixtureModule,
  ): CompiledModuleEffectDefinitionV1 =>
    unwrap(
      sdk.defineModuleEffectV1<FixtureEffectPayload>({
        descriptor: {
          descriptorVersion: 1,
          effectKind: IDENTITIES[module].effectKind,
          source: {
            moduleId: IDENTITIES[module].moduleId,
            contributionId: IDENTITIES[module].contributionId,
          },
          namespace: IDENTITIES[module].namespace,
          ownerKinds: [module],
          supportedSchemaVersions: [1, 2],
        },
        decode: (input) => {
          record("effectDecode", module);
          const payload = decodeEffectPayload(input);
          return payload === undefined
            ? { status: "invalid" }
            : { status: "decoded", payload };
        },
        transform: (
          input: ModuleEffectApplyInputV1<FixtureEffectPayload>,
        ): ModuleEffectApplyResultV1 => {
          record("effectTransform", module);
          return {
            status: "replace",
            schemaVersion: input.payload.schemaVersion,
            payload: {
              marker: input.payload.marker,
              generatorVersion: 1,
            },
          };
        },
      }),
    );

  const commands = {
    score: createCommandDefinition("score"),
    part: createCommandDefinition("part"),
  } as const;
  const effects = {
    score: createEffectDefinition("score"),
    part: createEffectDefinition("part"),
  } as const;

  const createContribution = (
    module: FixtureModule,
  ): CompiledDomainCommandContributionV1 =>
    unwrap(
      sdk.defineDomainCommandContributionV1({
        apiVersion: 1,
        moduleId: IDENTITIES[module].moduleId,
        contributionId: IDENTITIES[module].contributionId,
        extensionNamespaces: [IDENTITIES[module].namespace],
        extensionRequirements: [
          {
            requirementVersion: 1,
            namespace: IDENTITIES[module].namespace,
            moduleId: IDENTITIES[module].moduleId,
            contributionId: IDENTITIES[module].contributionId,
            supportedSchemaVersions: [1, 2],
            requiredForWrite: true,
          },
        ],
        commands: [commands[module]],
        validate: (_view) => {
          record("validate", module);
          return [];
        },
        classify: (_view): DomainSupportClassificationV1 => {
          record("classify", module);
          return { status: "supported", issues: [] };
        },
        effects: [effects[module]],
      }),
    );

  const contributions = {
    score: createContribution("score"),
    part: createContribution("part"),
  } as const;

  const createRegistration = (
    module: FixtureModule,
  ): CompiledDomainCommandRegistrationEntryV1 =>
    unwrap(
      sdk.defineDomainCommandRegistrationEntryV1({
        registrationEntryId: "kernel.domain-commands.v1",
        ownerModuleId: IDENTITIES[module].moduleId,
        kind: "domain-command",
        contributions: [contributions[module]],
      }),
    );

  const registrationEntries = Object.freeze([
    createRegistration("score"),
    createRegistration("part"),
  ]);

  const manifest = Object.freeze({
    startupManifestVersion: 1 as const,
    modules: Object.freeze([
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
      ...(["score", "part"] as const).map((module) => ({
        moduleId: IDENTITIES[module].moduleId,
        origin: "official",
        runtime: module === "score" ? "builtin" : "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [
          "command:register",
          "command:execute",
          "score:read",
          "event:subscribe",
        ],
        registrationEntryIds: ["kernel.domain-commands.v1"],
      })),
    ]),
  });

  const requirement = (module: FixtureModule) => ({
    requirementVersion: 1 as const,
    namespace: IDENTITIES[module].namespace,
    moduleId: IDENTITIES[module].moduleId,
    contributionId: IDENTITIES[module].contributionId,
    supportedSchemaVersions: [1, 2] as const,
    requiredForWrite: true as const,
  });

  return Object.freeze({
    manifest,
    registrationEntries,
    knownRequirementInventory: Object.freeze({
      inventoryVersion: 1 as const,
      requirements: Object.freeze([requirement("part"), requirement("score")]),
    }),
    scoreCommandId: IDENTITIES.score.commandId,
    partCommandId: IDENTITIES.part.commandId,
    inputRegistrationOrder: Object.freeze([
      IDENTITIES.score.moduleId,
      IDENTITIES.part.moduleId,
    ]) as Cvn7QualificationModuleFixture["inputRegistrationOrder"],
    expectedCanonicalOrder: Object.freeze([
      IDENTITIES.part.moduleId,
      IDENTITIES.score.moduleId,
    ]) as Cvn7QualificationModuleFixture["expectedCanonicalOrder"],
    resetTrace: () => {
      callbackTrace.splice(0);
    },
    readTrace: () => Object.freeze([...callbackTrace]),
    createScoreCommand: (
      documentId: string,
      noteId: string,
      pitch: WrittenPitch,
      marker: string,
    ) => ({
      commandVersion: 1,
      commandId: IDENTITIES.score.commandId,
      target: { kind: "document", documentId },
      payload: { noteId, pitch, marker },
    }),
    createPartCommand: (
      targetPartId: string,
      noteId: string,
      pitch: WrittenPitch,
      marker: string,
    ) => ({
      commandVersion: 1,
      commandId: IDENTITIES.part.commandId,
      target: { kind: "part", partId: targetPartId },
      payload: { noteId, pitch, marker },
    }),
  });
}
