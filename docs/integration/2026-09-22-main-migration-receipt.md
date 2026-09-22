# Main Migration And Verification Receipt

Date: 2026-09-22, Asia/Shanghai.
Status: unified audit source integrated; automated main checks passed.
Native close/save/recovery acceptance remains open. This is not a release.

## Exact Git State

- Original main: `269112b2d85e01827e8cb81bdcc5b671afde4303`.
- Preserved legacy main: `746c6a7a87b917c9e9cecca05ad0155a19e9ba3a`,
  branch `codex/legacy-main-before-unified-audit`.
- Main fast-forward and tested source:
  `de3e3a498b8e379f53790e7abf18a419144fb483`.
- Tested tree: `ce571070bb6ae06dd59bcc31c2461cd97d20ac02`.
- Bootstrap correction: `430f3fd53b9be2cc8b44a60ee14f9c5f683a491c`.
- Original main checkout:
  `E:/desktop/brilliant_ideas/brilliant_guitar`.

The 32 previously dirty paths were staged by exact audited path, committed on
the preservation branch, then verified. Switching back to main restored its
tracked tree normally. No extra file removal or move was needed. Main was
clean before `git merge --ff-only de3e3a498b8e379f53790e7abf18a419144fb483`.
The merge was a fast-forward, without conflicts or whole-file conflict overrides.
No push, fetch, reset, stash, clean, rebase or amend was performed.

This receipt and date corrections are documentation-only descendants of the
tested source. The coordinator publishes their final full SHA after committing
and fast-forwarding main. Test/build results below retain their actual source
SHA; they are not relabeled as executions on the later documentation commit.

## Post-Migration Preservation Check

Fresh checks after migration confirmed:

- All 85 backup and restore-rehearsal files match the archive manifest:
  1,006,766 bytes.
- The preservation commit's parent is the original main and its changed path
  set is exactly the 32 audited paths. Each of those 32 committed blobs equals
  the raw archived source after Git's path-specific clean conversion.
- The other 53 archived source files, their three original worktree HEADs,
  branches and full status fingerprints remain unchanged.
- All ten protected references other than the intentionally advanced main
  remain unchanged, including `origin/main` and all original module deliveries.
- Main was clean at `de3e3a4` after verification.

Raw-byte archive: `.repo-archive/2026-09-21-legacy-preservation`.
Manifest SHA-256:
`5c32572a894e3c6e460705e2f22387537f5b9d1fe9c5b8da12028c9d38c1f84a`.
Git normalization is not a replacement for this raw-byte archive.
Old worktrees and backup files were not cleaned up.

## Fresh Main Verification

All commands below ran in the original main checkout, not the candidate.
The first tool preflight failed because main lacked installed dependency
metadata. After locked installation, it passed. No lockfile was changed.
The interrupted Rust sessions had no retrievable final result; the Rust tests
and checks were rerun to completion after the interruption.

| Command or check | Actual result on `de3e3a4` |
| --- | --- |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` in root, Workbench and Desktop | All exit 0; independent directories |
| Environment `--check-tools --base de3e3a498b8e379f53790e7abf18a419144fb483` | Exit 0; three locks, tools, 90 historical objects |
| Environment `--prepare-addons` with the same full base | Three local variants built; exit 0 |
| Environment `--prepare-desktop` and `--prepare-smoke` with the same full base | Both exit 0 |
| Environment `--check` with the same full base | Exit 0; three addons and desktop release |
| `validateArtifact` on the separate desktop-smoke manifest | Passed provenance, inputs, configuration and hash |
| `npm run typecheck` in root and Workbench | Both exit 0 |
| `npm test` in root | 139 files; 932 passed / 0 failed / 2 skipped |
| `npm test` in Workbench | 617 passed / 0 failed / 0 skipped; includes test typecheck |
| Bootstrap focused tests | 6/6 |
| `cargo +1.97.1 fmt --all -- --check` | Exit 0 |
| `cargo +1.97.1 test --workspace --all-features --locked --offline --target-dir target/main-verify-workspace --quiet` | 667 passed / 0 failed / 2 ignored |
| `cargo +1.97.1 clippy --workspace --all-targets --all-features --locked --offline --target-dir target/main-verify-clippy -- -D warnings` | Exit 0 |
| `cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --offline --target-dir target/main-verify-desktop --quiet` | 66 passed / 0 failed / 0 ignored |

Cargo was invoked through `C:/Users/ATOM/.cargo/bin/cargo.exe`.
Tools: Node v24.15.0, npm 11.12.1, Rust/Cargo 1.97.1, pwsh 7.6.5.
Cargo's ignored test-profile `panic` setting and Vite's large-chunk notice remain
warnings. The root environment-negative test intentionally printed a missing
Git-object diagnostic; the suite exit was 0.

## Built Artifacts And Remaining Acceptance

Main's artifact manifests are in `target/development-environment`.
All five new artifacts record actual source `de3e3a4` and the original main
checkout, not the candidate worktree. Original candidate artifacts are retained.

| Variant | Bytes | SHA-256 |
| --- | --- | --- |
| core-v1 | 3,605,504 | `0b99c572304b465328e23e811179673ab7f7258971436a4cbfe38a9991d93cf8` |
| integrated-v2 | 5,046,784 | `bdf952e9f231ed0866713fa566fb74268a39cf702fca990434967d3ec8809baa` |
| wasm-v1 | 6,279,680 | `7ce5f32aa5b4cc8c96be7f9986559f40fb66295222841add66b9355b2c6620b0` |
| desktop-release | 20,900,352 | `0a6c57c31d10e6d6f2e727b78be3d7c3698831bec3a1faeeb3150493e3eae0d8` |
| desktop-smoke | 20,900,352 | `b169bee36367ad5a7c03335165592ec414a55d434d68eca3bc1e05fac5ed9349` |

Main's newly built smoke executable was not launched or GUI-accepted in this
migration. The independent audit owns native lifecycle reproduction in its own
checkout and isolated runtime data. The known failed-close sequence in B9 has
not been repaired. The bootstrap correction is built and unit-tested, not yet
accepted through the mounted native UI. Do not confuse successful mocked close
tests with native ACL enforcement or preservation after a rejected final close.

No real user document or provider was used. The earlier coordinator smoke
scene was not manipulated during this resumed stage; its current process state
was not reverified because process inspection approval timed out. Do not infer
that it exited successfully. No force-kill was used as acceptance evidence.
No power-loss, signed installer, MSRV or multi-platform qualification was run.

## Audit Handoff

The user authorized a new independent audit task using `gpt-5.6-sol / xhigh`.
Start from the final main SHA published after this documentation commit, with
its own Git worktree, dependencies, output directories and runtime state.
Source audit and reproduction only; do not fix production code or write main.
Reports and disposable probes belong only to that worktree. Do not create Trellis.

First stage: verify the baseline, independently trace close/save/recovery,
failure ordering and retry/concurrency behavior, and report high-risk findings.
Include severity, exact file/line, evidence, reproduction, impact, test gaps
and one proposed primary owner. Report and stop before stage two or any fix.
The later scope includes startup, cross-language contracts and all four module
boundaries. Visual-design progress is excluded; Kernel reporting is required.
The coordinator consolidates major-stage findings for user direction.
This handoff is not authorization to resume all four old development branches.
