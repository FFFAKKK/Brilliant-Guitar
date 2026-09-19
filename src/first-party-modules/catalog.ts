import { compileOfficialModuleCatalogV1 } from "../core-kernel/module-sdk/index";
import { CORE_KERNEL_STARTUP_MANIFEST } from "../core-kernel/registry/builtins";
import type {
  KernelStartupModuleDeclaration,
  KernelStartupModuleManifest,
} from "../core-kernel/registry/contracts";
import {
  GUITAR_DOMAIN_MODULE_REGISTRATION_ENTRIES,
  GUITAR_DOMAIN_MODULE_STARTUP_MANIFEST,
  GUITAR_DOMAIN_NAMESPACE,
} from "./guitar-domain";
import {
  KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES,
  KEY_SIGNATURE_MODULE_STARTUP_MANIFEST,
  KEY_SIGNATURE_NAMESPACE,
} from "./key-signature";

function declaration(
  manifest: KernelStartupModuleManifest,
  moduleId: string,
): KernelStartupModuleDeclaration {
  const value = manifest.modules.find(module => module.moduleId === moduleId);
  if (value === undefined) throw new Error(`Missing first-party module declaration: ${moduleId}`);
  return value;
}

export const FIRST_PARTY_MODULE_STARTUP_MANIFEST: KernelStartupModuleManifest = Object.freeze({
  startupManifestVersion: 1,
  modules: Object.freeze([
    ...CORE_KERNEL_STARTUP_MANIFEST.modules,
    declaration(KEY_SIGNATURE_MODULE_STARTUP_MANIFEST, KEY_SIGNATURE_NAMESPACE),
    declaration(GUITAR_DOMAIN_MODULE_STARTUP_MANIFEST, GUITAR_DOMAIN_NAMESPACE),
  ]),
});

export const FIRST_PARTY_MODULE_REGISTRATION_ENTRIES = Object.freeze([
  ...KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES,
  ...GUITAR_DOMAIN_MODULE_REGISTRATION_ENTRIES,
]);

export function compileFirstPartyModuleCatalogV1() {
  return compileOfficialModuleCatalogV1(
    FIRST_PARTY_MODULE_STARTUP_MANIFEST,
    FIRST_PARTY_MODULE_REGISTRATION_ENTRIES,
  );
}
