# Changelog

All notable changes to Particle GPT are recorded here. Releases follow Semantic Versioning and commits follow Conventional Commits.

## [Unreleased]

### Added

- ESLint and Prettier checks, a Node 24 support declaration, and GitHub Actions validation on pushes and pull requests.
- Lazy WebGL renderer capability negotiation with Canvas2D fallback and a visible initialization status.
- Shared opaque renderer background and device-pixel-ratio-aware backing buffers.
- Visible WebGL particle capacity to prevent silently truncated rendering workloads.
- Opaque particle-color normalization, removing per-particle WebGL color parsing and rejecting ambiguous transparent colors.
- Canvas2D fallback when the active WebGL context is lost, without resetting simulation state.

## [2.1.0] - 2026-09-04

### Added

- Fixed 60 Hz simulation clock with bounded catch-up, interpolation, pause/resume, and overload diagnostics.
- Seeded particle generation and explicit population reset, target, trim, and particles-per-second emission APIs.
- Deterministic domain and benchmark test harness.
- Progressive LLM documentation, architecture notes, improvement specification, and ADR library.

### Changed

- Benchmark scenarios now start from exact seeded populations and restore through one cleanup path.
- Benchmark ramp emission and sustained FPS detection now use elapsed time instead of rendered-frame counts.
- Active benchmarks are invalidated when visibility or clock integrity is compromised.

### Removed

- Accidental package self-dependency and ambiguous minimum-population setting.
