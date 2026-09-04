# Benchmarking contract

## Purpose

The benchmark subsystem should answer whether a specific code or configuration change improves performance under a reproducible workload. It is not a general device score and must not compare unlike runs.

## Current scenarios

| ID          | Intent                         | Nominal population | Collisions |  Seed |
| ----------- | ------------------------------ | -----------------: | ---------- | ----: |
| `standard`  | Baseline rendering/update load |              1,000 | Off        | 1,337 |
| `stress`    | Higher particle count          |              5,000 | Off        | 1,337 |
| `collision` | Dense collision workload       |                500 | On         | 1,337 |
| `ramp`      | Find approximate 60 FPS limit  |       100 → 30,000 | Off        | 1,337 |

The current implementation applies gravity-only, disables all WebGL effects except age alpha, resets to the scenario's exact seeded starting population before warmup, and ramps at 3,000 particles per simulated second.

## Current validity limits

- The manifest records renderer identity/capability, surface dimensions and DPR, clock configuration, seeded workload, complete plugin snapshots, and build identity. Comparisons reject workload differences by default and list the differing fields.
- The fixed 20 ms dropped-frame threshold does not yet adapt to the display refresh context.
- Built-in plugin snapshots use manifest schema version 1 until Phase 4 makes plugin schemas self-describing. Unknown or malformed imported manifests are rejected rather than partially applied.
- A local build without `VITE_GIT_SHA` records its revision as `development`; configure that build variable for commit-level benchmark provenance.

An active run is invalidated and restored if the document becomes hidden, the clock clamps wall time, or sustained physics overload is detected. Invalidated runs are not returned as completed results.

Benchmark results remain diagnostic measurements rather than universal device scores, but saved baselines now preserve their workload definition and cannot silently compare unlike runs.

## Target lifecycle

1. Capture the user's complete restorable world, force, shader, and random-source state.
2. Resolve and validate a benchmark scenario.
3. Create an immutable `BenchmarkRunManifest`.
4. Reset the simulation using the scenario seed and exact starting population.
5. Apply scenario force/effect/background/renderer settings.
6. Warm up without recording samples.
7. Record time-based samples and progress.
8. Complete or cancel through the same cleanup path.
9. Restore the user's state exactly, including particle positions, velocities, age, and interpolation state.
10. Persist the result and manifest together.

## Required run manifest

At minimum, persist:

- schema version, result ID, timestamp, and user label;
- app version plus Git commit/build identifier when available;
- scenario ID and scenario definition version;
- renderer ID and renderer capability/version information;
- CSS viewport, backing-buffer dimensions, device pixel ratio, and detected refresh context;
- user agent and hardware concurrency;
- simulation clock configuration and pixels-per-meter scale;
- exact initial population, particle distribution settings, collision settings, and random seed;
- complete force and effect snapshots with plugin schema versions;
- warmup duration, measurement duration, thresholds, and sample count.

See [ADR-0005](adrs/0005-versioned-benchmark-run-manifest.md).

## Comparison policy

Runs are automatically comparable only when their compatibility fingerprints match. The fingerprint should cover every manifest field that materially changes workload or timing, excluding result ID, timestamp, label, and the code revision intentionally being compared.

If fingerprints differ, the UI must:

1. refuse the comparison by default;
2. list the differing fields;
3. permit an explicitly labeled exploratory comparison only if the product chooses to support it.

Do not collapse multiple metrics into a verdict without showing the underlying values and sample quality. A practical first pass may retain the current 5% threshold, but it should include run-to-run variance before calling changes significant.

## Acceptance checks

- Every scenario starts at its declared population regardless of prior UI state.
- Cancel and complete restore the same exact world, force, shader, and random-source state.
- Ramp progression and its one-second failure window are based on simulated emission and elapsed milliseconds, not rendered-frame count.
- A run with zero measured frames fails visibly instead of being stored as a valid result.
- Import validates schema version, fingerprint integrity, and nested JSON fields before saving any result.
- Incompatible runs are not silently compared.
- Exported JSON can be imported and round-tripped without information loss.
