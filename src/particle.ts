import { Vector } from './vector';
import { parseOpaqueColor, RgbColor } from './colors';

export interface ParticleSnapshot {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  fillStyle: string;
  maxLifeSpan: number | null;
  timeAlive: number;
}

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

  snapshot(): ParticleSnapshot {
    return {
      x: this.x,
      y: this.y,
      previousX: this.previousX,
      previousY: this.previousY,
      velocityX: this.velocity.x,
      velocityY: this.velocity.y,
      radius: this.radius,
      fillStyle: this.fillStyle,
      maxLifeSpan: this.maxLifeSpan,
      timeAlive: this._timeAlive,
    };
  }

  restoreSnapshot(snapshot: ParticleSnapshot): void {
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.previousX = snapshot.previousX;
    this.previousY = snapshot.previousY;
    this.velocity.x = snapshot.velocityX;
    this.velocity.y = snapshot.velocityY;
    this.radius = snapshot.radius;
    this.fillStyle = snapshot.fillStyle;
    this.color = parseOpaqueColor(snapshot.fillStyle);
    this.maxLifeSpan = snapshot.maxLifeSpan;
    this._timeAlive = snapshot.timeAlive;
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
