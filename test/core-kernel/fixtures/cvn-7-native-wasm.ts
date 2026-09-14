import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as sdk from "../../../src/core-kernel/module-sdk/index";
import { createNativeWasmPagedSessionV2, installNativeWasmScheduledEditingV4 } from "../../../src/native-host/wasm-core-reads";
import { createCvn7QualificationModules } from "./cvn-7-qualification-modules";

export function createCvn7NativeWasmFixture(
  addon: Parameters<typeof installNativeWasmScheduledEditingV4>[0] =
    require(resolve("target/wasm-v1/brilliant_kernel_node.node")),
) {
  const modules = createCvn7QualificationModules(sdk);
  const compiled = sdk.compileOfficialModuleCatalogV1(modules.manifest, modules.registrationEntries);
  assert.ok(compiled.ok);
  const bytes = readFileSync("test/core-kernel/fixtures/wasm-guest/guest-cvn7.wasm");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const bindings = ["score", "part"].map(module => ({
    moduleId: `fixture.cvn7.${module}.module`, contributionId: `fixture.cvn7.${module}.contribution.v1`,
    abiVersion: 1, sha256, bytes,
  }));
  return { modules, catalog: compiled.catalog, guestSha256: sha256,
    createPaged: (document: unknown) => createNativeWasmPagedSessionV2(
      addon, compiled.catalog, bindings, document, modules.knownRequirementInventory),
    install: () => installNativeWasmScheduledEditingV4(addon, compiled.catalog, bindings) };
}
