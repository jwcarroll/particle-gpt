import { SimulationController } from '../SimulationController';
import { Particle } from '../particle';
import { sampleFields } from '../Fields';

export class Presentation {
  private trails = new Map<Particle, { age: number; points: number[] }>();
  private lastTime = -1;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private controller: SimulationController,
  ) {}
  clear(): void {
    this.trails.clear();
    this.lastTime = -1;
  }
  draw(selected: string | null): void {
    const ctx = this.canvas.getContext('2d')!;
    const world = this.controller.world;
    const { width, height } = world.getSettings();
    ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const time = this.controller.clock.getDiagnostics().simulationTimeSeconds;
    if (time < this.lastTime || !this.controller.trails) this.clear();
    if (this.controller.trails) {
      const particles = world.activeParticles;
      const stride = Math.max(1, Math.ceil(particles.length / 1000));
      const sampled = new Set<Particle>();
      for (let i = 0; i < particles.length; i += stride) {
        const p = particles[i];
        sampled.add(p);
        let trail = this.trails.get(p);
        if (!trail || p.timeAlive < trail.age) {
          trail = { age: p.timeAlive, points: [] };
          this.trails.set(p, trail);
        }
        if (time !== this.lastTime) {
          trail.points.push(p.x, p.y);
          trail.age = p.timeAlive;
          if (trail.points.length > 60) trail.points.splice(0, 2);
        }
        ctx.strokeStyle = p.fillStyle;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        for (let j = 0; j < trail.points.length; j += 2) {
          if (j === 0) ctx.moveTo(trail.points[j], trail.points[j + 1]);
          else ctx.lineTo(trail.points[j], trail.points[j + 1]);
        }
        ctx.stroke();
      }
      for (const p of this.trails.keys()) if (!sampled.has(p)) this.trails.delete(p);
    }
    this.lastTime = time;
    ctx.globalAlpha = 1;
    const fields = world.getFields();
    if (this.controller.arrows) {
      const force = { x: 0, y: 0 };
      ctx.strokeStyle = '#8da7b8';
      ctx.globalAlpha = 0.5;
      for (let y = 32; y < height; y += 64)
        for (let x = 32; x < width; x += 64) {
          sampleFields(fields, x, y, force);
          const magnitude = Math.hypot(force.x, force.y);
          if (!magnitude) continue;
          const length = Math.min(24, magnitude / 100);
          const dx = force.x / magnitude,
            dy = force.y / magnitude;
          const endX = x + dx * length,
            endY = y + dy * length;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(endX, endY);
          ctx.lineTo(endX - dx * 5 - dy * 3, endY - dy * 5 + dx * 3);
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - dx * 5 + dy * 3, endY - dy * 5 - dx * 3);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    if (this.controller.locked) return;
    for (const field of fields) {
      ctx.strokeStyle = field.id === selected ? '#ffffff' : '#69dfeb';
      ctx.lineWidth = field.id === selected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(field.x, field.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '11px system-ui';
      ctx.fillText(field.kind, field.x + 18, field.y + 4);
    }
  }
}
