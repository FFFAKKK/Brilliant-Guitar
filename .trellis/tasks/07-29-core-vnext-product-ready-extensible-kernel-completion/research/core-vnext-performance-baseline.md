# Core VNext Preliminary Performance Baseline

## Purpose

Provide evidence for the Core VNext qualification-scale decision. This is a single-run planning probe, not an acceptance benchmark and not a claim about end-user UI latency.

## Existing Product Requirement

- `.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-010-commercial-readiness.md:52-62` requires opening a roughly 5-minute, multi-track, 200-measure score in an acceptable time and common edits to feel approximately immediate, but deliberately leaves numeric thresholds to technical design.
- `.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-015-commercial-quality-attributes.md:62-70` requires benchmarks for open/save/edit/playback/export and a responsive Windows desktop experience.
- `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/commercial-quality-gates.md:77-94` requires recording platform, score size, operation steps and elapsed/experience result.
- The product spec index references `SPEC-010-product-quality.md`, but that file is absent in the current tree. Numeric quality thresholds therefore need a later product-document synchronization after this decision is accepted.

## Probe Environment

```text
Node: v24.15.0
Platform: win32 x64
CPU: 13th Gen Intel(R) Core(TM) i9-13900HX
Logical CPUs: 32
Physical memory reported by Node: 39.7 GiB
```

## Probe Shape

- `brilliant-score-1` semantic-valid synthetic documents;
- 200 global 4/4 measures;
- 4 or 8 Parts, each with one Staff;
- one or two Voices per Part/Measure;
- 8 eighth-note rests or 16 sixteenth-note rests per Voice;
- globally unique stable IDs;
- no extension blocks;
- operations measured once: `CommandBus.create`, one metadata command submit, then undo;
- current built Core V1 at planning HEAD, which has no `src/**` drift from the accepted Core V1 close baseline.

## Results

| Measures | Parts | Voices per Part/Measure | Events per Voice | Total Events | Create | Submit | Undo | Heap after case |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 200 | 4 | 1 | 8 | 6,400 | 25.1 ms | 35.2 ms | 27.0 ms | 14.5 MiB |
| 200 | 8 | 1 | 8 | 12,800 | 43.7 ms | 55.7 ms | 54.0 ms | 52.3 MiB |
| 200 | 8 | 2 | 16 | 51,200 | 137.5 ms | 183.0 ms | 214.4 ms | 68.9 MiB |

## Interpretation

- Current full-document clone plus full semantic/profile traversal remains workable at the documented 200-measure order of magnitude.
- Cost grows approximately with the total entity/event graph, so "200 measures" alone is not a sufficient benchmark definition; Part, Voice and Event counts must be fixed.
- At 51,200 events, a trivial metadata edit already exceeds a typical near-immediate interaction budget on this high-end reference machine.
- The approved clone-once effect-set refactor prevents N full clones inside one batch but still leaves one full candidate clone and full validation traversal per committed transaction.
- Core VNext uses exactly two qualification tiers in this parent contract: one release-blocking representative fixture and one completion/stress fixture. Absolute latency is enforced only on the documented reference environment; portable CI uses the exact candidate/accepted-baseline ratios from CVN-FC-134.

## Promoted Exact Qualification Contract

The user selected the balanced product-ready target. The binding fixture, sampling and budget authority is now `../feature-contract-matrix.md` CVN-FC-130–134; this research file retains the probe evidence and does not provide looser implementation defaults.

### Release-blocking representative fixture

- 200 measures;
- 8 Parts;
- exactly 2 Voices per Part/Measure;
- exactly 8 Events per Voice;
- exactly 25,600 Events and 12,800 Notes using the CVN-FC-131 alternating Notes/Rest fixture;
- exactly two synthetic official module contributions;
- exactly 2,000 committed history entries in the long-history fixture.

Reference-Windows P95 budgets after warm-up and repeated sampling:

- ordinary single-target submit/undo/redo: `<= 100 ms`;
- immutable read/snapshot creation: `<= 50 ms`;
- 100-child atomic batch: `<= 300 ms`;
- 100-command deterministic replay: `<= 2 s`;
- create/decode/semantic/compatibility pipeline: `<= 1 s` for the representative fixture.

### Completion/stress fixture

- 400 measures;
- 16 Parts;
- exactly 2 Voices per Part/Measure;
- exactly 8 Events per Voice;
- exactly 102,400 Events and 51,200 Notes;
- exactly 10,000 submitted and replayed semantic envelopes.

The stress fixture must complete deterministically with deeply equal replay output and peak RSS `<= 2.0 GiB`, without crash, stack overflow or state divergence. Its initial latency is recorded as a trend metric; it becomes release-blocking only after a separately approved budget is established from repeated measurements.

## Design Consequences

- A release-blocking 25,600-event fixture is likely achievable with clone-once candidates plus focused indexing/validation work.
- Requiring near-immediate edits at 100,000+ events would likely trigger structural sharing, incremental semantic validation and incremental snapshot work inside Core VNext rather than leaving them as optional later optimization.
- Benchmark harnesses must generate deterministic fixtures, warm up before measured runs, execute multiple samples, report median/P95, and record Node/OS/CPU/memory/build hash.
