# CVN-6 File and Test Ownership Matrix

## Planning Candidate Allowlist

| Path | Ownership |
|---|---|
| `.trellis/tasks/08-11-cvn-6-module-runtime-validation-migration-integration/**` | child planning artifacts |
| parent `task.json` | child link and current CVN-6 planning state |
| parent `implement.md` | current gate and formal child reference |
| parent `feature-contract-matrix.md` | CVN-6 bounded public closure and state |
| parent `research/cvn-roadmap-and-stage-plan.md` | formal child/current-gate status |
| active `domain-transaction-integration.md` | labeled CVN-6 planning-candidate closure |

Post-Core task files, `src/**`, `test/**`, package files and TypeScript config have zero planning-candidate delta.

## Future Production Allowlist

### New

- `src/core-kernel/commands/integrated-runtime.ts`
- `src/core-kernel/registry/domain-availability.ts`
- `src/core-kernel/migration/migrate-kernel-extension.ts`

### Existing

```text
src/core-kernel/index.ts
src/core-kernel/commands/contracts.ts
src/core-kernel/commands/command-bus.ts
src/core-kernel/commands/runtime.ts
src/core-kernel/commands/replay.ts
src/core-kernel/commands/execution-assembly.ts
src/core-kernel/commands/effects.ts
src/core-kernel/session/runtime.ts
src/core-kernel/registry/integrated-contracts.ts
src/core-kernel/registry/domain-catalog.ts
src/core-kernel/registry/assembly.ts
src/core-kernel/registry/runtime.ts
src/core-kernel/registry/gateway.ts
src/core-kernel/events/contracts.ts
src/core-kernel/events/facts.ts
src/core-kernel/events/runtime.ts
src/core-kernel/read/contracts.ts
src/core-kernel/read/session-state.ts
src/core-kernel/read/snapshot.ts
src/core-kernel/migration/contracts.ts
src/core-kernel/reports/contracts.ts
src/core-kernel/reports/adapters.ts
src/core-kernel/reports/build-report.ts
src/core-kernel/errors/kernel-error.ts
```

## Protected Production Paths

- `src/core-kernel/module-sdk/**`
- `src/core-kernel/migration/migrate-score-document.ts`
- Score schema and codec format authority
- Guitar/domain implementation directories
- persistence, renderer, playback, export, host and public extension-platform directories
- package/build configuration except a separately approved test-runner necessity

## Planned Tests

| File | Decisive ownership |
|---|---|
| `cvn-6-public-contracts.test.ts` | declarations, root/SDK export allowlists, Core drift |
| `integrated-assembly-identity.test.ts` | authentic/forged/mode/A-B construction matrix |
| `domain-availability.test.ts` | compatibility, fact order, complete/incomplete, frozen views |
| `module-transaction-atomicity.test.ts` | ordered multi-effect candidate/inverse/rollback |
| `module-validation-classification.test.ts` | call order/counts, issue aggregation and exception isolation |
| `integrated-replay-events-history.test.ts` | submit/undo/redo/replay/history/event parity |
| `extension-migration.test.ts` | detached migration and preservation matrix |
| `integrated-hostile-input-resource.test.ts` | guards, callback contracts and caps |
| `integrated-public-boundary.test.ts` | privacy and forbidden dependencies |
| `core-only-regression.test.ts` | accepted Core-only behavior |
| `fixtures/cvn-6-synthetic-official-modules.ts` | two neutral official modules |

Any implementation path outside these lists triggers a bounded planning review before further source edits.
