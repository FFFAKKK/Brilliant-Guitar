// Private pure migration adapter. Rust owns request/version checks and document
// replacement; JS owns authentic SDK callback bindings and existing issue checks.
import { getKernelIntegratedCatalogState } from "../registry/domain-catalog";
import { captureHostInstalledContributionsV1 } from "./integrated-catalog-capture";
import { prepareExtensionMigrationEffectV1, validateExtensionMigrationModulesV1 } from "../migration/migrate-kernel-extension";
import { encodeIntegratedValueV2 } from "./integrated-wire";
import type { NativeExtensionMigrationFactoryV2, NativeExtensionMigrationResultV2 } from "./integrated-backend-selection";
import type { KernelExtensionMigrationRequestV1 } from "../migration/contracts";
import type { ScoreDocument } from "../domain/score-document";
import type { ScopedExecutionPolicyV1 } from "../module-sdk/scoped-invocation";

export type NativeExtensionMigrationFunctionV2 = (bytes: Buffer, executor: (bytes: Buffer) => Buffer) => Buffer;
const parse = JSON.parse;
const apply = Reflect.apply;
const bufferToString = Buffer.prototype.toString;

export function createNativeExtensionMigrationV2(migrate: NativeExtensionMigrationFunctionV2, policy?: ScopedExecutionPolicyV1): NativeExtensionMigrationFactoryV2 {
  return (document, request, catalog) => {
    const mismatch = policy !== undefined && policy.catalog !== catalog;
    const state = mismatch ? undefined : getKernelIntegratedCatalogState(catalog);
    const projection = mismatch ? undefined : captureHostInstalledContributionsV1(catalog);
    // An invalid catalog travels as null: Rust must check initial semantics
    // before returning assembly-mismatch, even for an idempotent request.
    const bytes = migrate(encodeIntegratedValueV2({ apiVersion: 2, document, request,
      catalog: projection?.projection ?? null,
      commands: state?.contributions.flatMap(entry => entry.commands.map(command => command.descriptor)) ?? [],
      effects: state?.contributions.flatMap(entry => entry.effects.map(effect => effect.descriptor)) ?? [],
    }), (bytes) => {
      const input = parse(apply(bufferToString, bytes, ["utf8"]) as string) as {
        operation: "migrationPrepare" | "migrationValidate"; document: ScoreDocument; request?: KernelExtensionMigrationRequestV1;
      };
      if (state === undefined) return encodeIntegratedValueV2({ ok: false, failure: { code: "migration.assembly-mismatch" } });
      if (input.operation === "migrationValidate") {
        const result = validateExtensionMigrationModulesV1(input.document, state, policy?.invoke);
        if (result.ok) return encodeIntegratedValueV2({ ok: true });
        return encodeIntegratedValueV2({ ok: false, failure: result.kind === "semantic"
          ? { code: "migration.contribution-semantic-invalid", issues: result.issues }
          : { code: result.kind === "internal" ? "migration.contribution-internal-error" : "migration.contribution-contract-violation",
            moduleId: result.contribution.moduleId, contributionId: result.contribution.contributionId } });
      }
      const request = input.request;
      const contribution = request === undefined ? undefined : state.contributions.find(entry =>
        entry.moduleId === request.moduleId && entry.contributionId === request.contributionId);
      const effect = request === undefined ? undefined : state.effectIndex[request.effectKind];
      if (input.operation !== "migrationPrepare" || request === undefined || contribution === undefined || effect === undefined) {
        return encodeIntegratedValueV2({ ok: false, failure: { code: "migration.assembly-mismatch" } });
      }
      return encodeIntegratedValueV2(prepareExtensionMigrationEffectV1(input.document, request, contribution, effect, policy?.invoke));
    });
    return parse(apply(bufferToString, bytes, ["utf8"]) as string) as NativeExtensionMigrationResultV2;
  };
}
