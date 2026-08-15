# Current Architecture Evidence — Planning Base `5e159959`

## Purpose

This file records reproducible evidence used by Architecture Reset V2. It is descriptive, not a replacement authority. Line numbers refer to the planning base and may move after future implementation.

## 1. Physical inventory

Focused repository counts at the base:

| Item | Result |
|---|---:|
| Production TypeScript files under `src/core-kernel` | 71 |
| Production TypeScript lines | 24,765 |
| `commands` files / lines | 16 / 10,821 |
| `registry` files / lines | 10 / 4,563 |
| `commands + registry` share | 15,384 / 24,765 = 62.12% |
| Test TypeScript files / lines | 94 / 32,560 |
| Inherited full test baseline | 531/531 |

Absent at base:

```text
Cargo.toml
crates/
apps/
src-tauri/
vite.config.ts
```

No production subtree implements Guitar Domain, Layout, Renderer, Playback, Persistence, Workbench, or a public Extension Host. The product target exists mainly in planning/specification while `src/core-kernel` is the only implemented production area.

## 2. Hot-path evidence

### 2.1 Write target scan

`src/core-kernel/commands/target-resolver.ts:185-260` contains the nested entity collection traversal used to find command targets. Stable entity IDs exist in the DTO, but the write path does not begin with an active-session `EntityId → handle` index.

### 2.2 Read index is snapshot-shaped

`src/core-kernel/read/entity-index.ts:17,29,89,272-293` builds/caches an entity index against document objects for read operations. This is useful characterization, but it is not a mutable store index shared with atomic write adoption. Therefore it does not remove write scans or guarantee index/store atomicity.

### 2.3 Full clone for effect application

`src/core-kernel/commands/effects.ts:1741` clones a ScoreDocument before applying an effect set; the batch path near `:1753` also begins from a full clone. Local edits therefore allocate and traverse global data.

### 2.4 History array copying

`src/core-kernel/commands/runtime.ts:203,361,456-457,492` uses spread/slice-shaped array replacement for growing undo/redo stacks. With long histories, each transaction copies a growing collection in addition to score work.

### 2.5 Callback view and repeated semantic pipeline

- `src/core-kernel/commands/integrated-runtime.ts:641` constructs a detached callback view from the document.
- `:687-768` performs integrated semantic/availability/provider assessment.
- the pipeline is called around `:2003`, `:2134`, `:2315`, and `:2400` for live/history/replay paths.

The interaction path combines availability, semantic validation, provider validation, profile and classification over document-shaped data rather than an affected closure.

## 3. Model evidence

- `src/core-kernel/domain/score-document.ts:16` defines the document root.
- `:81` defines RhythmicEvent ownership of rhythm/duration.
- `:97` defines ScoreNote and WrittenPitch-oriented note data.
- `src/core-kernel/domain/extensions.ts:19` defines V1 extension owner.
- `:23` defines ExtensionBlock.

These facts support retaining Event/Voice rhythmic truth and score/Part ExtensionBlock ownership during the performance migration.

## 4. Compatibility/oracle evidence

The accepted RKP-0 archive contains:

- `research/oracle-scenario-matrix.md`: 64-row behavioral oracle;
- `research/sdk-surface-migration-matrix.md`: 8 runtime, 34 type, nine ABI-field inventory;
- generated fixture manifest/scenarios/qualification inputs used by the 531-test baseline.

`test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json` is the machine-readable source used to copy the exact 28 command IDs and 51 application runtime exports into V2. V2 treats these as migration inputs, not as approval for current internal algorithms.

## 5. Qualification state

CVN-7's sole official `--mode all` run for commit `b21540fa...` produced 411 request files and 410 result files. The missing result was candidate `stress-submit` for 10,000 envelopes over the 102,400-Event/51,200-Note fixture; the worker hit the three-hour liveness timeout. The evidence was classified invalid/incomplete, with no partial publication and no candidate-only regression conclusion.

The observed code complexity and representative timings explain why translating the same algorithm is insufficient. V2 retains the original stress workload and resource targets but places feasibility on indexed/overlay architecture and versioned qualification methods.

## 6. RKP state

At the base:

- Rust remediation parent remains `planning`;
- RKP-0 is accepted/archived;
- RKP-1 through RKP-9 are absent;
- `task_start_run=false` and production authorization is false;
- current parent text still describes four Rust crates.

Architecture Reset V2 proposes five crates by extracting Score Foundation. Because the candidate is not current authority, it does not edit the Rust parent. The later authority-sync commit must reconcile this before RKP-1 planning.

## 7. Evidence conclusion

The repository has a substantial, well-tested TypeScript Core contract implementation but not a complete guitar product. Its current large-score bottleneck is primarily structural: write scans, whole-document copying, global assessment and growing-history copying. The valid remediation target is an indexed live representation and localized transaction/validation path, with Rust used to implement that target while preserving accepted observable contracts.
