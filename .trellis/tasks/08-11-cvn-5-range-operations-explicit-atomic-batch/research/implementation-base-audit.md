# CVN-5 Implementation-Base Audit

## Result

`PASS ? NO PLANNING CONTRACT REOPEN REQUIRED`

The CVN-5 docs-only candidate is based on `d521a618e42c01077e8545d1c87e9b36e14d4bdb`, which contains accepted/archived CVN-6. The migration added no production, test or build-config changes.

## Dependency and surface evidence

- CVN-6 source/test: `8da50f90c9c05d87a8e1aa7a4e65b30e6ab82c7f`.
- Acceptance record: `160674deb805a30837e4a7a3a815ca4981e3a767`.
- Archive: `a0c1d6a7b8b38d053d591dca6586c8fff84bbdd6`.
- Application runtime exports: `51`.
- Existing Core catalog and Registry descriptors: `25` before CVN-5.
- Module SDK: runtime `8`, type `34`; contribution ABI remains nine fields.
- Persisted schema remains `brilliant-score-1`.

## File-layout rescan

The accepted command layer contains the expected catalog, bus, contracts, adapters, effect engine, execution assembly, integrated runtime, replay, strict codec and target resolver. Accepted CVN-6 owns its Registry inventory/gateway, integrated validators, profiles, facts and migration surfaces.

The planned CVN-5 production allowlist remains sufficient:

- new range selection/adapter and batch coordinator files;
- existing command catalog/contracts/assembly/runtime/effect/history/replay integration points;
- Registry built-in descriptor projection;
- existing event fact/runtime projection;
- bounded failure adapter/strict-codec projection;
- application root type projection with no runtime export addition.

The existing-test rescan confirms the six previously named projection owners remain the only accepted existing tests/fixtures that may need additive updates. All behavioral coverage otherwise belongs to named new CVN-5 test files. `public-api-boundary.test.ts` remains protected because the runtime export set is unchanged.

### 2026-08-11 implementation full-suite supersession

The statement above records the docs-only baseline rescan and is narrowly
superseded by the first implementation full-suite evidence. Four additional
existing test/projection owners are required and no others:

- `test/core-kernel/command-spine-characterization.test.ts`;
- `test/core-kernel/fixtures/cvn-1-characterization.ts`;
- `test/core-kernel/core-kernel-integration.test.ts`;
- `test/core-kernel/registry-gateway.test.ts`.

Together with the original six owners, the closed existing-test allowlist is
exactly ten paths. The first two preserve the accepted historical golden JSON
and SHA-256 by projecting only the exact three CVN-5 command descriptors; the
last two update the aggregate Registry contribution count from `31` to `34`.
This evidence does not authorize a golden rewrite.

### 2026-08-11 integrated failure-union supersession

Mixed Core/module batch compilation demonstrated one additional production type
owner: `src/core-kernel/registry/integrated-contracts.ts`. The accepted
`KernelCommandFailure` union is the public result type of the integrated bus,
while CVN5-R051 requires one outer batch wrapper whose leaf may be an existing
module contribution/resource failure. The narrow proposed delta adds only that
union member and reuses existing types; it changes no catalog, availability,
gateway, callback, runtime export, CVN-2 ABI or persistence behavior. The
existing independent reviewer passed this supersession on 2026-08-11 with
P0/P1/P2=`0/0/0`.

## Contract delta decision

Accepted CVN-6 did not change the range union, primitive effect categories,
final assessment ownership, installed catalog model, contribution ABI or export
counts assumed by CVN-5. The ten-path existing-test list remains closed. The
single integrated failure-union type owner documented by the later dated
supersession is the only newly identified production owner and is active only
for that reviewed type purpose.
