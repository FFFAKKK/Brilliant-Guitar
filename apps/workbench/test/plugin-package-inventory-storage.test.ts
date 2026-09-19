import assert from "node:assert/strict";
import test from "node:test";

import { emptyPluginPackageInventoryV1 } from "../src/plugins/plugin-package-transaction.ts";
import { BrowserPluginPackageInventoryStorage } from "../src/services/plugin-package-inventory-storage.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    port: {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
    },
  };
}

test("browser package inventory round-trips one strictly captured document", async () => {
  const memory = storage();
  const adapter = new BrowserPluginPackageInventoryStorage(memory.port);
  assert.equal(await adapter.read(), null);

  const document = emptyPluginPackageInventoryV1();
  await adapter.write(document);
  const restored = await adapter.read();
  assert.deepEqual(restored, document);
  assert.notEqual(restored, document);
  assert.equal(Object.isFrozen(restored), true);
});

test("browser package inventory quarantines invalid JSON and invalid contracts", async () => {
  const memory = storage();
  const adapter = new BrowserPluginPackageInventoryStorage(memory.port);
  memory.values.set(BrowserPluginPackageInventoryStorage.KEY, "{broken-json");
  assert.equal(await adapter.read(), null);
  assert.equal(memory.values.get(BrowserPluginPackageInventoryStorage.INVALID_KEY), "{broken-json");

  const invalid = JSON.stringify({
    schemaVersion: 1,
    state: "stable",
    revision: -1,
    stablePackages: [],
    candidatePackages: [],
  });
  memory.values.set(BrowserPluginPackageInventoryStorage.KEY, invalid);
  assert.equal(await adapter.read(), null);
  assert.equal(memory.values.get(BrowserPluginPackageInventoryStorage.INVALID_KEY), invalid);
});
