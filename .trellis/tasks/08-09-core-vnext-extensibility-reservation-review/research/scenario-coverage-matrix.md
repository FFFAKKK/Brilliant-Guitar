# Future Module Scenario Coverage Matrix

## 1. Scenario table

| ID | Scenario | Persisted truth | Commands/reads | Current V1 path | Future gate | Acceptance observation |
|---|---|---|---|---|---|---|
| SC-001 | Add/update/remove a technique on a Note/Event | Part-owned technique ExtensionBlock with stable entity IDs | namespaced module command | owned Extension effect | none | one version/history/event; undo/replay deep-equal |
| SC-002 | Technique changes placement/pitch and module data | Core WrittenPitch + owned block | module command | V1 multi-effect contribution | none | Core+module validation; reverse-order inverse |
| SC-003 | Create a piano Part with two Staves and Voices | Core Part/Staff/Voice/Event structures | Core commands | CVN-4 commands, later CVN-5 batch | none | no piano field added to Core schema |
| SC-004 | Store fingering, pedal and hand assignment | Piano-owned Part ExtensionBlock | piano module commands/selectors | V1 extension command; adapter reads snapshot | selector gate for efficient derived view | missing module preserves data losslessly |
| SC-005 | Atomic hand split updates staff assignments, voices and piano data | Core structures + Piano block | ordered Core/module operations | CVN-5 batch constructed by UI/adapter | operation-expansion gate for a single high-level domain command | one candidate/history/event; full rollback |
| SC-006 | Domain panel queries all techniques/fingerings in a range | derived data only | domain query | adapter computes from detached snapshot | domain selector contribution | read leaves version/history/dirty/event unchanged |
| SC-007 | Open document with missing or future module version | existing ExtensionBlocks | read/availability | V1 lossless read-only | package Host may reinstall compatible module | zero incompatible handler calls; payload preserved |
| SC-008 | Upgrade module while documents are open | persisted extension schema + Host package set | new Session creation | restart/reopen with new startup catalog | Assembly generation/package Host | old Session stays pinned; new Session uses new generation |
| SC-009 | Renderer/playback/export consumes module semantics | ScoreDocument + compatible ExtensionBlocks | snapshot/selector | external adapter | per-adapter contribution gates | no layout/audio/file object in Core truth/history |
| SC-010 | One action combines two official modules and Core | each module owns its block; Core owns notation | raw semantic envelopes | CVN-5 same-Assembly batch | future operation expansion remains Core-child-only | deterministic catalog order, one final validation/commit |

## 2. Detailed walkthroughs

### SC-001 — Technique lifecycle

1. Command target uses a stable Core address/ID.
2. Contribution strictly decodes payload.
3. Handler reads only compatible Part-owned block and detached Core facts.
4. Owned effect updates its namespace.
5. Module validator checks referenced IDs and technique rules.
6. Core owns commit/history/replay/event.
7. Event/Voice/Measure removal with technique references is performed as cleanup module command + Core command in a CVN-5 batch.

### SC-003 — Piano structural baseline

1. `core.part.insert` creates a non-transposing Part with multiple Staff definitions and per-Measure Voice content.
2. `core.staff.*` and `core.voice.*` evolve structure.
3. `core.event.set-staff-assignment` handles cross-staff display assignment supported by the current model.
4. Instrument-specific semantic data stays in a Piano namespace.
5. Missing universal Note/Chord lifecycle is a separate Core notation feature gate, not a module mutation privilege.

### SC-005 — Piano high-level operation

Current route:

```text
UI/adapter computes deterministic plan
  -> core.transaction.batch
       child 0: piano-owned extension command
       child 1..N: Core semantic commands
  -> one final validation and commit
```

Future route:

```text
piano high-level command
  -> one-level bounded Core-operation expansion
  -> same Core command preparation/effects
  -> owned extension effects
  -> one final validation and commit
```

Future route must prove replay equivalence and no recursive module invocation before adoption.

### SC-007 — Missing/incompatible module

- Document opening succeeds with detached data.
- Validation completeness is `incomplete`.
- Write availability is read-only with full canonical facts.
- Incompatible blocks enter zero domain callbacks.
- Reinstalling an exact-compatible contribution and opening a new Session restores normal validation/writes.
- Migration is explicit and detached; it does not rewrite an active Session.

### SC-008 — Assembly generations

- Host validates a complete candidate package set.
- Candidate failure leaves all existing Sessions and the prior generation unchanged.
- Candidate success produces a new immutable generation.
- New Sessions bind the new generation.
- Existing Sessions remain deterministic under their original generation.
- Rollback selects the previous package set for another new Session.

## 3. Coverage rule

Every future product proposal must identify one of these paths:

1. existing Core command;
2. existing V1 module command/effect;
3. CVN-5 Core/module batch;
4. named future versioned gate;
5. Core-external Adapter responsibility.

A proposal with no path returns to architecture planning before production implementation.

