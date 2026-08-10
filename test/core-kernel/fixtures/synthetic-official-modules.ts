import {
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
  type CompiledDomainCommandContributionV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledDomainCommandRegistrationEntryV1,
  type CompiledModuleEffectDefinitionV1,
  type DomainCommandDecodeInputV1,
  type DomainCommandPreparationResultV1,
  type DomainContributionReadViewV1,
  type DomainSupportClassificationV1,
  type ModuleEffectApplyInputV1,
  type ModuleEffectApplyResultV1,
  type OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";

export const syntheticOfficialModuleCallbackCounts = {
  commandDecode: 0,
  commandPrepare: 0,
  validate: 0,
  classify: 0,
  effectDecode: 0,
  effectTransform: 0,
};

export function resetSyntheticOfficialModuleCallbackCounts(): void {
  for (const key of Object.keys(
    syntheticOfficialModuleCallbackCounts,
  ) as (keyof typeof syntheticOfficialModuleCallbackCounts)[]) {
    syntheticOfficialModuleCallbackCounts[key] = 0;
  }
}

interface ScoreTouchCommand {
  readonly documentId: string;
  readonly amount: number;
}

interface PartTouchCommand {
  readonly partId: string;
  readonly enabled: boolean;
}

interface ScoreEffectPayload {
  readonly amount: number;
}

interface PartEffectPayload {
  readonly enabled: boolean;
}

function unwrapDefined<T>(
  result: OfficialModuleDefinitionResultV1<T>,
): T {
  if (result.status !== "defined") {
    throw new Error("Synthetic official module definition is invalid");
  }
  return result.value;
}

function scoreCommandDecode(
  _input: DomainCommandDecodeInputV1,
): { readonly status: "decoded"; readonly command: ScoreTouchCommand } {
  syntheticOfficialModuleCallbackCounts.commandDecode += 1;
  return {
    status: "decoded",
    command: { documentId: "fixture-document", amount: 1 },
  };
}

function scoreCommandPrepare(
  _view: DomainContributionReadViewV1,
  _command: ScoreTouchCommand,
): DomainCommandPreparationResultV1 {
  syntheticOfficialModuleCallbackCounts.commandPrepare += 1;
  return { status: "no-op" };
}

function partCommandDecode(
  _input: DomainCommandDecodeInputV1,
): { readonly status: "decoded"; readonly command: PartTouchCommand } {
  syntheticOfficialModuleCallbackCounts.commandDecode += 1;
  return {
    status: "decoded",
    command: { partId: "fixture-part", enabled: true },
  };
}

function partCommandPrepare(
  _view: DomainContributionReadViewV1,
  _command: PartTouchCommand,
): DomainCommandPreparationResultV1 {
  syntheticOfficialModuleCallbackCounts.commandPrepare += 1;
  return { status: "no-op" };
}

function scoreEffectDecode(
  _input: unknown,
): { readonly status: "decoded"; readonly payload: ScoreEffectPayload } {
  syntheticOfficialModuleCallbackCounts.effectDecode += 1;
  return { status: "decoded", payload: { amount: 1 } };
}

function scoreEffectTransform(
  _input: ModuleEffectApplyInputV1<ScoreEffectPayload>,
): ModuleEffectApplyResultV1 {
  syntheticOfficialModuleCallbackCounts.effectTransform += 1;
  return { status: "remove" };
}

function partEffectDecode(
  _input: unknown,
): { readonly status: "decoded"; readonly payload: PartEffectPayload } {
  syntheticOfficialModuleCallbackCounts.effectDecode += 1;
  return { status: "decoded", payload: { enabled: true } };
}

function partEffectTransform(
  _input: ModuleEffectApplyInputV1<PartEffectPayload>,
): ModuleEffectApplyResultV1 {
  syntheticOfficialModuleCallbackCounts.effectTransform += 1;
  return { status: "remove" };
}

function validateContribution(
  _view: DomainContributionReadViewV1,
): readonly never[] {
  syntheticOfficialModuleCallbackCounts.validate += 1;
  return [];
}

function classifyContribution(
  _view: DomainContributionReadViewV1,
): DomainSupportClassificationV1 {
  syntheticOfficialModuleCallbackCounts.classify += 1;
  return { status: "supported", issues: [] };
}

export const SYNTHETIC_SCORE_COMMAND: CompiledDomainCommandDefinitionV1 =
  unwrapDefined(
    defineDomainCommandV1<ScoreTouchCommand>({
      descriptor: {
        descriptorVersion: 1,
        commandId: "fixture.score.touch",
        commandVersion: 1,
        source: {
          moduleId: "fixture.score.module",
          contributionId: "fixture.score.contribution.v1",
        },
        targetKind: "document",
        requiredCapabilities: ["command:execute", "score:read"],
        titleKey: "fixture.score.command.touch.title",
      },
      decode: scoreCommandDecode,
      prepare: scoreCommandPrepare,
    }),
  );

export const SYNTHETIC_PART_COMMAND: CompiledDomainCommandDefinitionV1 =
  unwrapDefined(
    defineDomainCommandV1<PartTouchCommand>({
      descriptor: {
        descriptorVersion: 1,
        commandId: "fixture.part.touch",
        commandVersion: 1,
        source: {
          moduleId: "fixture.part.module",
          contributionId: "fixture.part.contribution.v1",
        },
        targetKind: "part",
        requiredCapabilities: ["command:execute", "score:read"],
        titleKey: "fixture.part.command.touch.title",
      },
      decode: partCommandDecode,
      prepare: partCommandPrepare,
    }),
  );

export const SYNTHETIC_SCORE_EFFECT: CompiledModuleEffectDefinitionV1 =
  unwrapDefined(
    defineModuleEffectV1<ScoreEffectPayload>({
      descriptor: {
        descriptorVersion: 1,
        effectKind: "fixture.score.replace",
        source: {
          moduleId: "fixture.score.module",
          contributionId: "fixture.score.contribution.v1",
        },
        namespace: "fixture.score",
        ownerKinds: ["score"],
        supportedSchemaVersions: [1],
      },
      decode: scoreEffectDecode,
      transform: scoreEffectTransform,
    }),
  );

export const SYNTHETIC_PART_EFFECT: CompiledModuleEffectDefinitionV1 =
  unwrapDefined(
    defineModuleEffectV1<PartEffectPayload>({
      descriptor: {
        descriptorVersion: 1,
        effectKind: "fixture.part.replace",
        source: {
          moduleId: "fixture.part.module",
          contributionId: "fixture.part.contribution.v1",
        },
        namespace: "fixture.part",
        ownerKinds: ["part"],
        supportedSchemaVersions: [1],
      },
      decode: partEffectDecode,
      transform: partEffectTransform,
    }),
  );

export const SYNTHETIC_SCORE_CONTRIBUTION: CompiledDomainCommandContributionV1 =
  unwrapDefined(
    defineDomainCommandContributionV1({
      apiVersion: 1,
      moduleId: "fixture.score.module",
      contributionId: "fixture.score.contribution.v1",
      extensionNamespaces: ["fixture.score"],
      extensionRequirements: [
        {
          requirementVersion: 1,
          namespace: "fixture.score",
          moduleId: "fixture.score.module",
          contributionId: "fixture.score.contribution.v1",
          supportedSchemaVersions: [1],
          requiredForWrite: true,
        },
      ],
      commands: [SYNTHETIC_SCORE_COMMAND],
      validate: validateContribution,
      classify: classifyContribution,
      effects: [SYNTHETIC_SCORE_EFFECT],
    }),
  );

export const SYNTHETIC_PART_CONTRIBUTION: CompiledDomainCommandContributionV1 =
  unwrapDefined(
    defineDomainCommandContributionV1({
      apiVersion: 1,
      moduleId: "fixture.part.module",
      contributionId: "fixture.part.contribution.v1",
      extensionNamespaces: ["fixture.part"],
      extensionRequirements: [
        {
          requirementVersion: 1,
          namespace: "fixture.part",
          moduleId: "fixture.part.module",
          contributionId: "fixture.part.contribution.v1",
          supportedSchemaVersions: [1],
          requiredForWrite: true,
        },
      ],
      commands: [SYNTHETIC_PART_COMMAND],
      validate: validateContribution,
      classify: classifyContribution,
      effects: [SYNTHETIC_PART_EFFECT],
    }),
  );

export const SYNTHETIC_SCORE_REGISTRATION_ENTRY: CompiledDomainCommandRegistrationEntryV1 =
  unwrapDefined(
    defineDomainCommandRegistrationEntryV1({
      registrationEntryId: "kernel.domain-commands.v1",
      ownerModuleId: "fixture.score.module",
      kind: "domain-command",
      contributions: [SYNTHETIC_SCORE_CONTRIBUTION],
    }),
  );

export const SYNTHETIC_PART_REGISTRATION_ENTRY: CompiledDomainCommandRegistrationEntryV1 =
  unwrapDefined(
    defineDomainCommandRegistrationEntryV1({
      registrationEntryId: "kernel.domain-commands.v1",
      ownerModuleId: "fixture.part.module",
      kind: "domain-command",
      contributions: [SYNTHETIC_PART_CONTRIBUTION],
    }),
  );

export const SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES = Object.freeze([
  SYNTHETIC_SCORE_REGISTRATION_ENTRY,
  SYNTHETIC_PART_REGISTRATION_ENTRY,
]);

export const SYNTHETIC_OFFICIAL_MODULE_MANIFEST = Object.freeze({
  startupManifestVersion: 1,
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
    {
      moduleId: "fixture.score.module",
      origin: "official",
      runtime: "builtin",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [
        "command:register",
        "command:execute",
        "score:read",
        "event:subscribe",
      ],
      registrationEntryIds: ["kernel.domain-commands.v1"],
    },
    {
      moduleId: "fixture.part.module",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [
        "command:register",
        "command:execute",
        "score:read",
        "event:subscribe",
      ],
      registrationEntryIds: ["kernel.domain-commands.v1"],
    },
  ]),
});
