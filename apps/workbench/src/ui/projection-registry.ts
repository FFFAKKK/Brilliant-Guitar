export interface UiProjection<T> {
  readonly id: string;
  /** Compile-time carrier only; projection values never live on the key. */
  readonly __value?: T;
}

export type AnyUiProjection = UiProjection<unknown>;

export function defineUiProjection<T>(id: string): UiProjection<T> {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)) throw new Error(`Invalid UI projection ID: ${id}`);
  return Object.freeze({ id });
}

export interface UiProjectionBinding {
  readonly projection: AnyUiProjection;
  readonly value: unknown;
}

export function bindUiProjection<T>(projection: UiProjection<T>, value: T): UiProjectionBinding {
  return { projection, value };
}

export interface UiProjectionReader {
  get<T>(projection: UiProjection<T>): T;
}

export class UiProjectionSnapshot implements UiProjectionReader {
  readonly #values: ReadonlyMap<string, unknown>;

  constructor(values: ReadonlyMap<string, unknown>) { this.#values = values; }

  get<T>(projection: UiProjection<T>): T {
    if (!this.#values.has(projection.id)) throw new Error(`UI projection is not bound: ${projection.id}`);
    return this.#values.get(projection.id) as T;
  }

  scoped(allowed: readonly AnyUiProjection[]): UiProjectionReader {
    for (const projection of allowed) {
      if (!this.#values.has(projection.id)) throw new Error(`UI projection is not bound: ${projection.id}`);
    }
    const ids = new Set(allowed.map((projection) => projection.id));
    return { get: <T>(projection: UiProjection<T>) => {
      if (!ids.has(projection.id)) throw new Error(`UI projection is not declared by this plugin: ${projection.id}`);
      return this.get(projection);
    } };
  }
}

/** Registry of host-owned projection contracts. Values are supplied per React render. */
export class UiProjectionRegistry {
  readonly #projections = new Map<string, AnyUiProjection>();

  constructor(projections: readonly AnyUiProjection[] = []) {
    for (const projection of projections) this.register(projection);
  }

  register(projection: AnyUiProjection): void {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(projection.id)) throw new Error(`Invalid UI projection ID: ${projection.id}`);
    if (this.#projections.has(projection.id)) throw new Error(`UI projection already registered: ${projection.id}`);
    this.#projections.set(projection.id, projection);
  }

  has(id: string): boolean { return this.#projections.has(id); }
  list(): readonly AnyUiProjection[] { return [...this.#projections.values()]; }

  snapshot(bindings: readonly UiProjectionBinding[]): UiProjectionSnapshot {
    const values = new Map<string, unknown>();
    for (const binding of bindings) {
      if (!this.#projections.has(binding.projection.id)) throw new Error(`Unknown UI projection: ${binding.projection.id}`);
      if (values.has(binding.projection.id)) throw new Error(`Duplicate UI projection binding: ${binding.projection.id}`);
      values.set(binding.projection.id, binding.value);
    }
    return new UiProjectionSnapshot(values);
  }
}
