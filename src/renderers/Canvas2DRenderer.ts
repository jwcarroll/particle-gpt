// src/renderers/Canvas2DRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';

export class Canvas2DRenderer implements ParticleRenderer {
  private ctx: CanvasRenderingContext2D;
  private offscreen!: OffscreenCanvas;
  private offscreenCtx!: OffscreenCanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
  }

  initialize(width: number, height: number): void {
    // Create offscreen canvas only if it doesn't exist
    if (!this.offscreen) {
      this.offscreen = new OffscreenCanvas(width, height);
    } else if (this.offscreen.width !== width || this.offscreen.height !== height) {
      // Resize if dimensions changed
      this.offscreen.width = width;
      this.offscreen.height = height;
    }

    // Always get fresh context since canvas resize clears context state
    const offscreenCtx = this.offscreen.getContext('2d');
    if (!offscreenCtx) throw new Error('Could not get offscreen context');
    this.offscreenCtx = offscreenCtx;
  }

  render(particles: Particle[], interpolationAlpha: number = 1): void {
    // Clear offscreen
    this.offscreenCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);

    // Group by fillStyle for batching
    const byColor = new Map<string, Particle[]>();
    for (const p of particles) {
      if (!byColor.has(p.fillStyle)) {
        byColor.set(p.fillStyle, []);
      }
      byColor.get(p.fillStyle)!.push(p);
    }

    // Render batched particles
    byColor.forEach((particles, color) => {
      this.offscreenCtx.fillStyle = color;

      for (const p of particles) {
        this.offscreenCtx.beginPath();
        this.offscreenCtx.arc(
          p.getInterpolatedX(interpolationAlpha),
          p.getInterpolatedY(interpolationAlpha),
          p.radius,
          0,
          Math.PI * 2,
        );

        if (p.maxLifeSpan !== null) {
          this.offscreenCtx.globalAlpha = 1 - p.timeAlive / p.maxLifeSpan;
        }

        this.offscreenCtx.fill();
      }

      this.offscreenCtx.globalAlpha = 1.0;
    });

    // Copy to main canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.offscreen, 0, 0);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;

    this.offscreen.width = width;
    this.offscreen.height = height;

    const offscreenCtx = this.offscreen.getContext('2d');
    if (!offscreenCtx) throw new Error('Could not get offscreen context');
    this.offscreenCtx = offscreenCtx;
  }

  dispose(): void {
    // Clean up any resources
  }
}
