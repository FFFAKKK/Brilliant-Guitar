# Semantic and Canonical Role Matrix

| Assertion | Input | Expected truth | Owner | Planned check |
| --- | --- | --- | --- | --- |
| Strict intake | raw create request | valid public request is decoded once | Contracts | retain existing decode |
| Store fidelity | decoded input / exported DTO | semantic equality | LiveScoreStore test seam | direct DTO equality |
| Primary canonicalization | exported DTO | one canonical Rust vector | Foundation | `canonical_score_bytes` once |
| Verification intake | primary canonical request | valid request is decoded once | Contracts | in-memory request + one decode |
| Verification canonicalization | verification DTO | one canonical Rust vector | Foundation | `canonical_score_bytes` once |
| Canonical stability | primary / verification vectors | byte equality | private seam | `canonicalBytesEqual=true` |
| Raw transport order | raw / primary canonical vectors | may differ | fixture + Foundation | noncanonical regression asserts inequality |

## Frozen diagnostics

| Role | SHA-256 | Meaning |
| --- | --- | --- |
| Raw TypeScript input | `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e` | raw transport/input ordering anchor |
| Rust canonical export | `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7` | Foundation canonical ordering anchor |

Both are `15_013_904` bytes. They must not be compared as an equality invariant. The first difference is the two-key ExtensionBlock payload ordering at the documented offset/path.

## Invariants deliberately unchanged

- counts, parity, ordering, unknown extension preservation, entity/owner probes, and all stable evidence metrics;
- one full document materialization and primary-only `canonicalEncodeBytes`;
- private Rust/process prefixes and all exact failure, cleanup, cap, and output rules;
- TypeScript default runtime, no qualification claim, and no E2 authorization.
