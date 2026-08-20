# Roadmap Synchronization Matrix

> **Architecture Reset V2 is current:** `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` at `e81c739b...`; the independent authority-sync task is `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`.

## Purpose

Record the narrow documentation edits required to make the corrected hierarchy durable without reopening accepted requirements or Core contracts.

| Document | Existing authority | This task change | Explicit non-change | Validation |
|---|---|---|---|---|
| Product `task.json` | owns top-level children | add this planning parent once; add planning note/meta pointer | no existing child/status rewrite | JSON parse; unique child |
| Product `prd.md` | owns product decisions and current delivery state | add fixed Core → official plugins → product loop → public plugins sequence and task pointer | preserve existing REQ/DEC content | heading and pointer search |
| Architecture Reset V2 design | current architecture authority | source for Core Platform, seven crates, unique owners and equal Instrument Plugin protocol | no V2 content rewrite | source commit/audit pointer |
| Rust remediation parent | RKP stage plan | RKP-1 consumes V2 seven-crate projection; RKP-9 remains before product route | no RKP-1 creation | exact crate/owner scan |
| Core VNext durable roadmap | owns CVN-0～7 dependencies and close line | add mandatory official-plugin/product-program exit after CVN-7; preserve optional evidence gates | no FC, command, budget or current CVN status change | diff review; command count unchanged |
| This task `prd.md` | new post-Core source requirements | own POPR-R001～010 and AC001～020 | no production authorization | Trellis validation |
| This task `design.md` | new architecture coordination | own five-layer boundary/data flow/dependencies | no public API implementation | planning review |
| This task `implement.md` | new future execution map | own child order and activation gates | children remain uncreated | task list check |
| REQ-007 | already says internal-first and third-party later | reference only | no text change | zero diff |
| REQ-011 | already fixes Guitar Core Loop | reference only | no text change | zero diff |
| microkernel architecture | already keeps product services outside Core | reference only | no text change | zero diff |
| modular plugin architecture | already defines Core/services/Workbench/Extension Host layers | reference only | no text change | zero diff |
| active Core specs | accepted implementation authority | context only | no spec change | zero diff |
| `src/**`, `test/**`, package/tsconfig | production/test/build surface | none | fully protected | base comparison empty |

## Required wording after sync

The durable documents must agree on all of the following:

1. Current execution continues CVN-2 → CVN-6 → CVN-5 → CVN-7.
2. CVN-7 closes the finite generic Core VNext.
3. The first post-Core implementation is Official Guitar Domain.
4. Product service modules and host follow through independent tasks.
5. Guitar Core Loop integrates the accepted official modules.
6. Public visual/functional plugin work follows official-module and product qualification evidence.
7. This task remains planning and is not the implementation target.
8. Kernel Runtime, Kernel Session/Composition, Product ApplicationAssembly and Product Extension Host each have one owner, with separate private/application identities.
9. Guitar/Piano/Bass/third-party Instrument Plugins use one equal protocol; Guitar Domain is not a Rust privileged provider.
10. RKP-9 precedes the product route, and Guitar Core Loop is the first post-RKP product milestone.

## Prohibited synchronization drift

- changing 25-current/28-final Core command counts;
- moving Guitar rules into Core;
- marking CVN-2 or future CVN stages accepted;
- creating future implementation children;
- editing active Core specs for a planning-only product route;
- absorbing the dirty CVN-2 candidate;
- updating unrelated product decisions.
