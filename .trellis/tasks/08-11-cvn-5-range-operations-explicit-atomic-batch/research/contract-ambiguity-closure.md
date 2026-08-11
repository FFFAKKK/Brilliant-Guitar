# Parent Contract Ambiguity Closure

## Closure A — Final assessment ordering

Parent `CVN-FC-091` requires one final validation/profile/classification pass, while historical `CVN-FC-093` wording could be read as aggregating public assessments per child.

The only interpretation consistent with one-candidate atomic batch and accepted CVN-6 callback counts is:

- child index orders routing, preparation, forward effects, affected-address facts and child failure attribution;
- the final candidate produces one public assessment;
- Core comes first, followed by module validator/classifier contributions in frozen catalog order;
- no per-child assessment or callback rerun exists.

This candidate synchronizes that sentence in the parent matrix and roadmap. It adds no new type or behavior.

## Closure B — Nested-batch priority

Parent stage wording placed “nested preflight” near outer validation, but the accepted failure-priority rule requires the lowest child index to own child-local failures.

The fixed interpretation is:

- outer stage validates only the batch envelope, exact payload, dense/non-empty/count and global capture budgets;
- child semantic IDs are not globally pre-scanned;
- nested `core.transaction.batch` is rejected when child `i` reaches route resolution, before that child's payload decoder;
- it is wrapped once at child `i`, and the earliest child reached wins.

This preserves strict capture, failure priority and no-recursion without invoking later child input.
