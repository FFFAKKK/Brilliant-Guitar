# CVN-6 Independent Implementation Review Candidate

## Status

`TARGETED INDEPENDENT REREVIEW PASSED / ACCEPTED SOURCE CANDIDATE COMMITTED`

The targeted independent planning rereview and final independent
implementation rereview both passed P0/P1/P2=`0/0/0`. The accepted source/test
candidate is `8da50f90c9c05d87a8e1aa7a4e65b30e6ab82c7f`. The task remains
`in_progress` only until the acceptance record is committed and the Trellis
archive step runs.

## Final Independent Implementation Rereview

- verdict: `PASS`;
- findings: P0/P1/P2=`0/0/0`;
- prior five P1 findings: all closed through independent public-entry
  reproduction;
- focused repaired suites: `23/23`;
- original closure probes: `5/5`;
- full suite: `383/383`;
- task/source/test/Registry boundaries, exports, GD-0, Trellis and diff checks:
  pass;
- reviewer writes, staging and commits: `0`.

The independent report is recorded in `implementation-review.md`.

## Implementation Candidate Evidence

- unified base: `050af1eed067300f2e2fb0339eff6f2430e43b36`;
- required ancestors `302dafe451bd4e10f4978d3076e367473b2fa3ae` and
  `c68fcc648051b51b73fda3e5bda6eb9e33298f39`: present;
- integrated public runtime surface: 51 names, with only
  `replayKernelCommands` and `migrateKernelExtension` added;
- SDK surface: runtime 8, type 34; CVN-2 compiler, catalog state and protected
  migration/schema paths have zero diff from the unified base;
- focused CVN-6 tests: 32 public/boundary tests plus the full CVN-6 functional
  matrices pass;
- exact resource evidence covers inventory rows `1024/1025`, versions
  `256/257`, callback issues `1024/1025`, aggregate issues `4096/4097`, and
  facts/effects/addresses `131072/131073`;
- Typecheck and Build: pass;
- full suite after bounded repair: `383/383` pass;
- Trellis validation: child `22/23`, parent `3/3`, product `0/0`, roadmap
  `15/16`, all pass;
- GD-0 Layer A: 7 fences, 0 diagnostics;
- GD-0 Layer B: pass after retaining the Core `createGateway` overload as the
  final TypeScript projection;
- `git diff --check`, dependency boundaries, public allowlists and protected
  path checks: pass;
- source/test candidate committed as
  `8da50f90c9c05d87a8e1aa7a4e65b30e6ab82c7f`; archive not yet performed.

The reviewer should inspect the actual uncommitted diff and rerun decisive
commands rather than treating this evidence list as an acceptance conclusion.

## Independent Implementation Review Round 1

The first read-only implementation review returned
`RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/5/0`. The five
reproduced findings were:

1. module candidates could reach adoption with Core semantic invalidity;
2. explicit inventory could add a forged namespace owned by an installed
   contribution identity;
3. replay did not strictly capture the command-sequence container;
4. migration round-trip could observe callback replacement of JSON primordials;
5. affected-address capacity was applied before canonical deduplication, while
   the original boundary tests did not prove legal limit success.

The bounded candidate now:

- rejects Core-semantic-invalid candidates before module validators/classifiers
  and preserves all session/event state;
- enforces bidirectional installed contribution requirement parity for bus,
  Registry and replay construction;
- descriptor-first captures one detached dense replay sequence and maps invalid
  containers to a stable rejected replay result;
- uses captured JSON parse/stringify, checks callback primordial integrity and
  verifies round-trip equality before publishing migration output;
- decodes, deduplicates and sorts affected addresses before the canonical cap;
- proves a legal 131,072-effect transaction commits, and directly proves
  canonical affected-address limit/limit+1 behavior.

Focused repair regression: `23/23` pass. Full suite: `383/383` pass. The
targeted independent rereview passed P0/P1/P2=`0/0/0` and authorized the
acceptance-record/archive flow.

## Initial Independent Review

The initial read-only review returned `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/0`. The sole finding was that `required-contribution-unavailable` had no real public construction path: `ExtensionBlock` has no contribution identity, while accepted CVN-2 catalog state retains only selected contributions and their namespace index.

The repair introduces an independent composition-root `KernelKnownRequirementInventoryV1` at the CVN-6 runtime-construction boundary. It does not add a CVN-2 compiler overload or alter the nine-field contribution ABI, SDK `8/34`, catalog state, selection rules or zero-callback compilation behavior. Targeted independent planning rereview passed P0/P1/P2=`0/0/0` against the clean planning tree at `b0c342b29bde662d7a15f9d61f0bd3e7ccbe4a82`.

## Final Planning Review

- verdict: `PASS`;
- findings: P0/P1/P2=`0/0/0`;
- prior inventory-source P1: closed;
- frozen catalog protected-path follow-up: closed;
- verified gates: Trellis `22/23`, `3/3`, `0/0`, `15/16`; typecheck/build; full test `350/350`; clean worktree and empty index;
- next gate: independent implementation review before acceptance or archive.

## Review Baseline

- original planning candidate: `a8695286c2674a0605b52689b2a4b3bc12d516aa`;
- unified base: `050af1eed067300f2e2fb0339eff6f2430e43b36`;
- accepted/archived CVN-2 line: `302dafe451bd4e10f4978d3076e367473b2fa3ae`;
- post-Core roadmap parent: `c68fcc648051b51b73fda3e5bda6eb9e33298f39`.

## Targeted Review Questions

1. Does `KernelKnownRequirementInventoryV1` belong uniquely to CVN-6 application/runtime construction rather than CVN-2 catalog compilation or the post-Core Product Host?
2. Do catalog-only integrated overloads remain exact while explicit inventory overloads provide the sole real absent-but-known construction path?
3. Does the strict codec fix exact shape, duplicate namespace rejection, installed-requirement parity, canonical order, rows `1024/1025` and versions `256/257`?
4. Does catalog authenticity precede inventory authority, and does invalid inventory produce `command.invalid-requirement-inventory` or `registry.invalid-startup-input` without partial state or callbacks?
5. Do authentic catalog identity plus canonical inventory content produce one private runtime assembly identity, with catalog/inventory A/B and Core/integrated mismatches deterministic?
6. Are unavailable-only, incompatible-only, mixed and unknown fixtures all constructible through public overloads without private-state fabrication?
7. Is unknown defined only by an inventory miss, so an ignored registration entry cannot be misclassified as unavailable?
8. Are absent, incompatible and unknown callback counts zero while compatible filtered-view rules remain unchanged?
9. Are CVN-2 nine-field ABI, SDK `8/34`, compiler behavior, unselected-entry behavior and catalog-private state unchanged?
10. Do parent contracts, active spec, JSONL, task metadata and self-audit consistently record the initial P1 repair and targeted-rereview-pending state?
11. Are CVN-1 single-owner, CVN-5/CVN-7 gates, post-Core ownership and production-path zero-diff boundaries unchanged?

## Expected Implementation Verdict Format

```text
PASS | RETURN FOR BOUNDED IMPLEMENTATION REPAIR
P0: <count>
P1: <count>
P2: <count>
```

Every finding identifies an exact source/test file and line range, the violated
contract, impact and narrow repair. Review remains read-only; it does not stage,
commit, accept or archive the task.
