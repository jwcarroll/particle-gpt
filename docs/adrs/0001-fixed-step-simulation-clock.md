# ADR-0001: Fixed-step simulation clock with independent rendering

- Status: Accepted
- Date: 2026-09-04
- Implementation: Partial — the fixed clock, interpolation, visibility pause, diagnostics, render skipping, and benchmark invalidation are implemented; interactive overload presentation and manifest persistence remain pending.

## Context

The animation loop currently passes the full time since the previous `requestAnimationFrame` callback directly to `World.update(dt)`. This is a variable-timestep simulation.

The current approach is already time-based: at a constant velocity, multiplying by elapsed seconds makes `100 px/s` average roughly 100 pixels per wall-clock second. However, the size and number of physics calculations depend on rendering performance. At lower frame rates, each update covers a larger interval. The total distance remains approximately correct, but movement appears to jump and numerical behavior becomes less consistent. Large steps also make acceleration less accurate and increase the chance of particles crossing boundaries or one another between collision checks.

Returning to a suspended tab can produce an especially large step that moves particles through geometry, skips collisions, and expires lifetimes abruptly.

Benchmark ramp behavior also uses rendered frames as a proxy for elapsed time. This makes the workload depend on the performance being measured.

Two time guarantees must be distinguished:

- **Simulation-time fidelity:** `100 px/s` means 100 pixels per simulation second, independent of rendering frame rate and hardware.
- **Real-time fidelity:** one simulation second tracks one wall-clock second while the device can sustain the configured physics rate.

No system can guarantee accurate real-time physics, bounded CPU usage, and smooth rendering when the available hardware cannot calculate the required physics workload. Overload must therefore be detected and handled explicitly.

## Decision

Introduce a `SimulationClock` that separates a fixed-rate physics loop from the variable-rate rendering loop.

### Physics clock

- Use a fixed simulation step of `1 / 60` seconds initially.
- Advance authoritative `simulationTime` only when a fixed physics step is executed.
- Pass only the fixed step to `World.update`; never pass a rendering-frame delta or network-arrival delta into the world.
- Accumulate foreground wall-clock time and execute zero or more fixed physics steps to catch simulation time up with wall time.
- Evaluate particle lifetime, deterministic forces, collision response, and emission using simulation time.
- Consider a higher rate such as 120 Hz only if collision and numerical-stability tests demonstrate that 60 Hz is insufficient. A higher rate is a deliberate CPU-versus-accuracy decision, not a rendering requirement.

At 60 Hz, a particle with a constant velocity of `100 px/s` moves `100 / 60`, or approximately `1.6667` pixels, during every physics step. After 60 executed steps it has moved approximately 100 pixels regardless of whether rendering ran at 30, 60, 144, or 240 FPS.

### Rendering clock

- Continue requesting render opportunities through `requestAnimationFrame`.
- Rendering may run faster or slower than physics and must not advance authoritative simulation state.
- Retain each particle's previous and current simulated position so the renderer can interpolate between them using the accumulator remainder.
- Calculate render interpolation as `alpha = accumulator / fixedStep`, constrained to the interval from zero to one.
- Derive time-based visual effects from simulation time plus the interpolation remainder unless an effect is explicitly documented as wall-clock-only.
- Accept the one-physics-tick latency introduced by interpolation in exchange for smooth presentation when rendering and physics cadences do not align.

Interpolation smooths rendering between known physics states, particularly when rendering is faster than physics. It cannot make a genuinely overloaded 30 FPS display present 60 unique frames per second.

### Recoverable stalls

- Clamp a single observed foreground wall-clock delta to reject catastrophic discontinuities, initially at `0.1` seconds.
- Execute multiple fixed physics steps after an ordinary slow frame.
- Bound physics work performed in a single animation callback, initially at eight steps, to prevent an unbounded catch-up loop.
- When catch-up work consumes the frame budget, prioritize physics and reduce or skip rendering rather than enlarging the physics step.
- Preserve remaining accumulated foreground time for later catch-up while the stall is considered recoverable.

### Sustained overload

- Detect when the simulation remains behind after the per-callback catch-up budget for a configurable duration or number of callbacks.
- Enter an explicit `overloaded` state instead of silently reporting normal real-time operation.
- Record backlog, skipped renders, clamped wall time, and any discarded simulation time as diagnostics.
- Interactive mode may allow simulation time to fall behind wall time to preserve stable physics. The UI must expose that real-time fidelity has been lost.
- Benchmarks must fail or be marked invalid if wall time is clamped, simulation time is discarded, document visibility changes, or sustained overload occurs.
- Do not enlarge the fixed physics step to hide overload.

This policy guarantees simulation-time fidelity. Real-time fidelity is guaranteed only inside the declared performance envelope. Rendering is the first workload sacrificed during recoverable overload; the application never silently claims that slowed simulation remained real-time.

### Visibility and suspension

- Pause simulation-time advancement while the document is hidden.
- Reset the wall-clock reference and accumulator on resume so hidden time is not replayed as physics.
- Treat visibility changes during a benchmark as an invalidating interruption unless a future scenario explicitly defines different behavior.

## Reference loop

The intended control flow is equivalent to:

```ts
const fixedStep = 1 / 60;
const maxFrameDelta = 0.1;
const maxStepsPerCallback = 8;

let previousWallTime = performance.now();
let accumulator = 0;
let simulationTime = 0;

function animate(now: number) {
  const elapsed = Math.min(Math.max((now - previousWallTime) / 1000, 0), maxFrameDelta);
  previousWallTime = now;
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= fixedStep && steps < maxStepsPerCallback) {
    world.update(fixedStep);
    simulationTime += fixedStep;
    accumulator -= fixedStep;
    steps++;
  }

  const behind = accumulator >= fixedStep;
  clockDiagnostics.observe({ elapsed, steps, accumulator, behind });

  if (!behind || shouldRenderWhileCatchingUp()) {
    const alpha = Math.min(accumulator / fixedStep, 1);
    renderer.render(world.activeParticles, alpha, simulationTime);
  }

  requestAnimationFrame(animate);
}
```

The exact controller API may differ. The important constraints are fixed world steps, independent interpolated rendering, retained recoverable backlog, and visible overload diagnostics.

## Consequences

- Constant velocity and force integration use the same physics interval on supported hardware regardless of rendering frame rate.
- Collision and boundary behavior become more consistent because ordinary low rendering rates produce multiple small physics steps instead of one large step.
- Rendering can run above 60 FPS without increasing the number of expensive physics calculations per simulation second.
- Rendering below 60 FPS can still maintain 60 Hz physics by executing multiple steps before a rendered frame, assuming sufficient CPU capacity.
- Previous simulated positions add storage and lifecycle work to every particle. Pool resets must initialize both previous and current state.
- Interpolation improves cadence mismatch but does not manufacture frames on an overloaded display.
- Skipping renders can cause visible stutter while preserving physics and real-time catch-up.
- Under sustained overload, simulation may run slower than wall time. This limitation is observable and invalidates performance benchmarks rather than being hidden.
- The animation loop gains a controller/clock boundary, while `World.update` remains a deterministic fixed-step operation.

## Implementation notes

- Keep `SimulationClock` free of DOM dependencies. A controller translates `requestAnimationFrame` and `visibilitychange` events into clock operations.
- Do not read wall-clock time inside `World`, particles, collisions, or deterministic plugins.
- Update a particle's previous position immediately before each physics integration step.
- Initialize previous and current positions to the same value when creating or resetting a pooled particle.
- Rendering must interpolate read-only values and must not write interpolated positions back into the world.
- Use elapsed milliseconds, not rendered-frame counts, for sustained threshold windows.
- Expose simulation time, wall-time backlog, physics steps per render, skipped renders, clamped time, and overload state to benchmark instrumentation.
- Keep networking concerns separate. A future multiplayer system would timestamp inputs and snapshots by authoritative simulation tick; packet arrival would not determine physics `dt`.

## Validation

- Given identical seed and inputs, 30, 60, and 144 FPS render schedules produce the same world state after the same number of simulation steps.
- At constant `100 px/s` velocity, 60 fixed steps move a particle approximately 100 pixels.
- A 30 FPS render schedule normally executes two 60 Hz physics steps per rendered frame.
- A 144 FPS render schedule normally executes zero or one physics step per rendered frame and uses interpolation for intermediate presentation.
- A recoverable slow frame retains its backlog, catches up using fixed steps, and may skip rendering without changing the step size.
- A sustained overload sets the overload diagnostic and does not claim real-time fidelity.
- A one-second wall-clock discontinuity never becomes one large world update.
- Pause/resume does not age, move, or emit particles while hidden and does not replay hidden time.
- Benchmark results are invalidated by visibility interruption, sustained overload, clamped wall time, or discarded simulation time.
- Time-based visual effects remain synchronized with interpolated simulation presentation.
