# Planning Base and Dependency Audit

## Live baseline

- Worktree: `.worktrees/cvn-5-range-atomic-batch-planning-base`.
- Branch: `codex/cvn-5-range-atomic-batch-planning-base`.
- Planning base: `1673d94c100186538d163d259ebb936e9ae00a38`.
- Baseline subject: `docs(cvn-6): activate reviewed implementation`.
- Baseline tests before this task: typecheck/build pass; full suite `350/350` as recorded and revalidated by the planning gate.

## Accepted dependencies

| Dependency | State at planning base | CVN-5 use |
|---|---|---|
| CVN-2 | accepted/archived | frozen nine-field official contribution ABI, SDK `8/34`, installed catalog |
| CVN-3 | accepted/archived | measure structure and primitive measure effects |
| CVN-4 | accepted/archived | Part/Staff/Voice/Event/Note structure and primitive event/pitch effects |
| Extensibility Reservation | accepted/archived | Core-first, startup-frozen evolution fence |
| GD-0 | accepted/archived | public official-domain data/failure fence, no Guitar implementation |

## Open dependency

CVN-6 is `in_progress` and implementation-authorized at the planning base, but it is not accepted or archived. CVN-5 consumes its eventual accepted:

- authentic integrated catalog/inventory assembly;
- Core-only/integrated availability preflight;
- official-module route/handler/effect ownership;
- validators, Core profile, classifiers, issues/facts and caps;
- integrated event identity and `replayKernelCommands`.

Therefore CVN-5 can be planned and independently reviewed now, but `task.py start`, production edits and implementation authorization remain false until the CVN-6 acceptance and archive commits are ancestors of the implementation branch.

## Dependency graph

```text
accepted CVN-2 + accepted CVN-3 + accepted CVN-4 + accepted CVN-6
                              |
                              v
                            CVN-5
                              |
                              v
                            CVN-7
```

CVN-5 does not reopen CVN-6. If the accepted CVN-6 surface differs from the planning input, the operator records the delta and returns this task to planning review.

## Planning isolation

The CVN-6 implementation worktree remains independent. This branch must not absorb its unaccepted source/test changes. Relative to the planning base, the CVN-5 candidate owns documents only, with zero `src/**`, `test/**`, build-config, CVN-6-task or post-Core-task delta.
