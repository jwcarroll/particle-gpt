// src/renderers/Canvas2DRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';
import { getBackingHeight, getBackingWidth, RenderSurfaceConfig } from './RenderSurface';
import { getParticleOpacity } from './ParticleOpacity';

export class Canvas2DRenderer implements ParticleRenderer {
  private ctx: CanvasRenderingContext2D;
  private offscreen!: OffscreenCanvas;
  private offscreenCtx!: OffscreenCanvasRenderingContext2D;
  private surface!: RenderSurfaceConfig;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
  }

  initialize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
    const backingWidth = getBackingWidth(surface);
    const backingHeight = getBackingHeight(surface);
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.ctx.setTransform(surface.devicePixelRatio, 0, 0, surface.devicePixelRatio, 0, 0);

    // Create offscreen canvas only if it doesn't exist
    if (!this.offscreen) {
      this.offscreen = new OffscreenCanvas(backingWidth, backingHeight);
    } else if (this.offscreen.width !== backingWidth || this.offscreen.height !== backingHeight) {
      // Resize if dimensions changed
      this.offscreen.width = backingWidth;
      this.offscreen.height = backingHeight;
    }

    // Always get fresh context since canvas resize clears context state
    const offscreenCtx = this.offscreen.getContext('2d');
    if (!offscreenCtx) throw new Error('Could not get offscreen context');
    this.offscreenCtx = offscreenCtx;
    this.offscreenCtx.setTransform(surface.devicePixelRatio, 0, 0, surface.devicePixelRatio, 0, 0);
  }

  render(particles: Particle[], interpolationAlpha: number = 1): void {
    const { logicalWidth, logicalHeight, backgroundColor } = this.surface;
    this.offscreenCtx.globalAlpha = 1;
    this.offscreenCtx.fillStyle = backgroundColor;
    this.offscreenCtx.fillRect(0, 0, logicalWidth, logicalHeight);

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

        this.offscreenCtx.globalAlpha = getParticleOpacity(p.timeAlive, p.maxLifeSpan);

        this.offscreenCtx.fill();
      }

      this.offscreenCtx.globalAlpha = 1.0;
    });

    // Copy to main canvas
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    this.ctx.drawImage(
      this.offscreen,
      0,
      0,
      this.offscreen.width,
      this.offscreen.height,
      0,
      0,
      logicalWidth,
      logicalHeight,
    );
  }

  resize(surface: RenderSurfaceConfig): void {
    this.initialize(surface);
  }

  dispose(): void {
    // Clean up any resources
  }
}
