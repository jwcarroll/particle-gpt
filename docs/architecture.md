# Architecture and runtime model

Particle GPT is a local browser laboratory. The canvas is the primary workspace; the inspector is a view of domain state, not a second owner of simulation settings.

## Runtime topology

`main.ts` assembles the world, plugin catalog, simulation controller, renderer manager, benchmark module, inspector, shell, and presentation layer. The shell owns transport, scene import/export, local presets, sharing, field placement, and capture. The inspector generates plugin bindings from catalog metadata and submits narrow setting updates.

- `World` owns active/pooled particles, emission, fields, colors, seeded random generation, and elapsed simulation time. Positions/radii are pixels; velocity is pixels/second. Forces use m/s² converted at 100 pixels/meter.

- `SimulationController` owns play/pause, seed, presentation settings, fit-to-window policy, and benchmark edit locking. Reset preserves configuration and play/pause state. Step pauses and advances exactly one fixed tick.

- `SimulationClock` remains the simulation wall-clock boundary: 60 Hz updates, 100 ms clamp, eight-step catch-up bound. Paused presentation does not advance. Exact clock restoration discards the benchmark's wall-time anchor.

- `RendererManager` lazily negotiates WebGL 1/ANGLE instancing and falls back to Canvas2D on context loss. Shared surfaces define logical dimensions, DPR, and background. Renderer selection never mutates particles.

- `Presentation` draws optional trails, field markers, and field arrows in a separate canvas. Sampling is pure. Trails retain at most 30 points for at most 1,000 deterministically selected particles; arrows use a 64px logical grid.

- Force registries compile enabled uniform/per-particle lists after configuration changes. Returned aggregate vectors are borrowed scratch values: consume immediately, do not retain. Exact runtime snapshots include wind RNG/gust state; scene presets do not.

- Effects remain trusted built-in GLSL. Uniform names follow the catalog convention `u_fx` + capitalized plugin ID + capitalized state key. The renderer has no concrete effect-class checks. New shader algorithms still require a trusted GLSL implementation.

## Frame lifecycle

The clock advances zero or more fixed world updates, then the active renderer consumes interpolated particles and simulation time. The presentation layer draws without domain mutation. Benchmark timing records update and renderer CPU submission duration; renderer timing is not GPU completion time. Capture copies the just-drawn canvases without stepping physics. Diagnostics refresh four times per second and avoid refreshing an actively edited inspector.

Resizing invalidates a benchmark before changing the surface. Fit-to-window scenes update logical bounds; shared/imported scenes retain logical dimensions and scale their presentation until Fit to window is explicitly selected. Visibility loss pauses the clock and invalidates active benchmarks.

## Scene and field contracts

Scene schema 1 contains seed, logical world settings, color policy, versioned plugin configuration, field/emitter instances, and presentation settings. All input is validated before application. Shared URLs use an encoded JSON fragment, capped at 16 KiB; larger scenes use JSON export. Imports are capped at 1 MiB. Local presets use `particle_scenes_v1`.

Fields have stable instance IDs, position, kind, strength, and falloff. Positive attractor strength pulls toward the center; repulsor reverses that direction; vortex rotates the direction by 90 degrees. Negative strength reverses the result. Distance is converted to meters, falloff is capped at 10, and the exact center has zero acceleration. Emitters use seeded position/direction generation and per-emitter fractional emission, processed in stored order under the global cap. Emitters replace uniform replenishment when present; initial seeded reset still creates the declared population.

The stable `radial` plugin ID uses schema 2 with `uniform` (legacy centroid) and `perParticle` evaluation. New scenes default to per-particle. Version-1 scene plugin configuration migrates explicitly to uniform behavior. Old benchmark records are never rewritten.

## Current limits

Discrete collision detection can tunnel at high speed; it is characterized rather than solved. Grid cells use the largest active radius, including particles spawned before a radius-setting change. The 50,000-particle cap remains explicit. Canvas color grouping and collision buckets still allocate; those optimizations require separate measurements. WebGL context loss falls back for the session rather than attempting recovery. No remote code loading, backend, video recording, or GPU timing queries are introduced.
