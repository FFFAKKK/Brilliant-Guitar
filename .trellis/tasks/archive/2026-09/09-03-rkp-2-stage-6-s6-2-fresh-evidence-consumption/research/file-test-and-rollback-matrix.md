# File, test and rollback matrix

## Planning files

The planning candidate changes exactly eleven files under this new task and
four parent projections. Every path is literal in task.json. No src, test,
crates, Cargo, package, TypeScript configuration or active-spec path may change.

## Future implementation files

| Path | E1 responsibility | Test owner | Rollback |
| --- | --- | --- | --- |
| rkp-2-workspace-contracts.test.ts | current authority, allowlists, hashes, ordering and negative fixtures | focused Workspace Law and full runner | revert E1 source commit |
| rkp-2-scale-evidence-worker.ts | detached lossless sentinel observation only | worker representative suite | revert E1 source commit |
| rkp-2-scale-evidence-worker.test.ts | validate and emit one final consumption record | worker representative and opt-in suites | revert E1 source commit |

Protected technical inputs:

- crates/brilliant-kernel-runtime/src/indices.rs
- crates/brilliant-kernel-runtime/src/runtime.rs
- crates/brilliant-kernel-runtime/src/store.rs
- test/core-kernel/fixtures/cvn-7-qualification-score.ts
- test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1
- all product/public/config/spec paths

## Test matrix

| Gate | Planning | E1/E2/E4 | Failure rule |
| --- | --- | --- | --- |
| typecheck/build | exit 0 | exit 0 | stop |
| focused Workspace Law | 11/7/4/0 | 11/8/3/0 | exact title classifier |
| full runner, fresh native absent | 590/582/7/1 on clean commit | not an E2 lane | three exact missing-addon files plus exact titles and manifest |
| full runner, validated native present | 611/605/4/2 on clean commit | 611/606/3/2 | hash-equal DLL/.node plus exact titles and 80-file manifest |
| Rust 1.97.1 | not required for docs-only candidate | fmt/check/test/clippy pass | stop |
| Rust 1.88.0 | not required for docs-only candidate | workspace check pass | stop |
| autocrlf matrix | predecessor record checked | true/false fresh source checkouts | any CR/blob mismatch blocks |
| E3 | forbidden | exactly one opt-in run after E2 | any invalid result blocks publication |

## Lifecycle files after E1

Only eight literal lifecycle paths may change between the E1 source and E4
candidate. The range must contain no technical path. Acceptance/archive and
integration are later owner decisions and are not rollback steps inside E4.
