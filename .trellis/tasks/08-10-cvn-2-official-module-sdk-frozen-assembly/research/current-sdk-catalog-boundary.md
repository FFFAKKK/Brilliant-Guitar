# CVN-2 Current SDK/Catalog Boundary Evidence

## Purpose

This read-only research note records the repository facts used by the detailed CVN-2 plan. It does not activate implementation and introduces no authority above GD-0 or `CVN-FC-110/111`.

## Current application boundary

- `src/core-kernel/index.ts` is the application-facing Core root.
- `test/core-kernel/public-api-boundary.test.ts` asserts the exact runtime key allowlist and scans the root for private module leakage.
- Runtime error classes, deep-freeze helpers, Registry candidate builders, compiled entries, command adapters/effects, history, and Session state are absent from the root.
- `test/core-kernel/forbidden-dependency-boundary.test.ts` scans every Core TypeScript import/export/require/dynamic import/import type and rejects non-relative dependencies or paths escaping `src/core-kernel`.

Planning consequence: the official authoring API needs a separate explicit entry, and CVN-2 may add only type-only shared data to the application root.

## Current Registry boundary

- `registry/contracts.ts` defines seven existing capabilities, the official/third-party origin union, builtin/internal-module/javascript-typescript runtimes, system-trusted/sandboxed trust, startup manifest data, and stable Registry failures.
- `registry/strict-codec.ts` performs exact descriptor-first startup decoding.
- `registry/assembly.ts` performs all-or-nothing Core command/selector contribution validation, deterministic sorting, and frozen candidate construction.
- `registry/builtins.ts` owns two immutable Core registration entries and the exact Core startup manifest.
- `registry/runtime.ts` passes only the Core compiled entries to the existing Core-only Registry factory.
- Current compiled-entry lookup is keyed by registration ID alone; the shared domain entry requires a composite `(ownerModuleId, registrationEntryId)` lookup in the new domain compiler, without changing Core-only runtime behavior.

Planning consequence: CVN-2 extends the accepted startup ID decoder additively but builds the domain catalog in new isolated modules. It does not widen `createKernelRegistry()` into integrated behavior.

## Current strict-input and freeze primitives

- `codec/strict-input-capture.ts` captures unknown data through own enumerable data descriptors, creates a detached deeply frozen graph, and enforces depth `64` and property count `1,048,576`.
- The capture rejects functions, so compiled binding records must be inspected descriptor-first while callable slots are retained separately and never invoked during catalog construction.
- `read/deep-freeze.ts` recursively freezes data objects through data descriptors. It does not turn closure state into pure data.

Planning consequence: all manifest/descriptors/payload-independent metadata use the accepted capture/strict-reader principles. Function purity stays a trusted static-code review rule; CVN-2 validates callable slot kind and stores the references privately.

## Current transaction boundary

- CVN-1 already owns one command/transaction/history/event spine and a private nonempty effect-set foundation.
- Current Core adapters separate payload decoding from preparation and return `no-op`, changed effects/affected addresses, or a stable failure.
- CVN-2 must not add a second command path or call the stored module functions.

Planning consequence: the SDK signatures mirror decode/prepare/validate/classify/effect phases as inert bindings. CVN-6 later adapts them to the accepted spine.

## Accepted contract facts consumed

- Entry: `kernel.domain-commands.v1`.
- Outer ABI: exactly `apiVersion/moduleId/contributionId/extensionNamespaces/extensionRequirements/commands/validate/classify/effects`.
- Required identity profile: official, builtin/internal-module, system-trusted, capability-complete.
- Exact requirement versions: nonempty, strictly ascending, duplicate-free, positive safe integers.
- Successful catalog: detached, deterministic, deeply frozen, private process identity, no ready mutation.
- CVN-2 owns only `CVN-FC-110/111`; CVN-6 owns handler execution and integrated runtime.

## Protected accepted surfaces

The future operator treats these as characterization baselines, not redesign targets:

- the current accepted twenty-five Core command IDs; the parent final catalog remains twenty-eight after later gates, and CVN-2 adds none of those fixed IDs;
- Core-only `CommandBus`, Registry, gateway, replay, history, event, dirty/checkpoint, and public result behavior;
- GD-0 tagged public-contract fences and the active synchronized fence;
- `brilliant-score-1` and opaque extension round-trip behavior;
- zero Core-to-Guitar imports;
- final CVN-4 strict-input and rejection-atomicity repair.

## No unresolved product question

The accepted parent/GD-0/Extensibility documents answer ownership, public separation, V1 identity, limits, lifecycle, and future-port policy. The remaining work is implementation and verification of the fixed plan, not a new product choice.
