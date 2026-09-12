import type { ScoreDocument } from "../domain/score-document";
import type { IntegratedCommandBus, IntegratedCommandBusCreationResult, KernelIntegratedCatalog } from "../registry/integrated-contracts";
import type { KernelIntegratedRuntimeAssemblyState } from "../registry/domain-availability";

// Private embedding seam. The application's default remains the existing backend.
export type NativeIntegratedFactoryV2 = (document: ScoreDocument, catalog: KernelIntegratedCatalog,
  inventory: unknown, explicit: boolean) => IntegratedCommandBusCreationResult;
let selected: NativeIntegratedFactoryV2 | undefined;
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
