# PRD — RKP-2 Cross-platform Full Test Runner Contract Repair

## 1. Status and purpose

This is a planning-only blocking child of `08-24-rkp-2-indexed-live-score-store-load-encode-parity`. It repairs the complete TypeScript test runner contract before RKP-2 Stage 6 may be separately authorized. The child remains `planning`; `task_start_run=false`, `production_implementation_authorized=false`, and `independent_planning_review=pending`.

The exact planning base is `eed4871a86191783d539b7d4097be3627e98e4a0`. This candidate does not run `task.py start`, edit the runner/package, accept/archive/push, authorize Stage 6, create RKP-3, switch the default runtime, or run qualification.

## 2. Confirmed problem

`package.json` currently delegates full discovery to `node --test "dist/test/**/*.test.js"`. That quoted wildcard is interpreted differently by Node/runtime/shell combinations:

- Node 24 observations include one complete literal-file run with 77 files and 557 tests, but the package/literal-glob route can discover only 29 files and 261 tests while returning exit code 0;
- Node 20.20.2 rejects the literal glob with exit code 1;
- the real 77-file literal run at this planning base discovers 557 tests: 556 pass, 1 expected GC skip and 0 fail;
- `package.json` and `package-lock.json` are zero-delta across `df40aef391440ae64ad3e266419579bee5887a1f..eed4871a86191783d539b7d4097be3627e98e4a0`, so this is an existing cross-environment runner-method gap, not a Stage 5 product regression.

An exit-zero partial run cannot be accepted as a full-suite gate. RKP-2 Stage 6 candidate freeze therefore remains blocked until this child is planned, independently approved, implemented, independently reviewed, accepted, archived and integrated into a new Stage 6 prerequisite base.

## 3. Requirements

### R1 — one explicit discovery owner

Create `test/test-infrastructure/run-compiled-tests.ts`. It recursively enumerates literal compiled files below repository-CWD `dist/test` and is the only complete-suite discovery owner. It does not use a shell glob, Node `globPatterns`, a third-party glob package, or a new dependency.

### R2 — deterministic, hostile-safe enumeration

The root is exactly `<repo cwd>/dist/test`. Missing, non-directory and empty roots fail nonzero. Traversal rejects symbolic-link/junction-style entries and selects only regular files whose normalized relative path ends with `.test.js`. Paths use `/`, are sorted with an explicit UTF-16 code-unit comparator, deduplicated and preserve spaces, Unicode and arbitrary nesting. The returned manifest input is deeply detached and frozen.

### R3 — immutable manifest

Before execution the runner emits `full-test-manifest-v1` containing `fileCount` and lowercase SHA-256 of `join(files, "\n") + "\n"`. The exact relative file array used for the hash must project one-to-one to the absolute array passed to `node:test`.

### R4 — stable programmatic runner

Use the stable official `node:test` `run({ files })` API. The supported contract is Node `>=20.0.0`, specifically exercised on 20.20.2 and 24.15.0. For cross-version compatibility, invoke `run({ files: absoluteFiles, concurrency: true })` from verified repository CWD. Absolute files plus the Node 20/24 default separate-process execution provide the required `cwd=repoRoot`, `isolation=process` semantics without passing later-version-only `cwd` or `isolation` options.

### R5 — reliable completion and exit

Connect `TestsStream` to a stable built-in reporter. Setup, synchronous runner, stream and reporter failures all become nonzero. Any failed, cancelled or missing top-level file outcome, any manifest/file-array mismatch, or any runner error is nonzero. Only the complete successful set exits zero. Preserve ordinary test output and expected skips.

### R6 — executable contract tests

Create `test/test-infrastructure/run-compiled-tests.test.ts` with injectable filesystem/runner/reporter seams. No production environment variable, public product API or third Node export is added. Tests cover deterministic enumeration, hostile paths/entries, manifest/hash, exact runner options, all nonzero propagation cases, partial discovery, current-tree parity, Node 20/24 and PowerShell/cmd/npm entry paths.

### R7 — package integration without dependency drift

Change only the test script target to:

```text
npm run build && node dist/test/test-infrastructure/run-compiled-tests.js
```

`package-lock.json` remains byte-identical and is excluded from the implementation allowlist.

### R8 — RKP-2 single-owner integration

This child exclusively owns test infrastructure. RKP-2 Stage 6 consumes the accepted runner and its manifest evidence; it does not duplicate discovery or become a second owner. Stage 6 remains separately user-authorized after an accepted repair is integrated into a new prerequisite base.

### R9 — protected product boundary

No `src/**`, Rust crate, Cargo/toolchain, Node native source, CVN/qualification code, public inventory, default runtime, product test semantics or individual test-file content changes are allowed. The runner must dynamically include later `.test.js` additions without a fixed file/test-count constant.

### R10 — lifecycle boundary

Planning self-audit is not independent acceptance. Implementation, review, acceptance, archive, integration, Stage 6 authorization and push are distinct later gates.

## 4. Acceptance criteria

- [ ] Planning candidate contains every required task/research artifact and exact literal allowlists.
- [ ] Independent planning review returns P0/P1/P2=`0/0/0` for the exact planning HEAD.
- [ ] Later implementation enumerates the same literal set from PowerShell, `cmd.exe`/`npm.cmd`, Node 20.20.2 and Node 24.15.0.
- [ ] Missing/non-directory/empty/symbolic roots, duplicate aliases, setup/stream/reporter/runner failures and partial discovery are nonzero.
- [ ] Exact `files`, repo CWD, process isolation semantics, concurrency, manifest count/hash and top-level outcome completeness are mechanically proved.
- [ ] A clean current compiled tree produces manifest equality and 557 discovered / 556 pass / 1 expected skip / 0 fail as evidence only, never as a hard-coded contract.
- [ ] `package-lock.json`, product/Rust/native/CVN/qualification/default-runtime/public contracts remain zero-delta.
- [ ] Repair acceptance/integration creates a new RKP-2 Stage 6 prerequisite base; Stage 6 still requires separate user authorization.

## 5. Out of scope

RKP-2 Stage 6 evidence, LiveScoreStore changes, commands, transactions, history, events, selectors, incremental validation, providers, RKP-3, official measurement, default-runtime cutover, task acceptance/archive and push are excluded.
