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

  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

    //decrease opacity as particle ages
    if (this.maxLifeSpan !== null) {
      ctx.globalAlpha = 1 - this._timeAlive / this.maxLifeSpan;
    }
    ctx.fillStyle = this.fillStyle;
    ctx.fill();
    ctx.closePath();
  }

  reset(x: number, y: number, velocity: Vector, radius: number, fillStyle: string, maxLifeSpan: number): void {
    this.x = x;
    this.y = y;
    this.velocity = velocity;
    this.radius = radius;
    this.fillStyle = fillStyle;
    this.maxLifeSpan = maxLifeSpan;
    this._timeAlive = 0;
  }

  hasCollidedWith(particle: Particle) {
    const distance = Math.sqrt((this.x - particle.x) ** 2 + (this.y - particle.y) ** 2);
    return distance < this.radius + particle.radius;
  }

  drawStar(ctx: CanvasRenderingContext2D) {
    const points = 5;
    const outerRadius = this.radius;
    const innerRadius = this.radius / 2;
    const angle = Math.PI / points;

    ctx.beginPath();
    ctx.moveTo(this.x, this.y - outerRadius);

    for (let i = 1; i < 2 * points + 1; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const newX = this.x + r * Math.sin(i * angle);
      const newY = this.y - r * Math.cos(i * angle);
      ctx.lineTo(newX, newY);
    }

    //decrease opacity as particle ages
    if (this.maxLifeSpan !== null) {
      ctx.globalAlpha = 1 - this._timeAlive / this.maxLifeSpan;
    }
    ctx.fillStyle = this.fillStyle;
    ctx.fill();
    ctx.closePath();
  }
}
