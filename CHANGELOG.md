# Changelog

All notable changes to Particle GPT are recorded here. Releases follow Semantic Versioning and commits follow Conventional Commits. Release Please maintains release entries from commits merged to `main`.

## [2.2.0](https://github.com/jwcarroll/particle-gpt/compare/v2.1.0...v2.2.0) (2026-09-04)


### Features

* **renderer:** add lazy WebGL fallback ([112ee22](https://github.com/jwcarroll/particle-gpt/commit/112ee220ee42d7a7ee1039062705bf76516b3eb6))
* **renderer:** add parity fixtures ([80a0d75](https://github.com/jwcarroll/particle-gpt/commit/80a0d75fa72db81ca01b5ba10126a5e80be53c2e))
* **renderer:** add shared high-dpi surface ([9e8af92](https://github.com/jwcarroll/particle-gpt/commit/9e8af9217bbe03b9c1218a4878957970a3af9a75))
* **renderer:** expose WebGL particle capacity ([6cf8eb7](https://github.com/jwcarroll/particle-gpt/commit/6cf8eb7be5e45f94edc103fb029d46b686714c59))
* **renderer:** normalize particle colors ([f5dc895](https://github.com/jwcarroll/particle-gpt/commit/f5dc895a147bd99c39cddf9a5df889ea4d80c23f))
* **renderer:** recover from WebGL context loss ([222373b](https://github.com/jwcarroll/particle-gpt/commit/222373b36d623aff0618360c6df943888a19465f))

## [Unreleased]

### Added

- ESLint and Prettier checks, a Node 24 support declaration, and GitHub Actions validation on pushes and pull requests.
- Lazy WebGL renderer capability negotiation with Canvas2D fallback and a visible initialization status.
- Shared opaque renderer background and device-pixel-ratio-aware backing buffers.
- Visible WebGL particle capacity to prevent silently truncated rendering workloads.
- Opaque particle-color normalization, removing per-particle WebGL color parsing and rejecting ambiguous transparent colors.
- Canvas2D fallback when the active WebGL context is lost, without resetting simulation state.
- Deterministic renderer-parity fixtures and shared lifetime-alpha behavior with effects disabled.

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
