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
