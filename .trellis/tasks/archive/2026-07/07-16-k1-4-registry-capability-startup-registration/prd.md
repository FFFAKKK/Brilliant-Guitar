# K1-4 Registry Capability Startup Registration

## Status

- Phase: accepted at `94766a0930c05e5339c44f667deaf02116af1c0c`; independent technical acceptance passed on 2026-07-19.
- Tasks 1–6 and the acceptance repairs are complete, with 125/125 tests passing at the accepted baseline.
- K1-3 was accepted and archived at `7369eeac60fecea66c2c9164c04439625c2d78b0` with 102/102 tests passing.

## Goal

Define the minimum deterministic Core Kernel mechanism for startup-time internal module registration, contribution discovery, and capability enforcement, without turning K1-4 into a third-party plugin runtime or weakening the accepted K1-2/K1-3 command, snapshot, selector, and event boundaries.

## Background

- K1-2 owns a closed static catalog of six Core built-in commands; it has no dynamic registry bridge.
- K1-3 owns immutable document reads, six closed selectors, dirty checkpoints, and two post-commit event facts; event publication and handler records remain private.
- `ExtensionBlock` is persisted score data, not a registry contribution, module instance, or executable payload.
- `ScoreFeatureProfile` describes product support, not module authorization.
- K1-4 may support only deterministic startup-time `builtin` / `internal-module` composition. Third-party code execution, discovery, installation, sandboxing, runtime unload, hot reload, and permission UI are later Extension Host concerns.
- Existing `REQ-018`, `SPEC-015`, and the parent K1-4 sections are planning inputs only. Their contribution lists, error names, `registryVersion`, and `kernel.registry.changed` proposal are not approved contracts.

## Requirements

- The first registry contract supports exactly two contribution kinds: `command` and `selector`.
- Hard validators, technique definitions, migrations, import/export descriptors, and template descriptors remain outside K1-4 until a later task proves an executable consumer and approves their contracts.
- Startup registers executable adapters for the existing six Core commands and six K1-3 selectors. Registry-mediated module calls must resolve the contribution, authorize the caller, and then delegate to the accepted `CommandBus` or pure selector implementation.
- K1-4 does not add arbitrary command payload codecs, mutation kinds, handler-defined transaction paths, or new selector semantics. K1-2 replay and transaction results and K1-3 selector results remain unchanged.
- Existing direct `CommandBus` and selector APIs remain trusted Core Host compatibility APIs. Internal modules use a new capability-scoped gateway; later package-boundary work must prevent module code from treating trusted host APIs as its normal integration surface.
- `KernelModuleIdentity` contains a stable `moduleId`, `origin`, `runtime`, `trustLevel`, `apiVersion`, and an immutable granted-capability set. These dimensions are validated independently; official origin or a trusted runtime never implies a capability.
- The identity vocabulary reserves `origin = "official" | "third-party"`, `runtime = "builtin" | "internal-module" | "javascript-typescript"`, and `trustLevel = "system-trusted" | "sandboxed"` for protocol compatibility. K1-4 accepts only manifest-bound `official` + (`builtin` or `internal-module`) + `system-trusted` identities and returns stable rejection for all other combinations.
- Modules cannot self-assign trust or capabilities. K1-4 receives both only from the static startup manifest and compiled registration bindings.
- K1-4 defines exactly seven capabilities: `registry:read`, `command:register`, `selector:register`, `command:execute`, `selector:execute`, `score:read`, and `event:subscribe`.
- `command:execute` authorizes registry-mediated submit, undo, and redo. Registration capabilities never imply execution, read, or subscription capabilities, and no capability implies another.
- `markPersisted`, startup-manifest assembly, registry creation, and registry freeze remain trusted Core Host operations. K1-4 adds no `score:write`, event-registration, file, network, report, or operating-system capability.
- Registry startup uses one public all-or-nothing factory. The Core Host submits the complete manifest and compiled registration bindings; validation and handler binding occur in isolated candidate state, and success returns an already-frozen ready registry plus module gateways.
- A failed startup returns no usable or partially populated registry. Public APIs expose no mutable builder, incremental `register`, `seal`, `unregister`, `replace`, or post-ready mutation operation; private temporary assembly structures are implementation details only.
- K1-4 owns closed, privacy-safe startup and gateway failure unions. Startup codes cover invalid input, missing compiled registration entries, duplicate module/contribution IDs, unsupported origin/runtime/trust, incompatible API version, denied capability, invalid contribution, descriptor/handler mismatch, and internal error.
- Gateway codes cover invalid invocation, unknown module, unknown contribution, denied capability, and internal error. Startup validation plus disjoint command/selector ID sets make contribution-kind mismatch unreachable in a ready Registry, so it is not part of the public access failure union. Every K1-4 entrypoint catches unexpected exceptions and preserves the prior `CommandBus` state.
- After authorization and adapter dispatch, the accepted `CommandResult`, `ReadResult`, and event-subscription result pass through unchanged. K1-5 may map K1-4 codes into future `KernelError` or report issues but may not rename or reinterpret them.
- Failure payloads contain stable IDs and finite structured values only; they never contain raw exceptions, stack traces, source, file paths, handlers, registry internals, credentials, or mutable documents.
- K1-4 has no monotonic `registryVersion` and publishes no `kernel.registry.changed` event. The accepted K1-3 `KernelEvent` union remains closed and document/session-scoped.
- `startupManifestVersion: 1` and module/contribution `apiVersion` express protocol compatibility; they are not mutable runtime counters. A ready registry never changes, so consumers may retain or repeat-read the same frozen summary without invalidation events.
- `RegistrySummary` contains only `startupManifestVersion: 1`, modules sorted by `moduleId`, and contributions sorted by `kind` then `id`. Module entries expose only `moduleId` and `apiVersion: 1`.
- Every contribution summary exposes `id`, `kind`, `sourceModuleId`, `apiVersion: 1`, immutable `requiredCapabilities`, and `titleKey`. Command summaries additionally expose `targetKind`; selector summaries expose `inputKind = "snapshot" | "read-state"`.
- Summary reads return deeply frozen, detached values and are deeply equal across repeated reads. There is no Registry query DSL or `status` field; callers filter locally, and invalid/unsupported entries prevent startup instead of appearing as disabled records.
- Summary never exposes granted capabilities, origin, runtime, trust level, handler references, private indexes, or the registry object itself. `registry:read` authorizes directory access only and cannot infer or elevate permissions.
- Registry APIs never expose a second score-write path or mutable `ScoreDocument`; every authorized write still uses the accepted semantic command transaction.
- Stable caller-supplied IDs and deterministic ordering are mandatory. Registry code cannot depend on time, randomness, file paths, process state, React, VexFlow, Web Audio, or Tauri.
- Manifest-supplied module and registration-entry IDs are 1–128 characters and match `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`. Unsafe/path/URL/control/script-like IDs return `registry.invalid-startup-input`; a safe but uncompiled entry ID returns `registry.registration-entry-not-found`.
- `moduleId` is used only for Registry lookup, capability checks, safe rejection details, and summary source metadata. It is not added to command envelopes, HistoryEntry, undo/redo, replay, or K1-3 events; future K1-5 attribution must use a separate operation/report record.

## Out of Scope

- Third-party TypeScript/JavaScript/native execution and Extension Host implementation.
- Plugin package installation, discovery, signature verification, sandboxing, runtime enable/disable, unload, or hot reload.
- Guitar Domain commands or persisted technique schema.
- K1-5 general `KernelError`, diagnostic/report, recovery, migration orchestration, or import/export report implementation.
- UI command palette, renderer, playback, persistence IO, import/export implementations, or desktop-shell integration.
- Retired test technique registration, speculative Guitar technique contributions, Registry mutation/version/change events, or module attribution inside command history/document events.

## Acceptance Criteria

- [x] `prd.md`, `design.md`, and `implement.md` form a decision-complete K1-4 contract and were approved by the user on 2026-07-17 before production code starts.
- [x] Every approved contribution kind names a concrete current or immediately-following consumer; speculative kinds are excluded.
- [x] The default startup manifest registers exactly six command adapters and six selector adapters; no arbitrary handler or contribution kind is accepted.
- [x] Strict startup decoding rejects malformed shape, sparse arrays, accessors, unsupported identities, duplicate IDs, unknown compiled entries, incompatible API versions, missing registration capabilities, and handler/descriptor mismatch without throwing.
- [x] Startup composition, duplicate/version/runtime/capability rejection, freeze behavior, summary privacy, and deterministic ordering have testable contracts.
- [x] Reordering an equivalent manifest yields a deeply equal summary and identical gateway behavior.
- [x] Every denied or internal-error gateway path preserves document, version, history, dirty state, event sequence, subscriptions, and Registry state.
- [x] Authorized submit/undo/redo/read/select/subscribe return the accepted K1-2/K1-3 result contracts unchanged inside the gateway result.
- [x] Repeated summary reads are deeply equal and deeply frozen, and contain no granted capabilities, trust policy, handler, internal index, Registry, or mutable score data.
- [x] The plan explicitly preserves the K1-2 command transaction path and K1-3 snapshot/event boundaries.
- [x] History, replay, and K1-3 events remain deeply equal to trusted-host execution and contain no module attribution or Registry event.
- [x] The plan assigns K1-4 failure ownership without implementing K1-5 reports or leaking raw exceptions.
- [x] Public-boundary tests prove that handlers, mutable registry state, score mutation shortcuts, third-party runtimes, and post-start mutation APIs are not exported.
- [x] Final validation includes `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, forbidden-dependency checks, and Trellis task validation.
