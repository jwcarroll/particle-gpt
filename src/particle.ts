import { Vector } from './vector';
import { parseOpaqueColor, RgbColor } from './colors';

export class Particle {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocity: Vector;
  radius: number;
  maxLifeSpan: number | null;
  fillStyle: string;
  color: RgbColor;

  private _timeAlive: number = 0;

  public get isDead() {
    return this.maxLifeSpan !== null && this._timeAlive > this.maxLifeSpan;
  }

  constructor(
    x: number,
    y: number,
    velocity: Vector,
    radius: number,
    fillStyle: string = '#0000ff',
    maxLifeSpan?: number,
  ) {
    this.x = x;
    this.y = y;
    this.previousX = x;
    this.previousY = y;
    this.velocity = velocity;
    this.radius = radius;
    this.fillStyle = fillStyle;
    this.color = parseOpaqueColor(fillStyle);
    this.maxLifeSpan = maxLifeSpan || null;
  }

  public get timeAlive() {
    return this._timeAlive;
  }

  update(dt: number) {
    this._timeAlive += dt;

    this.previousX = this.x;
    this.previousY = this.y;
    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;
  }

  getInterpolatedX(alpha: number): number {
    return this.previousX + (this.x - this.previousX) * alpha;
  }

  getInterpolatedY(alpha: number): number {
    return this.previousY + (this.y - this.previousY) * alpha;
  }

  reset(
    x: number,
    y: number,
    velocity: Vector,
    radius: number,
    fillStyle: string,
    maxLifeSpan: number,
  ): void {
    this.x = x;
    this.y = y;
    this.previousX = x;
    this.previousY = y;
    // Keep the same velocity object to reduce allocations during pool reuse.
    this.velocity.x = velocity.x;
    this.velocity.y = velocity.y;
    this.radius = radius;
    this.fillStyle = fillStyle;
    this.color = parseOpaqueColor(fillStyle);
    this.maxLifeSpan = maxLifeSpan;
    this._timeAlive = 0;
  }

  hasCollidedWith(particle: Particle) {
    const dx = this.x - particle.x;
    const dy = this.y - particle.y;
    const sumRadius = this.radius + particle.radius;
    return dx * dx + dy * dy < sumRadius * sumRadius;
  }
}
