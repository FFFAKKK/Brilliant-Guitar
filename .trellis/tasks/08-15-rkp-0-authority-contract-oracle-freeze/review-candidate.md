# RKP-0 Planning Review Candidate

Status: `INDEPENDENT PLANNING REVIEW PASSED / READY FOR RKP-0 OPERATOR HANDOFF`.

Review history: `561a2ec` returned `0/5/0`; `05df623` returned `0/1/0`; the exact-path repair at `9a9f957ce4fcaded8ec87365f0f59f3f621b73da` passed `0/0/0`. The final authority-projection commit changes only review metadata and requires one final read-only projection check before operator activation.

## Required findings check

1. The fifth official input is recorded as incomplete/invalid, with no performance verdict or partial publication.
2. Current TypeScript authority and future Rust transition authority are not conflated.
3. The oracle has a real public construction path and exact 28+28+8 scenario partition.
4. Canonicalization, hashes and regeneration are deterministic and machine independent.
5. Qualification V2 freezes latency/resource/complexity data while leaving liveness calibration to RKP-7.
6. The test allowlist is sufficient without package or production changes.
7. RKP-0 does not introduce Rust, native bindings, production indices or official measurement.
8. Later stage tasks remain absent and unactivated.
9. Every one of the 64 scenarios has a fixed construction/result/state/inverse contract and one observation per operation.
10. Manifest fixture fields, exact CVN-2 export names, P99 method and the explicit file allowlist are internally aligned.

## Implementation candidate — 2026-08-15

The activated RKP-0 candidate implements the planned authority only: deterministic public-call capture of all 64 fixed rows, strict fixture decoders, byte/hash regeneration, the exact `28` command / `51` app / `8+34` SDK / `9` ABI inventories, and Qualification V2 sampling and liveness-precedence data. Its final review must independently confirm the exact allowlist, no production or existing-test delta, the fifth invalid CVN-7 ledger row, and the absence of published partial measurement evidence.

### Candidate self-audit evidence

- `npm.cmd run typecheck` — pass; `npm.cmd run build` — pass.
- RKP-0 oracle suite — `13/13` pass; CVN-7 related suite — `84/84` pass; full suite — `529/529` pass.
- Five Trellis task validations pass; `git diff --check` passes; all changed and untracked paths match the PRD's explicit allowlist; `src/**`, existing test files, package files, `tsconfig`, and native/Cargo paths have zero delta from `b21540fa3636e6c8e827ff24c2099f4ff331285d`.
- This is a candidate only: independent implementation audit, acceptance, archive, push, later RKP stages, and any official qualification measurement remain out of scope.
