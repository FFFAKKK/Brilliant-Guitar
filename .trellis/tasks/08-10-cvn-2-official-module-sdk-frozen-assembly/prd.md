# CVN-2 Official Module SDK and Frozen Contribution Assembly

> **Lifecycle:** DETAILED PLANNING CANDIDATE. The Trellis task remains `planning`; no `task.py start` transition and no production implementation are part of this checkpoint.

## 1. Goal and product value

CVN-2 gives statically shipped official modules one versioned, typed authoring seam and compiles their data descriptors plus composition-root function bindings into one detached, deterministic, deeply frozen catalog. The catalog is built once, is either wholly valid or absent, and later becomes the only module catalog that CVN-6 may bind to the existing Core transaction owner.

After CVN-2 implementation and independent acceptance, the kernel will gain these concrete capabilities:

1. Official modules can describe namespaced commands, exact extension compatibility, validators, classifiers, and owned effect definitions without Core importing a domain package.
2. Product startup can reject malformed, mismatched, over-limit, or under-capability module assemblies before any handler or Session becomes active.
3. A successful assembly is immutable and has one process-local identity, eliminating ready-state registration order, replacement, and hot-reload drift.
4. CVN-6 can consume a stable catalog rather than redesigning module metadata while it implements runtime execution.
5. Existing Core-only construction, the current accepted twenty-five Core command IDs, history, replay, events, and document schema remain unchanged; the parent-owned final twenty-eight-command plan is neither implemented nor altered here.

CVN-2 does **not** make module commands executable. It creates the accepted authoring and catalog foundation needed for that later integration.

## 2. Confirmed entry baseline

The unified planning baseline is merge commit `706802c`, with accepted-line parents `ebd8075` (Extensibility Reservation plus GD-0) and `7ad1ff1` (final CVN-4 repair and re-acceptance).

| Dependency | Candidate/charter | Acceptance |
|---|---|---|
| final CVN-4 local correctness repair | `b0272e2` | `7f33e7d` |
| Extensibility Reservation charter | `7c4e852` | `253d19e` |
| GD-0 domain/Core transaction contract | `451627e` | `a2b9009` |

CVN-0, CVN-1, CVN-3, and final CVN-4 are accepted. The child owns only `CVN-FC-110` and `CVN-FC-111`.

## 3. Authority order

When two planning statements appear to differ, the operator uses this order and stops rather than guessing:

1. GD-0 tagged `typescript public-contract` fences and the synchronized active domain transaction specification.
2. Parent `feature-contract-matrix.md`, specifically `CVN-FC-110/111`.
3. Accepted Extensibility Reservation decision matrix.
4. This child `prd.md`, `design.md`, and `implement.md`.
5. Existing source layout and private symbol names.

Private file names may follow this child plan; public fields, discriminants, ownership, limits, and exclusions may not be reinterpreted locally.

## 4. In scope

### CVN2-R001 — Lifecycle and authority

- Status remains `planning` until this planning candidate is reviewed and the user separately activates implementation.
- The unified merge commit is the only planning base.
- Planning changes are limited to Trellis task/spec coordination files; `src/**`, `test/**`, package manifests, and `tsconfig.json` remain unchanged in this checkpoint.

### CVN2-R002 — Exact contract ownership

- CVN-2 is primary owner of exactly `CVN-FC-110` and `CVN-FC-111`.
- `CVN-FC-110` owns the additive `kernel.domain-commands.v1` entry and the nine-field `CompiledDomainCommandContributionV1` outer ABI.
- `CVN-FC-111` owns deterministic, all-or-nothing, startup-frozen catalog construction and the V1 resource constants.
- Runtime contracts in `CVN-FC-112..122` are consumed only as signature constraints; their behavior and call counts remain CVN-6 work.

### CVN2-R003 — Separate public surfaces

- Application-facing entry remains `src/core-kernel/index.ts`.
- Official module authoring entry is fixed as `src/core-kernel/module-sdk/index.ts`.
- The application root adds only type-only shared data needed now: `KernelIntegratedCatalog`, `ExtensionRuntimeRequirementV1`, `ModuleIssueCode`, and `ModuleKernelIssue`.
- The application root does not export the compiler, definition builders, `ModuleKernelErrorBase`, callbacks, effect requests, catalog state accessors, or assembly builders.
- The SDK entry uses explicit allowlisted exports; it never uses `export *`.

### CVN2-R004 — Exact V1 outer ABI

`CompiledDomainCommandContributionV1` has exactly these own enumerable fields and no others:

1. `apiVersion`
2. `moduleId`
3. `contributionId`
4. `extensionNamespaces`
5. `extensionRequirements`
6. `commands`
7. `validate`
8. `classify`
9. `effects`

`apiVersion` is exactly `1`. Manifests contain only data. Callable bindings arrive only through statically imported composition-root registration entries.

### CVN2-R005 — Official identity profile

- Registration entry ID is exactly `kernel.domain-commands.v1`.
- Selected domain modules use `origin: "official"`, `runtime: "builtin" | "internal-module"`, `trustLevel: "system-trusted"`, and `apiVersion: 1`.
- Every selected domain module has `command:register`, `command:execute`, `score:read`, and `event:subscribe`.
- Missing capability checks follow the fixed capability order in `design.md`; extra already-defined Core capabilities do not grant broader document mutation.
- Each manifest declaration binds to a static registration entry with the same owner module ID.

### CVN2-R006 — Typed authoring contracts

The SDK defines and freezes:

- command descriptors plus strict decoder/preparation bindings;
- exact extension runtime requirements;
- a detached contribution read view containing Core document data without the global extension array plus only that contribution's exact-compatible blocks;
- restricted forward effect-request data for WrittenPitch replacement or a declared module effect;
- module effect descriptors plus decode/transform bindings limited to a declared namespace and score/Part owner kind;
- semantic validator and support classifier signatures;
- namespace-qualified module issue data, the issue builder, and `ModuleKernelErrorBase`.

These callback slots are stored but never called by CVN-2 catalog construction.

### CVN2-R007 — Issue and error boundary

- Module issue codes use the Registry safe-ID grammar, are no longer than 128 characters, and begin with `${moduleId}.`.
- `messageKey` is derived as `module.${code}`; callers do not supply it.
- Severity is deterministic: a code containing `.unsupported.` or ending `.unsupported` is `warning`; codes ending `.internal-error` or `.invariant-violation` are `fatal`; all others are `error`.
- Source is exactly `{ kind: "module", moduleId, contributionId }`.
- Optional location is an existing `KernelIssueLocation`; optional details is a captured `JsonObject`.
- `toIssue()` returns detached, deeply frozen data. Error instances, stack, message, cause, and thrown values never enter results or catalog summaries.

### CVN2-R008 — Catalog input and Core preservation

- `compileOfficialModuleCatalogV1(startupManifest, registrationEntries)` accepts both parameters as `unknown` and returns a data-only result union; it does not throw.
- The startup manifest is a full manifest. It must retain the exact accepted `core.commands` and `core.selectors` declarations and may add official domain declarations.
- Current Core compiled entries remain the only bindings for Core registration IDs.
- Domain static entries are selected by the composite key `(ownerModuleId, registrationEntryId)`, allowing multiple modules to use the shared `kernel.domain-commands.v1` entry without registration-timing dependence.
- Core-only `createKernelRegistry()` and its accepted manifest behavior remain unchanged.

### CVN2-R009 — Validation precedence

Catalog construction validates in this order and reports the first failing stage:

1. strict startup manifest, registration-entry, descriptor, and API-version shape;
2. module, contribution, and registration identity parity;
3. official origin, allowed runtime, system trust, and required capabilities;
4. unique module ID, contribution ID, command ID, effect kind, and extension namespace;
5. command namespace, target kind, required capability tuple, and descriptor/function parity;
6. requirement identity, one-to-one namespace coverage, and exact supported schema-version list;
7. effect namespace, supported-version parity, and score/Part owner allowlist;
8. synchronous compiler completion, callback slot kind, deep freeze, private identity, and absence of ready mutation APIs.

No public handle is created and no private catalog state is installed until every stage succeeds.

### CVN2-R010 — Deterministic normalization

- Ready modules sort by `moduleId`.
- Contributions sort by `(moduleId, contributionId)`.
- Commands sort by `commandId`; effects sort by `effectKind`; namespaces sort lexically.
- Requirements sort by `(namespace, moduleId, contributionId)`.
- `supportedSchemaVersions` must already be nonempty, strictly ascending, duplicate-free positive safe integers; the compiler clones but does not reorder a malformed list into validity.
- Validator/classifier issue order is not evaluated or normalized in CVN-2; CVN-6 later preserves callback-return order after contract validation.

### CVN2-R011 — Resource limits

The exported frozen `OFFICIAL_MODULE_SDK_V1_LIMITS` records exactly:

| Limit | Inclusive maximum | CVN-2 enforcement |
|---|---:|---|
| all manifest modules, including the two Core modules | 64 | yes |
| domain contribution entries | 256 | yes |
| total domain command descriptors | 4,096 | yes |
| total module effect definitions | 4,096 | yes |
| total owned extension namespaces | 1,024 | yes |
| supported schema versions per requirement | 256 | yes |
| module issues returned by one callback | 1,024 | constant/signature only; CVN-6 executes |
| aggregate module issues per transaction | 4,096 | constant/signature only; CVN-6 executes |
| canonical compatibility facts | 131,072 | constant/signature only; CVN-6 executes |

Exact-boundary and boundary+1 fixtures are required for every CVN-2-enforced limit.

### CVN2-R012 — Failure mapping

- Invalid manifest/root count: `registry.invalid-startup-input`.
- Missing selected entry: `registry.registration-entry-not-found`.
- Owner mismatch: `registry.registration-owner-mismatch`.
- Duplicate module/contribution: existing dedicated Registry failures.
- Origin/runtime/trust/API/capability: existing dedicated Registry failures.
- Invalid nested contribution, duplicate command/effect/namespace, or per-entry aggregate/version cap: `registry.invalid-contribution` with `registrationEntryId`.
- Descriptor/function parity: `registry.handler-mismatch` with `contributionId`.
- Unexpected trapped/internal condition: `registry.internal-error`.

Failures contain no callback, payload, stack, absolute path, raw thrown value, catalog object, or partial normalized contribution.

### CVN2-R013 — Frozen private state

- A successful `KernelIntegratedCatalog` is an opaque frozen handle with no methods.
- A private `WeakMap` owns normalized Core assembly state, normalized domain contributions, and a process-local assembly identity.
- The handle and private identity are not serialized, hashed into documents, exposed in summaries, or accepted from a manifest.
- The only internal catalog-state reader is a non-root, non-SDK module import reserved for CVN-6.
- There is no register, unregister, replace, unload, reload, version counter, change event, Session, bus, history, replay, or document mutation method.

### CVN2-R014 — Neutral qualification fixtures

Two synthetic official modules are required:

| Fixture | Runtime | Namespace | Command target | Effect owner |
|---|---|---|---|---|
| `fixture.score.module` / `fixture.score.contribution.v1` | `builtin` | `fixture.score` | document | score |
| `fixture.part.module` / `fixture.part.contribution.v1` | `internal-module` | `fixture.part` | part | part |

Both use schema version `1`, have validator/classifier bindings, and increment call counters if invoked. Every CVN-2 catalog test must leave all counters at zero.

### CVN2-R015 — Compatibility and rollback

- Runtime keys from `src/core-kernel/index.ts` remain byte-for-byte equal to the accepted allowlist.
- The current accepted twenty-five Core command IDs and Core Registry summary remain equal. CVN-2 adds no fixed Core command ID and leaves the parent-owned final twenty-eight-command catalog plan unchanged.
- GD-0 tagged fences and the active combined fence retain their accepted text/hash.
- There are zero imports from Guitar or any package outside `src/core-kernel`.
- Rollback removes the additive SDK/catalog files and type-only Registry additions; no document migration or persisted-state conversion is involved.

## 5. Explicitly out of scope

The following are not CVN-2 implementation work:

- writable integrated Registry/bus/gateway/replay or `CommandBus.createIntegrated` behavior;
- invoking command decoders, preparers, effects, validators, classifiers, or facts;
- module issue/fact aggregation at transaction time;
- availability, read-only degradation, integrated diagnostics, migration, history, replay, or unified events;
- batch execution;
- Guitar namespaces, schema, commands, policies, or fixtures;
- runtime discovery, package install, dynamic import, unload, replacement, hot reload, assembly generations, or a Host;
- Domain Selectors, rendering, playback, import/export, analysis, UI adapters, or any reserved future port;
- generic patch/path, whole-document replacement, mutable document/candidate, module-supplied inverse, or a second bus/history/replay/event owner.

## 6. Acceptance criteria

### Planning-base checkpoint

- [x] CVN2-AC001: one isolated branch/worktree contains all six required candidate/acceptance commits.
- [x] CVN2-AC002: the roadmap reconciles final CVN-4, Extensibility Reservation, and GD-0.
- [x] CVN2-AC003: child status is `planning`; implementation authorization is false.
- [x] CVN2-AC004: primary ownership is exactly `CVN-FC-110/111`.
- [x] CVN2-AC005: CVN-5, CVN-6, and future ports remain excluded.
- [x] CVN2-AC006: unified-base Trellis validation, typecheck, build, and full `315/315` regression passed.

### Detailed-planning checkpoint

- [x] CVN2-AC007: PRD, design, implementation runbook, file allowlist, test matrix, failure precedence, limits, rollback, and decisive commands are explicit.
- [x] CVN2-AC008: `implement.jsonl` and `check.jsonl` are curated from real accepted spec/research files.
- [x] CVN2-AC009: bounded self-audit reports final P0/P1/P2=`0/0/0`, records the corrected current-25/final-28 command-count distinction, and confirms zero production delta.
- [ ] CVN2-AC010: an independent planning reviewer passes the candidate and the user reviews that result before activation.

### Required from a future implementation candidate

- [ ] CVN2-AC011: application root runtime export allowlist and all accepted Core behavior remain equal.
- [ ] CVN2-AC012: SDK runtime/type export allowlists match `design.md` exactly.
- [ ] CVN2-AC013: the outer contribution object has exactly nine fields; manifests carry zero functions.
- [ ] CVN2-AC014: valid two-module catalog order, input isolation, deep freeze, opaque handle, and private state are proven with callback counts `0`.
- [ ] CVN2-AC015: every validation stage and failure mapping has a decisive table-driven case; no partial handle/state is observable.
- [ ] CVN2-AC016: each enforced limit passes at the exact boundary and rejects at boundary+1 with the specified Registry failure.
- [ ] CVN2-AC017: hostile getters, Proxies, sparse arrays, cycles, extra fields, invalid prototypes, async/generator callback slots, caller mutation, and thrown traps return stable data-only results.
- [ ] CVN2-AC018: SDK issue/error helpers produce detached frozen issues and expose no raw `Error` fields.
- [ ] CVN2-AC019: Core forbidden-dependency scan, GD-0 contract fixtures, typecheck, build, full tests, Trellis validation, and diff check all pass.
- [ ] CVN2-AC020: source/test changes stay within the file allowlist in `implement.md`, and the final worktree is clean after a path-limited commit.

## 7. Activation gate

The next lifecycle decision is an independent planning review plus user activation. Until both occur, the task stays `planning`, production files stay untouched, and CVN-6 remains blocked on accepted CVN-2 rather than on this planning candidate alone.
