# Root Cause and Public Wire Authority

## 1. Evidence snapshot

At exact base `ce673a2ad62348fa73458d493a45f9c005bf0288`:

- `score-document-model.md` defines a Part owner with `partId`;
- TypeScript `decodeExtensionOwner` captures exactly `kind,partId`;
- Rust Contracts `validate_owner` captures exactly `kind,partId`;
- Foundation `ExtensionOwnerV1::Part` stores a private `part_id` field without a serde field rename;
- Runtime import/export clones `ExtensionOwnerV1` and does not rewrite its wire name.

The Stage 6 S6.1 RED used a valid TypeScript document with a Part-owned unknown extension. The TypeScript oracle accepted it; native create rejected it with the existing root `codec.invalid-shape/wrong-type` fallback because Foundation serde could not decode the public key. Isolating score-owned blocks succeeds. This is a public-wire implementation defect, not a Stage 6 fixture defect.

## 2. Authority comparison

| Boundary | Current accepted spelling | Behavior |
| --- | --- | --- |
| TypeScript schema/model | `partId` | authoritative public wire |
| TypeScript strict codec | `partId` | exact shape, no extra key |
| Rust Contracts strict walk | `partId` | exact shape, no extra key |
| Rust Foundation derived serde | `part_id` | Part field-name drift/root cause; not the public score-extra shape owner |
| Runtime store/export | typed owner clone | not a wire-name owner |

The fix belongs where the public wire maps to the Rust DTO: Foundation serde metadata.

## 3. Why no alias

`part_id` has never been an accepted public field. Accepting it as an alias would create a second public spelling, weaken strict shape, complicate canonical output and silently turn an implementation bug into compatibility authority. The correct behavior is:

- decode `partId` only;
- encode `partId` only;
- directly reject `part_id` alone, `partId` plus `part_id`, and other Part extras in Foundation;
- reject extra fields on score owners at the existing Contracts descriptor-first strict walk and TypeScript strict codec;
- keep Foundation's `Score` unit variant and derived serde implementation unchanged apart from the frozen enum/field attributes; add no custom exact-shape decoder.

## 4. Failure precedence

Contracts visits the bounded structure before Foundation:

- `part_id` alone produces missing `partId` at the exact field path; missing-field rank wins over the later owner extra-field candidate;
- both spellings have no missing field, so the owner-level extra-field result wins;
- score extras are selected by the Contracts exact-shape walk before Foundation, so Foundation is not required to reject them directly;
- a valid `partId` must reach Foundation and no longer collapse to the root serde fallback;
- semantic-invalid unresolved Part IDs continue to use the existing `score.invalid-structure/invalid-reference` path;
- all native rejection cases publish no handle.

No StableFailureV1 variant or path model is added.

## 5. Affected and unaffected flows

Affected:

- create/load of Part-owned extensions;
- canonical serialize/export of Part-owned extensions;
- unknown Part-owned block preservation.

Unaffected:

- valid score-owned extensions; malformed score extras remain rejected by the existing public boundary;
- opaque payload content;
- topology/index ordering;
- commands, transactions and history;
- Node export surface;
- TypeScript product runtime;
- schema version and public inventories.

## 6. Audit conclusion

Independent root-cause classification is P0/P1/P2=`0/1/0`. A separate blocking child is required because the narrow production owner (`dto.rs`) is outside the previously authorized Stage 6 test-only allowlist. The original S6.0 commit must remain intact while S6.1 waits for this child's planning, implementation review and integration.

The first planning review of candidate `7e211869b7ab8d5ead3916ca8d98107d55f182db` separately returned P0/P1/P2=`0/1/0`: it correctly observed that the frozen serde configuration cannot also make Foundation directly reject extras on the internally tagged unit `Score` variant. This bounded planning repair assigns that exact-shape check only to Contracts/TypeScript and leaves the production serde configuration unchanged.
