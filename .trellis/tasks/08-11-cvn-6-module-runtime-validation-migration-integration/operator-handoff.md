# CVN-6 Planning Operator Handoff

## Candidate Identity

- Task: `08-11-cvn-6-module-runtime-validation-migration-integration`.
- Worktree: `.worktrees/cvn-6-unified-planning-base`.
- Branch: `codex/cvn-6-unified-planning-base`.
- Unified base: `050af1eed067300f2e2fb0339eff6f2430e43b36`.
- Required ancestors: `302dafe451bd4e10f4978d3076e367473b2fa3ae`, `c68fcc648051b51b73fda3e5bda6eb9e33298f39`.
- Lifecycle: `planning`.
- `task_start_run=false`.
- `production_implementation_authorized=false`.
- Initial independent planning verdict: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/0`.
- Targeted independent planning rereview: pending.

## What This Child Owns

- `CVN-FC-112`: composition-root known-requirement inventory, private runtime assembly binding and the existing Core runtime owner.
- `CVN-FC-120`: changed-candidate validation/profile/diagnostic pipeline.
- `CVN-FC-121`: write and validation availability with lossless degradation.
- `CVN-FC-122`: detached deterministic official extension migration.

The bounded repair adds application-facing `KernelKnownRequirementInventoryV1` and explicit inventory overloads only to integrated Registry, CommandBus and replay construction. CVN-2 remains the sole owner of catalog compilation, its nine-field ABI, SDK `8/34`, selected-entry rules and catalog-private state. The inventory carries no callback and cannot install a module, contribution, command, effect, Registry summary or gateway.

## Operator Order After Future Activation

1. verify the accepted planning commit and both ancestors;
2. verify the targeted planning rereview passed P0/P1/P2=`0/0/0`;
3. activate only this child after explicit approval;
4. follow `implement.md` phases 1 through 10 in order;
5. keep source/test edits inside the exact allowlists;
6. obtain independent implementation review before acceptance/archive.

The parent coordination task is not an implementation target. CVN-5 remains gated on accepted CVN-6. CVN-7 remains gated on accepted/archived CVN-0 through CVN-6.

## Boundary Reminders

- CVN-6 runtime assembly identity combines authentic catalog identity with canonical inventory data; it is distinct from both CVN-2 catalog identity and the post-Core Product Host Application Assembly.
- Catalog-only integrated overloads remain exact and derive installed-only requirements.
- Only explicit inventory construction makes an absent-but-known contribution reachable.
- Each synthetic module command is one contribution-owned transaction; cross-module aggregate batch belongs to CVN-5.
- Guitar Domain, product services/host and the public plugin platform remain on the post-CVN-7 roadmap.
- Existing persisted schema, physical file behavior and CVN-2 compiler remain exact.

## Immediate Handoff Target

The targeted auditor reviews `review-candidate.md` and `research/known-requirement-inventory-closure.md`, then checks the synchronized PRD/design/implement/parent/spec projections. The decisive questions are public reachability of unavailable-only/incompatible-only/mixed/unknown, inventory ownership and strict codec, catalog/inventory assembly mismatch, failure priority, callback-zero behavior, and CVN-2/post-Core zero drift. Implementation activation follows only after a recorded P0/P1/P2=`0/0/0` result and user approval.
