import {
  createModuleKernelIssueV1,
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
  type ModuleKernelIssue,
  type OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";
import type { WrittenPitch } from "../../../src/core-kernel/index";

type FixtureModule = "score" | "part";

interface FixtureCommand {
  readonly noteId: string;
  readonly pitch: WrittenPitch;
  readonly schemaVersion: number;
  readonly marker: string;
}

interface FixtureEffectPayload {
  readonly schemaVersion: number;
  readonly marker: string;
}

export const cvn6CallbackTrace: string[] = [];
export const cvn6CallbackCounts = {
  commandDecode: 0,
  commandPrepare: 0,
  validate: 0,
  classify: 0,
  effectDecode: 0,
  effectTransform: 0,
};

export const cvn6CallbackBehavior: {
  validatorIssueModule?: FixtureModule;
  classifierUnsupportedModule?: FixtureModule;
  throwFamily?: keyof typeof cvn6CallbackCounts;
  malformedFamily?: keyof typeof cvn6CallbackCounts;
  effectRequestCount?: number;
  coreOnlyEffectRequests?: boolean;
  affectedAddressCount?: number;
  validatorIssueCount?: number;
  replaceJsonStringify?: boolean;
} = {};

export function resetCvn6Callbacks(): void {
  cvn6CallbackTrace.splice(0);
  for (const key of Object.keys(cvn6CallbackCounts) as Array<keyof typeof cvn6CallbackCounts>) {
    cvn6CallbackCounts[key] = 0;
  }
  delete cvn6CallbackBehavior.validatorIssueModule;
  delete cvn6CallbackBehavior.classifierUnsupportedModule;
  delete cvn6CallbackBehavior.throwFamily;
  delete cvn6CallbackBehavior.malformedFamily;
  delete cvn6CallbackBehavior.effectRequestCount;
  delete cvn6CallbackBehavior.coreOnlyEffectRequests;
  delete cvn6CallbackBehavior.affectedAddressCount;
  delete cvn6CallbackBehavior.validatorIssueCount;
  delete cvn6CallbackBehavior.replaceJsonStringify;
}

function record(family: keyof typeof cvn6CallbackCounts, module: FixtureModule): void {
  cvn6CallbackCounts[family] += 1;
  cvn6CallbackTrace.push(`${family}:${module}`);
  if (cvn6CallbackBehavior.throwFamily === family) {
    throw new Error(`fixture ${family}`);
  }
}

function malformed(family: keyof typeof cvn6CallbackCounts): boolean {
  return cvn6CallbackBehavior.malformedFamily === family;
}

function unwrap<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") {
    throw new Error("invalid CVN-6 synthetic module fixture");
  }
  return result.value;
}

function issue(module: FixtureModule, suffix: string): ModuleKernelIssue {
  const moduleId = `fixture.${module}.module` as const;
  const created = createModuleKernelIssueV1({
    code: `${moduleId}.${suffix}`,
    source: {
      kind: "module",
      moduleId,
      contributionId: `fixture.${module}.contribution.v1`,
    },
  });
  if (created.status !== "created") {
    throw new Error("invalid fixture issue");
  }
  return created.issue;
}

function decodeCommand(
  module: FixtureModule,
  input: DomainCommandDecodeInputV1,
): { readonly status: "decoded"; readonly command: FixtureCommand } | { readonly status: "invalid" } {
  record("commandDecode", module);
  if (malformed("commandDecode")) {
    return { unexpected: true } as never;
  }
  const payload = input.payload as Partial<FixtureCommand> | null;
  return payload !== null &&
    typeof payload === "object" &&
    typeof payload.noteId === "string" &&
    typeof payload.pitch === "object" &&
    payload.pitch !== null &&
    typeof payload.schemaVersion === "number" &&
    typeof payload.marker === "string"
    ? {
        status: "decoded",
        command: {
          noteId: payload.noteId,
          pitch: payload.pitch as FixtureCommand["pitch"],
          schemaVersion: payload.schemaVersion,
          marker: payload.marker,
        },
      }
    : { status: "invalid" };
}

function prepareCommand(
  module: FixtureModule,
  owner: { readonly kind: "score" } | { readonly kind: "part"; readonly partId: string },
  _view: DomainContributionReadViewV1,
  command: FixtureCommand,
): DomainCommandPreparationResultV1 {
  record("commandPrepare", module);
  if (malformed("commandPrepare")) {
    return { status: "changed" } as never;
  }
  const effects = [
    {
      requestVersion: 1 as const,
      requestKind: "core.note.replace-written-pitch" as const,
      target: { kind: "note" as const, noteId: command.noteId },
      writtenPitch: command.pitch,
    },
    {
      requestVersion: 1 as const,
      requestKind: "module.extension" as const,
      effectKind: `fixture.${module}.replace`,
      namespace: `fixture.${module}`,
      owner,
      payload: {
        schemaVersion: command.schemaVersion,
        marker: command.marker,
      },
    },
  ];
  const requestedEffectCount = cvn6CallbackBehavior.effectRequestCount ?? effects.length;
  const effectPattern = cvn6CallbackBehavior.coreOnlyEffectRequests === true
    ? [effects[0]!]
    : effects;
  const rawEffectRequests = Array.from(
    { length: requestedEffectCount },
    (_, index) => effectPattern[index % effectPattern.length]!,
  );
  const effectRequests = rawEffectRequests as unknown as DomainCommandPreparationResultV1 extends {
    readonly status: "changed";
    readonly effectRequests: infer Requests;
  } ? Requests : never;
  const addresses = [
    { kind: "note" as const, noteId: command.noteId },
    owner.kind === "score"
      ? { kind: "document" as const, documentId: _view.documentId }
      : { kind: "part" as const, partId: owner.partId },
  ];
  const affected = Array.from(
    { length: cvn6CallbackBehavior.affectedAddressCount ?? addresses.length },
    (_, index) => addresses[index % addresses.length]!,
  );
  return {
    status: "changed",
    effectRequests,
    affected,
  };
}

function decodeEffect(
  module: FixtureModule,
  input: unknown,
): { readonly status: "decoded"; readonly payload: FixtureEffectPayload } | { readonly status: "invalid" } {
  record("effectDecode", module);
  if (malformed("effectDecode")) {
    return { status: "decoded" } as never;
  }
  const payload = input as Partial<FixtureEffectPayload> | null;
  return payload !== null &&
    typeof payload === "object" &&
    typeof payload.schemaVersion === "number" &&
    typeof payload.marker === "string"
    ? {
        status: "decoded",
        payload: {
          schemaVersion: payload.schemaVersion,
          marker: payload.marker,
        },
      }
    : { status: "invalid" };
}

function transformEffect(
  module: FixtureModule,
  input: ModuleEffectApplyInputV1<FixtureEffectPayload>,
): ModuleEffectApplyResultV1 {
  record("effectTransform", module);
  if (malformed("effectTransform")) {
    return { status: "replace", schemaVersion: 1 } as never;
  }
  if (cvn6CallbackBehavior.replaceJsonStringify === true) {
    JSON.stringify = (() => "{}") as typeof JSON.stringify;
  }
  return {
    status: "replace",
    schemaVersion: input.payload.schemaVersion,
    payload: { marker: input.payload.marker },
  };
}

function validate(
  module: FixtureModule,
  _view: DomainContributionReadViewV1,
): readonly ModuleKernelIssue[] {
  record("validate", module);
  if (malformed("validate")) {
    return { length: 0 } as never;
  }
  if (cvn6CallbackBehavior.validatorIssueCount !== undefined) {
    return Array.from(
      { length: cvn6CallbackBehavior.validatorIssueCount },
      () => issue(module, "semantic-invalid"),
    );
  }
  return cvn6CallbackBehavior.validatorIssueModule === module
    ? [issue(module, "semantic-invalid")]
    : [];
}

function classify(
  module: FixtureModule,
  _view: DomainContributionReadViewV1,
): DomainSupportClassificationV1 {
  record("classify", module);
  if (malformed("classify")) {
    return { status: "supported" } as never;
  }
  return cvn6CallbackBehavior.classifierUnsupportedModule === module
    ? { status: "unsupported", issues: [issue(module, "unsupported.fixture")] }
    : { status: "supported", issues: [] };
}

export const CVN6_SCORE_COMMAND: CompiledDomainCommandDefinitionV1 = unwrap(
  defineDomainCommandV1<FixtureCommand>({
    descriptor: {
      descriptorVersion: 1,
      commandId: "fixture.score.apply",
      commandVersion: 1,
      source: {
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
      },
      targetKind: "document",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: "fixture.score.command.apply.title",
    },
    decode: (input) => decodeCommand("score", input),
    prepare: (view, command) => prepareCommand("score", { kind: "score" }, view, command),
  }),
);

export const CVN6_PART_COMMAND: CompiledDomainCommandDefinitionV1 = unwrap(
  defineDomainCommandV1<FixtureCommand>({
    descriptor: {
      descriptorVersion: 1,
      commandId: "fixture.part.apply",
      commandVersion: 1,
      source: {
        moduleId: "fixture.part.module",
        contributionId: "fixture.part.contribution.v1",
      },
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: "fixture.part.command.apply.title",
    },
    decode: (input) => decodeCommand("part", input),
    prepare: (view, command) => prepareCommand(
      "part",
      { kind: "part", partId: (view.compatibleExtensions[0]?.owner as { partId?: string } | undefined)?.partId ?? "part-1" },
      view,
      command,
    ),
  }),
);

export const CVN6_SCORE_EFFECT: CompiledModuleEffectDefinitionV1 = unwrap(
  defineModuleEffectV1<FixtureEffectPayload>({
    descriptor: {
      descriptorVersion: 1,
      effectKind: "fixture.score.replace",
      source: {
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
      },
      namespace: "fixture.score",
      ownerKinds: ["score"],
      supportedSchemaVersions: [1, 2],
    },
    decode: (input) => decodeEffect("score", input),
    transform: (input) => transformEffect("score", input),
  }),
);

export const CVN6_PART_EFFECT: CompiledModuleEffectDefinitionV1 = unwrap(
  defineModuleEffectV1<FixtureEffectPayload>({
    descriptor: {
      descriptorVersion: 1,
      effectKind: "fixture.part.replace",
      source: {
        moduleId: "fixture.part.module",
        contributionId: "fixture.part.contribution.v1",
      },
      namespace: "fixture.part",
      ownerKinds: ["part"],
      supportedSchemaVersions: [1, 2],
    },
    decode: (input) => decodeEffect("part", input),
    transform: (input) => transformEffect("part", input),
  }),
);

function contribution(module: FixtureModule): CompiledDomainCommandContributionV1 {
  const moduleId = `fixture.${module}.module`;
  const contributionId = `fixture.${module}.contribution.v1`;
  const namespace = `fixture.${module}`;
  return unwrap(defineDomainCommandContributionV1({
    apiVersion: 1,
    moduleId,
    contributionId,
    extensionNamespaces: [namespace],
    extensionRequirements: [{
      requirementVersion: 1,
      namespace,
      moduleId,
      contributionId,
      supportedSchemaVersions: [1, 2],
      requiredForWrite: true,
    }],
    commands: [module === "score" ? CVN6_SCORE_COMMAND : CVN6_PART_COMMAND],
    validate: (view) => validate(module, view),
    classify: (view) => classify(module, view),
    effects: [module === "score" ? CVN6_SCORE_EFFECT : CVN6_PART_EFFECT],
  }));
}

export const CVN6_SCORE_CONTRIBUTION = contribution("score");
export const CVN6_PART_CONTRIBUTION = contribution("part");

function registration(
  module: FixtureModule,
  contributionValue: CompiledDomainCommandContributionV1,
): CompiledDomainCommandRegistrationEntryV1 {
  return unwrap(defineDomainCommandRegistrationEntryV1({
    registrationEntryId: "kernel.domain-commands.v1",
    ownerModuleId: `fixture.${module}.module`,
    kind: "domain-command",
    contributions: [contributionValue],
  }));
}

export const CVN6_REGISTRATION_ENTRIES = Object.freeze([
  registration("score", CVN6_SCORE_CONTRIBUTION),
  registration("part", CVN6_PART_CONTRIBUTION),
]);

export const CVN6_MANIFEST = Object.freeze({
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
    ...(["part", "score"] as const).map((module) => ({
      moduleId: `fixture.${module}.module`,
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
