import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CORE_COMPILED_REGISTRATION_ENTRIES,
  CORE_KERNEL_STARTUP_MANIFEST,
} from "../../src/core-kernel/registry/builtins";
import {
  buildRegistryCandidate,
  createKernelRegistry,
  decodeKernelStartupManifest,
  KernelModuleGateway,
  KernelRegistry,
} from "../../src/core-kernel/registry/runtime";
import type { DecodedKernelStartupManifest } from "../../src/core-kernel/registry/strict-codec";

type StartupFailure = Readonly<Record<string, unknown>> & {
  readonly code: string;
};

function createMutableManifest(): {
  startupManifestVersion: number;
  modules: Array<{
    moduleId: string;
    origin: string;
    runtime: string;
    trustLevel: string;
    apiVersion: number;
    capabilities: string[];
    registrationEntryIds: string[];
  }>;
} {
  return {
    startupManifestVersion: CORE_KERNEL_STARTUP_MANIFEST.startupManifestVersion,
    modules: CORE_KERNEL_STARTUP_MANIFEST.modules.map((module) => ({
      ...module,
      capabilities: [...module.capabilities],
      registrationEntryIds: [...module.registrationEntryIds],
    })),
  };
}

function assertStartupFailure(
  manifest: unknown,
  expectedFailure: StartupFailure,
): void {
  const result = createKernelRegistry(manifest);
  assert.deepEqual(result, { ok: false, failure: expectedFailure });
  assert.equal("registry" in result, false);
}

function decodeForCandidate(manifest: unknown): DecodedKernelStartupManifest {
  const result = decodeKernelStartupManifest(manifest);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected a decoded startup manifest");
  }
  return result.value;
}

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

test("default startup manifest is deeply frozen and owns two compiled entries", () => {
  assert.deepEqual(CORE_KERNEL_STARTUP_MANIFEST, {
    startupManifestVersion: 1,
    modules: [
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
    ],
  });
  assertDeeplyFrozen(CORE_KERNEL_STARTUP_MANIFEST);

  assert.deepEqual(
    CORE_COMPILED_REGISTRATION_ENTRIES.map((record) => {
      return {
        registrationEntryId: record.registrationEntryId,
        ownerModuleId: record.ownerModuleId,
        kind: record.kind,
        contributionCount: record.contributions.length,
      };
    }),
    [
      {
        registrationEntryId: "core.commands.v1",
        ownerModuleId: "core.commands",
        kind: "command",
        contributionCount: 6,
      },
      {
        registrationEntryId: "core.selectors.v1",
        ownerModuleId: "core.selectors",
        kind: "selector",
        contributionCount: 6,
      },
    ],
  );
  assertDeeplyFrozen(CORE_COMPILED_REGISTRATION_ENTRIES);
});

test("compiled entries bind only the approved command and selector descriptors", () => {
  const [commandEntry, selectorEntry] = CORE_COMPILED_REGISTRATION_ENTRIES;

  assert.deepEqual(
    commandEntry?.contributions.map(({ descriptor }) => descriptor),
    [
      {
        id: "core.document.set-metadata",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.set-metadata.title",
        targetKind: "document",
      },
      {
        id: "core.note.set-written-pitch",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.set-written-pitch.title",
        targetKind: "note",
      },
      {
        id: "core.event.set-note-value",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.set-note-value.title",
        targetKind: "event",
      },
      {
        id: "core.voice.insert-notes-event",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.insert-notes-event.title",
        targetKind: "voice",
      },
      {
        id: "core.voice.insert-rest-event",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.insert-rest-event.title",
        targetKind: "voice",
      },
      {
        id: "core.event.remove",
        kind: "command",
        sourceModuleId: "core.commands",
        apiVersion: 1,
        requiredCapabilities: ["command:execute"],
        titleKey: "core.command.remove-event.title",
        targetKind: "event",
      },
    ],
  );
  assert.equal(
    commandEntry?.contributions.every(
      (contribution) =>
        "commandDefinition" in contribution && !("selector" in contribution),
    ),
    true,
  );

  assert.deepEqual(
    selectorEntry?.contributions.map(({ descriptor }) => descriptor),
    [
      {
        id: "core.selector.score-metadata",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.score-metadata.title",
        inputKind: "snapshot",
      },
      {
        id: "core.selector.score-entity",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.score-entity.title",
        inputKind: "snapshot",
      },
      {
        id: "core.selector.score-entity-ownership",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.score-entity-ownership.title",
        inputKind: "snapshot",
      },
      {
        id: "core.selector.score-range",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.score-range.title",
        inputKind: "snapshot",
      },
      {
        id: "core.selector.history-state",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.history-state.title",
        inputKind: "read-state",
      },
      {
        id: "core.selector.dirty-state",
        kind: "selector",
        sourceModuleId: "core.selectors",
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: "core.selector.dirty-state.title",
        inputKind: "read-state",
      },
    ],
  );
  assert.equal(
    selectorEntry?.contributions.every(
      (contribution) =>
        !("commandDefinition" in contribution) &&
        "selector" in contribution &&
        typeof contribution.selector === "function",
    ),
    true,
  );
});

test("registry runtime factory exists and constructs only through its token", () => {
  const result = createKernelRegistry(CORE_KERNEL_STARTUP_MANIFEST);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.registry instanceof KernelRegistry, true);
    assert.equal(Object.isFrozen(result.registry), true);
  }

  assert.throws(() => Reflect.construct(KernelRegistry, []));
  assert.throws(() => Reflect.construct(KernelModuleGateway, []));

  const withConsumer = createMutableManifest();
  withConsumer.modules.push({
    moduleId: "internal.reader",
    origin: "official",
    runtime: "internal-module",
    trustLevel: "system-trusted",
    apiVersion: 1,
    capabilities: ["registry:read", "score:read"],
    registrationEntryIds: [],
  });
  assert.equal(createKernelRegistry(withConsumer).ok, true);
});

test("strict manifest codec rejects malformed structures without throwing", () => {
  const invalidInputs: readonly unknown[] = [
    undefined,
    null,
    false,
    1,
    "manifest",
    [],
    {},
    { startupManifestVersion: 1 },
    { modules: [] },
    { startupManifestVersion: 2, modules: [] },
    { startupManifestVersion: 1, modules: [], extra: true },
    { startupManifestVersion: 1, modules: {} },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], extra: true }],
    },
    {
      startupManifestVersion: 1,
      modules: [
        {
          moduleId: "core.commands",
          origin: "official",
          runtime: "builtin",
          trustLevel: "system-trusted",
          apiVersion: 1,
          capabilities: ["command:register"],
        },
      ],
    },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], origin: "unknown" }],
    },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], runtime: "native" }],
    },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], trustLevel: "trusted" }],
    },
    {
      startupManifestVersion: 1,
      modules: [
        { ...createMutableManifest().modules[0], capabilities: ["unknown"] },
      ],
    },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], apiVersion: Infinity }],
    },
    {
      startupManifestVersion: 1,
      modules: [{ ...createMutableManifest().modules[0], apiVersion: 1.5 }],
    },
    {
      startupManifestVersion: 1,
      modules: [
        {
          ...createMutableManifest().modules[0],
          capabilities: ["command:register", "command:register"],
        },
      ],
    },
    {
      startupManifestVersion: 1,
      modules: [
        {
          ...createMutableManifest().modules[0],
          registrationEntryIds: ["core.commands.v1", "core.commands.v1"],
        },
      ],
    },
  ];

  for (const input of invalidInputs) {
    assertStartupFailure(input, { code: "registry.invalid-startup-input" });
  }

  const accessorManifest = {
    get startupManifestVersion(): number {
      throw new Error("must not run");
    },
    modules: [],
  };
  assertStartupFailure(accessorManifest, {
    code: "registry.invalid-startup-input",
  });

  const throwingProxy = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("proxy escaped");
      },
    },
  );
  assertStartupFailure(throwingProxy, {
    code: "registry.invalid-startup-input",
  });

  const sparseModules: unknown[] = [];
  sparseModules.length = 1_000_000;
  assertStartupFailure(
    { startupManifestVersion: 1, modules: sparseModules },
    { code: "registry.invalid-startup-input" },
  );

  const accessorModules: unknown[] = [];
  Object.defineProperty(accessorModules, "0", {
    enumerable: true,
    get(): never {
      throw new Error("must not run");
    },
  });
  assertStartupFailure(
    { startupManifestVersion: 1, modules: accessorModules },
    { code: "registry.invalid-startup-input" },
  );
});

test("manifest IDs use a finite safe namespace while safe unknown entries stay diagnosable", () => {
  for (const moduleId of [
    "",
    "Core.Commands",
    "core/commands",
    "core\\commands",
    "https://core.commands",
    "core commands",
    "<script>",
    `core.${"a".repeat(124)}`,
  ]) {
    const manifest = createMutableManifest();
    manifest.modules[0]!.moduleId = moduleId;
    assertStartupFailure(manifest, { code: "registry.invalid-startup-input" });
  }

  for (const registrationEntryId of [
    "",
    "core/commands/v1",
    "../core.commands.v1",
    "core.commands.v1?url=true",
    "core.commands.\u0000.v1",
    `core.${"a".repeat(124)}`,
  ]) {
    const manifest = createMutableManifest();
    manifest.modules[0]!.registrationEntryIds = [registrationEntryId];
    assertStartupFailure(manifest, { code: "registry.invalid-startup-input" });
  }

  const safeUnknown = createMutableManifest();
  safeUnknown.modules[0]!.registrationEntryIds = ["core.unknown.v1"];
  assertStartupFailure(safeUnknown, {
    code: "registry.registration-entry-not-found",
    registrationEntryId: "core.unknown.v1",
  });
});

test("candidate validation returns every identity and binding failure deterministically", () => {
  const duplicateModule = createMutableManifest();
  duplicateModule.modules.push(structuredClone(duplicateModule.modules[0]!));
  assertStartupFailure(duplicateModule, {
    code: "registry.duplicate-module-id",
    moduleId: "core.commands",
  });

  const identityCases = [
    ["origin", "third-party", "registry.unsupported-origin"],
    ["runtime", "javascript-typescript", "registry.unsupported-runtime"],
    ["trustLevel", "sandboxed", "registry.unsupported-trust-level"],
    ["apiVersion", 2, "registry.api-version-incompatible"],
  ] as const;
  for (const [key, value, code] of identityCases) {
    const manifest = createMutableManifest();
    Object.assign(manifest.modules[0]!, { [key]: value });
    assertStartupFailure(manifest, { code, moduleId: "core.commands" });
  }

  const missingCapability = createMutableManifest();
  missingCapability.modules[0]!.capabilities = [];
  assertStartupFailure(missingCapability, {
    code: "registry.capability-denied",
    moduleId: "core.commands",
    capability: "command:register",
  });

  const decoded = decodeForCandidate(CORE_KERNEL_STARTUP_MANIFEST);

  const ownerMismatchEntries = CORE_COMPILED_REGISTRATION_ENTRIES.map(
    (entry, index) =>
      index === 0 ? { ...entry, ownerModuleId: "other.module" } : entry,
  );
  assert.deepEqual(
    buildRegistryCandidate(decoded, ownerMismatchEntries),
    {
      ok: false,
      failure: {
        code: "registry.registration-owner-mismatch",
        registrationEntryId: "core.commands.v1",
        moduleId: "core.commands",
      },
    },
  );
});

test("candidate seam closes corrupted compiled contribution failures", () => {
  const decoded = decodeForCandidate(CORE_KERNEL_STARTUP_MANIFEST);
  const commandEntry = CORE_COMPILED_REGISTRATION_ENTRIES[0]!;
  const selectorEntry = CORE_COMPILED_REGISTRATION_ENTRIES[1]!;
  const firstCommand = commandEntry.contributions[0]!;
  const secondCommand = commandEntry.contributions[1]!;
  const firstSelector = selectorEntry.contributions[0]!;

  const duplicateEntries = [
    {
      ...commandEntry,
      contributions: [firstCommand, firstCommand],
    },
    selectorEntry,
  ];
  assert.deepEqual(buildRegistryCandidate(decoded, duplicateEntries), {
    ok: false,
    failure: {
      code: "registry.duplicate-contribution-id",
      contributionId: firstCommand.descriptor.id,
    },
  });

  const invalidEntries = [
    {
      ...commandEntry,
      contributions: [
        {
          ...firstCommand,
          descriptor: { ...firstCommand.descriptor, titleKey: "invalid title" },
        },
      ],
    },
    selectorEntry,
  ];
  assert.deepEqual(buildRegistryCandidate(decoded, invalidEntries), {
    ok: false,
    failure: {
      code: "registry.invalid-contribution",
      registrationEntryId: "core.commands.v1",
    },
  });

  assert.equal("commandDefinition" in secondCommand, true);
  const mismatchedCommandEntries = [
    {
      ...commandEntry,
      contributions: [
        {
          ...firstCommand,
          commandDefinition:
            "commandDefinition" in secondCommand
              ? secondCommand.commandDefinition
              : undefined,
        },
      ],
    },
    selectorEntry,
  ];
  assert.deepEqual(
    buildRegistryCandidate(decoded, mismatchedCommandEntries),
    {
      ok: false,
      failure: {
        code: "registry.handler-mismatch",
        contributionId: firstCommand.descriptor.id,
      },
    },
  );

  if (!("selector" in firstSelector)) {
    assert.fail("expected a selector contribution");
  }
  const mismatchedSelectorEntries = [
    commandEntry,
    {
      ...selectorEntry,
      contributions: [
        {
          ...firstSelector,
          inputKind:
            firstSelector.descriptor.inputKind === "snapshot"
              ? "read-state"
              : "snapshot",
        },
      ],
    },
  ];
  assert.deepEqual(
    buildRegistryCandidate(decoded, mismatchedSelectorEntries),
    {
      ok: false,
      failure: {
        code: "registry.handler-mismatch",
        contributionId: firstSelector.descriptor.id,
      },
    },
  );

  const throwingEntries = new Proxy(CORE_COMPILED_REGISTRATION_ENTRIES, {
    ownKeys(): never {
      throw new Error("compiled table escaped");
    },
  });
  assert.deepEqual(buildRegistryCandidate(decoded, throwingEntries), {
    ok: false,
    failure: { code: "registry.internal-error" },
  });
});

test("strict decoder clones and lexically normalizes accepted manifest arrays", () => {
  const manifest = createMutableManifest();
  manifest.modules[0]!.capabilities = [
    "selector:register",
    "command:register",
  ];
  manifest.modules[0]!.registrationEntryIds = [
    "core.selectors.v1",
    "core.commands.v1",
  ];
  manifest.modules.push({
    moduleId: "internal.reader",
    origin: "official",
    runtime: "internal-module",
    trustLevel: "system-trusted",
    apiVersion: 1,
    capabilities: ["score:read", "registry:read"],
    registrationEntryIds: [],
  });
  manifest.modules.reverse();

  const decoded = decodeKernelStartupManifest(manifest);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const value = decoded.value as {
      readonly modules: readonly {
        readonly moduleId: string;
        readonly capabilities: readonly string[];
      }[];
    };
    const consumer = value.modules.find(
      (module) => module.moduleId === "internal.reader",
    );
    const commands = value.modules.find(
      (module) => module.moduleId === "core.commands",
    ) as
      | {
          readonly capabilities: readonly string[];
          readonly registrationEntryIds: readonly string[];
        }
      | undefined;
    assert.deepEqual(consumer?.capabilities, ["registry:read", "score:read"]);
    assert.deepEqual(commands?.capabilities, [
      "command:register",
      "selector:register",
    ]);
    assert.deepEqual(commands?.registrationEntryIds, [
      "core.commands.v1",
      "core.selectors.v1",
    ]);

    manifest.modules[0]!.capabilities[0] = "event:subscribe";
    assert.deepEqual(consumer?.capabilities, ["registry:read", "score:read"]);
  }
});
