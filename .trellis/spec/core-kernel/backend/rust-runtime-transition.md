# Rust Runtime Transition Contract

## Current authority

The accepted runtime remains the Pure TypeScript Core Kernel. `ScoreDocument`, public command entry points, snapshots, events, and error contracts remain governed by the existing Core Kernel specifications. This document does not authorize a Rust, native, FFI, package, build, or production-source change.

## RKP-0 authority boundary

RKP-0 owns only deterministic test-oracle and transition-contract material:

- a strict manifest/schema and exactly 64 TypeScript public-call oracle rows (`28` accepted, `28` rejected, `8` cross-cutting);
- fixed inventories of `28` commands, `51` app runtimes, CVN-2 SDK `8` runtime and `34` type exports, and the nine ABI names;
- Qualification V2 data: fresh process, five warmups, twenty measured public-call samples, nearest-rank P95/P99, RSS, and evidence-validity/liveness precedence;
- the CVN-7 fifth official input as invalid/incomplete ledger data with no partial evidence.

The oracle compares behavior; it is not a second production command implementation and does not relax the Pure Core Kernel boundary.

## Executable oracle contract

### 1. Scope / trigger

The transition needs a stable comparison authority before any independent Rust implementation exists. The contract applies only to `test/core-kernel/rust-migration/` and RKP-0 task authority files.

### 2. Signatures

`decodeOracleScenario(value): RustMigrationOracleScenarioV1`, `decodeOracleManifest(value): RustMigrationOracleManifestV1`, `canonicalJsonl(rows): string`, and `sha256(value): string` define the fixture boundary. The frozen runtime inventories are `COMMAND_IDS`, `APPLICATION_RUNTIME_EXPORTS`, `MODULE_SDK_RUNTIME_EXPORTS`, `MODULE_SDK_TYPE_EXPORTS`, and `CONTRIBUTION_ABI_FIELDS`.

### 3. Contracts

The JSONL corpus contains exactly 64 ordered rows: accepted `A1`–`A28`, rejected `R1`–`R28`, and cross-cutting `X1`–`X8`. The manifest carries per-row hashes, corpus hash, and authority-source hashes. Qualification V2 uses a fresh process, five warmups, twenty measured public calls, nearest-rank P95/P99, RSS, and evidence-validity/liveness precedence.

### 4. Validation and error matrix

| Input condition | Required result |
| --- | --- |
| Extra, missing, or unknown fixture field | Strict decoder rejects before comparison |
| Unknown operation or observation discriminator | Strict decoder rejects before comparison |
| Missing-target rejected row | Fixed rejection with zero state/event delta |
| Incomplete or timed-out measurement | `EVIDENCE_INVALID`; no partial evidence or performance conclusion |

### 5. Good / base / bad cases

- Good: an accepted submit/undo/redo sequence produces its declared inverse state projection.
- Base: a declared cross-cutting read/lookup preserves the explicit zero-delta projection.
- Bad: a candidate adds a manifest key, silently changes an exported inventory name, or treats an incomplete worker result as qualification evidence.

### 6. Required tests

The RKP-0 oracle suite must assert byte-stable regeneration, exact 28/28/8 partition/order, one observation per public operation, accepted inverse equality, rejected/cross-cutting zero deltas, strict decoder rejection, inventory/ABI names, corpus and source hashes, Qualification V2 fields, and the explicit allowlist.

### 7. Wrong vs correct

Wrong: regenerate an approximate behavior sample, accept extra JSON fields, or time a private helper while calling it an end-to-end qualification.

Correct: capture the exact declared public-call row, canonicalize and hash the whole corpus, reject schema drift, and measure only the frozen public-call timed region from a fresh process.

## Future cutover gate

Only a separately authorized later RKP stage may propose a runtime cutover. Before that proposal can change authority, it must preserve the frozen public behavior, pass independent implementation review, pass a separately authorized complete qualification run, and receive explicit acceptance. RKP-0 neither accepts a cutover nor creates a later stage.

## Archive-safe transition evidence

RKP workspace-contract and task-context consumers must distinguish immutable historical paths from current lifecycle paths:

- Git-at-commit reads keep the path that existed at the pinned commit. Native archive must not rewrite historical evidence.
- Current task reads resolve exactly one declared active/archive root and verify a literal file manifest. Both roots, neither root, missing files, extra files, symlinks, or heuristic archive searches are invalid.
- A closed stage or repair history is anchored to an exact accepted or activation commit. Later deltas are admitted only through a literal task-owned allowlist; moving `HEAD` is not an authority boundary by itself.
- When Trellis validates an archived task's JSONL, a missing former-active reference may map only to the identical suffix in the JSONL owner's exact archived task directory. Existing literal paths take precedence. Cross-task, cross-month, arbitrary recursive, or best-match archive lookup is forbidden.
- Native archive must not be repaired by recreating the active task directory or copying accepted authority back into it.

Every archive-aware repair must include hostile coverage for ambiguous roots and malformed manifests, plus a post-archive validation that proves archived context remains consumable. These governance rules do not authorize runtime cutover, qualification, production Rust changes, or a later RKP stage.

## RKP-3 private transaction contract

### 1. Scope / trigger

This contract applies only when the private Rust session receives a Stage-3 command through the test-only native seam. It owns the frozen 28-command catalog, transaction overlay, ordered reversible ChangeSet, indexed range operations, atomic batch, and command-local validation. The Pure TypeScript Core remains the product default; history, dirty state, events, semantic replay, support classification, plugin assembly, migration, qualification, and runtime cutover are not RKP-3 claims.

### 2. Signatures

- Rust boundary: `KernelSession::submit_stage3_bytes(&mut self, request_bytes: &[u8]) -> KernelStage3SubmitResultV1` and `submitKernelStage3V1(handle, requestBytes) -> Buffer`.
- Runtime boundary: `KernelRuntime::begin_stage3_transaction() -> KernelStage3TransactionV1`, followed by one `commit_stage3_transaction(...) -> KernelStage3RuntimeCommitV1`.
- TypeScript evidence adapter: `submitRustKernelSmokeCommand(addon, handle, command) -> KernelStage3SubmitWireV1`.
- The request is `{ apiVersion: 1, command }`; results are exactly `committed`, `no-op`, `command-rejected`, or stable bridge `rejected`. A submit result never contains a document; document projection requires a separate read.

### 3. Contracts

The command catalog contains exactly 28 ordered version-1 IDs with their frozen target kinds. Each attempt reads through a touched-state overlay, records stable-ID ChangeSet addresses, keeps Runtime handles only in the private CommitPlan, and performs no live-store mutation before a complete preflight. A commit adopts store, topology, entity/owner/reference/time indices, and checked document version exactly once. A no-op and every rejection preserve version and byte-identical state. Batch contains 1..100 dense, non-nested children, exposes earlier child changes to later children, reports the lowest failing child, and commits once or not at all. Resource ceilings are 131,072 prepared effects, 131,072 affected addresses, 256 MiB logical ChangeSet bytes, and 64 MiB request/response bytes.

### 4. Validation and error matrix

| Condition | Required result |
| --- | --- |
| Malformed/unknown command envelope, version, ID, or target kind | Stable `command.*` rejection before adoption |
| Missing target/anchor, wrong owner, self anchor, or reference conflict | Exact command failure, unchanged version and bytes |
| Invalid/reversed/cross-owner range or pitch overflow | Exact range failure with first failing Note address where applicable |
| Empty, nested, over-limit, or failing batch child | Exact batch failure; lowest `failedCommandIndex`; zero adoption |
| Version, effect, affected-address, logical-byte, request, response, depth, or property cap | Stable overflow/resource/bridge rejection; no partial state |
| Local post-plan invariant failure or contained panic | Private stable rejection; no raw Rust error or partial publication |

### 5. Good / base / bad cases

- Good: an accepted local, aggregate, range, or batch command commits one checked version and a separate read matches the canonical TypeScript projection.
- Base: a semantic no-op returns an empty affected list, keeps the current version, and performs no adoption.
- Bad: mutate the live store while preparing, scan or clone the full document for a local edit, expose a Runtime handle in ChangeSet, accept a nested batch, or return a document/ChangeSet through the native submit result.

### 6. Required tests

Tests must cover all 28 handlers, exact catalog order, 28 accepted and 28 missing-target oracle rows, atomic batch commit and child rejection, forward/inverse equality for every ChangeSet class, rejected byte equality, checked version overflow, handle/thread/busy/reentrant/poison/panic boundaries, hostile JSON and byte/property/depth caps, index parity, unknown extension preservation, exact three native exports, zero first-four global-work counters, local/range work independent of unrelated measures, frozen fixture hashes, dependency zero delta, literal changed-path allowlist, and no tracked build outputs.

### 7. Wrong vs correct

Wrong: treat green local tests as runtime cutover evidence, relax predecessor history to admit arbitrary later paths, or claim history/events/support parity from Stage-3 submit results.

Correct: pin predecessor history to its accepted RKP-2 head, enforce all successor deltas with the RKP-3 literal allowlist, compare only stage-owned oracle projections, keep TypeScript as default, and require a separate implementation review before any acceptance decision.
