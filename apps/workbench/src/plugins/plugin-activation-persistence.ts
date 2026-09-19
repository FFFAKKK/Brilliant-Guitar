export interface PluginActivationDocumentV1 {
  readonly schemaVersion: 1;
  readonly enabledPluginIds: readonly string[];
}

export interface PluginActivationStoragePort {
  read(): Promise<unknown>;
  write(document: PluginActivationDocumentV1): Promise<void>;
}

export interface PluginActivationTarget {
  restoreActivation(pluginIds: readonly string[]): void;
}

const pluginIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function normalizePluginActivationDocument(value: unknown): PluginActivationDocumentV1 {
  const source = record(value);
  const ids = source?.schemaVersion === 1 && Array.isArray(source.enabledPluginIds)
    ? source.enabledPluginIds.filter((item): item is string => typeof item === "string" && pluginIdPattern.test(item))
    : [];
  return Object.freeze({ schemaVersion: 1, enabledPluginIds: Object.freeze([...new Set(ids)]) });
}

/** Persists the desired user-plugin activation set while the platform owns actual lifecycle state. */
export class PluginActivationPersistence {
  readonly #target: PluginActivationTarget;
  readonly #storage: PluginActivationStoragePort;
  #desired = new Set<string>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(target: PluginActivationTarget, storage: PluginActivationStoragePort) {
    this.#target = target;
    this.#storage = storage;
  }

  async restore(): Promise<PluginActivationDocumentV1> {
    const document = normalizePluginActivationDocument(await this.#storage.read());
    this.#desired = new Set(document.enabledPluginIds);
    this.#target.restoreActivation(document.enabledPluginIds);
    await this.#enqueue(document);
    return document;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginActivationDocumentV1> {
    if (!pluginIdPattern.test(pluginId)) throw new Error(`Invalid plugin ID: ${pluginId}`);
    if (enabled) this.#desired.add(pluginId);
    else this.#desired.delete(pluginId);
    const document = this.snapshot();
    this.#target.restoreActivation(document.enabledPluginIds);
    await this.#enqueue(document);
    return document;
  }

  snapshot(): PluginActivationDocumentV1 {
    return Object.freeze({
      schemaVersion: 1,
      enabledPluginIds: Object.freeze([...this.#desired]),
    });
  }

  #enqueue(document: PluginActivationDocumentV1): Promise<void> {
    const task = this.#writeQueue.catch(() => undefined).then(() => this.#storage.write(document));
    this.#writeQueue = task;
    return task;
  }
}
