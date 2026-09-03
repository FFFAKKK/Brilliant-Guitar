# RKP-2 Stage 6 S6.3 Final Candidate Freeze

## Goal

Turn the accepted, archived, and fast-forward-integrated S6.2 result into one coherent final RKP-2 implementation candidate. S6.3 repairs only executable governance that became stale after accepted descendants and archive relocation; it does not add kernel behavior or rerun the expensive scale journey.

## Requirements

1. Preserve the accepted S6.2 evidence exactly at `.trellis/tasks/archive/2026-09/09-03-rkp-2-stage-6-s6-2-fresh-evidence-consumption` and prove that its active task root is absent.
2. Pin and verify the S6.2 chain `c920f057` reviewed candidate -> `e3518896` acceptance -> `51dbabd1` native archive, including the exact fresh sentinel SHA-256 `4cbcbf87...bb0c` and `partialEvidence=false`.
3. Repair the three known post-integration Workspace Law failures:
   - classify `.gitattributes` as an explicit accepted RKP-2 implementation authority path;
   - stop requiring an old part-owner blob for paths later owned by accepted RKP-1A;
   - make Stage 6 path ownership include accepted descendants, archived S6.2 authority, and the bounded S6.3 task.
4. Change no production Rust/TypeScript behavior. The only technical edit is `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`; the parent design edit only synchronizes its literal allowlist.
5. Do not execute the opt-in large E3 command. S6.3 consumes the already accepted evidence and records `e3_execution_count=0` for this task.
6. Run focused governance checks and one final complete RKP-2 verification lane. Freeze actual counts and hashes from that run rather than predicted values.
7. At the candidate, project S6.2 complete, S6.3 complete, Stage 6 complete, and RKP-2 implementation candidate ready for one direct final check. Keep TypeScript as default and every qualification/cutover/RKP-3/archive/push gate false.

## Acceptance Criteria

- [ ] S6.2 archive topology, immutable evidence, acceptance chain, exact sentinel, process success, parity, ordering, round trip, resource cleanup, and non-reuse properties remain executable assertions.
- [ ] The three inherited focused Workspace Law failures are removed without weakening hostile mutation fixtures or broadening production scope.
- [ ] Focused Workspace Law passes completely.
- [ ] Typecheck, build, Rust toolchain gates, and the full Node suite pass in the final complete lane; exact results are recorded.
- [ ] Diff classification proves one technical test path plus the declared lifecycle/authority paths and no other change.
- [ ] Final RKP-2 candidate is committed on `codex/rkp-2-indexed-live-score-store-implementation` and is ready for one direct final implementation check.
- [ ] No E3 rerun, qualification, default runtime cutover, RKP-3 creation, RKP-2 archive, remote push, or unrelated file edit occurs.

## Non-goals

- New kernel features or performance work.
- Re-running the 102,400-event scale workload.
- Accepting, archiving, qualifying, shipping, or pushing RKP-2.
