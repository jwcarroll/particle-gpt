# ADR-0002: Explicit particle population lifecycle

- Status: Accepted
- Date: 2026-09-04
- Implementation: Implemented — exact seeded reset, target, trim, particles-per-second emission, and benchmark adoption are available through explicit `World` APIs.

## Context

`WorldSettings` exposes minimum and maximum particle counts plus `spawnRate`, but the implementation only adds up to `maxParticleCount`. It never enforces the minimum as a distinct concept or trims excess particles. `spawnRate` is particles per update rather than particles per second.

This ambiguity affects the interactive controls and invalidates benchmark scenarios that assume an exact starting population.

## Decision

Replace ambiguous range behavior with explicit population and emission operations.

- `resetPopulation(count, options)` removes all active particles through the pool, resets deterministic counters, and creates exactly `count` initialized particles.
- `setTargetPopulation(count)` defines a steady-state target for replenishment.
- `setEmissionRate(particlesPerSecond)` defines time-based creation toward the target using a fractional accumulator.
- `trimPopulation(count, policy)` provides explicit shrinking. Initial policies are `oldest-first` and `immediate-arbitrary`; the benchmark path uses immediate deterministic trimming or a full reset.
- If a variable target range remains a product feature, it must have named semantics independent of these APIs. Otherwise remove `minParticleCount`.
- Validate counts and rates as finite, non-negative values with documented upper bounds.

## Consequences

- UI labels match runtime behavior.
- Benchmarks can guarantee their initial workload.
- Emission becomes independent of render cadence when used with the simulation clock.
- A reset intentionally changes the visual scene and pool sizes; callers must choose it rather than receiving hidden trimming behavior.

## Implementation notes

- Reuse pooled `Particle` instances and velocity objects during resets.
- Introduce an injectable seeded random source before claiming exact cross-run reproducibility.
- Keep direct array mutation inside `World`; UI and benchmark code should call domain methods.
- Decide whether reset preserves or clears elapsed plugin time and record that choice in tests.

## Validation

- Resetting from 5,000 to 500 particles yields exactly 500 before the next render.
- Emitting 120 particles per second for one simulated second creates 120 particles at both 60 Hz and 144 Hz render cadence, subject to the target.
- Negative, non-finite, and over-limit values are rejected or normalized consistently.
- Reset and trim return removed particles to the pool without duplicating references.
- Every built-in benchmark begins with its declared population regardless of prior application state.
