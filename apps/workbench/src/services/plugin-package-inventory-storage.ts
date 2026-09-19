import {
  capturePluginPackageInventoryDocumentV1,
  type PluginPackageInventoryDocumentV1,
  type PluginPackageInventoryStoragePort,
} from "../plugins/plugin-package-transaction.ts";

type PackageInventoryBrowserStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PackageInventoryBrowserStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** Browser preview adapter. Desktop production storage remains host-owned. */
export class BrowserPluginPackageInventoryStorage implements PluginPackageInventoryStoragePort {
  static readonly KEY = "brilliant.workbench.plugin-package-inventory.v1";
  static readonly INVALID_KEY = "brilliant.workbench.plugin-package-inventory.invalid.v1";
  readonly #storage: PackageInventoryBrowserStorage | undefined;

  constructor(storage: PackageInventoryBrowserStorage | undefined = browserStorage()) {
    this.#storage = storage;
  }

  async read(): Promise<unknown> {
    const value = this.#storage?.getItem(BrowserPluginPackageInventoryStorage.KEY);
    if (value === null || value === undefined) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      const document = capturePluginPackageInventoryDocumentV1(parsed);
      if (!document) throw new Error("invalid plugin package inventory");
      return document;
    } catch {
      this.#storage?.setItem(BrowserPluginPackageInventoryStorage.INVALID_KEY, value);
      return null;
    }
  }

  async write(document: PluginPackageInventoryDocumentV1): Promise<void> {
    this.#storage?.setItem(BrowserPluginPackageInventoryStorage.KEY, JSON.stringify(document));
  }
}
