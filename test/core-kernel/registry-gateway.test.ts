import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus } from "../../src/core-kernel/commands/command-bus";
import {
  CORE_COMPILED_REGISTRATION_ENTRIES,
} from "../../src/core-kernel/registry/builtins";
import {
  createKernelRegistry,
  type KernelModuleGateway,
  type KernelModuleGatewayCreationResult,
  type KernelRegistry,
} from "../../src/core-kernel/registry/runtime";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

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

function requireBus(): CommandBus {
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected a valid CommandBus fixture");
  }
  return created.value;
}

function createManifest(includeUnprivileged: boolean, reversed: boolean): {
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
  const modules = [
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
      moduleId: "internal.reader",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: ["score:read", "registry:read"],
      registrationEntryIds: [],
    },
  ];
  if (includeUnprivileged) {
    modules.push({
      moduleId: "internal.none",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [],
      registrationEntryIds: [],
    });
  }
  if (reversed) {
    modules.reverse();
    for (const module of modules) {
      module.capabilities.reverse();
      module.registrationEntryIds.reverse();
    }
  }
  return { startupManifestVersion: 1, modules };
}

function requireRegistry(manifest: unknown): KernelRegistry {
  const created = createKernelRegistry(manifest);
  if (!created.ok) {
    throw new Error(`expected a valid Registry: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  return created.registry;
}

function createGatewayDynamically(
  registry: KernelRegistry,
  moduleId: unknown,
  commandBus: unknown,
): KernelModuleGatewayCreationResult {
  const createGateway = registry.createGateway as unknown as (
    moduleId: unknown,
    commandBus: unknown,
  ) => KernelModuleGatewayCreationResult;
  return createGateway.call(registry, moduleId, commandBus);
}

function requireGateway(
  registry: KernelRegistry,
  moduleId: string,
  commandBus: CommandBus,
): KernelModuleGateway {
  const created = registry.createGateway(moduleId, commandBus);
  if (!created.ok) {
    throw new Error(`expected a valid gateway: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  return created.gateway;
}

function expectedContributionSummaries(): readonly unknown[] {
  return CORE_COMPILED_REGISTRATION_ENTRIES.flatMap((entry) =>
    entry.contributions.map(({ descriptor }) => descriptor),
  ).sort((left, right) => {
    const kind = left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
    return kind !== 0
      ? kind
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : 0;
  });
}

test("equivalent startup order yields one detached frozen privacy-safe summary", () => {
  const forward = requireRegistry(createManifest(false, false));
  const reversedManifest = createManifest(false, true);
  const reversed = requireRegistry(reversedManifest);
  reversedManifest.modules[0]!.moduleId = "tampered.after.startup";

  const forwardGateway = requireGateway(forward, "internal.reader", requireBus());
  const reversedGateway = requireGateway(
    reversed,
    "internal.reader",
    requireBus(),
  );
  const first = forwardGateway.summary();
  const second = reversedGateway.summary();
  const repeated = forwardGateway.summary();

  assert.equal(first.status, "authorized");
  assert.equal(second.status, "authorized");
  assert.equal(repeated.status, "authorized");
  if (
    first.status !== "authorized" ||
    second.status !== "authorized" ||
    repeated.status !== "authorized"
  ) {
    return;
  }

  assert.deepEqual(first.value, second.value);
  assert.deepEqual(repeated.value, first.value);
  assert.notEqual(repeated.value, first.value);
  assert.notEqual(repeated.value.modules, first.value.modules);
  assert.notEqual(repeated.value.contributions, first.value.contributions);
  assert.deepEqual(first.value.modules, [
    { moduleId: "core.commands", apiVersion: 1 },
    { moduleId: "core.selectors", apiVersion: 1 },
    { moduleId: "internal.reader", apiVersion: 1 },
  ]);
  assert.equal(first.value.contributions.length, 12);
  assert.deepEqual(first.value.contributions, expectedContributionSummaries());
  assertDeeplyFrozen(first.value);
  assertDeeplyFrozen(repeated.value);

  const serialized = JSON.stringify(first.value);
  for (const forbidden of [
    "handler",
    "origin",
    "runtime",
    "trustLevel",
    "capabilities",
    "registryVersion",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  assert.equal(
    Reflect.set(
      first.value.modules[0] as unknown as Record<string, unknown>,
      "moduleId",
      "tampered",
    ),
    false,
  );
  assert.equal(
    Reflect.set(
      first.value.contributions as unknown as Record<string, unknown>,
      "0",
      null,
    ),
    false,
  );
  assert.deepEqual(forwardGateway.summary(), repeated);
});

test("gateway creation and summary enforce exact module and registry capability", () => {
  const registry = requireRegistry(createManifest(true, false));
  const bus = requireBus();

  assert.deepEqual(
    registry.createGateway("internal.missing", bus),
    {
      ok: false,
      failure: {
        code: "registry.module-not-found",
        moduleId: "internal.missing",
      },
    },
  );
  assert.deepEqual(registry.createGateway("../unsafe", bus), {
    ok: false,
    failure: { code: "registry.invalid-invocation" },
  });
  assert.deepEqual(
    createGatewayDynamically(registry, "internal.reader", {}),
    { ok: false, failure: { code: "registry.invalid-invocation" } },
  );

  const unprivileged = requireGateway(registry, "internal.none", bus);
  assert.equal(Object.isFrozen(unprivileged), true);
  assert.deepEqual(unprivileged.summary(), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.none",
      capability: "registry:read",
    },
  });
});

test("gateway read authorizes independently and preserves the accepted ReadResult", () => {
  const registry = requireRegistry(createManifest(true, false));
  const directBus = requireBus();
  const gatewayBus = requireBus();
  const reader = requireGateway(registry, "internal.reader", gatewayBus);
  const unprivileged = requireGateway(registry, "internal.none", gatewayBus);

  const direct = directBus.read();
  assert.deepEqual(reader.read(), {
    status: "authorized",
    value: direct,
  });
  assert.deepEqual(unprivileged.read(), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.none",
      capability: "score:read",
    },
  });

  const throwingBus = requireBus();
  Object.defineProperty(throwingBus, "read", {
    enumerable: false,
    configurable: true,
    value(): never {
      throw new Error("raw bus error must not escape");
    },
  });
  const throwingGateway = requireGateway(
    registry,
    "internal.reader",
    throwingBus,
  );
  assert.deepEqual(throwingGateway.read(), {
    status: "rejected",
    failure: { code: "registry.internal-error" },
  });
});
