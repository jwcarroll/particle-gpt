import { Force } from "./force";
import { Particle } from "./particle";
import { Vector } from "./vector";

export interface WorldSettings {
  minParticleCount: number;
  maxParticleCount: number;
  minParticleRadius: number;
  maxParticleRadius: number;
  minParticleVelocity: number;
  maxParticleVelocity: number;
  minStartingAngle: number;
  maxStartingAngle: number;
  minParticleLifeSpan: number;
  maxParticleLifeSpan: number;
  elasticity: number;
  enableParticleCollision: boolean;
  fillStyle: string | (() => string);
}

const defaultSettings: WorldSettings = {
  minParticleCount: 100,
  maxParticleCount: 1000,
  minParticleRadius: 5,
  maxParticleRadius: 10,
  minParticleVelocity: 0,
  maxParticleVelocity: 100,
  minStartingAngle: 0,
  maxStartingAngle: 360,
  minParticleLifeSpan: 1,
  maxParticleLifeSpan: 10,
  elasticity: 0.7,
  enableParticleCollision: true,
  fillStyle: 'blue',
};

export class World {
  particles: Particle[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  window: Window;

  private _settings: WorldSettings = { ...defaultSettings };

  private _forces: Map<string, Force> = new Map();

  constructor(canvas: HTMLCanvasElement, window: Window) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    this.ctx = ctx;

    this.canvas.height = window.innerHeight - 50;
    this.canvas.width = window.innerWidth - 50;

    this.window = window;
    this.particles = [];

    this.window.addEventListener('resize', () => {
      this.canvas.height = this.window.innerHeight - 50;
      this.canvas.width = this.window.innerWidth - 50;
    }
    );
  }

  getSettings() {
    return { ...this._settings };
  }

  updateSettings(settings: Partial<WorldSettings>) {
    this._settings = { ...this._settings, ...settings };
  }

  get particleCount() {
    return this.particles.length;
  }

  addForce(force: Force) {
    this._forces.set(force.name, force);
  }

  removeForce(name: string) {
    this._forces.delete(name);
  }

  addParticle(particle: Particle) {
    this.particles.push(particle);
  }

  update(dt: number) {
    this.particles = this.particles.filter(particle => !particle.isDead);

    this.particles.forEach(particle => {
      particle.update(dt)
      this._forces.forEach(force => {
        particle.velocity = particle.velocity.add(force);
      });
      this.handleParticleCollidingWithBoundingBox(particle, this.canvas.height, this.canvas.width, this._settings.elasticity);
    });

    this.handleParticlesCollidingWithOneAnother(this._settings.elasticity);
    this.refillParticles();
  }

  handleParticleCollidingWithBoundingBox(particle: Particle, height: number, width: number, elasticity: number) {
    if (particle.x - particle.radius < 0) {
      particle.x = particle.radius + 1;
      particle.velocity.x *= -elasticity;
    }
    else if (particle.x + particle.radius > width) {
      particle.x = width - particle.radius - 1;
      particle.velocity.x *= -elasticity;
    }
    if (particle.y - particle.radius < 0) {
      particle.y = particle.radius + 1;
      particle.velocity.y *= -elasticity;
    }
    else if (particle.y + particle.radius > height) {
      particle.y = height - particle.radius - 1;
      particle.velocity.y *= -elasticity;
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.beginPath();
    this.particles.forEach(particle => particle.drawStar(this.ctx));
    this.ctx.closePath();
  }

  private addRandomParticle() {
    const x = Math.random() * this.canvas.width;
    const y = Math.random() * this.canvas.height;
    const startingAngle = getRandomNumberBetween(this._settings.minStartingAngle, this._settings.maxStartingAngle);
    const velocity = getRandomNumberBetween(this._settings.minParticleVelocity, this._settings.maxParticleVelocity);
    const vVector = Vector.fromAngle(startingAngle, velocity);
    const vx = vVector.x;
    const vy = vVector.y;
    const radius = this.getRadius();
    const fillStyle = this.getFillStyle();
    const maxLifeSpan = getRandomNumberBetween(this._settings.minParticleLifeSpan, this._settings.maxParticleLifeSpan);
    this.addParticle(new Particle(x, y, new Vector(vx, vy), radius, fillStyle, maxLifeSpan));
  }

  private refillParticles() {
    const particleCount = this.particles.length;
    const minParticleCount = this._settings.minParticleCount;
    const maxParticleCount = this._settings.maxParticleCount;
    if (particleCount < maxParticleCount) {
      const particlesToAdd = getRandomNumberBetween(minParticleCount - particleCount, maxParticleCount - particleCount);
      for (let i = 0; i < particlesToAdd; i++) {
        this.addRandomParticle();
      }
    }
  }

  private getRadius() {
    return Math.random() * (this._settings.maxParticleRadius - this._settings.minParticleRadius) + this._settings.minParticleRadius;
  }

  private getFillStyle() {
    if (typeof this._settings.fillStyle === 'string') {
      return this._settings.fillStyle;
    }

    return this._settings.fillStyle();
  }

  private handleParticlesCollidingWithOneAnother(elasticity: number) {
    if (!this._settings.enableParticleCollision) {
      return;
    }
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];

        if (p1.hasCollidedWith(p2)) {
          const pos1 = new Vector(p1.x, p1.y);
          const pos2 = new Vector(p2.x, p2.y);

          const collisionNormal = pos1.subtract(pos2).normalize();
          const p1VelocityAlongCollisionNormal = p1.velocity.dot(collisionNormal);
          const p2VelocityAlongCollisionNormal = p2.velocity.dot(collisionNormal);

          const p1FinalVelocityAlongCollisionNormal = p2VelocityAlongCollisionNormal;
          const p2FinalVelocityAlongCollisionNormal = p1VelocityAlongCollisionNormal;

          const p1FinalVelocity = p1.velocity.add(collisionNormal.multiply(p1FinalVelocityAlongCollisionNormal - p1VelocityAlongCollisionNormal));
          const p2FinalVelocity = p2.velocity.add(collisionNormal.multiply(p2FinalVelocityAlongCollisionNormal - p2VelocityAlongCollisionNormal));

          p1.velocity = p1FinalVelocity.multiply(elasticity);
          p2.velocity = p2FinalVelocity.multiply(elasticity);

          //make sure they aren't overlapping
          const overlap = p1.radius + p2.radius - pos1.distanceTo(pos2);
          const moveApart = collisionNormal.multiply(overlap / 2);
          p1.x += moveApart.x;
          p1.y += moveApart.y;
          p2.x -= moveApart.x;
          p2.y -= moveApart.y;
        }
      }
    }
  }
}

function getRandomNumberBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}