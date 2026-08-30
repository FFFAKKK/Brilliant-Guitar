# Current Seam and Authority Audit

## Observed seam defect

At the current technical seam head `639e93555c15b46c54c8e9bb7ec610d4a77c7478`, `collect_scale_evidence` strictly decodes the request, builds the Store, verifies parity, exports one DTO, canonical-encodes that DTO, then asserts the canonical vector equals the raw request score slice. That assertion conflates independent representations.

The accepted RKP-1A evidence proves the frozen stress input decodes correctly under the successor cap and has stable semantic content. It also proves the raw input SHA and canonical export SHA are different artifacts with the same byte length. This does not invalidate Foundation canonicalization; it invalidates the seam's raw-byte equality premise.

## Authority chain

- Stage 6 E1 technical predecessor: `6cae1cbb742bcd31c3669f1e82b5a12b0e33ea15`.
- Current private seam technical head: `639e93555c15b46c54c8e9bb7ec610d4a77c7478`.
- Accepted RKP-1A implementation authority: `08374273b05bc992e749a17a959b64af0f293f0b`.
- C5 final authority/audit: `d14d73117e03822a52fd19c55f3024cb2b73ef45`, PASS `0/0/0`.

Archived RKP-1A and closeout task roots are immutable inputs. The original Stage 6 nine immutable planning-authority documents also remain byte/hash unchanged. This new task is the successor planning owner only.

## Boundaries retained

`decode_create_request`, Foundation canonicalization, DTO shape, property caps, worker protocol, public exports, Runtime state, metrics ownership, and the frozen CVN-7 stress fixture are not re-owned by this child.
