import type { PluginSettingsDocument, PluginSettingsRestoreResult } from "./plugin-settings.ts";
import { normalizePluginSettingsDocument, PluginSettingsRegistry } from "./plugin-settings.ts";

export interface PluginSettingsStoragePort {
  read(): Promise<unknown>;
  write(document: PluginSettingsDocument): Promise<void>;
}

/** Connects the process-local plugin settings registry to an application-owned persistence boundary. */
export class PluginSettingsPersistence {
  readonly #registry: PluginSettingsRegistry;
  readonly #storage: PluginSettingsStoragePort;
  #preserved: PluginSettingsDocument = Object.freeze({});
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(registry: PluginSettingsRegistry, storage: PluginSettingsStoragePort) {
    this.#registry = registry;
    this.#storage = storage;
  }

  async restore(): Promise<PluginSettingsRestoreResult> {
    this.#preserved = normalizePluginSettingsDocument(await this.#storage.read());
    const result = this.#registry.restore(this.#preserved);
    await this.#enqueue(this.#mergedDocument());
    return result;
  }

  async write<T>(pluginId: string, value: unknown): Promise<T> {
    const normalized = this.#registry.write<T>(pluginId, value);
    await this.#enqueue(this.#mergedDocument());
    return normalized;
  }

  async reset<T>(pluginId: string): Promise<T> {
    const defaults = this.#registry.reset<T>(pluginId);
    await this.#enqueue(this.#mergedDocument());
    return defaults;
  }

  snapshot(): PluginSettingsDocument {
    return this.#mergedDocument();
  }

  #mergedDocument(): PluginSettingsDocument {
    return Object.freeze({ ...this.#preserved, ...this.#registry.serialize() });
  }

  #enqueue(document: PluginSettingsDocument): Promise<void> {
    const task = this.#writeQueue.catch(() => undefined)
      .then(() => this.#storage.write(document))
      .then(() => { this.#preserved = document; });
    this.#writeQueue = task;
    return task;
  }
}
