# Particle GPT agent guide

This repository is an interactive 2D particle-simulation laboratory built with TypeScript, Vite, Canvas 2D, WebGL 1, and Tweakpane. Treat it as both a simulation engine and a visual instrument: correctness, reproducibility, renderer parity, and interaction quality all matter.

## Read progressively

Do not load every document by default. Start here, then open only what the task requires:

1. [docs/README.md](docs/README.md) — documentation map and source-of-truth rules.
2. [docs/architecture.md](docs/architecture.md) — current runtime topology, data flow, and invariants.
3. [docs/development.md](docs/development.md) — commands, change workflow, and validation matrix.
4. [docs/benchmarking.md](docs/benchmarking.md) — benchmark semantics and comparability rules.
5. [docs/versioning.md](docs/versioning.md) — Semantic Versioning and Conventional Commits policy.
6. [docs/improvement-spec.html](docs/improvement-spec.html) — complete modernization specification and delivery plan.
7. [docs/adrs/README.md](docs/adrs/README.md) — proposed architectural decisions.

If prose and code disagree about current behavior, the code is authoritative. If an accepted ADR and an implementation plan disagree about intended behavior, the accepted ADR is authoritative.

## Quick commands

```bash
npm install
npm run dev
npm test
npm run test:watch
npm run lint
npm run format:check
npm run check
npm run build
npm run preview
```

The development server is configured for port 3000 and opens a browser. `npm run check` is the local CI gate: lint, formatting, unit tests, then strict TypeScript compilation and a Vite production build. The supported runtime is Node.js 24 or later, declared in `package.json` and `.nvmrc`. Release Please runs on `main` and turns Conventional Commits into reviewable release PRs, version tags, and GitHub releases; see `docs/versioning.md` before changing release files.

`npm test` runs the Node-based TypeScript domain and benchmark tests once. `npm run test:watch` reruns them while files change. `npm run lint` rejects warnings, and `npm run format:check` verifies Prettier formatting. GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests. Browser tests are not yet automated.

## Repository map

- `src/main.ts` — composition root, animation loop, renderer selection, and all Tweakpane controls.
- `src/SimulationClock.ts` — fixed-step scheduling, interpolation timing, stall handling, and clock diagnostics.
- `src/simulator.ts` — `World`, particle lifecycle, force integration, boundaries, and particle collisions.
- `src/particle.ts`, `src/vector.ts`, `src/force.ts` — core domain primitives.
- `src/random.ts` — random-source contract and seeded generator used for reproducible resets.
- `src/forces/` — force plugin contracts, registry, and gravity/wind/radial implementations.
- `src/renderers/` — renderer interface plus double-buffered Canvas 2D, direct Canvas 2D, and instanced WebGL implementations.
- `src/shaders/` — effect state plugins and registry; WebGL shader composition remains centralized in `WebGLRenderer`.
- `src/benchmark/` — scenarios, runner, metrics, persistence, comparison, and Tweakpane UI.
- `src/style.css` — full-screen canvas and global page styles.
- `docs/adrs/` — decision records. Proposed records describe intended direction, not completed behavior.

## Current invariants

Preserve these unless a task explicitly changes them and updates the relevant ADR/documentation:

- Simulation units are seconds for time and pixels for position/velocity. Force plugins express strengths in meters per second squared and convert using `PIXELS_PER_METER`.
- `SimulationClock` is the only wall-clock boundary. It calls `World.update(1 / 60)` zero or more times per animation callback.
- `World.update(dt)` owns simulation mutation. Renderers consume particles and interpolation alpha but must not mutate them.
- Renderer selection must not change simulation state.
- A benchmark must restore the user's pre-run settings and plugin state when it completes or is stopped.
- Every built-in benchmark begins from its declared seeded population.
- Force and shader plugin IDs are stable persistence keys. Renaming one requires a migration strategy.
- Particle pooling reuses `Particle` and its `velocity` object to reduce allocation pressure.
- `dist/` is generated output and must not be edited by hand.

## Known limitations

Do not accidentally encode these as desired behavior:

- Benchmark runs reset the exact starting population, but do not record a complete run manifest or restore the exact pre-run particle state.
- Interactive clock overload diagnostics exist in code but are not yet exposed in the UI.
- WebGL capability fallback, a shared background/device-pixel-ratio policy, a visible particle cap, normalized opaque particle colors, Canvas2D recovery from context loss, and deterministic parity fixtures now exist. Benchmark-manifest capability reporting remains incomplete.
- “Radial” force currently uses the swarm centroid and returns one uniform force vector for the whole frame.
- Plugin state is registered, but plugin UI and WebGL shader wiring are still manually centralized.

See the specification and proposed ADRs before fixing these, because several require coordinated contract changes rather than isolated patches.

## Working conventions

- Keep changes narrow and preserve unrelated user work.
- Prefer explicit domain APIs (`resetPopulation`, `setTargetPopulation`, clock/manifest objects) over having UI code manipulate arrays or timing details.
- Validate external or imported JSON at runtime; TypeScript casts are not validation.
- Keep simulation logic independent of DOM, Tweakpane, and browser storage so it can be unit tested.
- Avoid per-frame allocations in hot paths. Measure before and after performance-oriented changes.
- Do not compare benchmark results with different run manifests.
- When adding a plugin, document its ID, units, defaults, state shape, determinism, and renderer/UI requirements.
- Update documentation in the same change when behavior, commands, persisted formats, architecture, or validation expectations change.
- Add or supersede an ADR when changing a recorded decision. Do not silently rewrite accepted decisions.

## Validation expectations

Always run:

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Then apply the relevant checks from [docs/development.md](docs/development.md). At minimum, visually inspect Canvas2D and WebGL after renderer or effect work; exercise start, completion, cancellation, and restoration after benchmark work; and test a small and a high-DPI viewport after layout or canvas sizing work.

In the final handoff, state exactly what was run, what passed, what was not run, and any remaining behavioral uncertainty.
