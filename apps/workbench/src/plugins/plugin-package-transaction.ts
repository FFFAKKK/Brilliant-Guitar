import type { PluginTier } from "./plugin-package-contract.ts";

export const PLUGIN_PACKAGE_INVENTORY_LIMIT = 256;

export type PluginPackageInventoryState = "stable" | "pending" | "launching" | "recovery";

export interface InstalledPluginPackageV1 {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly tier: PluginTier;
  /** Opaque handle owned by the trusted artifact store; never a filesystem path. */
  readonly artifactId: string;
  readonly sha256: string;
}

export interface PluginPackageInventoryDocumentV1 {
  readonly schemaVersion: 1;
  readonly state: PluginPackageInventoryState;
  readonly revision: number;
  /** Last package set that crossed the application stable point. */
  readonly stablePackages: readonly InstalledPluginPackageV1[];
  /** Next-launch package set. Empty only has special meaning while state is stable. */
  readonly candidatePackages: readonly InstalledPluginPackageV1[];
}

export interface PluginPackageInventoryStoragePort {
  read(): Promise<unknown>;
  write(document: PluginPackageInventoryDocumentV1): Promise<void>;
}

export type PluginPackageTransactionFailureCode =
  | "package.invalid"
  | "package.already-installed"
  | "package.not-installed"
  | "package.identity-mismatch"
  | "package.system-managed"
  | "package.no-change"
  | "package.limit-exceeded"
  | "package.no-pending-change"
  | "package.launch-in-progress";

export interface PluginPackageTransactionFailure {
  readonly code: PluginPackageTransactionFailureCode;
  readonly pluginId?: string;
}

export type PluginPackageTransactionResultV1 =
  | { readonly ok: true; readonly document: PluginPackageInventoryDocumentV1 }
  | { readonly ok: false; readonly failure: PluginPackageTransactionFailure };

export type PluginPackageLaunchResultV1 =
  | {
      readonly ok: true;
      readonly document: PluginPackageInventoryDocumentV1;
      readonly packages: readonly InstalledPluginPackageV1[];
    }
  | { readonly ok: false; readonly failure: PluginPackageTransactionFailure };

const pluginIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+$/;
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const documentKeys = Object.freeze([
  "schemaVersion", "state", "revision", "stablePackages", "candidatePackages",
]);
const packageKeys = Object.freeze([
  "pluginId", "pluginVersion", "tier", "artifactId", "sha256",
]);

function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length
      || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
    const captured: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return null;
  }
}

function denseArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || value.length > PLUGIN_PACKAGE_INVENTORY_LIMIT) return null;
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return null;
    }
    return value;
  } catch {
    return null;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function samePackage(left: InstalledPluginPackageV1, right: InstalledPluginPackageV1): boolean {
  return left.pluginId === right.pluginId
    && left.pluginVersion === right.pluginVersion
    && left.tier === right.tier
    && left.artifactId === right.artifactId
    && left.sha256 === right.sha256;
}

export function captureInstalledPluginPackageV1(value: unknown): InstalledPluginPackageV1 | null {
  const source = exactDataRecord(value, packageKeys);
  if (!source || typeof source.pluginId !== "string" || !pluginIdPattern.test(source.pluginId)
    || typeof source.pluginVersion !== "string" || !semanticVersionPattern.test(source.pluginVersion)
    || (source.tier !== "system" && source.tier !== "product" && source.tier !== "third-party")
    || typeof source.artifactId !== "string" || !artifactIdPattern.test(source.artifactId)
    || typeof source.sha256 !== "string" || !sha256Pattern.test(source.sha256)) return null;
  return Object.freeze({
    pluginId: source.pluginId,
    pluginVersion: source.pluginVersion,
    tier: source.tier,
    artifactId: source.artifactId,
    sha256: source.sha256,
  });
}

function capturePackages(value: unknown): readonly InstalledPluginPackageV1[] | null {
  const values = denseArray(value);
  if (!values) return null;
  const packages: InstalledPluginPackageV1[] = [];
  const ids = new Set<string>();
  for (const value of values) {
    const captured = captureInstalledPluginPackageV1(value);
    if (!captured || ids.has(captured.pluginId)) return null;
    ids.add(captured.pluginId);
    packages.push(captured);
  }
  packages.sort((left, right) => compareText(left.pluginId, right.pluginId));
  return Object.freeze(packages);
}

function systemPackagesUnchanged(
  stable: readonly InstalledPluginPackageV1[],
  candidate: readonly InstalledPluginPackageV1[],
): boolean {
  const stableSystems = stable.filter((item) => item.tier === "system");
  const candidateSystems = candidate.filter((item) => item.tier === "system");
  return stableSystems.length === candidateSystems.length
    && stableSystems.every((item, index) => {
      const other = candidateSystems[index];
      return other !== undefined && samePackage(item, other);
    });
}

function document(
  state: PluginPackageInventoryState,
  revision: number,
  stablePackages: readonly InstalledPluginPackageV1[],
  candidatePackages: readonly InstalledPluginPackageV1[],
): PluginPackageInventoryDocumentV1 {
  return Object.freeze({
    schemaVersion: 1,
    state,
    revision,
    stablePackages: Object.freeze([...stablePackages]),
    candidatePackages: Object.freeze([...candidatePackages]),
  });
}

export function emptyPluginPackageInventoryV1(): PluginPackageInventoryDocumentV1 {
  return document("stable", 0, [], []);
}

export function capturePluginPackageInventoryDocumentV1(
  value: unknown,
): PluginPackageInventoryDocumentV1 | null {
  const source = exactDataRecord(value, documentKeys);
  if (!source || source.schemaVersion !== 1
    || (source.state !== "stable" && source.state !== "pending"
      && source.state !== "launching" && source.state !== "recovery")
    || typeof source.revision !== "number" || !Number.isSafeInteger(source.revision) || source.revision < 0) return null;
  const stable = capturePackages(source.stablePackages);
  const candidate = capturePackages(source.candidatePackages);
  if (!stable || !candidate || (source.state === "stable" && candidate.length !== 0)
    || (source.state !== "stable" && !systemPackagesUnchanged(stable, candidate))) return null;
  return document(source.state, source.revision, stable, candidate);
}

function failure(
  code: PluginPackageTransactionFailureCode,
  pluginId?: string,
): { readonly ok: false; readonly failure: PluginPackageTransactionFailure } {
  return Object.freeze({
    ok: false,
    failure: Object.freeze({ code, ...(pluginId === undefined ? {} : { pluginId }) }),
  });
}

/**
 * Startup-only package inventory transaction. Artifact verification and file IO
 * stay in the trusted host; this controller only protects stable/candidate
 * identities and never mutates the running PluginPlatform.
 */
export class PluginPackageTransactionController {
  readonly #storage: PluginPackageInventoryStoragePort;
  #current = emptyPluginPackageInventoryV1();
  #prepared = false;
  #prepareRequested = false;
  #queue: Promise<void> = Promise.resolve();

  constructor(storage: PluginPackageInventoryStoragePort) {
    this.#storage = storage;
  }

  prepare(): Promise<PluginPackageInventoryDocumentV1> {
    if (this.#prepareRequested) return Promise.reject(new Error("Plugin package inventory already prepared"));
    this.#prepareRequested = true;
    const pending = this.#enqueue(async () => {
      const source = await this.#storage.read();
      const captured = source === null || source === undefined
        ? emptyPluginPackageInventoryV1()
        : capturePluginPackageInventoryDocumentV1(source);
      if (!captured) throw new Error("Invalid plugin package inventory");
      if (captured.state === "launching") {
        const recovered = document(
          "recovery",
          captured.revision + 1,
          captured.stablePackages,
          captured.candidatePackages,
        );
        await this.#storage.write(recovered);
        this.#current = recovered;
      } else {
        this.#current = captured;
      }
      this.#prepared = true;
      return this.#current;
    });
    return pending.catch((error: unknown) => {
      this.#prepareRequested = false;
      throw error;
    });
  }

  snapshot(): PluginPackageInventoryDocumentV1 {
    return this.#current;
  }

  stageInstall(value: unknown): Promise<PluginPackageTransactionResultV1> {
    return this.#mutate((packages) => {
      const item = captureInstalledPluginPackageV1(value);
      if (!item) return failure("package.invalid");
      if (item.tier === "system") return failure("package.system-managed", item.pluginId);
      if (packages.some((current) => current.pluginId === item.pluginId)) {
        return failure("package.already-installed", item.pluginId);
      }
      if (packages.length >= PLUGIN_PACKAGE_INVENTORY_LIMIT) return failure("package.limit-exceeded");
      return [...packages, item];
    });
  }

  stageUpdate(pluginId: string, value: unknown): Promise<PluginPackageTransactionResultV1> {
    return this.#mutate((packages) => {
      const item = captureInstalledPluginPackageV1(value);
      if (!item) return failure("package.invalid", pluginId);
      if (item.pluginId !== pluginId) return failure("package.identity-mismatch", pluginId);
      const index = packages.findIndex((current) => current.pluginId === pluginId);
      if (index < 0) return failure("package.not-installed", pluginId);
      const current = packages[index]!;
      if (current.tier === "system") return failure("package.system-managed", pluginId);
      if (current.tier !== item.tier) return failure("package.identity-mismatch", pluginId);
      if (samePackage(current, item)) return failure("package.no-change", pluginId);
      const updated = [...packages];
      updated[index] = item;
      return updated;
    });
  }

  stageUninstall(pluginId: string): Promise<PluginPackageTransactionResultV1> {
    return this.#mutate((packages) => {
      const current = packages.find((item) => item.pluginId === pluginId);
      if (!current) return failure("package.not-installed", pluginId);
      if (current.tier === "system") return failure("package.system-managed", pluginId);
      return packages.filter((item) => item.pluginId !== pluginId);
    });
  }

  beginCandidateLaunch(): Promise<PluginPackageLaunchResultV1> {
    return this.#enqueue(async () => {
      this.#assertPrepared();
      if (this.#current.state === "launching") {
        return failure("package.launch-in-progress");
      }
      if (this.#current.state === "stable") {
        return failure("package.no-pending-change");
      }
      const launching = document(
        "launching",
        this.#current.revision + 1,
        this.#current.stablePackages,
        this.#current.candidatePackages,
      );
      await this.#storage.write(launching);
      this.#current = launching;
      return Object.freeze({ ok: true, document: launching, packages: launching.candidatePackages });
    });
  }

  markStable(): Promise<PluginPackageTransactionResultV1> {
    return this.#enqueue(async () => {
      this.#assertPrepared();
      if (this.#current.state !== "launching") return failure("package.no-pending-change");
      const stable = document("stable", this.#current.revision + 1, this.#current.candidatePackages, []);
      await this.#storage.write(stable);
      this.#current = stable;
      return Object.freeze({ ok: true, document: stable });
    });
  }

  discardCandidate(): Promise<PluginPackageTransactionResultV1> {
    return this.#enqueue(async () => {
      this.#assertPrepared();
      if (this.#current.state === "launching") return failure("package.launch-in-progress");
      if (this.#current.state === "stable") return failure("package.no-pending-change");
      const stable = document("stable", this.#current.revision + 1, this.#current.stablePackages, []);
      await this.#storage.write(stable);
      this.#current = stable;
      return Object.freeze({ ok: true, document: stable });
    });
  }

  #mutate(
    change: (
      packages: readonly InstalledPluginPackageV1[],
    ) => readonly InstalledPluginPackageV1[] | PluginPackageTransactionResultV1,
  ): Promise<PluginPackageTransactionResultV1> {
    return this.#enqueue(async () => {
      this.#assertPrepared();
      if (this.#current.state === "launching") return failure("package.launch-in-progress");
      const base = this.#current.state === "stable"
        ? this.#current.stablePackages
        : this.#current.candidatePackages;
      const changed = change(base);
      if (!Array.isArray(changed)) return changed as PluginPackageTransactionResultV1;
      const packages = [...changed].sort((left, right) => compareText(left.pluginId, right.pluginId));
      const pending = document(
        "pending",
        this.#current.revision + 1,
        this.#current.stablePackages,
        packages,
      );
      await this.#storage.write(pending);
      this.#current = pending;
      return Object.freeze({ ok: true, document: pending });
    });
  }

  #assertPrepared(): void {
    if (!this.#prepared) throw new Error("Plugin package inventory is not prepared");
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation, operation);
    this.#queue = task.then(() => undefined, () => undefined);
    return task;
  }
}
