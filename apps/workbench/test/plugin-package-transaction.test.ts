import assert from "node:assert/strict";
import test from "node:test";

import {
  PluginPackageTransactionController,
  capturePluginPackageInventoryDocumentV1,
  emptyPluginPackageInventoryV1,
  type PluginPackageInventoryDocumentV1,
  type PluginPackageInventoryStoragePort,
} from "../src/plugins/plugin-package-transaction.ts";

const digest = (character: string) => character.repeat(64);
const installed = (pluginId: string, version = "1.0.0", tier: "system" | "product" | "third-party" = "product") => ({
  pluginId,
  pluginVersion: version,
  tier,
  artifactId: `${pluginId}:${version}`,
  sha256: digest(version === "1.0.0" ? "a" : "b"),
});

class MemoryStorage implements PluginPackageInventoryStoragePort {
  value: unknown;
  readonly writes: PluginPackageInventoryDocumentV1[] = [];
  failNextWrite = false;
  constructor(value: unknown = null) { this.value = value; }
  async read() { return this.value; }
  async write(document: PluginPackageInventoryDocumentV1) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("storage unavailable");
    }
    this.value = document;
    this.writes.push(document);
  }
}

test("install stays pending until the candidate session reaches its stable point", async () => {
  const storage = new MemoryStorage();
  const controller = new PluginPackageTransactionController(storage);
  assert.deepEqual(await controller.prepare(), emptyPluginPackageInventoryV1());

  const staged = await controller.stageInstall(installed("example.product"));
  assert.equal(staged.ok, true);
  assert.equal(controller.snapshot().state, "pending");
  assert.deepEqual(controller.snapshot().stablePackages, []);
  assert.deepEqual(controller.snapshot().candidatePackages.map((item) => item.pluginId), ["example.product"]);

  const launch = await controller.beginCandidateLaunch();
  assert.equal(launch.ok, true);
  if (!launch.ok) return;
  assert.equal(launch.document.state, "launching");
  assert.deepEqual(launch.packages.map((item) => item.pluginId), ["example.product"]);

  const stable = await controller.markStable();
  assert.equal(stable.ok, true);
  assert.equal(controller.snapshot().state, "stable");
  assert.deepEqual(controller.snapshot().stablePackages.map((item) => item.pluginId), ["example.product"]);
  assert.deepEqual(controller.snapshot().candidatePackages, []);
});

test("an interrupted candidate launch recovers the exact last-known-good package set", async () => {
  const system = installed("brilliant.system.foundation", "1.0.0", "system");
  const stableProduct = installed("example.product", "1.0.0");
  const upgradedProduct = installed("example.product", "2.0.0");
  const storage = new MemoryStorage({
    schemaVersion: 1,
    state: "launching",
    revision: 4,
    stablePackages: [system, stableProduct],
    candidatePackages: [system, upgradedProduct],
  });
  const controller = new PluginPackageTransactionController(storage);

  const recovered = await controller.prepare();
  assert.equal(recovered.state, "recovery");
  assert.deepEqual(recovered.stablePackages.map((item) => item.pluginVersion), ["1.0.0", "1.0.0"]);
  assert.deepEqual(recovered.candidatePackages.map((item) => item.pluginVersion), ["1.0.0", "2.0.0"]);
  assert.equal(storage.writes.at(-1)?.state, "recovery");

  const discarded = await controller.discardCandidate();
  assert.equal(discarded.ok, true);
  assert.equal(controller.snapshot().state, "stable");
  assert.deepEqual(controller.snapshot().stablePackages.map((item) => item.pluginVersion), ["1.0.0", "1.0.0"]);
});

test("updates and uninstall are next-launch transactions while system packages remain fixed", async () => {
  const system = installed("brilliant.system.foundation", "1.0.0", "system");
  const product = installed("example.product", "1.0.0");
  const storage = new MemoryStorage({
    schemaVersion: 1,
    state: "stable",
    revision: 1,
    stablePackages: [system, product],
    candidatePackages: [],
  });
  const controller = new PluginPackageTransactionController(storage);
  await controller.prepare();

  assert.deepEqual(await controller.stageUpdate("brilliant.system.foundation",
    installed("brilliant.system.foundation", "2.0.0", "system")), {
    ok: false,
    failure: { code: "package.system-managed", pluginId: "brilliant.system.foundation" },
  });
  assert.equal((await controller.stageUpdate("example.product", installed("example.product", "2.0.0"))).ok, true);
  assert.deepEqual(controller.snapshot().stablePackages.map((item) => item.pluginVersion), ["1.0.0", "1.0.0"]);
  assert.deepEqual(controller.snapshot().candidatePackages.map((item) => item.pluginVersion), ["1.0.0", "2.0.0"]);
  assert.equal((await controller.stageUninstall("example.product")).ok, true);
  assert.deepEqual(controller.snapshot().candidatePackages.map((item) => item.pluginId), ["brilliant.system.foundation"]);
  assert.deepEqual(await controller.stageUninstall("brilliant.system.foundation"), {
    ok: false,
    failure: { code: "package.system-managed", pluginId: "brilliant.system.foundation" },
  });
});

test("launching inventory refuses every topology mutation", async () => {
  const storage = new MemoryStorage();
  const controller = new PluginPackageTransactionController(storage);
  await controller.prepare();
  await controller.stageInstall(installed("example.product"));
  await controller.beginCandidateLaunch();

  assert.deepEqual(await controller.stageInstall(installed("example.second")), {
    ok: false,
    failure: { code: "package.launch-in-progress" },
  });
  assert.deepEqual(await controller.stageUninstall("example.product"), {
    ok: false,
    failure: { code: "package.launch-in-progress" },
  });
  assert.deepEqual(await controller.discardCandidate(), {
    ok: false,
    failure: { code: "package.launch-in-progress" },
  });
});

test("transport capture rejects accessors, sparse arrays and system replacement", () => {
  let accessed = false;
  const hostile = {
    schemaVersion: 1,
    state: "stable",
    revision: 0,
    get stablePackages() { accessed = true; throw new Error("must not execute"); },
    candidatePackages: [],
  };
  assert.equal(capturePluginPackageInventoryDocumentV1(hostile), null);
  assert.equal(accessed, false);

  const sparse = new Array(1);
  assert.equal(capturePluginPackageInventoryDocumentV1({
    schemaVersion: 1, state: "stable", revision: 0, stablePackages: sparse, candidatePackages: [],
  }), null);

  assert.equal(capturePluginPackageInventoryDocumentV1({
    schemaVersion: 1,
    state: "pending",
    revision: 1,
    stablePackages: [installed("brilliant.system.foundation", "1.0.0", "system")],
    candidatePackages: [installed("brilliant.system.foundation", "2.0.0", "system")],
  }), null);
});

test("serialized mutations preserve both packages and monotonic revisions", async () => {
  const storage = new MemoryStorage();
  const controller = new PluginPackageTransactionController(storage);
  await controller.prepare();
  const [first, second] = await Promise.all([
    controller.stageInstall(installed("example.second")),
    controller.stageInstall(installed("example.first")),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(controller.snapshot().revision, 2);
  assert.deepEqual(controller.snapshot().candidatePackages.map((item) => item.pluginId), [
    "example.first", "example.second",
  ]);
  assert.deepEqual(storage.writes.map((item) => item.revision), [1, 2]);
});

test("a failed durable write leaves memory unchanged and the queue retryable", async () => {
  const storage = new MemoryStorage();
  const controller = new PluginPackageTransactionController(storage);
  await controller.prepare();
  storage.failNextWrite = true;

  await assert.rejects(controller.stageInstall(installed("example.first")), /storage unavailable/);
  assert.deepEqual(controller.snapshot(), emptyPluginPackageInventoryV1());
  assert.deepEqual(storage.writes, []);

  const retry = await controller.stageInstall(installed("example.first"));
  assert.equal(retry.ok, true);
  assert.equal(controller.snapshot().revision, 1);
  assert.deepEqual(controller.snapshot().candidatePackages.map((item) => item.pluginId), ["example.first"]);
});
