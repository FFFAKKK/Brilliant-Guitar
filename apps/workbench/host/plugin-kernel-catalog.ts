import { createRequire } from "node:module";

import {
  bindTrustedPluginKernelAssemblyV1,
  type TrustedPluginKernelAssemblyV1,
  type TrustedPluginKernelBindingFailure,
  type TrustedPluginKernelModuleBindingV1,
} from "../src/plugins/plugin-kernel-adapter.ts";
import type {
  CompiledDomainCommandRegistrationEntryV1,
  OfficialModuleCatalogCompilationResultV1,
} from "../.kernel/src/core-kernel/module-sdk/index.js";
import type { KernelIntegratedCatalog } from "../.kernel/src/core-kernel/index.js";

const require = createRequire(import.meta.url);

const DOMAIN_CAPABILITIES = Object.freeze([
  "command:register",
  "command:execute",
  "score:read",
  "event:subscribe",
] as const);

export type TrustedInternalKernelModuleBindingV1 =
  TrustedPluginKernelModuleBindingV1<CompiledDomainCommandRegistrationEntryV1>;

export type PluginKernelCatalogHostFailureV1 =
  | {
      readonly code: "kernel-host.binding-rejected";
      readonly failure: TrustedPluginKernelBindingFailure;
    }
  | {
      readonly code: "kernel-host.runtime-not-ready";
      readonly moduleId: string;
      readonly runtime: "wasm";
    }
  | {
      readonly code: "kernel-host.catalog-rejected";
      readonly failure: Extract<OfficialModuleCatalogCompilationResultV1, { readonly ok: false }>["failure"];
    };

export type PluginKernelCatalogHostResultV1 =
  | {
      readonly ok: true;
      readonly catalog: KernelIntegratedCatalog;
      readonly assembly: TrustedPluginKernelAssemblyV1<CompiledDomainCommandRegistrationEntryV1>;
    }
  | { readonly ok: false; readonly failure: PluginKernelCatalogHostFailureV1 };

function rejected(failure: PluginKernelCatalogHostFailureV1): PluginKernelCatalogHostResultV1 {
  return Object.freeze({ ok: false, failure: Object.freeze(failure) });
}

/**
 * Trusted process-start boundary for Kernel-bearing plugin packages.
 *
 * It does not introduce another registry or execute plugin callbacks. The
 * package platform decides the fixed module set, the trusted host binds exact
 * implementations, and the existing Kernel Catalog remains the only compiler
 * and runtime authority.
 */
export function compilePluginKernelCatalogV1(
  planInput: unknown,
  bindingInput: unknown,
): PluginKernelCatalogHostResultV1 {
  const bound = bindTrustedPluginKernelAssemblyV1<CompiledDomainCommandRegistrationEntryV1>(
    planInput,
    bindingInput,
  );
  if (!bound.ok) {
    return rejected({ code: "kernel-host.binding-rejected", failure: bound.failure });
  }

  for (const module of bound.assembly.modules) {
    if (module.runtime === "wasm") {
      return rejected({
        code: "kernel-host.runtime-not-ready",
        moduleId: module.moduleId,
        runtime: "wasm",
      });
    }
  }

  const { CORE_KERNEL_STARTUP_MANIFEST } = require(
    "../.kernel/src/core-kernel/registry/builtins.js",
  ) as typeof import("../.kernel/src/core-kernel/registry/builtins.js");
  const { compileOfficialModuleCatalogV1 } = require(
    "../.kernel/src/core-kernel/module-sdk/index.js",
  ) as typeof import("../.kernel/src/core-kernel/module-sdk/index.js");

  const startupManifest = Object.freeze({
    startupManifestVersion: 1 as const,
    modules: Object.freeze([
      ...CORE_KERNEL_STARTUP_MANIFEST.modules,
      ...bound.assembly.modules.map((module) => Object.freeze({
        moduleId: module.moduleId,
        origin: "official" as const,
        runtime: "internal-module" as const,
        trustLevel: "system-trusted" as const,
        apiVersion: 1 as const,
        capabilities: DOMAIN_CAPABILITIES,
        registrationEntryIds: Object.freeze(["kernel.domain-commands.v1"] as const),
      })),
    ]),
  });
  const compiled = compileOfficialModuleCatalogV1(
    startupManifest,
    bound.assembly.modules.map((module) => module.implementation),
  );
  if (!compiled.ok) {
    return rejected({ code: "kernel-host.catalog-rejected", failure: compiled.failure });
  }
  return Object.freeze({
    ok: true,
    catalog: compiled.catalog,
    assembly: bound.assembly,
  });
}
