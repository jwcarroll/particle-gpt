# ADR-0005: Versioned benchmark run manifest

- Status: Proposed
- Date: 2026-09-04

## Context

Current benchmark results contain scenario, aggregate statistics, and limited browser environment information. They do not identify the renderer, surface dimensions, complete force/effect state, clock settings, seed, or code revision. The UI can compare any saved runs without checking whether the workloads were equivalent.

This creates precise-looking but potentially misleading verdicts.

## Decision

Persist a versioned, immutable `BenchmarkRunManifest` with every result and derive a compatibility fingerprint from workload-defining fields.

- Manifest schema starts at version 1 and is validated at runtime during import.
- Results embed or reference the exact scenario definition used, including a scenario version.
- The manifest contains the fields listed in `docs/benchmarking.md`, including renderer, render surface, clock, population, seed, forces, effects, thresholds, environment, and build identity.
- A canonical serialization of compatibility-relevant fields is hashed or stored as a fingerprint.
- The normal comparison path requires matching fingerprints except for explicitly excluded identity fields and the code revision under test.
- Mismatch errors list human-readable differing fields.
- Benchmark completion and cancellation use a single cleanup/finalization mechanism; incomplete runs are not stored as completed results.

## Consequences

- Saved baselines are self-explanatory and portable.
- Old imports require schema migration or remain view-only.
- Results become larger, but expected storage volume remains small.
- The UI must expose configuration differences instead of only a verdict.
- Code revision comparison requires deliberately excluding revision from compatibility while keeping all workload fields equal.

## Implementation notes

- Prefer a canonical JSON serializer or a stable field projection before hashing.
- Do not include timestamps, labels, result IDs, or measured statistics in the compatibility fingerprint.
- Capture both logical viewport and physical backing-buffer dimensions.
- Record visibility changes, dropped simulation time, and sample count as quality signals.
- Reject or quarantine imported values that are non-finite, out of bounds, or from unknown plugin schemas.

## Validation

- Export and import preserve every manifest field.
- Same workload with different labels or timestamps is comparable.
- Different renderer, viewport, DPR, collision state, clock configuration, seed, or plugin state is rejected by default.
- The UI shows exactly which fields differ.
- Malformed or unsupported manifests do not mutate application or saved-result state.
- Cancelled and zero-sample runs cannot appear as valid completed baselines.
