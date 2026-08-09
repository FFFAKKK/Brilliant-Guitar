# Contract Impact Map

## 1. Planned documentation delta

| File | Section/anchor | Allowed change | Protected content | Verification |
|---|---|---|---|---|
| parent `task.json` | `children` / reservation metadata | retain this task ID and record its in-progress documentation gate, branch and dependency stop points | every existing child, accepted CVN state and production authorization | exact JSON diff |
| parent `prd.md` | after CVN-D011 | add CVN-D012 | D001-D011 meaning/order | heading list comparison |
| parent `prd.md` | after CVN-R011 | add CVN-R012 | R001-R011 meaning/order | heading list comparison |
| parent `prd.md` | Acceptance Criteria end | add CVN-AC018 | AC001-017 meaning/order | AC list comparison |
| `feature-contract-matrix.md` | after CVN-FC-112 | add non-FC evolution subsection | FC110-112 V1, FC heading/owner count, caps | pre/post exact tables and heading set |
| durable roadmap | graph/status/CVN-2/CVN-6/scheduling/index | add reservation gate and future index; live status refresh | accepted CVN-4 evidence and original CVN-5 dependency set | graph + status table review |
| GD-0 `design.md` | after ABI/effect design or rollout | add forward-evolution explanation | all `public-contract` fences and V1 effect scope | fence hash equality |
| this task | all artifacts | requirements/design/plan/research/context and activation evidence | `in_progress` documentation-only status until independent review/user acceptance | task validation |

## 2. No-change files

| Path family | Reason |
|---|---|
| `src/**` | No runtime implementation in reservation planning. |
| `test/**` | No behavior change to characterize. |
| `.trellis/spec/**` | Accepted specs describe current behavior; future reservations are not current runtime truth. |
| `.trellis/tasks/archive/2026-08/08-04-cvn-4-part-staff-voice-lifecycle/**` | Accepted CVN-4 task evidence stays immutable after merge baseline `783f69c`. |
| archived CVN-0/CVN-1/CVN-3 tasks | Accepted evidence stays immutable. |
| package/build files | No export or runtime surface changes. |

## 3. Count and hash invariants

| Invariant | Baseline | Required after delta |
|---|---:|---:|
| Core command IDs | 28 | 28 |
| V1 retained commands | 6 | 6 |
| VNext added commands | 22 | 22 |
| `CompiledDomainCommandContributionV1` fields | 9 | 9 |
| Persisted Score schema | `brilliant-score-1` | `brilliant-score-1` |
| module-to-Core V1 write | WrittenPitch | WrittenPitch |
| ExtensionOwner V1 | Score/Part | Score/Part |
| GD-0 public fences | 6 fences; ordered SHA-256 recorded in `implement.md` Stage 0 | exact count/order/hash equality |
| `CVN-FC-*` headings | 44 | 44 |
| primary-owner rows | 9 | 9 |
| ready Assembly mutation APIs | 0 | 0 |
| source/test/spec/CVN-4 archive paths in task-owned diff from `783f69c` | 0 | 0 |

Stage 0 derived these counts from the activation baseline. The set and ordering must remain equal after the documentation delta.

## 4. Requirement trace

| Requirement | Owning artifact | Evidence |
|---|---|---|
| R001 | PRD + roadmap | live worktree/task status and diff path scan |
| R002-R004 | parent D012/R012 + decision matrix | version lane table and V1 equality checks |
| R005 | design section 6 | SC-005 and no V1 API delta |
| R006 | design section 7 | SC-006 and no runtime selector export |
| R007 | design section 8 | Score schema/owner equality |
| R008 | design section 9 | SC-008 generation walkthrough |
| R009 | design section 10 | SC-009 adapter boundary |
| R010 | design section 4/9 | dependency/capability rules |
| R011 | scenario matrix | SC-001 through SC-010 complete |
| R012-R013 | impact map | exact docs-only delta and count checks |
| R014 | roadmap | pre-CVN-2 gate and unchanged dependency edges |
| R015-R016 | implement sections 11-13 | Trellis/Git validation and independent review |

## 5. Review focus

1. Future planning language must not claim implementation or acceptance.
2. “New version lane” must not mutate V1 in place.
3. Domain operation expansion must route Core semantic commands, not private effects or generic paths.
4. Selector output must not become a second persisted truth.
5. Assembly generation must create new Sessions rather than mutate old Sessions.
6. External Adapter contracts must remain outside Core business truth.
7. CVN-4 status and commit references must match the live completed archive evidence.
8. Parent finite completion remains CVN-0 through CVN-7; future gates are additive post-completion work.
