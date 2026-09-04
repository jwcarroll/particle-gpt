# Architecture and runtime model

## Purpose

Particle GPT is a browser-based 2D particle laboratory. It combines an interactive simulation, multiple rendering backends, configurable forces and effects, and an in-browser benchmark harness.

## Current topology

```text
index.html
  └─ src/main.ts (composition root + UI + animation loop)
       ├─ World
       │    ├─ Particle[] activeParticles
       │    ├─ Particle[] particlePool
       │    ├─ injectable random source
       │    ├─ legacy named Force values
       │    └─ ForceRegistry provider
       ├─ RendererManager (lazy capability negotiation)
       │    ├─ Canvas2DRenderer (OffscreenCanvas copy)
       │    ├─ DirectCanvas2DRenderer
       │    └─ WebGLRenderer (WebGL 1 + ANGLE instancing)
       ├─ ShaderRegistry (effect state)
       ├─ ForceRegistry (force state + net vector)
       ├─ BenchmarkModule
       ├─ SimulationClock (fixed 60 Hz physics + diagnostics)
       └─ Tweakpane controls
```

`main.ts` currently assembles every concrete plugin and owns all of their UI bindings. The registries provide state lookup, snapshots, and restoration, but they do not yet provide automatic UI or shader composition.

## Frame lifecycle

On each foreground `requestAnimationFrame` callback:

1. `SimulationClock` accumulates bounded foreground wall time.
2. It executes zero or more fixed `1 / 60` second `World.update` steps, up to eight per callback.
3. `World.update` removes dead particles, updates positions and lifetimes, applies force and collision response, and emits particles toward the explicit target using particles-per-second semantics.
4. If physics is not behind, the selected renderer interpolates between each particle's previous and current position using the accumulator remainder.
5. The benchmark module receives measured update and render durations plus particle and pool counts.
6. Tweakpane's FPS graph closes its sample and another frame is requested.

Single foreground deltas are clamped to 100 ms. Backlog is preserved while recoverable, rendering is skipped when physics remains behind, and sustained overload is observable through clock diagnostics. Visibility changes pause the clock and invalidate an active benchmark. See [ADR-0001](adrs/0001-fixed-step-simulation-clock.md).

## State ownership

| State                                | Current owner                 | Notes                                                                |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------------------- |
| Particle position, velocity, age     | `World` / `Particle`          | Mutable hot-path data; pooled after death                            |
| World settings                       | `World`                       | Updated through shallow partial merges                               |
| Physics schedule and simulation time | `SimulationClock`             | Fixed 60 Hz; rendering never advances authoritative time             |
| Particle generation randomness       | `World`                       | Defaults to `Math.random`; seeded during benchmark population resets |
| Legacy uniform forces                | `World`                       | Stored by name; separate from plugin registry                        |
| Plugin state                         | Each plugin instance          | Registry snapshots are shallow object copies                         |
| Renderer resources                   | Concrete renderer             | Renderers must treat particles as read-only                          |
| UI editing state                     | `setupTweakPane` in `main.ts` | Several objects mirror plugin/world state                            |
| Benchmark history                    | `BenchmarkStorage`            | JSON in browser `localStorage`                                       |

## Simulation contracts

- Time values passed to the domain are seconds.
- Population replenishment uses `emissionRate` particles per simulated second toward `maxParticleCount`, which is the explicit target.
- Positions and radii are pixels; velocities are pixels per second.
- Force strengths in the UI are labeled in meters per second squared and multiplied by the shared pixels-per-meter scale.
- Current force plugins produce one net vector per frame. Gravity and wind fit that model. Radial attraction does not: it currently points from the swarm centroid to a configured center, so all particles receive the same acceleration.
- Collision resolution assumes equal mass, uses a spatial hash based on maximum diameter, applies overlap correction, and then applies an impulse along the collision normal.
- Boundary collisions clamp position and reflect the relevant velocity component using elasticity.
- `World.resetPopulation(count, { seed })` validates the count, returns active particles to the pool, resets elapsed world time, and creates exactly the requested seeded population.

## Rendering contracts

`ParticleRenderer` exposes `initialize`, optional `setTime`, `render`, `resize`, and `dispose`.

- Canvas2D renderers draw circles and fade finite-lifespan particles.
- The buffered renderer draws to `OffscreenCanvas` and copies to the visible canvas.
- `RendererManager` creates Canvas2D renderers at startup and probes WebGL only when selected. If WebGL initialization fails, it retains the active Canvas2D renderer and reports the failure reason to the UI.
- `RenderSurfaceConfig` defines logical dimensions, device pixel ratio, and an opaque background. Backing buffers scale by device pixel ratio while simulation and particle coordinates remain logical pixels.
- Particles retain their Canvas color string and a normalized opaque RGB value. WebGL uses that stored RGB directly, avoiding per-particle color parsing in the render loop.
- WebGL uses one instanced quad per particle and applies effect uniforms in a single shader program.
- If the browser loses a WebGL context, `RendererManager` marks it unavailable and moves active rendering to buffered Canvas2D; it does not mutate `World` or attempt GPU resource recovery mid-frame.
- `BASE_RENDERER_PARITY_FIXTURE` provides deterministic shared pre-rasterization expectations for surface configuration, interpolation, color, radius, and lifetime opacity. Screenshot-tolerance assertions can build on this fixture when browser-test infrastructure is introduced.
- WebGL silently caps drawing at 50,000 particles.
- Background, color parsing, antialiasing, alpha, and pixel-density behavior are not currently normalized across renderers.

The target parity and fallback policy is recorded in [ADR-0003](adrs/0003-renderer-capabilities-and-parity.md).

## Extensibility boundaries

Force and shader registries already provide stable IDs, registration, listing, snapshotting, and restoration. However:

- force controls are manually created in `main.ts`;
- shader controls are manually created in `main.ts`;
- every shader effect is imported and interpreted directly by `WebGLRenderer`;
- state restoration relies on unchecked casts;
- plugins do not declare units, control metadata, capability requirements, or versioned persistence schemas.

The target contract is recorded in [ADR-0004](adrs/0004-self-describing-plugin-contracts.md).

## Intended module direction

The modernization specification aims to separate:

```text
Application shell
  ├─ SimulationController ── SimulationClock ── World
  ├─ RendererManager ─────── RendererCapabilities + renderers
  ├─ PluginCatalog ───────── self-describing forces/effects
  ├─ BenchmarkController ─── BenchmarkRunManifest + storage
  └─ View adapters ───────── canvas interaction + inspector UI
```

This is a direction, not current implementation. Introduce boundaries only as required by a work package; avoid a large speculative rewrite.
