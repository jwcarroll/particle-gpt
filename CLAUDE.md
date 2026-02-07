# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start development server (port 3000, auto-opens browser)
npm run build    # TypeScript compilation + Vite production build
npm run preview  # Preview production build
```

## Architecture Overview

This is a 2D physics particle simulation engine built with TypeScript, Vite, and Canvas 2D API. Interactive parameter tuning is provided via Tweakpane UI.

### Core Components

**Vector Math** (`src/vector.ts`): `Vector` class for 2D math operations, `Degree` class for angle conversions.

**Force System** (`src/force.ts`): `Force` extends `Vector` with named forces (e.g., gravity) applied each frame to all particles.

**Particle** (`src/particle.ts`): Individual particle with position, velocity, radius, lifespan, and collision detection. Supports object pooling via `reset()`.

**World Simulation** (`src/simulator.ts`): Main physics engine managing:
- Particle lifecycle (spawning, pooling, removal)
- Force application
- Boundary and particle-to-particle collision with elasticity
- Configurable via `WorldSettings` (particle counts, radius, velocity, lifespan ranges, elasticity, collision toggle)

**Renderer** (`src/renderers/`): `ParticleRenderer` interface with `Canvas2DRenderer` implementation using OffscreenCanvas double-buffering and color-batched drawing.

**Application Entry** (`src/main.ts`): Initializes World and renderer, sets up Tweakpane controls (particle counts, radius, lifespan, elasticity, collision toggle, FPS graph), runs animation loop with delta-time physics.

### Data Flow

```
main.ts → World.update(dt) → applies forces, updates positions, handles collisions
        → Canvas2DRenderer.render() → draws particles to canvas
```

### Key Patterns

- **Object Pooling**: Particles recycled via `particlePool[]` to reduce GC pressure
- **Renderer Abstraction**: Interface allows future WebGL or other renderers
- **Force-based Physics**: Extensible force system via `World.addForce()`/`removeForce()`
