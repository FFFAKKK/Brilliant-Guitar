# CVN-7 Fixture and Workload Contract

## Generator identity

| Fixture | generatorVersion | seed |
|---|---:|---|
| representative | 1 | `cvn7-representative-v1` |
| stress | 1 | `cvn7-stress-v1` |

No clock, randomness, environment, filesystem ordering or object identity enters generated data.

## Exact counts

| Entity | Representative | Stress |
|---|---:|---:|
| Measure | 200 | 400 |
| Part | 8 | 16 |
| Staff | 8 | 16 |
| PartMeasureContent | 1,600 | 6,400 |
| Voice | 3,200 | 12,800 |
| Event | 25,600 | 102,400 |
| Note | 12,800 | 51,200 |

Each Voice has eight eighth-note events. Even event positions are one-note Notes events; odd positions are Rest. Every Part/Measure has exactly two Voices and every Part has exactly one Staff.

## Extensions and modules

- score namespace: `fixture.cvn7.score`;
- part namespace: `fixture.cvn7.part`;
- unknown namespace: `fixture.cvn7.unknown`;
- known score blocks: 1;
- known part blocks: one per Part;
- unknown opaque blocks: 1 score-owned;
- catalog order: score contribution, then part contribution;
- each known contribution supplies one command, validator, classifier and owned effect;
- each module command requests WrittenPitch replacement followed by owned block replacement.

## Workloads

### Long history

Exactly 2,000 changed submits alternate the canonical first Note between C4 and D4. The retained final state has version 2,000, undo depth 2,000 and redo depth 0.

### Stress

Exactly 10,000 envelopes select `canonicalNotes[index % noteCount]`. Per-note visit count decides C4/D4 so each submit changes current data. Live and replay start from the same encoded initial document and authentic integrated assembly inputs.

### 100-child batch

| Index | Child |
|---:|---|
| 0 | `fixture.cvn7.score.apply` |
| 1..98 | `core.document.set-metadata`, alternating two distinct metadata values |
| 99 | `fixture.cvn7.part.apply` |

All 100 children are effective. The result is one version, one history entry, one aggregate committed event and the existing optional dirty event.

### Replay 100

The first 100 canonical Notes each receive one C4→D4 command. Replay uses the same 100 detached envelopes and a fresh compatible assembly.

## Generator acceptance

- exact counts;
- globally unique IDs;
- complete Measure coverage for each Part;
- valid Staff references;
- exact Voice duration;
- semantic validation pass;
- encode/decode round-trip deep equality;
- same seed/version generation deep equality;
- different fixture kind produces the prescribed different counts;
- unknown block remains opaque and lossless.
