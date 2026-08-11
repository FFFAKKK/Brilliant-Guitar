# CVN-6 Independent Planning Review Candidate

## Status

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`

This is a planning-only bounded repair. Production implementation authorization and task activation remain false.

## Initial Independent Review

The initial read-only review returned `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/0`. The sole finding was that `required-contribution-unavailable` had no real public construction path: `ExtensionBlock` has no contribution identity, while accepted CVN-2 catalog state retains only selected contributions and their namespace index.

The repair introduces an independent composition-root `KernelKnownRequirementInventoryV1` at the CVN-6 runtime-construction boundary. It does not add a CVN-2 compiler overload or alter the nine-field contribution ABI, SDK `8/34`, catalog state, selection rules or zero-callback compilation behavior. Independent planning review remains `pending` until this targeted rereview reports P0/P1/P2=`0/0/0`.

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

## Expected Verdict Format

```text
PASS | RETURN FOR BOUNDED PLANNING REPAIR
P0: <count>
P1: <count>
P2: <count>
```

Every finding identifies an exact planning file and line range, the violated contract, impact and narrow repair. Review remains read-only.
