# CVN-0 Public Unknown-Guard Consistency Design

## 1. Status and Authority

- Lifecycle: `IMPLEMENTATION CANDIDATE / INDEPENDENT ACCEPTANCE PENDING`.
- Parent contract: CVN-FC-010.
- Finding authority: archived `CKV1-AUDIT-001`.
- Compatibility: Core V1 public predicate names/signatures and all unrelated mechanisms remain frozen.

## 2. Current Problem

The three guards currently use different inspection models:

| Guard | Current risky operation | Current hostile outcome |
|---|---|---|
| `isWrittenPitch` | direct `candidate.step/alter/octave` reads | getter/Proxy `get` can execute or throw |
| `isTransposition` | direct field reads | getter/Proxy `get` can execute or throw |
| `isJsonValue` | `value[index]` and `record[key]` reads | getter executes; result can misleadingly be `true` |

This is a public-boundary consistency repair, not a new kernel mechanism.

## 3. Allowed File Shape

### Production

1. `src/core-kernel/domain/extensions.ts`
2. `src/core-kernel/domain/pitch.ts`
3. Optional: `src/core-kernel/domain/strict-data.ts`

The optional helper is private to domain implementations and is omitted from `src/core-kernel/index.ts`. Domain code does not import Registry/command codecs because that would invert dependency direction.

### Tests

1. New `test/core-kernel/public-unknown-guards.test.ts`
2. Existing tests remain characterization authorities and change only if a documented false assumption blocks compilation.

### Spec closeout

- `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`
- `.trellis/spec/core-kernel/backend/quality-guidelines.md`

## 4. Private Inspection Primitives

The optional helper owns only synchronous reflection operations wrapped by a total exception boundary:

- classify primitive；
- validate plain/null prototype；
- read exact own enumerable data record by an expected key list；
- read arbitrary JsonObject own enumerable string data entries；
- read dense array length and index descriptor values；
- reject symbols, accessors, unexpected keys/descriptors and reflection failures。

Every helper returns private data or `undefined`; it throws no error and exports nothing from the Core root. It performs no clone, freeze, mutation, cache, logging or error conversion.

## 5. Record Inspection Algorithm

For WrittenPitch/Transposition, execute in this exact order inside `try/catch`:

1. Reject primitive, `null` and Array.
2. Read prototype through reflection; accept only `Object.prototype` or `null`.
3. Read `Reflect.ownKeys` once.
4. Require exact key count and exact expected string-key set; reject symbols.
5. For expected keys in contract order, read each own descriptor once.
6. Require an enumerable data descriptor containing `value`; reject accessor/non-enumerable/missing descriptors.
7. Validate only captured descriptor values; perform zero property `get` operations.
8. Return boolean; catch any reflection failure and return `false`.

## 6. JsonValue Algorithm

Use an explicit DFS work stack with enter/exit frames:

1. Primitive frame: apply CVN0-R002 directly.
2. Object/array enter frame:
   - if object is in the active-path set, return `false`；
   - inspect prototype/keys/descriptors and capture child descriptor values；
   - add object to active path；
   - push one exit frame, then children in reverse order so validation follows original key/index order。
3. Exit frame: remove object from active path.

The active-path set, rather than a global seen set, rejects cycles while allowing a shared acyclic object to appear in multiple branches. All traversal state is call-local.

### Array fast rejection

Before reading any index descriptor:

1. Read the own `length` descriptor.
2. Require a non-enumerable data descriptor with a nonnegative safe-integer value; writable/configurable may be either value so frozen arrays remain valid.
3. Read own keys once.
4. Require exactly `length + 1` keys: `length` plus canonical decimal indices `0..length-1` and no symbol/custom keys.
5. If key count or canonical-index coverage differs, return `false` before a length-sized loop.

This makes `length = 0xffff_ffff` with zero indices a constant-shape rejection after `ownKeys`, rather than billions of index checks.

## 7. Proxy and Mutation Model

- A normal Proxy around a valid target may return `true` when its reflection traps expose valid descriptors; its `get` trap count remains zero.
- Throwing, revoked or invariant-violating reflection traps return `false` through the outer boundary.
- A Proxy may mutate its target during a reflection trap. The predicate validates the captured descriptor snapshot from that call and retains nothing afterward.
- The next predicate invocation starts from empty stack/set state and observes the new reflection result.

## 8. Compatibility and Protected Areas

### Must remain deeply/observably equal

- root export allowlist；
- ordinary predicate results；
- `transposeWrittenPitch` success/failure codes and values；
- semantic diagnostic codes/order for accepted fixtures；
- strict command decode results；
- ScoreDocument encode/decode；
- CommandBus/history/replay/read/event/Registry/report/migration behavior。

### Explicit contract tightening

Hostile or non-data runtime shapes that previously executed code or were accidentally accepted now return `false`: accessors, symbols, non-enumerable application fields, inherited/custom-prototype records, extra pitch/transposition fields and custom array properties.

## 9. Decisive Test Matrix

| ID | Fixture | Expected |
|---|---|---|
| UG-T01 | current valid primitives/nested JSON | unchanged result |
| UG-T02 | exact plain + null-prototype pitch/transposition | `true` |
| UG-T03 | min/max pitch and safe-integer transposition boundaries | exact boolean |
| UG-T04 | getter for every guarded field/index/key | `false`, getter count `0` |
| UG-T05 | Proxy with throwing `get` around valid target | valid result, `get` count `0` |
| UG-T06 | throwing reflection traps and revoked Proxy | `false`, no throw |
| UG-T07 | accessor/symbol/non-enumerable/extra/inherited/custom prototype | `false` |
| UG-T08 | sparse and huge sparse arrays | `false`, zero index-descriptor loop |
| UG-T09 | cyclic object/array | `false` |
| UG-T10 | repeated shared non-cyclic object | `true` |
| UG-T11 | 20,000-level dense nested array | `true`, no stack failure |
| UG-T12 | mutate after first call, invoke again | each call reflects its own descriptor snapshot |
| UG-T13 | root public export allowlist | deeply equal |
| UG-T14 | full Core suite | green |

## 10. Rollback

The change has no persisted migration. Reverting the optional helper and the two guard call sites restores the activation baseline. Any ordinary-value, public-export or unrelated Core trace drift stops the Gate before merge.

## 11. Requirement Trace

| Requirement | Design | Evidence |
|---|---|---|
| CVN0-R001 | §§5–8 | UG-T01/T02/T03/T13/T14 |
| CVN0-R002 | §6 | UG-T01/T04/T08–T12 |
| CVN0-R003 | §5 | UG-T02–T07 |
| CVN0-R004 | §5 | UG-T02–T07 |
| CVN0-R005 | §8 | public API + full regression |
| CVN0-R006 | §3/8 | protected-path diff audit |
