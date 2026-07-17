import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CORE_COMPILED_REGISTRATION_ENTRIES,
  CORE_KERNEL_STARTUP_MANIFEST,
} from "../../src/core-kernel/registry/builtins";

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
