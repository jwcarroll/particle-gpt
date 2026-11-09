# Laboratory delivery and acceptance

Implementation date: 2026-11-08. This delivery implements the seven planned milestones. GitHub publication was approved on 2026-11-09; deployment and release publication remain separate actions.

## Delivered behavior

| Milestone                        | Implemented result                                                                                                                             | Evidence                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Simulation/inspector correctness | Active-radius collision grid; narrow control writes; authoritative refresh without clobbering active edits                                     | Domain collision cases and browser resize/edit regression                                               |
| Benchmark lifecycle              | Edit locking, cancel, deadline, distinct completed outcomes, exact world/plugin/clock/pause restoration, resize/DPR/context invalidation       | Unit restoration/preflight/timeout checks and browser start/complete/cancel/resize/context-loss checks  |
| Workload/history                 | Schema 2 colors, fields, presentation, plugin versions/evaluation; schema 1 retained as history; atomic imports and visible persistence errors | Palette mismatch, mixed history round-trip, quota/unknown-schema tests; real browser persistence/export |
| Browser coverage                 | Chromium production-optimized test build; test-only fixture seam omitted from normal production; separate CI job                               | 10 browser cases, including deterministic renderer pixel comparisons                                    |
| Plugin contracts                 | Generated controls, validated state and snapshots, uniform/per-particle dispatch, legacy radial migration, catalog-based effect uniforms       | Registry atomicity, RNG restoration, scene migration and force-direction tests                          |
| Visual laboratory                | Transport/seed/diagnostics; desktop inspector/mobile sheet; presets and URL/JSON sharing; field/emitter tools; trails/arrows; PNG              | Browser keyboard/mobile/share/capture tests and inspected desktop/mobile screenshots                    |
| Performance                      | Cached enabled force lists and reusable aggregate outputs eliminate per-particle registry snapshot work                                        | Five matched before/after browser runs under identical workload fingerprints                            |

## Validation

- Unit tests: 45 passed, including collision characterization, deterministic reset, emitter behavior, scene validation, plugin restoration, and benchmark/history cases.
- Browser tests: 10 passed in Chromium on Windows. WebGL was available; parity and context-loss cases actually ran rather than skipping.
- Browser conditions: 1280×800 desktop; 390×844 and 360×844 at DPR 2; reduced motion; keyboard transport/focus; 0/1/50,000 WebGL particles; all built-in effects enabled.
- Visual inspection: Canvas2D mobile and WebGL desktop/effects screenshots under ignored `test-results`.
- Native 200% browser zoom: **not verified**. Computer-use app approval timed out before native browser interaction. DPR emulation is not treated as proof of browser zoom.
- Real GPU hardware identity and cross-browser performance were not established. Chromium results do not claim universal GPU performance.
- `npm run check` passed: lint, formatting, 45 unit tests, TypeScript, and production build. `npm run test:browser` passed all 10 cases. A subsequent stronger foreground-pixel parity assertion also passed its targeted browser rerun. `git diff --check` passed; the normal production bundle contains no test entrypoint. Hosted GitHub Actions execution has not been observed in this session.

## Performance evidence

Both JSON files carry fingerprint `fnv1a-a15366bb`, with no workload differences. They contain five runs each: Direct Canvas2D, 5,000 seeded particles, 1280×720 logical surface, DPR 1, 120 warmup callbacks and 180 measured callbacks per run.

| Metric                               | Before       | After        |
| ------------------------------------ | ------------ | ------------ |
| Per-run median update CPU time       | 1.2–1.3 ms   | 0.6–0.7 ms   |
| Median of update medians             | 1.3 ms       | 0.7 ms       |
| Per-run median render CPU submission | 1.2–1.5 ms   | 0.9–1.3 ms   |
| p95 callback interval                | 16.7–16.8 ms | 16.7–16.8 ms |

The update reduction exceeds the observed run-to-run variation in this local workload. Frame cadence did not improve. Do not attribute all render-time variation to the force-cache change. Canvas grouping allocations, collision buckets, and centroid passes remain future profiling targets; they were not changed speculatively.

## Remaining limits and release handling

Discrete high-speed collision tunneling is characterized, not fixed. Trails are bounded/sampled; arrows show placed fields and do not mutate wind RNG. WebGL fallback remains session-long. Video, remote plugins, backend hosting, GPU timer queries, and major toolchain upgrades remain outside this delivery.

Dependency installation reported 17 audit findings (11 moderate, 6 high). No broad dependency upgrade or automatic audit fix was performed; toolchain modernization remains a separate change.

The persisted-format/plugin-contract changes require explicit breaking-change release notes under repository policy. Use Conventional Commits and Release Please; do not manually edit release versions or tags. See ADR-0006 and the plugin/benchmark contracts. Old benchmark records remain unchanged and exportable, but their comparisons are intentionally disabled.
