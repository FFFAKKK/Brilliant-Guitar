interface CoreMigrationStep {
  readonly stepId: string;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly migrate: (input: unknown) => unknown;
}

export const CORE_MIGRATION_STEPS: readonly CoreMigrationStep[] =
  Object.freeze([]);
