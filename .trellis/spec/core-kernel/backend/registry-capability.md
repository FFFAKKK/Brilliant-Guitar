# Registry and Capability

## Core Rule

All extension points are explicit contributions registered through `KernelRegistry`, and all access is denied by default unless capability checks pass.

## Contribution Scope

V1 registry may accept descriptors and handlers for:

- Commands.
- Selectors.
- Hard validators.
- Technique definitions.
- Migrations.
- External import/export abstract descriptors.
- Templates.

Import/export descriptors are metadata and capability declarations only. They do not mean Core Kernel implements PDF, PNG, Guitar Pro, or physical `.bgp` IO.

## Module Identity

Module identity must model these concepts independently:

- `origin`.
- `runtime`.
- `trustLevel`.
- `apiVersion`.
- capabilities.

`origin = "official"`, `runtime = "internal-module"`, or `trustLevel = "system-trusted"` must not automatically grant all permissions.

## V1 Runtime Boundary

Pure Core Kernel V1 only accepts startup-time `builtin` and `internal-module` registrations from a static `KernelStartupModuleManifest`.

The V1 manifest must not reference:

- External file paths.
- URLs.
- Script strings.
- Dynamic imports.
- Third-party plugin manifests.
- User-installed plugin packages.

Runtime plugin changes are not supported. After the app is ready, third-party plugin install, remove, enable, disable, unload, or hotplug requests must not change the active handler set.

## Capability Rules

- Capability checks must happen before command execution, selector access, contribution registration, and future plugin facade access.
- Registration capability and execution capability are separate.
- Missing capability must return a stable structured error such as `capability-denied`.
- Duplicate IDs, unknown contribution kinds, unsupported runtime, incompatible API version, and missing capability must be rejected.
- Registry summary must be read-only and must not expose handlers, mutable objects, React components, VexFlow objects, Web Audio nodes, Tauri objects, or `ScoreDocument` references.

