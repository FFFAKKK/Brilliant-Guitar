# Official Plugin and Product Dependency Map

## Fixed delivery chain

```text
Core VNext completion
  -> Official Guitar Domain
      -> File/Persistence
      -> Layout -> SVG Renderer -> Workbench/Editor Session
      -> Playback
      -> Layout + Renderer -> PDF/PNG Export
  -> Guitar Core Loop Integration
  -> Product Release Qualification
  -> Public Visual and Functional Plugin Planning
```

## Stage contracts

| Stage | Entry | Owned result | Exit | User benefit |
|---|---|---|---|---|
| Core VNext | accepted CVN prerequisites | generic module-capable microkernel | CVN-7 accepted/archived | stable and measurable foundation |
| Guitar Domain | accepted Core VNext + GD-0 | six-string/tuning/fret/techniques and domain commands | headless Guitar fixtures pass | project becomes guitar-aware without enlarging Core |
| File/Persistence | accepted Guitar data contract | durable `.bgp`, save/open/recovery | Guitar round-trip passes | user work becomes a protected local asset |
| Layout | accepted Guitar projection | notation primitives/hit areas | deterministic golden | one semantic score can drive multiple views |
| SVG Renderer | accepted Layout | visible staff/tab/techniques | visual golden | users can see a professional score |
| Playback | accepted Guitar/time | playback events and transport | deterministic four-measure playback | users can audit their notation by ear |
| Workbench | accepted File/Persistence, Layout, Renderer, Playback, Guitar and Core commands | keyboard-first editing/session/UI, file/playback bindings, Application Assembly and official provider directory | atomic ready/fail assembly plus four-measure edit/save/reopen/play flow | users can create, protect and audit work in one stable product session |
| PDF/PNG Export | accepted Layout/Renderer/Workbench contribution API | shareable outputs and product invocation contribution | golden and failure tests | users can deliver teaching/rehearsal material |
| Core Loop Integration | all official product modules accepted | one end-to-end product journey | repeatable E2E | first usable product version |
| Product Qualification | accepted Core Loop | installation/release/performance/compatibility | release candidate gate | commercial-grade open-source delivery |
| Public Plugins | accepted product contracts | external visual/functional SDK | separately planned | users and developers customize the product |

## Dependency rules

1. Dependency satisfaction is proved by acceptance/archive commits, not by local green tests.
2. Only one new child is activated at a time unless two children have disjoint owners, complete independent plans and explicit user approval.
3. File/Persistence may proceed after Guitar data contract acceptance without waiting for Renderer.
4. Layout and Playback may proceed independently after Guitar Domain acceptance.
5. Workbench waits for stable File/Persistence, Layout, Renderer, Playback and final Guitar command IDs, then uniquely owns Application Assembly, their product-facing bindings and the future Export contribution port.
6. Export waits for stable Layout/page semantics, Renderer output and the accepted Workbench contribution API.
7. Integration consumes the accepted Application Assembly contract/factory and accepted providers; it owns only final product wiring and E2E evidence. Assembly-contract or feature changes return to the owning child.
8. Public plugin planning consumes evidence from official modules and Product Qualification; it does not reopen CVN.

## Ownership fences

- Core owns persisted generic score semantics and unified state transitions.
- Guitar Domain owns guitar payload and behavior.
- Layout owns view geometry; Renderer owns pixels/vectors.
- Playback owns runtime event schedules.
- Persistence owns physical IO and package assembly.
- Workbench/Product Host owns user session, visual composition, Application Assembly, official provider directory and stable assembly identity; ready assembly has no contribution-set mutation.
- Future Extension Host owns public-plugin discovery, manifest validation, authorization, event filtering, failure isolation and mapping to versioned logical contribution contracts.
- Export owns external output artifacts.
- No service owns a mutable copy of ScoreDocument.
- Public plugins never receive raw Registry mutation, a bare Core event bus or mutable ScoreDocument access.

## Stop decisions

| Finding | Required route |
|---|---|
| Guitar scenario fits accepted SDK/effects | implement in Guitar child |
| Guitar scenario needs bounded Core operation expansion | stop and create post-CVN Core evolution gate |
| score/Part extension aggregation misses measured budget | stop and create schema/owner evolution gate |
| visual requirement leaks specific Renderer objects into Core | return to Layout/Renderer design |
| persistence needs new semantic score data | route through owning domain/schema task |
| integration exposes missing module behavior | return to module owner; integration stays narrow |
