# Planning Self-Audit

## Result

Bounded-repair planning self-audit: P0/P1/P2=`0/0/0`.

The first independent review of `7e211869b7ab8d5ead3916ca8d98107d55f182db` returned P0/P1/P2=`0/1/0`: the plan incorrectly claimed that the frozen derived-serde configuration directly rejects extras on the internally tagged unit `Score` variant. The repair keeps the attributes unchanged, limits Foundation tests to Part mapping/Part extras plus exact Score normal round-trip, and assigns score-extra rejection to Contracts/TypeScript. This self-audit is not an independent verdict; `independent_planning_review` remains `pending` and targeted rereview is required.

## Contract checks

- [x] Exact base `ce673a2ad62348fa73458d493a45f9c005bf0288` is pinned.
- [x] Original RKP-2 worktree is preserved; new branch/worktree is isolated.
- [x] Child is planning with start/production authorization false.
- [x] Public score and Part owner JSON shapes are literal and closed.
- [x] `part_id` is explicitly forbidden as an alias and output.
- [x] Field-level bidirectional rename and Part struct-field unknown rejection are exact; no direct Foundation score-extra claim remains.
- [x] Contracts descriptor-first strict walk and TypeScript strict codec remain the only score-extra exact-shape owners.
- [x] No custom Foundation deserializer or `Score` unit-variant change is planned.
- [x] Contracts/TypeScript/Runtime non-root-cause boundaries are documented.
- [x] Six technical paths are literal and complete.
- [x] Lifecycle projections are limited to child/RKP-2/Rust-parent state.
- [x] R0–R3 are independently reversible.
- [x] Native, canonical, hostile, zero-publication and inventory tests are specified.
- [x] Independent planning, implementation, acceptance/archive/integration and S6.1 resume are separate gates.
- [x] TypeScript default, no qualification, no push and no RKP-3 remain explicit.

## Hostile review questions

1. Could serde accept `part_id` through an implicit rename rule? No: only the field-level `rename = "partId"` is allowed and workspace-law forbids `alias`.
2. Could both spellings be accepted? No: enum `deny_unknown_fields` and Contracts exact-object checking reject the snake_case extra.
3. Could output still leak snake_case? Direct Foundation serialization plus native read assertions require only `partId`.
4. Could Foundation be forced into a second score exact-shape owner? No: exact Score normal round-trip is direct; score extras are rejected only by Contracts/TypeScript and no custom deserializer is allowed.
5. Could Runtime be a second wire owner? No: Runtime remains unchanged and only clones the typed owner.
6. Could tests become tautological? The matrix requires independent Foundation Part mapping, Contracts public strict-shape and real native projections, plus the TypeScript oracle.
7. Could planning silently resume Stage 6? No: S6.1/S6.2/S6.3 remain false until accepted repair integration.

## Remaining gate

Submit the repaired exact planning commit to the same dedicated read-only planning auditor for targeted rereview. Do not activate or implement before PASS and a new explicit implementation authorization.

## Validation evidence

- Child Trellis `implement=14/check=14`, RKP-2 `25/20`, and Rust parent `18/19`: PASS.
- Planning changed-path set: exact 15 (eleven child artifacts plus four parent projection paths).
- Relative to `ce673a2...`, `src/test/crates`, Cargo/toolchain/rustfmt, package/tsconfig and active specs: zero delta; both RKP-2 JSONLs: zero delta.
- TypeScript typecheck/build: PASS.
- Exact clean technical baseline `ce673a2...` on Node `24.15.0`: full-test-manifest-v1 fileCount `78`, SHA-256 `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, `576 discovered / 575 pass / 1 expected GC skip / 0 fail`.
- Native baseline after deterministic DLL-to-`.node` build: RKP-1 bridge plus RKP-2 Stage 5 parity `13/13`.
- Rust in a new LF detached clone with `core.autocrlf=false`: fmt/check, workspace test `70/70`, clippy `-D warnings`, and MSRV `1.88.0` check all PASS. The first CRLF checkout reproduced four known source-self-inspection failures; no Rust source changed, and the required LF clean-checkout rerun closed them.
- The planning worktree's pre-commit full-runner diagnostic correctly rejected dirty lifecycle files and the not-yet-reviewed child path. The accepted workspace-law cannot include this child during planning without modifying the user-protected test/design authority; R2 owns that future six-path implementation update. The clean exact-base run above is the planning technical baseline, not a claim that an unreviewed child is already in the accepted RKP-2 implementation allowlist.
- Focused workspace-law remains intentionally fail-closed at `6/7` on the planning candidate and passes `7/7` at exact base `ce673a2...`; this repair does not modify or relax it.
