// src/renderers/DirectCanvas2DRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';

/**
 * Direct renderer without double-buffering.
 * Draws directly to the visible canvas, skipping the offscreen copy.
 */
export class DirectCanvas2DRenderer implements ParticleRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
  }

  initialize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(particles: Particle[], interpolationAlpha: number = 1): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

        if (p.maxLifeSpan !== null) {
          this.ctx.globalAlpha = 1 - p.timeAlive / p.maxLifeSpan;
        }

        this.ctx.fill();
      }
    });

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  dispose(): void {}
}
