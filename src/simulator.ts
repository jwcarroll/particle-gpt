/**
 * Performance Test Results:
 * 
 * Initial Version:
 * - Date: 2024-10-31
 * - Description: Initial implementation of the World class with particle simulation. No optimizations.
 * - Particle Count at 60fps: 1200
 * - Notes: Initial performance baseline.
 * 
 * Subsequent Changes:
 * 
 * Version 1.1:
 * - Date: 2024-10-31
 * - Description: Added particle pooling to reuse particles instead of creating new ones.
 * - Particle Count at 60fps: 1300
 * - Notes: Didn't have a significant impact on FPS performance.
 * 
 */
import { Force } from "./force";
import { Particle } from "./particle";
import { Vector } from "./vector";

export interface WorldSettings {
  height: number;
  width: number;
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
  spawnRate: number;
}

const defaultSettings: WorldSettings = {
  height: 0,
  width: 0,
  minParticleCount: 100,
  maxParticleCount: 1000,
  minParticleRadius: 5,
  maxParticleRadius: 10,
  minParticleVelocity: 0,
  maxParticleVelocity: 500,
  minStartingAngle: 0,
  maxStartingAngle: 360,
  minParticleLifeSpan: 1,
  maxParticleLifeSpan: 10,
  elasticity: 0.7,
  enableParticleCollision: true,
  fillStyle: 'blue',
  spawnRate: 30,
};


export class World {
  activeParticles: Particle[] = [];
  particlePool: Particle[] = [];

  private _settings: WorldSettings = { ...defaultSettings };


  private _forces: Map<string, Force> = new Map();
  private _forceList: Force[] = [];
  private _collisionGrid: Map<string, number[]> = new Map();

  getSettings() {
    return { ...this._settings };
  }

  updateSettings(settings: Partial<WorldSettings>) {
    this._settings = { ...this._settings, ...settings };
  }

  getParticleFromPool(): Particle {
    return this.particlePool.pop() || new Particle(0, 0, new Vector(0, 0), 0, '', 0);
  }

  returnParticleToPool(particle: Particle): void {
    this.particlePool.push(particle);
  }

  get particleCount() {
    return this.activeParticles.length;
  }

  addForce(force: Force) {
    this._forces.set(force.name, force);
    this._forceList = Array.from(this._forces.values());
  }

  removeForce(name: string) {
    this._forces.delete(name);
    this._forceList = Array.from(this._forces.values());
  }

  addParticle(particle: Particle) {
    this.activeParticles.push(particle);
  }

  update(dt: number) {
    let totalForceX = 0;
    let totalForceY = 0;
    for (let f = 0; f < this._forceList.length; f++) {
      totalForceX += this._forceList[f].x;
      totalForceY += this._forceList[f].y;
    }

    let i = 0;
    while (i < this.activeParticles.length) {
      const particle = this.activeParticles[i];

      if (particle.isDead) {
        // Move to pool and remove from active
        this.returnParticleToPool(particle);
        this.activeParticles[i] = this.activeParticles[this.activeParticles.length - 1];
        this.activeParticles.pop();
        continue;
      }

      particle.update(dt);
      particle.velocity.x += totalForceX;
      particle.velocity.y += totalForceY;

      this.handleParticleCollidingWithBoundingBox(
        particle,
        this._settings.height,
        this._settings.width,
        this._settings.elasticity);

      i++;
    }

    if (this._settings.enableParticleCollision) {
      this.handleParticlesCollidingWithOneAnother(this._settings.elasticity);
    }

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

  private addRandomParticle() {
    const x = Math.random() * this._settings.width;
    const y = Math.random() * this._settings.height;
    const startingAngleDegrees = getRandomNumberBetween(this._settings.minStartingAngle, this._settings.maxStartingAngle);
    const startingAngleRadians = startingAngleDegrees * (Math.PI / 180);
    const velocity = getRandomNumberBetween(this._settings.minParticleVelocity, this._settings.maxParticleVelocity);
    const velocityX = Math.cos(startingAngleRadians) * velocity;
    const velocityY = Math.sin(startingAngleRadians) * velocity;
    const radius = this.getRadius();
    const fillStyle = this.getFillStyle();
    const maxLifeSpan = getRandomNumberBetween(this._settings.minParticleLifeSpan, this._settings.maxParticleLifeSpan);

    const particle = this.getParticleFromPool();
    particle.velocity.x = velocityX;
    particle.velocity.y = velocityY;
    particle.reset(x, y, particle.velocity, radius, fillStyle, maxLifeSpan);
    this.activeParticles.push(particle);
  }

  private refillParticles() {
    const particleCount = this.activeParticles.length;
    const maxParticleCount = this._settings.maxParticleCount;
    const spawnRate = this._settings.spawnRate;

    // If below max, add particles up to spawn rate
    if (particleCount < maxParticleCount) {
      const particlesToAdd = Math.min(spawnRate, maxParticleCount - particleCount);
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
    const particles = this.activeParticles;
    const cellSize = Math.max(1, this._settings.maxParticleRadius * 2);
    this.buildCollisionGrid(particles, cellSize);

    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];
      const cellX = Math.floor(p1.x / cellSize);
      const cellY = Math.floor(p1.y / cellSize);

      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const key = this.getGridKey(cellX + offsetX, cellY + offsetY);
          const candidates = this._collisionGrid.get(key);
          if (!candidates) {
            continue;
          }

          for (let c = 0; c < candidates.length; c++) {
            const j = candidates[c];
            if (j <= i) {
              continue;
            }

            const p2 = particles[j];
            if (!p1.hasCollidedWith(p2)) {
              continue;
            }

            this.resolveParticleCollision(p1, p2, elasticity);
          }
        }
      }
    }
  }

  private buildCollisionGrid(particles: Particle[], cellSize: number) {
    this._collisionGrid.clear();

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const cellX = Math.floor(particle.x / cellSize);
      const cellY = Math.floor(particle.y / cellSize);
      const key = this.getGridKey(cellX, cellY);
      const existing = this._collisionGrid.get(key);
      if (existing) {
        existing.push(i);
      } else {
        this._collisionGrid.set(key, [i]);
      }
    }
  }

  private getGridKey(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private resolveParticleCollision(p1: Particle, p2: Particle, elasticity: number) {
    let dx = p1.x - p2.x;
    let dy = p1.y - p2.y;
    let distanceSquared = dx * dx + dy * dy;

    // Avoid division-by-zero when particles fully overlap.
    if (distanceSquared < 1e-12) {
      dx = 1;
      dy = 0;
      distanceSquared = 1;
    }

    const distance = Math.sqrt(distanceSquared);
    const normalX = dx / distance;
    const normalY = dy / distance;

    const p1VelocityAlongNormal = p1.velocity.x * normalX + p1.velocity.y * normalY;
    const p2VelocityAlongNormal = p2.velocity.x * normalX + p2.velocity.y * normalY;

    const p1FinalVelocityAlongNormal = p2VelocityAlongNormal;
    const p2FinalVelocityAlongNormal = p1VelocityAlongNormal;

    const p1Delta = p1FinalVelocityAlongNormal - p1VelocityAlongNormal;
    const p2Delta = p2FinalVelocityAlongNormal - p2VelocityAlongNormal;

    p1.velocity.x = (p1.velocity.x + normalX * p1Delta) * elasticity;
    p1.velocity.y = (p1.velocity.y + normalY * p1Delta) * elasticity;
    p2.velocity.x = (p2.velocity.x + normalX * p2Delta) * elasticity;
    p2.velocity.y = (p2.velocity.y + normalY * p2Delta) * elasticity;

    const overlap = p1.radius + p2.radius - distance;
    if (overlap > 0) {
      const moveApart = overlap * 0.5;
      p1.x += normalX * moveApart;
      p1.y += normalY * moveApart;
      p2.x -= normalX * moveApart;
      p2.y -= normalY * moveApart;
    }
  }
}

function getRandomNumberBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
