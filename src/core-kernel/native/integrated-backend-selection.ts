import type { ScoreDocument } from "../domain/score-document";
import type { IntegratedCommandBus, IntegratedCommandBusCreationResult, KernelIntegratedCatalog } from "../registry/integrated-contracts";
import type { KernelIntegratedRuntimeAssemblyState } from "../registry/domain-availability";
import type { KernelExtensionMigrationFailure, KernelExtensionMigrationRequestV1 } from "../migration/contracts";

// Private embedding seam. The application's default remains the existing backend.
export type NativeIntegratedFactoryV2 = (document: ScoreDocument, catalog: KernelIntegratedCatalog,
  inventory: unknown, explicit: boolean) => IntegratedCommandBusCreationResult;
let selected: NativeIntegratedFactoryV2 | undefined;
export type NativeExtensionMigrationResultV2 =
  | { readonly status: "migrated" | "not-required"; readonly document: ScoreDocument }
  | { readonly status: "rejected"; readonly failure: KernelExtensionMigrationFailure };
export type NativeExtensionMigrationFactoryV2 = (document: ScoreDocument, request: KernelExtensionMigrationRequestV1,
  catalog: KernelIntegratedCatalog) => NativeExtensionMigrationResultV2;
let selectedMigration: { factory: NativeExtensionMigrationFactoryV2 | undefined } | undefined;
export function nativeExtensionMigrationFactoryV2(): NativeExtensionMigrationFactoryV2 | undefined { return selectedMigration?.factory; }
export function selectNativeExtensionMigrationFactoryV2(factory: NativeExtensionMigrationFactoryV2 | undefined): () => void {
  const previous = selectedMigration;
  const selection = { factory };
  selectedMigration = selection;
  return () => { if (selectedMigration === selection) selectedMigration = previous; };
}
const assemblies = new WeakMap<IntegratedCommandBus, KernelIntegratedRuntimeAssemblyState>();
export function nativeIntegratedFactoryV2(): NativeIntegratedFactoryV2 | undefined { return selected; }
export function selectNativeIntegratedFactoryV2(factory: NativeIntegratedFactoryV2): () => void {
  const previous = selected;
  selected = factory;
  return () => { if (selected === factory) selected = previous; };
}
export function bindNativeIntegratedAssemblyV2(bus: IntegratedCommandBus, assembly: KernelIntegratedRuntimeAssemblyState): void {
  assemblies.set(bus, assembly);
}
export function nativeIntegratedAssemblyV2(bus: IntegratedCommandBus): KernelIntegratedRuntimeAssemblyState | undefined {
  return assemblies.get(bus);
}
