# CVN-2 Independent Planning Review

## Review target

- Candidate HEAD: `8757097fd6dd3e9464807b9ab091006285a19f2b`
- Detailed planning commit: `2941725`
- Unified planning base: `706802c`
- Scope reviewed: CVN-FC-110/111 planning contracts only
- Lifecycle during review: `planning`; `task.py start` not run
- Production/test delta owned by the reviewed candidate: zero

The review compared the child PRD, detailed design, operator runbook, context
manifests, accepted GD-0 contract, parent feature matrix, current strict
TypeScript configuration, and the live pre-CVN-2 Core surface. Temporary type
probes were created under the system temporary directory and removed after the
compiler result was captured; they did not modify the worktree.

## Initial verdict — RETURN FOR BOUNDED PLANNING REPAIR

Initial P0/P1/P2 = `0/2/1`.

### [P1] Heterogeneous typed command/effect collections collapse to `unknown`

`design.md` declares invariant callback pairs:

- `CompiledDomainCommandDefinitionV1<Command>` both produces `Command` from
  `decode` and consumes `Command` in `prepare`;
- `CompiledModuleEffectDefinitionV1<Payload>` both produces `Payload` from
  `decode` and consumes `Payload` in `transform`.

The containing contribution erases both parameters by using
`CompiledDomainCommandDefinitionV1[]` and
`CompiledModuleEffectDefinitionV1[]`. With this repository's `strict: true`
configuration, those defaults are `...<unknown>`. A definition specialized to
a real command or payload is therefore not assignable to the planned array.

A focused TypeScript 5.8 strict-mode probe reproduced `TS2322` for both
collections: the specialized `prepare`/`transform` callback cannot consume
`unknown`. The planned Stage 1 "callback signature assignability" check would
fail unless the operator introduced `any`, a cast, or an unsound bivariant
method. All three would defeat the promised typed authoring seam.

Required repair:

1. add typed command-definition and effect-definition builders;
2. make their returned compiled definition handles non-generic and opaque;
3. retain each generic decoder/consumer pair behind one private SDK binding;
4. require authentic handles in the contribution builder and catalog compiler;
5. add positive heterogeneous-collection and negative cross-pair type fixtures;
6. update the exact SDK runtime/type export allowlists and tests.

This repair does not add a tenth contribution field and does not move runtime
execution into CVN-2.

### [P1] The command decoder invocation value is not fixed

The accepted GD-0 contract requires the matched contribution to strictly decode
the full target and payload from `unknown`. The candidate freezes only
`DomainCommandDecoderV1<Command> = (input: unknown) => ...` and never states
whether CVN-6 passes the full envelope, only the payload, only the target, or a
fresh target/payload pair. The fixture and runbook likewise omit that call
shape.

That ambiguity sits in the ABI owned by CVN-2. Leaving it open would force the
CVN-6 operator to reinterpret a public callback signature and could make two
official modules expect incompatible values.

Required repair:

1. add one exact `DomainCommandDecodeInputV1` shell with only `target` and
   `payload` own data fields, both typed `unknown`;
2. state the exact capture, shell freeze, invocation, decoded-value cloning,
   and preparation handoff rules owned by later CVN-6;
3. add a compile-time signature fixture and a runtime no-invocation fixture;
4. export the input type from the SDK and no application-root runtime symbol.

### [P2] `ModuleKernelErrorBase` generics are not tied to constructor data

The planned class promises `toIssue()` values narrowed to generic `ModuleId`
and `Code`, but its protected constructor accepts non-generic
`ModuleIssueInputV1`. Strict TypeScript therefore accepts a subclass that
claims module/code `foo` while calling `super()` with validated module/code
`bar`; the returned static type can then contradict the stored frozen issue.

Required repair:

1. parameterize `ModuleIssueInputV1` by module ID and code;
2. constrain `Code` to the selected module namespace;
3. require the protected constructor to accept exactly those parameters;
4. add a negative `@ts-expect-error` fixture for cross-module construction.

## Preserved conclusions

The review found no defect in these already fixed boundaries:

- CVN-2 still owns only CVN-FC-110/111;
- the contribution outer ABI remains exactly nine fields;
- the application root adds type declarations only and zero runtime keys;
- catalog construction remains detached, startup-only, deterministic, and
  all-or-nothing;
- CVN-2 invokes zero module callbacks;
- CVN-6 runtime integration, future ports, hot plug, generic patch/path,
  mutable document access, and a second transaction owner remain excluded;
- the current Core catalog remains 25 commands while the parent-final target
  remains 28.

## Gate state

The candidate stays in `planning`. Production implementation remains inactive.
After the three bounded repairs, a fresh review must reproduce the type
fixtures, verify the exact export allowlists and nine-field ABI, and report
P0/P1/P2=`0/0/0` before the user activation decision.
