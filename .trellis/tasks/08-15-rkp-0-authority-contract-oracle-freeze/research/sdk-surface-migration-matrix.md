# CVN-2 SDK Surface and Migration Matrix

## 1. Frozen legacy TypeScript authoring entry

The accepted CVN-2 entry remains `src/core-kernel/module-sdk/index.ts`. RKP-0 freezes names, not only counts.

### Runtime exports — exact eight

1. `ModuleKernelErrorBase`
2. `OFFICIAL_MODULE_SDK_V1_LIMITS`
3. `compileOfficialModuleCatalogV1`
4. `createModuleKernelIssueV1`
5. `defineDomainCommandContributionV1`
6. `defineDomainCommandRegistrationEntryV1`
7. `defineDomainCommandV1`
8. `defineModuleEffectV1`

### Type exports — exact thirty-four

1. `CompiledDomainCommandContributionV1`
2. `CompiledDomainCommandDefinitionV1`
3. `CompiledDomainCommandRegistrationEntryV1`
4. `CompiledModuleEffectDefinitionV1`
5. `CoreWrittenPitchEffectRequestV1`
6. `DomainCommandDecodeInputV1`
7. `DomainCommandDecodeResultV1`
8. `DomainCommandDecoderV1`
9. `DomainCommandDefinitionInputV1`
10. `DomainCommandDescriptorV1`
11. `DomainCommandPreparationResultV1`
12. `DomainCommandPreparerV1`
13. `DomainContributionReadViewV1`
14. `DomainEffectRequestV1`
15. `DomainSemanticValidatorV1`
16. `DomainSupportClassificationV1`
17. `DomainSupportClassifierV1`
18. `ExtensionRuntimeRequirementV1`
19. `KernelIntegratedCatalog`
20. `ModuleEffectApplyInputV1`
21. `ModuleEffectApplyResultV1`
22. `ModuleEffectDefinitionInputV1`
23. `ModuleEffectDescriptorV1`
24. `ModuleEffectPayloadDecodeResultV1`
25. `ModuleEffectPayloadDecoderV1`
26. `ModuleEffectTransformerV1`
27. `ModuleIssueCode`
28. `ModuleIssueCreationResultV1`
29. `ModuleIssueInputV1`
30. `ModuleKernelIssue`
31. `ModuleOwnedEffectRequestV1`
32. `OfficialModuleCatalogCompilationResultV1`
33. `OfficialModuleDefinitionResultV1`
34. `OfficialModuleSdkV1Limits`

The contribution ABI fields are exactly `apiVersion`, `moduleId`, `contributionId`, `extensionNamespaces`, `extensionRequirements`, `commands`, `validate`, `classify`, `effects`. The manifest stores and compares these ordered names.

## 2. Three distinct extension surfaces

| Surface | Owner and consumers | Runtime role | Compatibility decision |
|---|---|---|---|
| CVN-2 TypeScript Module SDK | `src/core-kernel/module-sdk/index.ts`; existing Core tests and legacy official authoring | Builds the accepted callback/catalog objects for the TypeScript engine and the differential oracle | Exact 8/34 names and nine ABI fields remain source-compatible through RKP-9 and after RKP-9 until a separately planned deprecation task. It is not consumed by the Rust product assembly after RKP-8. |
| Rust official extension SDK | future Cargo crate `brilliant-kernel-extension-sdk`, owned first by RKP-5 and consumed by RKP-6 official providers | Source-built Rust traits/data registered into the frozen startup assembly; no JavaScript callbacks on the live edit path | New versioned surface. It adapts accepted semantics, ordering, caps and diagnostics; it does not masquerade as the TypeScript 8/34 entry. |
| Future public TypeScript Extension SDK | future separate package `@brilliant-guitar/extension-sdk` plus Product Extension Host, owned by the post-Core public-plugin stage | Commands, detached reads, filtered events/reports and view contributions; React is optional only for visual contributions | Separate version/package/host. It does not import the legacy Module SDK, expose Rust handles, or run mutable callbacks inside the Core transaction. |

## 3. Stage-by-stage disposition

| Stage | CVN-2 TypeScript SDK | Rust SDK | Public TypeScript SDK |
|---|---|---|---|
| RKP-0 | Freeze exact names, ABI, tests and oracle role. | Contract target only. | Boundary reference only. |
| RKP-1..RKP-5 | Remains product-default TypeScript engine authoring/oracle entry. | Workspace/contracts then provider traits are implemented. | Absent. |
| RKP-6 | Remains executable differential oracle; official provider behavior is ported to Rust. | Official/synthetic providers use it. | Absent. |
| RKP-7 | Both sides run offline differential tests; TypeScript remains product default. | Must pass full behavior/performance gates. | Absent. |
| RKP-8 | Exact entry and compile tests remain, but Product Application Assembly consumes Rust providers only; no runtime selector ships. | Becomes sole live official-provider path. | Absent. |
| RKP-9 | Differential runner and legacy TypeScript transaction-engine oracle may be removed. `src/core-kernel/module-sdk/index.ts`, its exact export tests and compatibility fixtures are protected from implicit deletion. | Remains live. | Absent. |
| post-Core public-plugin stage | Legacy entry remains deprecated/internal unless a dedicated compatibility task changes it. | Remains official/advanced source-built surface. | Planned and versioned independently through Extension Host. |

Any proposal to remove or rename a CVN-2 export, change the nine-field ABI, route public plugins through it, or execute legacy TypeScript callbacks on the post-cutover live path returns to planning with an explicit compatibility/deprecation owner.
