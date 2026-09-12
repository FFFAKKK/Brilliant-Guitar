import assert = require("node:assert/strict");
import { test } from "node:test";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { getKernelIntegratedCatalogState } from "../../../src/core-kernel/registry/domain-catalog";
import { captureHostInstalledContributionsV1 } from "../../../src/core-kernel/native/integrated-catalog-capture";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
} from "../fixtures/cvn-6-synthetic-official-modules";

function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected genuine compiled fixture catalog");
  return result.catalog;
}

test("host capture reuses genuine catalog identity and isolates separately compiled catalogs", () => {
  const first = catalog();
  const second = catalog();
  const captured = captureHostInstalledContributionsV1(first);
  const other = captureHostInstalledContributionsV1(second);
  assert.ok(captured);
  assert.ok(other);
  assert.strictEqual(captureHostInstalledContributionsV1(first), captured);
  assert.notStrictEqual(captured, other);
  assert.notStrictEqual(captured.catalogIdentity, other.catalogIdentity);
  assert.notStrictEqual(captured.projection, other.projection);
  assert.deepEqual(captured.projection, other.projection);
  const state = getKernelIntegratedCatalogState(first);
  assert.ok(state);
  assert.notStrictEqual(captured.catalogIdentity, first);
  assert.notStrictEqual(captured.catalogIdentity, state.assemblyIdentity);
  assert.deepEqual(captured.projection, {
    contributions: state.contributions.map((value) => ({
      moduleId: value.moduleId,
      contributionId: value.contributionId,
      requirements: value.extensionRequirements,
    })),
  });
});

test("host projection is detached deep-frozen data without catalog or callback references", () => {
  const original = catalog();
  const state = getKernelIntegratedCatalogState(original);
  const captured = captureHostInstalledContributionsV1(original);
  assert.ok(state);
  assert.ok(captured);
  const references = new Set<object>();
  function collect(value: unknown): void {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return;
    if (references.has(value)) return;
    references.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) collect(descriptor.value);
    }
  }
  collect(original);
  collect(state);
  function inspect(value: unknown): void {
    assert.notEqual(typeof value, "function");
    assert.notEqual(typeof value, "symbol");
    if (value === null || typeof value !== "object") return;
    assert.equal(references.has(value), false);
    assert.equal(Object.isFrozen(value), true);
    for (const key of Reflect.ownKeys(value)) {
      assert.equal(typeof key, "string");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      assert.ok(descriptor && "value" in descriptor);
      inspect(descriptor.value);
    }
  }
  inspect(captured);
  assert.deepEqual(JSON.parse(JSON.stringify(captured.projection)), captured.projection);
  const owner = captured.projection.contributions[0];
  assert.ok(owner);
  assert.equal(Reflect.set(owner, "moduleId", "forged"), false);
  assert.equal(Reflect.set(owner.requirements, "0", null), false);
  assert.strictEqual(captureHostInstalledContributionsV1(original), captured);
});

test("copied branding and data never authenticate and hostile property traps are not invoked", () => {
  const original = catalog();
  const capture = captureHostInstalledContributionsV1(original);
  assert.ok(capture);
  const copied = Object.create(null, Object.getOwnPropertyDescriptors(original)) as object;
  let traps = 0;
  const proxy = new Proxy(original, {
    get() { traps += 1; throw new Error("must not inspect properties"); },
    ownKeys() { traps += 1; throw new Error("must not enumerate properties"); },
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [undefined, null, 1, "catalog", {}, copied, proxy, revoked.proxy,
    JSON.parse(JSON.stringify(original)), capture, capture.catalogIdentity, capture.projection]) {
    assert.equal(captureHostInstalledContributionsV1(value), undefined);
  }
  assert.equal(traps, 0);
  assert.strictEqual(captureHostInstalledContributionsV1(original), capture);
});

test("a genuine core-only catalog captures an empty domain contribution inventory", () => {
  const compiled = compileOfficialModuleCatalogV1({
    startupManifestVersion: 1,
    modules: CVN6_MANIFEST.modules.filter((value) => value.moduleId.startsWith("core.")),
  }, []);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("expected genuine core-only catalog");
  const captured = captureHostInstalledContributionsV1(compiled.catalog);
  assert.ok(captured);
  assert.deepEqual(captured.projection, { contributions: [] });
  assert.equal(Object.isFrozen(captured.projection.contributions), true);
});

test("capture uses saved primordials and bypasses inherited array setters", () => {
  // Both compilation and expected capture finish before any global mutation.
  const fresh = catalog();
  const expected = captureHostInstalledContributionsV1(catalog());
  assert.ok(expected);
  const define = Object.defineProperty;
  const remove = Reflect.deleteProperty;
  const sites = [
    { owner: Object, key: "freeze" },
    { owner: Reflect, key: "apply" },
    { owner: WeakMap.prototype, key: "get" },
    { owner: WeakMap.prototype, key: "set" },
    { owner: Array.prototype, key: "0" },
  ].map((site) => ({ ...site, original: Object.getOwnPropertyDescriptor(site.owner, site.key) }));
  let traps = 0;
  const trap = () => { traps += 1; throw new Error("hostile primordial invoked"); };
  let captured: ReturnType<typeof captureHostInstalledContributionsV1>;
  try {
    for (let index = 0; index < sites.length; index += 1) {
      const site = sites[index];
      if (site === undefined) throw new Error("missing mutation site");
      define(site.owner, site.key, index === sites.length - 1
        ? { configurable: true, set: trap }
        : { configurable: true, writable: true, value: trap });
    }
    captured = captureHostInstalledContributionsV1(fresh);
  } finally {
    // No assertions, logging or collection growth while the hooks are active.
    for (let index = sites.length - 1; index >= 0; index -= 1) {
      const site = sites[index];
      if (site === undefined) continue;
      if (site.original === undefined) remove(site.owner, site.key);
      else define(site.owner, site.key, site.original);
    }
  }
  assert.equal(traps, 0);
  assert.ok(captured);
  assert.deepEqual(captured.projection, expected.projection);
  assert.notStrictEqual(captured.catalogIdentity, expected.catalogIdentity);
  assert.strictEqual(captureHostInstalledContributionsV1(fresh), captured);
});
