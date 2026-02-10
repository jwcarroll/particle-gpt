import { Vector } from "./vector";


export class Particle {
  x: number;
  y: number;
  velocity: Vector;
  radius: number;
  maxLifeSpan: number | null;
  fillStyle: string;

  private _timeAlive: number = 0;

  public get isDead() {
    return this.maxLifeSpan !== null && this._timeAlive > this.maxLifeSpan;
  }

  constructor(x: number, y: number, velocity: Vector, radius: number, fillStyle: string = 'blue', maxLifeSpan?: number) {
    this.x = x;
    this.y = y;
    this.velocity = velocity;
    this.radius = radius;
    this.fillStyle = fillStyle;
    this.maxLifeSpan = maxLifeSpan || null;
  }

  public get timeAlive() {
    return this._timeAlive;
  }

  update(dt: number) {
    this._timeAlive += dt;

    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;
  }

  reset(x: number, y: number, velocity: Vector, radius: number, fillStyle: string, maxLifeSpan: number): void {
    this.x = x;
    this.y = y;
    // Keep the same velocity object to reduce allocations during pool reuse.
    this.velocity.x = velocity.x;
    this.velocity.y = velocity.y;
    this.radius = radius;
    this.fillStyle = fillStyle;
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
