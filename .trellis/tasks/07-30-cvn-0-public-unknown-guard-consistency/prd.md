# CVN-0 Public Unknown-Guard Consistency

> **Lifecycle:** IMPLEMENTATION CANDIDATE / INDEPENDENT ACCEPTANCE PENDING.
> **Parent authority:** `../07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md` CVN-FC-010.

## Goal

把现有公开 `unknown -> boolean` predicates 收口为统一的 descriptor-first、zero-getter、no-throw 合同，同时保持 Core V1 的公开名称、TypeScript type-predicate signatures、有效领域值、命令/事务/Registry 与持久化行为不变。

本 Gate 只处理：

- `isJsonValue(value: unknown): value is JsonValue`；
- `isWrittenPitch(value: unknown): value is WrittenPitch`；
- `isTransposition(value: unknown): value is Transposition`；
- 三者直接复用的私有 strict-data inspection helper。

## Confirmed Baseline

- Git activation baseline: `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c` on parent branch `codex/gd-0-guitar-domain-core-transaction-contract`.
- Accepted Core V1 compatibility base: `d92a7586536ac8757c318ae6f75aabd8698f85ac`.
- Archived finding `CKV1-AUDIT-001` proves the current inconsistency:
  - `isWrittenPitch` executes a throwing `step` getter；
  - `isTransposition` executes a throwing `diatonicSteps` getter；
  - `isJsonValue` executes an enumerable value getter and can return `true`。
- Current affected production files are `src/core-kernel/domain/extensions.ts` and `src/core-kernel/domain/pitch.ts`.
- Existing public exports include all three predicates and are frozen.

## Product Decisions

### CVN0-D001 — Total public predicate

Every call returns exactly `true` or `false`. Hostile JavaScript objects, revoked Proxies, throwing reflection traps, accessors, cycles and depth do not leak a raw exception.

### CVN0-D002 — Descriptor-first means zero ordinary property reads

The predicates inspect prototype, own keys and own property descriptors inside an exception boundary. They do not read untrusted fields through `value.key`, `value[key]`, iteration, spread, `Object.values`, coercion, `toJSON`, `structuredClone` or user callbacks.

A Proxy `get` trap is therefore never invoked. `getPrototypeOf`, `ownKeys` and `getOwnPropertyDescriptor` traps may run because reflection is the inspection boundary; if any such trap throws or returns an invalid invariant, the predicate returns `false`.

### CVN0-D003 — Exact accepted record form

Accepted domain records use `Object.prototype` or `null` prototype and exact own enumerable data fields:

- WrittenPitch: `step`, `alter`, `octave`；
- Transposition: `diatonicSteps`, `chromaticSemitones`；
- JsonObject: any number of own enumerable string-keyed data fields whose values recursively satisfy JsonValue。

Accessor fields, symbol keys, non-enumerable application fields, extra WrittenPitch/Transposition fields, inherited fields and custom/class prototypes return `false`.

### CVN0-D004 — Exact accepted array form

A JSON array must have a valid own non-enumerable `length` data descriptor, dense own enumerable index data descriptors `0..length-1`, and no other own keys. Sparse arrays, accessor indices, symbol/custom properties and huge sparse-length tricks return `false` before length-proportional index traversal.

### CVN0-D005 — No V1 size policy change

CVN-0 introduces no public depth/property/array-length cap for these existing predicates. `isJsonValue` therefore uses iterative traversal rather than call-stack recursion. CVN-FC-010's depth `64` and property `1,048,576` limits belong to later VNext new decoders, not these V1 predicates.

### CVN0-D006 — No cache or retained input

Predicates retain no input reference, descriptor snapshot or global visited state after return. A later call re-evaluates the value's then-current shape.

## Requirements

### CVN0-R001 — Ordinary compatibility

All existing valid primitive, plain-object, null-prototype, pitch-boundary and transposition-boundary cases keep their current boolean result. Existing cycles, sparse arrays, non-finite JSON numbers and invalid pitch/transposition values remain `false`.

### CVN0-R002 — JsonValue traversal

- `null`, boolean, string and finite number are `true`；
- `undefined`, bigint, symbol, function, `NaN` and infinities are `false`；
- cycles are `false`；
- repeated non-cyclic shared references are allowed；
- a valid 20,000-level nested array completes without a thrown stack error；
- object and array descriptor values are each read from their descriptor exactly once per visit。

### CVN0-R003 — WrittenPitch rules

- `step` is exactly one of `C D E F G A B`；
- `alter` is an integer in `[-2, 2]`；
- `octave` is an integer in `[0, 8]`；
- exact own enumerable data fields and valid prototype are required。

### CVN0-R004 — Transposition rules

Both fields are numbers satisfying `Number.isSafeInteger`; exact own enumerable data fields and valid prototype are required.

### CVN0-R005 — Export and consumer compatibility

- Root export names and count remain exactly unchanged.
- Public type-predicate signatures remain unchanged.
- `transposeWrittenPitch`, semantic validation and strict command decoding retain their accepted ordinary-input behavior.
- No new public helper/type/error/result is exported.

### CVN0-R006 — Scope isolation

Production edits are limited to the two affected domain files plus one optional private helper under `src/core-kernel/domain/`. Focused tests use one new file `test/core-kernel/public-unknown-guards.test.ts`. Active spec synchronization is limited to the Core boundary/quality wording owned by this contract.

## Out of Scope

- ScoreDocument decoder redesign；
- command, transaction, history, replay, events, Registry or gateway behavior；
- factory/batch/module SDK resource-limit enforcement；
- deep-freeze, cloning or normalized decode results；
- Guitar/domain integration；
- UI, rendering, playback, persistence or physical IO；
- package, dependency, build-tool or public-export changes。

## Acceptance Criteria

- [x] CVN0-AC001: All three public predicates return boolean and leak zero raw exceptions across the fixed hostile matrix.
- [x] CVN0-AC002: Accessor getter counters remain `0`; Proxy `get` counters remain `0` for both accepted and rejected proxy fixtures.
- [x] CVN0-AC003: Throwing/revoked `getPrototypeOf`, `ownKeys` and `getOwnPropertyDescriptor` proxy cases return `false`.
- [x] CVN0-AC004: Exact-field plain and null-prototype WrittenPitch/Transposition values pass; accessor, extra-field, inherited-field, symbol, non-enumerable and custom-prototype forms fail.
- [x] CVN0-AC005: JsonValue primitive/object/array/cycle/shared-reference decisions match CVN0-R002.
- [x] CVN0-AC006: A huge sparse array is rejected before any index-descriptor loop; a dense 20,000-level nested value completes without stack failure.
- [x] CVN0-AC007: Existing ordinary tests and all 169 accepted Core V1 tests remain green or are superseded only by an explicitly recorded larger count.
- [x] CVN0-AC008: `test/core-kernel/public-api-boundary.test.ts` proves no root export drift.
- [x] CVN0-AC009: Git diff contains only approved source/test/spec/task paths and zero Guitar/UI/IO dependency.
- [x] CVN0-AC010: Typecheck, build, focused tests, full tests, Trellis validation and `git diff --check` pass from a clean reproducible execution.
- [ ] CVN0-AC011: Independent review confirms no public size cap, cache, mutable global state or generalized decoder subsystem entered CVN-0.
