# Independent Planning Review Record

## Review scope

- Branch: `codex/post-core-official-plugin-product-roadmap`
- Base: `faaf424cf370bbf055ad2cf9862e472a50edc22f`
- Scope: this task's planning artifacts plus the narrow product-parent and Core VNext roadmap synchronization.
- Excluded: production implementation, task activation, future-child creation, remote push and the separate dirty CVN-2 candidate.

## Initial independent review

Verdict: `RETURN FOR BOUNDED PLANNING REPAIR`.

- P0: 0
- P1: 1
- P2: 0

### P1 — Application Assembly had no unique implementation child

`design.md` assigned Application Assembly to Product Host, but the future-child table and `implement.md` did not assign its startup atomic assembly, provider directory, stable session identity or ready-time frozen contribution set to Child 6 or Child 8. Child 8 was simultaneously constrained to integration and narrow repair, leaving a future operator to choose the owner.

Impact: the product host boundary and acceptance evidence were incomplete, and Guitar Core Loop could silently expand into a new assembly implementation.

## Bounded repair

The repair remains planning-only and makes these exact changes:

1. `workbench-editor-session-v1` is the unique first-version Application Assembly owner.
2. Child 6 now depends on File/Persistence, Layout, Renderer, Playback, Guitar Domain and Core commands.
3. Child 6 owns the official provider directory, stable session identity/assembly fingerprint and atomic `ready | failed` result.
4. A failed required-provider assembly publishes zero session and zero partial provider directory; a ready session has a frozen contribution set.
5. Child 6 fixes the future Export provider contribution port; Child 7 implements it.
6. Child 8 calls Child 6's accepted contract/factory with the full Child 1～7 accepted provider set to create a new ready session; it does not mutate an existing ready assembly or redesign assembly.
7. The operator handoff adds a clean lineage-convergence gate so accepted CVN-2 and this planning commit meet before CVN-6, never inside the dirty CVN-2 candidate.

The first targeted re-review found one remaining wording conflict: the dependency map still said Integration “owns cross-module assembly.” The final bounded wording repair makes Integration consume Child 6's accepted Application Assembly contract/factory and accepted providers; Integration now owns only final product wiring and E2E evidence.

## Targeted re-review

Status: `PASS`.

- P0: 0
- P1: 0
- P2: 0

The final independent targeted re-review verified:

- PRD, design, implement, task metadata and handoff assign first-version Application Assembly only to `workbench-editor-session-v1`;
- Child 7 implements only the frozen Export provider port;
- Child 8 calls the accepted Child 6 contract/factory with Child 1～7 accepted providers, owns only final wiring/E2E evidence and does not mutate an existing ready session;
- the task directory contains no synonymous second Application Assembly owner; Persistence “package assembly” refers only to the physical file package;
- the lineage-convergence gate keeps the current dirty CVN-2 candidate isolated and waits for accepted/archived/clean CVN-2 before a unified CVN-6 base;
- task status remains `planning`, production authorization and future-child creation remain false, the parent reference is unique, protected production paths are unchanged, and Trellis/diff checks pass.

Final planner verification after the review record was applied: child Trellis implement `15/15` and check `16/16`, product parent implement/check `0/0`, JSON/JSONL and parent/child structure pass, protected production delta is zero, typecheck/build pass and the full baseline is `315/315`.
