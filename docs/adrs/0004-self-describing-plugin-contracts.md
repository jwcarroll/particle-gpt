# ADR-0004: Self-describing and versioned plugin contracts

- Status: Proposed
- Date: 2026-09-04

## Context

Force and shader registries provide stable IDs and state snapshots, but adding a plugin still requires edits throughout `main.ts` and `WebGLRenderer`. Plugin state has no runtime schema or version, UI controls are hand-authored, and effects are not true renderer extensions.

The existing global-force contract also cannot represent a field that varies by particle, which makes the current radial implementation act on the swarm centroid.

## Decision

Evolve plugins into self-describing, versioned domain extensions without introducing runtime third-party code loading.

Every plugin declares:

- stable `id`, human label, kind, and `schemaVersion`;
- defaults and runtime state validator;
- control descriptors including labels, units, ranges, steps, grouping, and conditional visibility;
- determinism metadata and seed requirements;
- required renderer or simulation capabilities;
- snapshot migration functions for supported older versions.

Force plugins declare one evaluation mode:

- `uniform`: one acceleration vector per simulation step, suitable for gravity and wind;
- `perParticle`: acceleration evaluated against a read-only particle view, suitable for attractors, repulsors, and vortices.

Effect plugins initially remain data-driven inputs to a known renderer effect catalog. Arbitrary shader-source injection is out of scope. A later ADR may define composable render passes if needed.

## Consequences

- Common controls and persistence can be generated from plugin metadata.
- Imported state can be validated and migrated.
- Per-particle forces cost more CPU; registries and benchmarks must expose that evaluation mode.
- WebGL still owns trusted shader implementations, but effect discovery and state wiring become declarative.
- Stable plugin IDs and schema versions become public persistence contracts.

## Implementation notes

- Separate serializable state from runtime caches such as wind RNG progression when deciding what constitutes a preset versus an exact replay snapshot.
- Use discriminated TypeScript unions for control descriptors and force evaluation modes.
- Keep registry iteration allocation-free in hot paths by compiling active plugin lists when state changes.
- Generate UI through an adapter so plugin packages do not depend on Tweakpane.

## Validation

- Duplicate IDs and invalid defaults fail during registration with actionable messages.
- A plugin can generate controls without concrete `instanceof` checks in the application shell.
- Snapshot import validates kind, ID, and schema version before applying state.
- Uniform and per-particle force tests confirm units, disabled behavior, and deterministic output.
- Adding a built-in plugin does not require editing the application composition root beyond catalog registration.
