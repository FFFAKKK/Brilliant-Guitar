# CVN-0 Current Guard Evidence

## Baseline

- Worktree activation HEAD: `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`.
- Accepted Core V1 base: `d92a7586536ac8757c318ae6f75aabd8698f85ac`.
- Archived authority: `.trellis/tasks/archive/2026-07/07-26-core-kernel-v1-qualification-gate/audit-report.md`, CKV1-AUDIT-001.

## Decisive Existing Source

| Public guard | Current file/lines | Direct untrusted reads |
|---|---|---|
| `isJsonValue` | `src/core-kernel/domain/extensions.ts:24-68` | `value[index]`, `record[key]` |
| `isWrittenPitch` | `src/core-kernel/domain/pitch.ts:34-52` | `candidate.step/alter/octave` |
| `isTransposition` | `src/core-kernel/domain/pitch.ts:54-66` | `candidate.diatonicSteps/chromaticSemitones` |

## Reproduced Archived Observation

The accepted audit records:

```text
isWrittenPitch(Proxy with throwing step getter)       -> throws PITCH_GET; getCalls = 1
isTransposition(Proxy with throwing diatonic getter)  -> throws TRANSPOSITION_GET; getCalls = 1
isJsonValue(object with enumerable value getter)      -> true; getCalls = 1
```

No stateful kernel mechanism is involved in the observation.

## Existing Safe Patterns

- `src/core-kernel/commands/strict-codec.ts` already uses exact prototype/own-key/data-descriptor inspection and dense-array checks.
- `src/core-kernel/registry/strict-codec.ts` exposes a subsystem-local strict-data pattern with the same principles.
- Importing those higher-layer helpers into `domain/` would invert dependencies. CVN-0 therefore uses a narrow domain-private helper or two equivalent local implementations.

## Existing Tests

- `test/core-kernel/extensions.test.ts` covers ordinary JSON, non-finite numbers, cycle and sparse array.
- `test/core-kernel/pitch-transposition.test.ts` covers transposition behavior but not direct hostile predicate calls.
- `test/core-kernel/public-api-boundary.test.ts` freezes the three predicate export names.

## Planning Conclusion

The shortest compliant repair is confined to two domain guard files plus an optional private helper and one focused test file. Command/Registry codecs provide patterns, not a mandate to refactor unrelated layers.
