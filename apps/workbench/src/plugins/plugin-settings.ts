import type { PluginSettingsContribution } from "./plugin-sdk.ts";

export interface PluginSettingsEnvelope {
  readonly schemaVersion: number;
  readonly value: unknown;
}

export type PluginSettingsDocument = Readonly<Record<string, PluginSettingsEnvelope>>;

export interface PluginSettingsRestoreResult {
  readonly restored: readonly string[];
  readonly defaulted: readonly string[];
}

interface RegisteredPluginSettings {
  readonly schemaVersion: number;
  readonly defaults: unknown;
  readonly parse: (value: unknown) => unknown | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseSettings(definition: RegisteredPluginSettings, value: unknown): unknown | null {
  try { return definition.parse(value); }
  catch { return null; }
}

export function normalizePluginSettingsDocument(value: unknown): PluginSettingsDocument {
  const source = record(value);
  if (!source) return Object.freeze({});
  const document: Record<string, PluginSettingsEnvelope> = {};
  for (const [pluginId, rawEnvelope] of Object.entries(source)) {
    const envelope = record(rawEnvelope);
    if (!envelope || !Number.isSafeInteger(envelope.schemaVersion) || Number(envelope.schemaVersion) < 1
      || !Object.prototype.hasOwnProperty.call(envelope, "value")) continue;
    document[pluginId] = Object.freeze({ schemaVersion: Number(envelope.schemaVersion), value: envelope.value });
  }
  return Object.freeze(document);
}

/** Process-local, plugin-namespaced settings catalog. Persistence is supplied by the application host. */
export class PluginSettingsRegistry {
  readonly #definitions = new Map<string, RegisteredPluginSettings>();
  readonly #values = new Map<string, unknown>();
  readonly #listeners = new Set<() => void>();

  register<T>(pluginId: string, contribution: PluginSettingsContribution<T>): void {
    if (this.#definitions.has(pluginId)) throw new Error(`Plugin settings already registered: ${pluginId}`);
    const definition: RegisteredPluginSettings = {
      schemaVersion: contribution.schemaVersion,
      defaults: contribution.defaults,
      parse: contribution.parse,
    };
    const defaults = parseSettings(definition, contribution.defaults);
    if (defaults === null) throw new Error(`Plugin settings defaults are invalid: ${pluginId}`);
    this.#definitions.set(pluginId, {
      schemaVersion: contribution.schemaVersion,
      defaults,
      parse: contribution.parse,
    });
    this.#values.set(pluginId, defaults);
  }

  has(pluginId: string): boolean {
    return this.#definitions.has(pluginId);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  read<T>(pluginId: string): T {
    if (!this.#definitions.has(pluginId)) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    return this.#values.get(pluginId) as T;
  }

  write<T>(pluginId: string, value: unknown): T {
    const definition = this.#definitions.get(pluginId);
    if (!definition) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    const parsed = parseSettings(definition, value);
    if (parsed === null) throw new Error(`Plugin settings are invalid: ${pluginId}`);
    this.#values.set(pluginId, parsed);
    this.#publish();
    return parsed as T;
  }

  reset<T>(pluginId: string): T {
    const definition = this.#definitions.get(pluginId);
    if (!definition) throw new Error(`Plugin settings are not registered: ${pluginId}`);
    this.#values.set(pluginId, definition.defaults);
    this.#publish();
    return definition.defaults as T;
  }

  restore(value: unknown): PluginSettingsRestoreResult {
    const source = normalizePluginSettingsDocument(value);
    const restored: string[] = [];
    const defaulted: string[] = [];
    for (const [pluginId, definition] of this.#definitions) {
      const envelope = source[pluginId];
      const parsed = envelope?.schemaVersion === definition.schemaVersion
        ? parseSettings(definition, envelope.value) : null;
      if (parsed === null) {
        this.#values.set(pluginId, definition.defaults);
        defaulted.push(pluginId);
      } else {
        this.#values.set(pluginId, parsed);
        restored.push(pluginId);
      }
    }
    this.#publish();
    return Object.freeze({ restored: Object.freeze(restored), defaulted: Object.freeze(defaulted) });
  }

  serialize(): PluginSettingsDocument {
    const document: Record<string, PluginSettingsEnvelope> = {};
    for (const [pluginId, definition] of this.#definitions) {
      document[pluginId] = Object.freeze({
        schemaVersion: definition.schemaVersion,
        value: this.#values.get(pluginId),
      });
    }
    return Object.freeze(document);
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }
}
