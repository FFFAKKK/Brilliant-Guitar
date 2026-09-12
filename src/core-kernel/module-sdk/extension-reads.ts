// Opt-in startup subpath. The frozen V1 index and ABI fields stay unchanged.
import type { DomainContributionReadViewV1 } from "./contracts";
import type { ContributionDependencyViewV1 } from "../registry/contribution-reads";
export { compileContributionReadCatalogV1 } from "../registry/domain-catalog";
export type { ContributionExtensionReadV1, ContributionDependencyViewV1 } from "../registry/contribution-reads";
export interface DomainContributionDependencyReadViewV1 extends DomainContributionReadViewV1 {
  readonly dependencyReads: readonly ContributionDependencyViewV1[];
}
