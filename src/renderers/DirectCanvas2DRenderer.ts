// src/renderers/DirectCanvas2DRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';
import { getBackingHeight, getBackingWidth, RenderSurfaceConfig } from './RenderSurface';
import { getParticleOpacity } from './ParticleOpacity';

/**
 * Direct renderer without double-buffering.
 * Draws directly to the visible canvas, skipping the offscreen copy.
 */
export class DirectCanvas2DRenderer implements ParticleRenderer {
  private ctx: CanvasRenderingContext2D;
  private surface!: RenderSurfaceConfig;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
  }

  initialize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
    this.canvas.width = getBackingWidth(surface);
    this.canvas.height = getBackingHeight(surface);
    this.ctx.setTransform(surface.devicePixelRatio, 0, 0, surface.devicePixelRatio, 0, 0);
  }

  render(particles: Particle[], interpolationAlpha: number = 1): void {
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = this.surface.backgroundColor;
    this.ctx.fillRect(0, 0, this.surface.logicalWidth, this.surface.logicalHeight);

    // Group by fillStyle for batching (same as original)
    const byColor = new Map<string, Particle[]>();
    for (const p of particles) {
      if (!byColor.has(p.fillStyle)) {
        byColor.set(p.fillStyle, []);
      }
      byColor.get(p.fillStyle)!.push(p);
    }

    // Render batched particles
    byColor.forEach((particles, color) => {
      this.ctx.fillStyle = color;

      for (const p of particles) {
        this.ctx.beginPath();
        this.ctx.arc(
          p.getInterpolatedX(interpolationAlpha),
          p.getInterpolatedY(interpolationAlpha),
          p.radius,
          0,
          Math.PI * 2,
        );

        this.ctx.globalAlpha = getParticleOpacity(p.timeAlive, p.maxLifeSpan);

        this.ctx.fill();
      }
    });

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  resize(surface: RenderSurfaceConfig): void {
    this.initialize(surface);
  }

  dispose(): void {}
}
