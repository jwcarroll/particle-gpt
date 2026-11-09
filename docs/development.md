# Development and validation

## Setup

Prerequisite: Node.js 24 or later with npm. `.nvmrc` selects Node 24 for compatible version managers.

```bash
npm install
npm run dev
```

The development server uses `http://localhost:3000` and is configured to open a browser.

## Existing commands

| Command                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Start the Vite development server                             |
| `npm test`             | Run the TypeScript unit and characterization tests once       |
| `npm run test:watch`   | Rerun the TypeScript tests as files change                    |
| `npm run lint`         | Lint TypeScript and configuration with ESLint; warnings fail  |
| `npm run format`       | Apply the Prettier formatting baseline                        |
| `npm run format:check` | Verify Prettier formatting without changing files             |
| `npm run check`        | Run the local CI gate: lint, format check, tests, and build   |
| `npm run build`        | Run strict TypeScript checking and create a production bundle |
| `npm run preview`      | Serve the production bundle locally                           |

GitHub Actions runs `npm ci` followed by `npm run check` on every push and pull request with Node 24. A separate Chromium job runs `npm run test:browser` against an optimized test build. Install the browser with `npx playwright install chromium` (CI uses `--with-deps`). Test-only fixture APIs are excluded from production bundles.

## Browser and profiling commands

- `npm run test:browser`: Playwright builds `dist-test`, starts Vite preview through global setup, tests, and closes the server in teardown. In-process server lifetime avoids Windows process-tree shutdown hangs.
- `npm run profile -- profile-name`: five matched production-optimized profiling runs with JSON evidence under `docs/evidence`.
- Optional `PLAYWRIGHT_BROWSERS_PATH` selects a stable browser cache when the execution host provides a different user profile per command. It must match during install and execution.
- Test screenshots are written under ignored `test-results`; visual acceptance uses deterministic fixtures and pixel tolerances, not cross-OS golden images.

## Browser and profiling commands

- `npm run test:browser`: Playwright builds `dist-test`, starts Vite preview in global setup, tests, and closes the server during teardown. In-process server lifetime avoids Windows process-tree shutdown hangs.
- `npm run profile -- profile-name`: five matched optimized profiling runs with JSON evidence under `docs/evidence`.
- Optional `PLAYWRIGHT_BROWSERS_PATH` selects a stable browser cache when the host provides a different user profile per command. Use the same value during installation and execution.
- Screenshots are written under ignored `test-results`; renderer assertions use deterministic fixtures and pixel tolerances rather than cross-OS golden images.

## Change workflow

1. Read `AGENTS.md` and the task-specific document from `docs/`.
2. Inspect the working tree and preserve unrelated changes.
3. Identify whether the change affects simulation semantics, rendering parity, persisted data, or benchmark comparability.
4. Make the smallest coherent change. Add tests around a domain seam before expanding the implementation.
5. Run `npm run check` and the relevant checks below.
6. Update documentation and ADR status when the implemented behavior changes a documented contract.
7. Report commands run, results, untested surfaces, and remaining risks.

Commits and releases must follow [versioning.md](versioning.md). Use Conventional Commit subjects for every commit and keep `package.json`, `package-lock.json`, and release tags aligned with the chosen Semantic Version.

## Validation matrix

| Change area                         | Required checks                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Vector, particle, clock, population | Unit tests with deterministic inputs; boundary values; zero and large deltas                                           |
| Forces                              | Unit tests for disabled state, units, direction, reset, snapshot/restore, and deterministic seeds                      |
| Collisions                          | Head-on, separating, exact overlap, boundary contact, dense cells, and high-speed tunneling characterization           |
| Canvas renderer                     | Visual smoke test, alpha restoration, resize, high-DPI output, and zero-particle frame                                 |
| WebGL renderer/effects              | Capability fallback, compile/link failure, context loss, resize, high-DPI output, 0/1/max particles, and visual parity |
| Plugin contracts                    | Runtime state validation, duplicate IDs, schema versioning, generated controls, persistence round trip                 |
| Benchmarks                          | Exact starting population, warmup isolation, cancellation, restoration, manifest completeness, and mismatch rejection  |
| UI/layout                           | Desktop and 390px-wide viewport, keyboard access, inspector collapse, readable contrast, and reduced motion            |
| Storage/import                      | Valid data, malformed JSON, wrong schema/version, duplicates, quota failure, and migration behavior                    |

## Performance discipline

- Benchmark release builds, not development builds.
- Keep the browser tab foregrounded and record the full run manifest.
- Warm up before measuring and use multiple runs when deciding whether a change is significant.
- Avoid allocations inside particle, collision, and renderer loops unless measurements justify them.
- Compare only results that satisfy the compatibility policy in [benchmarking.md](benchmarking.md).
- Treat a single local FPS number as diagnostic evidence, not a universal claim.

## Dependency changes

The accidental `particle-gpt: file:` self-dependency has been removed. The repository remains several major Vite releases behind, and `npm audit` currently reports vulnerabilities through that toolchain. Upgrade major tooling as a separate work package, reading the relevant migration guides and rebuilding after each step. Do not mix a tooling migration with physics or benchmark semantic changes unless necessary.

## Generated and persistent data

- Do not edit `dist/`; it is generated by Vite and ignored by Git.
- Benchmark history is stored in browser `localStorage` under `benchmark_results`.
- Treat imported benchmark JSON as untrusted input. Validate it before state restoration or comparison.
