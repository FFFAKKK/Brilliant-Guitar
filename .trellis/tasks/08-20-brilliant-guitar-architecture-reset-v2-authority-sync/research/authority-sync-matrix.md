# Architecture Reset V2 Authority-Sync Matrix

## Purpose and fixed decision

This matrix is the executable disposition for every current or historical architecture authority touched by the sync. `V2 current` means `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` at `e81c739b...`, with acceptance/audit evidence recorded at `ea574ec...`. `TS oracle` means an existing active TypeScript contract remains usable for differential/compatibility observation but does not own the future Rust architecture. `Historical` means the original body remains available for traceability and is not a current decision source.

| Old authority file / set | Original state | V2 disposition | Concrete synchronization line | Unique owner | Content retained | Rollback action |
|---|---|---|---|---|---|---|
| `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` | Audited architecture candidate, content `e81c739b...` | V2 current architecture source | Keep content immutable; point all indexes/parents here | Architecture Reset V2 task | Yes, unchanged | Revert only sync pointers; do not edit audited content |
| `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/prd.md` | Audited V2 requirements | V2 requirement source | Keep content immutable; cite source task and acceptance evidence | Architecture Reset V2 task | Yes, unchanged | Restore pointer metadata only |
| `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/implement.md` | Audited staged RKP plan | V2 stage source; no activation | Keep content immutable; RKP-1 remains separate after sync audit | Rust remediation parent consumes it | Yes, unchanged | Restore lifecycle pointer |
| `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/research/*` | Audited evidence and repairs | V2 supporting evidence | No content rewrite; matrix records it as source evidence | V2 task | Yes, unchanged | No source research deletion |
| V2 `task.json`, `operator-handoff.md`, `review-candidate.md` | Candidate `planning`, `proposed_not_current` | Accepted-by-user; current authority pointer | Record acceptance, `e81c739b...`, `ea574ec...`, audit task/result and this sync task; do not alter audited content files | V2 task lifecycle metadata | Yes, metadata updated | Restore prior lifecycle flags |
| `.trellis/tasks/06-29-commercial-guitar-tablature-product/task.json` | Product parent with pre-sync child map | Product parent points to V2 sync | Preserve existing children; retain exactly one new sync child | Product parent | Yes | Remove only the one sync child entry |
| `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md` | Older product/current-stage PRD | Product PRD points to V2 current architecture | Add current-authority section and retain product requirements/28/51/8/34/9 compatibility facts | Product parent | Yes | Revert added authority section |
| `technical/project-architecture.md` | Early project structure proposal | Historical/superseded | Add banner and V2 link; preserve body | Product architecture history | Yes | Remove banner only |
| `technical/software-architecture.md` | Older Core Kernel + services plan | Historical/superseded | Add banner and V2 link; preserve body | Product architecture history | Yes | Remove banner only |
| `technical/microkernel-architecture.md` | Older nine-mechanism microkernel plan | Historical/superseded | Add banner and V2 link; preserve body | Product architecture history | Yes | Remove banner only |
| `technical/modular-plugin-architecture.md` | Older plugin/layer plan | Historical/superseded | Add banner and V2 link; preserve body | Product architecture history | Yes | Remove banner only |
| `.trellis/spec/core-kernel/index.md` | Active Pure TS Core coding entrypoint | TS observable contract + migration oracle | Add V2 current architecture pointer and clarify no Rust cutover/privileged Guitar ownership | Core spec index | Yes | Restore prior banner/index text |
| Rust parent `task.json` | Planning parent, RKP-0 child only | V2-governed Rust migration parent | Add V2 pointers, exact seven-crate target, unique owners and review-pending sync dependency; keep status planning/RKP-1 absent | Rust remediation parent | Yes | Restore V2 metadata fields |
| Rust parent `prd.md` | Old Rust transition projection | V2-governed RKP contract | Point to V2; replace four/five-crate projection with seven crates; keep 28/51/8/34/9, `brilliant-score-1`, RKP-0 oracle and no RKP-1 | Rust remediation parent | Yes | Revert only V2 projection paragraphs |
| Rust parent `design.md` | Four-crate Rust design with privileged extension SDK | Superseded by V2 seven-crate design | Use exact seven-crate graph; split Runtime from Session/Composition; keep TS oracle and no Guitar privileged provider | RKP stages consume V2 | Yes | Restore old design projection |
| Rust parent `implement.md` | RKP-1 described four-crate workspace | V2 stage execution map | RKP-1 consumes V2 seven crates; stages keep one-child gate and RKP-8 switch/RKP-9 qualification boundaries | Rust stage owner | Yes | Restore prior stage wording |
| Rust parent `operator-handoff.md` | RKP-0 accepted, RKP-1 absent | V2 handoff with sync gate | Add V2 source/audit pointers and seven-crate/RKP-1 stop | Rust parent operator | Yes | Restore prior handoff metadata |
| Rust parent `review-candidate.md` | Prior planning review PASS | V2 projection review | Add exact seven-crate, owner and V2-sync review focus; preserve old review evidence | Independent Rust planner/auditor | Yes | Remove projection section |
| Rust `research/current-authority-and-hotpath-audit.md` | TS current authority, old transition | V2 architecture authority + TS oracle | Separate current architecture from current implementation and retain hotpath evidence | Rust parent research | Yes | Restore old authority statement |
| Rust `research/stage-dependency-and-rollback-map.md` | Old stage owners/crate labels | V2 stage/owner map | Set RKP-1 V2 dependency and exact owners; retain rollback boundaries | RKP stage owner | Yes | Revert rows |
| Rust `research/planning-candidate-self-audit.md` | Previous self-audit | V2 sync self-audit | Add authority-sync checks and seven-crate proof while keeping prior evidence | Sync auditor | Yes | Remove added checks |
| `.trellis/tasks/08-11-post-core-official-plugin-product-roadmap/task.json` | Planning-only post-Core parent | V2-governed product roadmap | Add V2 pointer, owner boundaries, separate identities and Guitar Core Loop exit | Post-Core parent | Yes | Restore metadata |
| Post-Core `prd.md` | Five-layer post-Core plan | V2 Core Platform/Product Host/Extension Host plan | Define boundary names, equal Instrument Plugins, no Guitar privileged provider, and RKP-9 → Guitar Core Loop | Post-Core parent | Yes | Revert V2 status/layer additions |
| Post-Core `design.md` | Five-layer architecture diagram | V2 boundary projection | Add V2 graph and unique owner/identity table; retain product flow and service contracts | Post-Core design | Yes | Remove V2 projection |
| Post-Core `implement.md` | Child roadmap with old Core wording | V2 execution order | Make RKP-9 → Guitar Core Loop explicit; assign ApplicationAssembly/ExtensionHost to Product Host | Post-Core roadmap | Yes | Restore prior execution wording |
| Post-Core `operator-handoff.md` | Planning-only, CVN-2 continuation | V2 handoff | Add V2 authority, owner boundaries, equal plugin and activation stop | Post-Core operator | Yes | Restore prior handoff |
| Post-Core `review-candidate.md` | Prior planning review PASS | V2 sync review | Add V2 boundary and identity checks; preserve review evidence | Independent roadmap auditor | Yes | Remove added checks |
| Post-Core `research/roadmap-sync-matrix.md` | Prior narrow roadmap matrix | V2 sync matrix | Add current-authority, seven-crate consumer and product-boundary rows | Post-Core research | Yes | Revert added rows |
| `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/**` | Accepted archived RKP-0 oracle | Compatibility input only | No file changes; `28/51/8/34/9`, oracle data and failure ledger remain immutable | Archived RKP-0 | Yes, immutable | Revert sync commit; archive remains untouched |
| Archived CVN tasks / qualification fixtures | Accepted compatibility and qualification inputs | Compatibility input only | No file changes; no authority promotion in this task | CVN/RKP archive owners | Yes, immutable | No archived-path write permitted |
| `brilliant-score-1`, 28 commands, 51/8/34/9 surfaces | Existing accepted observable contracts | Migration oracle/current TS observable contract | Reference without redesign or count changes | Existing Core TS contract until accepted Rust stage | Yes | Revert references only |

## Owner and identity checklist

| Invariant | Current V2 answer |
|---|---|
| Kernel Runtime owner | `brilliant-kernel-runtime` owns live state, indices, transaction/history/event mechanisms |
| Kernel Session/Composition owner | `brilliant-kernel-session` owns use cases, 28 handlers, gateway and composition root |
| Product ApplicationAssembly owner | Product Host / Workbench Editor Session future child |
| Product Extension Host owner | Product Host future public-extension child |
| Kernel private identity | private composition/session identity; never a Product ApplicationAssembly identity |
| Product assembly identity | application session/assembly fingerprint; never a Kernel private identity |
| Instrument Plugin privilege | Guitar/Piano/Bass/third-party are equal public protocol consumers; no Guitar Rust privileged provider |
| RKP-1 gate | separate planning task only after this sync independently audited and accepted; absent in this commit |
| First post-RKP product work | Guitar Core Loop after RKP-9, before broad public plugin expansion |

## Rollback

The rollback unit is the single authority-sync commit. Reverting it restores the prior current/historical labels and parent projections while preserving the accepted V2 source, audit evidence, archived RKP-0/CVN inputs and all production paths. A returned sync audit does not permit lifecycle advancement; it triggers a bounded docs-only repair and rerun.
