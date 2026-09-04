# Design — RKP-2 Post-Archive Path Compatibility

## 1. Boundary

This is a path-resolution and governance repair. It changes no score model, store, codec, session, bridge, runtime, or public API behavior.

```text
historical commit + former active path  -> immutable Git evidence
current checkout + exact active/archive locator -> lifecycle evidence
archived task JSONL + same task suffix -> narrow validation fallback
```

## 2. RKP-2 workspace-contract locator

Keep the existing RKP-2 path constants as historical active paths. Add exact active/archive roots and the 13-file archive manifest. A mapper accepts only a path beneath the historical RKP-2 root and replaces that root with the result of `resolveExactlyOneTaskLocation` for current filesystem reads.

Current reads include the design allowlist, current task status/default-runtime assertions, and current context-manifest content. `gitTextAt` and accepted historical path-set constants continue to use active paths.

## 3. Accepted-delta boundary

The activation commit is the new closed baseline for descendants of the RKP-2 workspace law. The test derives accepted history through that exact commit. After activation it permits only:

```text
.trellis/scripts/common/task_context.py
.trellis/spec/core-kernel/backend/rust-runtime-transition.md
.trellis/tasks/09-04-rkp-2-post-archive-path-compatibility/task.json
.trellis/tasks/09-04-rkp-2-post-archive-path-compatibility/research/bug-analysis.md
.trellis/tasks/09-04-rkp-2-post-archive-path-compatibility/research/implementation-evidence.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Planning artifacts are committed before activation and therefore belong to the fixed baseline, not the implementation delta.

## 4. Trellis validator rule

Add a pure path-selection helper inside `task_context.py`:

1. Return the literal repository path when it exists.
2. Otherwise detect whether the JSONL owner is exactly under `.trellis/tasks/archive/<month>/<task>/`.
3. Accept fallback only when the missing reference is under `.trellis/tasks/<same-task>/`.
4. Map only the relative suffix into the JSONL owner's exact archive directory.
5. Preserve the existing file/directory type check, so a missing or wrong-type target still fails.

This is deterministic and cannot select a different task or scan arbitrary archive history.

## 5. Verification and rollback

Run the focused suite first, then archived task validation, Python compile, typecheck/build, and one full Node discovery. Do not run E3, Rust-native qualification, or CVN-7 qualification.

The implementation is isolated in a repair commit after activation. Reverting that commit returns to the exact RED state without altering the already accepted RKP-2 archives. A later lifecycle/evidence commit remains separately reversible.
