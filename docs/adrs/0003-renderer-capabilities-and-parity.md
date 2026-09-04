# ADR-0003: Renderer capabilities and visual parity

- Status: Proposed
- Date: 2026-09-04

## Context

The application eagerly creates the WebGL renderer even though Canvas2D is the default. A missing WebGL context or instancing extension can therefore prevent the entire app from loading. Canvas2D inherits the page background while WebGL clears to opaque black. Backing buffers use CSS pixel dimensions and do not account for device pixel ratio. Color parsing and alpha behavior also differ.

These differences weaken accessibility, visual consistency, and renderer benchmark comparisons.

## Decision

Introduce a `RendererManager` with capability negotiation and an explicit `RenderSurfaceConfig`.

- Canvas2D is the baseline renderer and must remain available when optional renderers fail.
- Optional renderers are created lazily. Capability checks return structured availability and failure reasons for the UI.
- Every renderer receives the same logical width, logical height, device pixel ratio, background color, and clear policy.
- Backing-buffer dimensions are logical dimensions multiplied by device pixel ratio; drawing coordinates remain logical pixels.
- Define a supported color contract for particle and effect state. Normalize colors before they reach renderer hot paths.
- Define visual-parity fixtures for position, radius, base color, lifetime alpha, background, and effect-off output.
- Renderer-specific enhancements are allowed only when declared as capabilities and represented in benchmark manifests.
- Handle resize and WebGL context loss without corrupting simulation state.

## Consequences

- The app degrades gracefully instead of failing at startup.
- Renderer comparisons become meaningful under a shared surface configuration.
- High-DPI output becomes sharp at increased memory and fill-rate cost.
- The UI can explain why a renderer or effect is unavailable.
- Exact pixel identity is not required across APIs, but defined tolerances are.

## Implementation notes

- Implemented in part: `RendererManager` now creates Canvas2D renderers at startup and defers WebGL construction until it is selected. A failed WebGL creation retains the current Canvas2D renderer, records the reason, and exposes it in the Rendering tab.
- Implemented in part: `RenderSurfaceConfig` gives every renderer one logical size, device pixel ratio, and opaque background. DPR scales backing buffers and rendering transforms, while world coordinates remain logical pixels.
- Implemented in part: WebGL exposes its 50,000-particle cap in the UI rather than silently truncating its draw workload.
- Implemented in part: particles normalize their opaque RGB value at creation and pool reset. Supported inputs are named primary colors, `#rgb`, `#rrggbb`, `rgb(r,g,b)`, and `hsl(h,s%,l%)`; transparent and unsupported inputs are rejected so Canvas2D and WebGL cannot interpret them differently.
- Implemented in part: a WebGL context-loss event preserves the simulation and switches active rendering to Canvas2D. WebGL is marked unavailable for the rest of the session instead of attempting an unsafe mid-frame resource rebuild.
- Implemented in part: a deterministic base parity fixture defines shared background, DPR, particle interpolation, RGB, radius, and lifetime-opacity expectations. Canvas2D and WebGL both use linear finite-lifetime fading when effects are off; the Age Alpha effect now overrides that curve.
- Deferred: benchmark-manifest capability reporting remains future work.
- Reset all mutable Canvas context state, including global alpha, every frame or use save/restore around rendering.
- Avoid allocating or parsing color strings per particle per frame; normalize at particle initialization or palette change.
- Report WebGL caps and the silent particle ceiling explicitly. Prefer a visible capacity warning over truncation.
- Include background and backing-buffer size in benchmark configuration.

## Validation

- Blocking WebGL creation still produces a working Canvas2D application.
- Renderer switching does not reset or modify particles.
- Canvas2D and WebGL share the configured background and comparable effect-off output.
- A device pixel ratio of two doubles backing-buffer dimensions without changing world coordinates.
- Resize, zero particles, maximum supported particles, and WebGL context loss have tested outcomes.
