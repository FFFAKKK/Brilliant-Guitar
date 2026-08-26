# RKP-2 Part Owner Wire Contract Repair

## 1. Problem

RKP-2 Stage 6 was activated at S6.0 commit `ce673a2ad62348fa73458d493a45f9c005bf0288`. Its first hostile/finality RED exposed a blocking compatibility defect: the accepted `brilliant-score-1` public wire uses `partId` for a Part-owned `ExtensionBlock`, while the Rust Foundation DTO currently derives serde behavior from the private Rust field name `part_id`.

The result is asymmetric and invalid public behavior:

- a public `{ "kind": "part", "partId": "part-1" }` owner passes the TypeScript codec and the Rust Contracts strict walk, then fails in Foundation decoding;
- Rust serialization would emit `part_id` rather than the accepted public `partId`;
- score-owned extensions are unaffected;
- Runtime is not the root cause because it only clones the already decoded owner.

Independent root-cause review classified this as P0/P1/P2=`0/1/0` and required a separate blocking planning child. RKP-2 Stage 6 remains historically started and authorized, but operationally paused after S6.0 and before S6.1.

## 2. User outcome

After a separately reviewed and authorized implementation of this child:

- native create/load accepts the one existing public Part-owner shape;
- deterministic export/read emits only `partId`;
- `part_id` is never accepted as an alias and never appears on output;
- unknown score-owned and Part-owned extension blocks survive create/read with nested JSON and input order intact;
- malformed owners retain the existing stable failure union, path/violation behavior and zero-publication law;
- RKP-2 may resume S6.1 from the preserved S6.0 commit without rewriting prior Stage 1–5 or runner-repair history.

## 3. Requirements

1. The only public owner wire shapes are exactly:
   - `{ "kind": "score" }`
   - `{ "kind": "part", "partId": "part-1" }`
2. `part_id` is a private Rust identifier only. It must not be a public alias, accepted input, encoded output, DTO addition or schema migration.
3. The bounded field-name repair is owned by `ExtensionOwnerV1` serde configuration in Foundation. Contracts and TypeScript strict codecs remain the public exact-shape authorities, including rejection of extra fields on the internally tagged unit `Score` variant; Runtime remains a consumer of the validated DTO.
4. The repair must be bidirectional: exact `partId` deserialize and serialize.
5. Unknown fields on either public wire variant must be rejected. Foundation directly rejects unknown fields on the struct-like `Part` variant, including `partId` plus `part_id`; Contracts' descriptor-first strict walk and the TypeScript strict codec reject extras on `Score`. Foundation must not add a custom deserializer or change the unit variant to become a second exact-shape owner.
6. No public diagnostic code, failure variant, discriminant, DTO, schema version, Node export or inventory count may change.
7. TypeScript remains the default product runtime. No default cutover, qualification, RKP-3, command/history/provider work or public plugin work is authorized.
8. Implementation must remain within the six literal technical paths frozen by `design.md`; lifecycle changes remain within the child and the three RKP-2 projection files plus the Rust parent `task.json`.
9. Implementation must be split into R0–R3 and independently reviewed before acceptance/archive/integration.
10. This planning turn does not run `task.py start` and authorizes no production change.

## 4. Acceptance criteria

- [ ] Foundation directly decodes and re-encodes exact Part `partId` and exact `Score`; Part output is byte-keyed with `partId` only.
- [ ] Foundation rejects `part_id`, `partId+part_id`, and other extra fields on the Part variant without a custom deserializer.
- [ ] Contracts accept a valid Part-owned public request and preserve exact existing stable failures for malformed Part owners and any extra field on a score owner.
- [ ] A document containing ordered score-owned and Part-owned unknown blocks survives native create/read with nested JSON, array order and block order unchanged.
- [ ] Native output contains `partId` and contains no `part_id`; malformed owner requests publish no handle.
- [ ] Repeated reads are byte-identical and detached; canonical encode/decode/encode remains equal.
- [ ] Node exports remain exactly two; StableFailureV1 remains 22; public inventories remain `28/51/8/34/9`; schema remains `brilliant-score-1`.
- [ ] TypeScript remains default and no protected path outside the literal allowlists changes.
- [ ] Rust fmt/check/test/clippy/MSRV, native tests, the accepted dynamic full runner and Trellis/JSON/allowlist gates pass.
- [ ] A dedicated independent implementation auditor accepts the exact candidate before archive/integration.

## 5. Non-goals

- Continuing RKP-2 S6.1, S6.2 or S6.3 inside this planning candidate.
- Changing TypeScript public contracts, `brilliant-score-1`, Extension payload semantics or Runtime topology/index design.
- Adding serde aliases, migrations, permissive compatibility input, a public test hook or a new failure.
- Modifying Node source, package scripts, Cargo dependencies, active specs, commands, transactions, history, providers or default runtime.
- Accepting, archiving, integrating, pushing or starting RKP-3 during planning.

## 6. Lifecycle gate

This child remains `planning`, `task_start_run=false`, `production_implementation_authorized=false`, `independent_planning_review=pending`, and `implementation_candidate_ready=false`. The only next gate is an independent planning review of the exact docs-only candidate.
