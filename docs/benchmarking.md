# Benchmarking contract

## Lifecycle and workload

Built-in scenarios are Standard (1,000), Stress (5,000), Collision (500), and Ramp (100 to 30,000), all seeded with 1337. Scenario definitions are version 2. Warmup is excluded from samples; every scenario's duration bounds measurement time after warmup. The ramp has one second warmup plus at most 60 seconds measurement and a one-second sustained drop window below 58 FPS. The 20 ms dropped-frame threshold remains a fixed diagnostic threshold.

Start captures exact world/particle/RNG, force/effect runtime, clock, pause, and presentation state. It resets seeded population, applies the force/effect preset, suppresses trails/arrows, and locks workload controls. Fields, emitters, palette, world distribution, and plugin settings remain part of the recorded workload. Thus emitter-limited populations may time out instead of reaching the ramp ceiling.

Completion, cancellation, invalidation, preflight failure, and result-generation failure restore captured state. Clock restoration resets the wall-time anchor. Resize/DPR changes invalidate first, then reconcile current surface dimensions. WebGL context loss, hidden documents, clamped wall time, and sustained overload invalidate runs. Cancel is always available; duplicate starts are ignored.

Completed results distinguish ordinary completion, an observed FPS limit, and a population ceiling (displayed as “at least”). Timeout, cancelled, invalid, and zero-sample runs cannot become saved baselines. Starting a run clears stale last-result eligibility.

## Manifest schema 2 and history

New manifests include exact color configuration (solid, ordered uniformly sampled palette, or continuous hue), field/emitter instances, presentation settings, plugin schema/evaluation mode, renderer/surface/DPR, clock settings, seed/distribution, scenario definition, thresholds, sample quality, and build identity. Custom color callbacks without serializable policy fail benchmark preflight.

Compatibility uses canonical serialization and an FNV-1a fingerprint. Build version/revision and quality are excluded; workload changes are not. Comparison computes field differences and rejects incompatible manifests. Results remain diagnostic, not universal device scores. Renderer timing measures CPU submission rather than GPU completion.

Schema-1 records remain unchanged, readable, deletable, and exportable as legacy history, but cannot serve as comparison baselines. Missing palette metadata is never invented. Unknown schemas, invalid nested values, unknown plugin versions/IDs, or fingerprint mismatches reject the entire import before storage changes. Mixed legacy/current exports round-trip. Save/import failures report “in memory only”; JSON export remains available.

Browser storage key remains `benchmark_results`. History displays complete raw workload/results under expandable details, with per-record deletion. Local presets use a separate key.

## Performance investigation

`npm run profile -- profile-name` builds the optimized test bundle and runs five matched Direct Canvas2D workloads: 5,000 seeded particles, 1280×720 logical surface, DPR 1, 120 warmup callbacks and 180 measured callbacks per run. Application animation is suspended during the profiling loop. The harness reports median update/render CPU durations and p95 callback intervals; it is deliberately separate from user-facing benchmark scoring. Evidence includes the workload manifest. Keep the test window foregrounded and avoid concurrent workloads.

See `evidence/profile-before.json`, `evidence/profile-after.json`, and `implementation-status.md`. Do not infer FPS improvement from reduced CPU time when display cadence is unchanged. CI rendering is correctness evidence, not a hardware-performance comparison.
