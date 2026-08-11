import {
  createModuleKernelIssueV1,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  type CompiledDomainCommandContributionV1,
  type CompiledDomainCommandRegistrationEntryV1,
  type DomainCommandPreparationResultV1,
  type OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";
import type { WrittenPitch } from "../../../src/core-kernel/index";

interface ObserveTitleCommand {
  readonly expectedTitle: string;
  readonly noteId: string;
  readonly pitch: WrittenPitch;
}

interface ResourceProbeCommand {
  readonly effectRequestCount: number;
  readonly affectedAddressCount: number;
  readonly missingEffectTarget: boolean;
}

function unwrap<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") {
    throw new Error("invalid CVN-5 batch module fixture");
  }
  return result.value;
}

function rejectTitleMismatch(): DomainCommandPreparationResultV1 {
  const created = createModuleKernelIssueV1({
    code: "fixture.batch.module.title-mismatch",
    source: {
      kind: "module",
      moduleId: "fixture.batch.module",
      contributionId: "fixture.batch.contribution.v1",
    },
  });
  if (created.status !== "created") {
    throw new Error("invalid CVN-5 batch module issue fixture");
  }
  return { status: "rejected", issues: [created.issue] };
}

const observeTitleCommand = unwrap(defineDomainCommandV1<ObserveTitleCommand>({
  descriptor: {
    descriptorVersion: 1,
    commandId: "fixture.batch.observe-title",
    commandVersion: 1,
    source: {
      moduleId: "fixture.batch.module",
      contributionId: "fixture.batch.contribution.v1",
    },
    targetKind: "document",
    requiredCapabilities: ["command:execute", "score:read"],
    titleKey: "fixture.batch.command.observe-title.title",
  },
  decode: ({ payload }) => {
    const candidate = payload as Partial<ObserveTitleCommand> | null;
    return candidate !== null &&
      typeof candidate === "object" &&
      typeof candidate.expectedTitle === "string" &&
      typeof candidate.noteId === "string" &&
      candidate.pitch !== null &&
      typeof candidate.pitch === "object"
      ? {
          status: "decoded",
          command: {
            expectedTitle: candidate.expectedTitle,
            noteId: candidate.noteId,
            pitch: candidate.pitch as WrittenPitch,
          },
        }
      : { status: "invalid" };
  },
  prepare: (view, command) =>
    view.coreDocument.metadata.title === command.expectedTitle
      ? {
          status: "changed",
          effectRequests: [{
            requestVersion: 1,
            requestKind: "core.note.replace-written-pitch",
            target: { kind: "note", noteId: command.noteId },
            writtenPitch: command.pitch,
          }],
          affected: [{ kind: "note", noteId: command.noteId }],
        }
      : rejectTitleMismatch(),
}));

const resourceProbeCommand = unwrap(defineDomainCommandV1<ResourceProbeCommand>({
  descriptor: {
    descriptorVersion: 1,
    commandId: "fixture.batch.resource-probe",
    commandVersion: 1,
    source: {
      moduleId: "fixture.batch.module",
      contributionId: "fixture.batch.contribution.v1",
    },
    targetKind: "document",
    requiredCapabilities: ["command:execute", "score:read"],
    titleKey: "fixture.batch.command.resource-probe.title",
  },
  decode: ({ payload }) => {
    const candidate = payload as Partial<ResourceProbeCommand> | null;
    return candidate !== null &&
      typeof candidate === "object" &&
      Number.isSafeInteger(candidate.effectRequestCount) &&
      (candidate.effectRequestCount ?? 0) > 0 &&
      Number.isSafeInteger(candidate.affectedAddressCount) &&
      (candidate.affectedAddressCount ?? -1) >= 0 &&
      typeof candidate.missingEffectTarget === "boolean"
      ? {
          status: "decoded",
          command: {
            effectRequestCount: candidate.effectRequestCount as number,
            affectedAddressCount: candidate.affectedAddressCount as number,
            missingEffectTarget: candidate.missingEffectTarget,
          },
        }
      : { status: "invalid" };
  },
  prepare: (_view, command) => {
    const effect = {
      requestVersion: 1 as const,
      requestKind: "core.note.replace-written-pitch" as const,
      target: {
        kind: "note" as const,
        noteId: command.missingEffectTarget ? "missing-note" : "note-1",
      },
      writtenPitch: { step: "G" as const, alter: 0 as const, octave: 4 },
    };
    return {
      status: "changed",
      effectRequests: [
        effect,
        ...Array.from(
          { length: command.effectRequestCount - 1 },
          () => effect,
        ),
      ],
      affected: Array.from(
        { length: command.affectedAddressCount },
        (_, index) => ({ kind: "note" as const, noteId: `missing-note-${index}` }),
      ),
    };
  },
}));

const contribution: CompiledDomainCommandContributionV1 = unwrap(
  defineDomainCommandContributionV1({
    apiVersion: 1,
    moduleId: "fixture.batch.module",
    contributionId: "fixture.batch.contribution.v1",
    extensionNamespaces: ["fixture.batch"],
    extensionRequirements: [{
      requirementVersion: 1,
      namespace: "fixture.batch",
      moduleId: "fixture.batch.module",
      contributionId: "fixture.batch.contribution.v1",
      supportedSchemaVersions: [1],
      requiredForWrite: true,
    }],
    commands: [observeTitleCommand, resourceProbeCommand],
    validate: () => [],
    classify: () => ({ status: "supported", issues: [] }),
    effects: [],
  }),
);

export const CVN5_BATCH_REGISTRATION_ENTRIES: readonly CompiledDomainCommandRegistrationEntryV1[] =
  Object.freeze([
    unwrap(defineDomainCommandRegistrationEntryV1({
      registrationEntryId: "kernel.domain-commands.v1",
      ownerModuleId: "fixture.batch.module",
      kind: "domain-command",
      contributions: [contribution],
    })),
  ]);

export const CVN5_BATCH_MANIFEST = Object.freeze({
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
      moduleId: "fixture.batch.module",
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
