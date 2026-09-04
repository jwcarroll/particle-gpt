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
import { Force } from './force';
import { Particle } from './particle';
import { Vector } from './vector';
import { ForceContext, ForceVector } from './forces';
import { createSeededRandom, RandomSource } from './random';

export const MAX_PARTICLE_COUNT = 50_000;
export const MAX_PARTICLE_EMISSION_RATE = 1_000_000;

export type PopulationTrimPolicy = 'oldest-first' | 'immediate-arbitrary';

export interface ResetPopulationOptions {
  seed?: number;
}

export interface WorldSettings {
  height: number;
  width: number;
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
  fillStyle: string | ((random: RandomSource) => string);
  emissionRate: number;
}

const defaultSettings: WorldSettings = {
  height: 0,
  width: 0,
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
  fillStyle: '#0000ff',
  emissionRate: 1_800,
};

export class World {
  activeParticles: Particle[] = [];
  particlePool: Particle[] = [];

  private _settings: WorldSettings = { ...defaultSettings };

  private _forces: Map<string, Force> = new Map();
  private _forceList: Force[] = [];
  private _collisionGrid: Map<string, number[]> = new Map();
  private _forceProvider: ((context: ForceContext) => ForceVector) | null = null;
  private _elapsedTime = 0;
  private _emissionAccumulator = 0;
  private _randomSource: RandomSource = Math.random;

  getSettings() {
    return { ...this._settings };
  }

  updateSettings(settings: Partial<WorldSettings>) {
    if (settings.maxParticleCount !== undefined) {
      this.validatePopulationCount(settings.maxParticleCount);
    }
    if (settings.emissionRate !== undefined) {
      this.validateEmissionRate(settings.emissionRate);
    }
    this._settings = { ...this._settings, ...settings };
    if (this.activeParticles.length >= this._settings.maxParticleCount) {
      this._emissionAccumulator = 0;
    }
  }

  setForceProvider(provider: ((context: ForceContext) => ForceVector) | null): void {
    this._forceProvider = provider;
  }

  getRandomSource(): RandomSource {
    return this._randomSource;
  }

  setRandomSource(randomSource: RandomSource): void {
    this._randomSource = randomSource;
  }

  setTargetPopulation(count: number): void {
    this.validatePopulationCount(count);
    this._settings.maxParticleCount = count;
    if (this.activeParticles.length >= count) {
      this._emissionAccumulator = 0;
    }
  }

  setEmissionRate(particlesPerSecond: number): void {
    this.validateEmissionRate(particlesPerSecond);
    this._settings.emissionRate = particlesPerSecond;
    if (particlesPerSecond === 0) {
      this._emissionAccumulator = 0;
    }
  }

  trimPopulation(count: number, policy: PopulationTrimPolicy = 'immediate-arbitrary'): void {
    this.validatePopulationCount(count);
    if (policy === 'oldest-first') {
      this.activeParticles.sort((first, second) => first.timeAlive - second.timeAlive);
    } else if (policy !== 'immediate-arbitrary') {
      throw new RangeError(`Unknown population trim policy: ${policy as string}.`);
    }

    if (count >= this.activeParticles.length) {
      return;
    }

    while (this.activeParticles.length > count) {
      const particle = this.activeParticles.pop();
      if (particle) {
        this.returnParticleToPool(particle);
      }
    }
    this._emissionAccumulator = 0;
  }

  resetPopulation(count: number, options: ResetPopulationOptions = {}): void {
    this.validatePopulationCount(count);

    while (this.activeParticles.length > 0) {
      const particle = this.activeParticles.pop();
      if (particle) {
        this.returnParticleToPool(particle);
      }
    }

    if (options.seed !== undefined) {
      this._randomSource = createSeededRandom(options.seed);
    }

    this._elapsedTime = 0;
    this._emissionAccumulator = 0;

    for (let i = 0; i < count; i++) {
      this.addRandomParticle();
    }
  }

  getParticleFromPool(): Particle {
    return this.particlePool.pop() || new Particle(0, 0, new Vector(0, 0), 0, '#000000', 0);
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
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError('World update delta must be a finite, non-negative number of seconds.');
    }
    this._elapsedTime += dt;

    let totalForceX = 0;
    let totalForceY = 0;
    for (let f = 0; f < this._forceList.length; f++) {
      totalForceX += this._forceList[f].x;
      totalForceY += this._forceList[f].y;
    }

    if (this._forceProvider) {
      const centroid = this.getParticleCentroid();
      const provided = this._forceProvider({
        dt,
        elapsedTime: this._elapsedTime,
        worldWidth: this._settings.width,
        worldHeight: this._settings.height,
        particleCount: this.activeParticles.length,
        particleCentroidX: centroid.x,
        particleCentroidY: centroid.y,
      });
      totalForceX += provided.x;
      totalForceY += provided.y;
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
      // Integrate acceleration with dt so behavior is frame-rate independent.
      particle.velocity.x += totalForceX * dt;
      particle.velocity.y += totalForceY * dt;

      this.handleParticleCollidingWithBoundingBox(
        particle,
        this._settings.height,
        this._settings.width,
        this._settings.elasticity,
      );

      i++;
    }

    if (this._settings.enableParticleCollision) {
      this.handleParticlesCollidingWithOneAnother(this._settings.elasticity);
    }

    this.refillParticles(dt);
  }

  handleParticleCollidingWithBoundingBox(
    particle: Particle,
    height: number,
    width: number,
    elasticity: number,
  ) {
    if (particle.x - particle.radius < 0) {
      particle.x = particle.radius + 1;
      particle.velocity.x *= -elasticity;
    } else if (particle.x + particle.radius > width) {
      particle.x = width - particle.radius - 1;
      particle.velocity.x *= -elasticity;
    }
    if (particle.y - particle.radius < 0) {
      particle.y = particle.radius + 1;
      particle.velocity.y *= -elasticity;
    } else if (particle.y + particle.radius > height) {
      particle.y = height - particle.radius - 1;
      particle.velocity.y *= -elasticity;
    }
  }

  private addRandomParticle() {
    const x = this._randomSource() * this._settings.width;
    const y = this._randomSource() * this._settings.height;
    const startingAngleDegrees = this.getRandomNumberBetween(
      this._settings.minStartingAngle,
      this._settings.maxStartingAngle,
    );
    const startingAngleRadians = startingAngleDegrees * (Math.PI / 180);
    const velocity = this.getRandomNumberBetween(
      this._settings.minParticleVelocity,
      this._settings.maxParticleVelocity,
    );
    const velocityX = Math.cos(startingAngleRadians) * velocity;
    const velocityY = Math.sin(startingAngleRadians) * velocity;
    const radius = this.getRadius();
    const fillStyle = this.getFillStyle();
    const maxLifeSpan = this.getRandomNumberBetween(
      this._settings.minParticleLifeSpan,
      this._settings.maxParticleLifeSpan,
    );

    const particle = this.getParticleFromPool();
    particle.velocity.x = velocityX;
    particle.velocity.y = velocityY;
    particle.reset(x, y, particle.velocity, radius, fillStyle, maxLifeSpan);
    this.activeParticles.push(particle);
  }

  private getParticleCentroid(): { x: number; y: number } {
    if (this.activeParticles.length === 0) {
      return {
        x: this._settings.width * 0.5,
        y: this._settings.height * 0.5,
      };
    }

    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < this.activeParticles.length; i++) {
      sumX += this.activeParticles[i].x;
      sumY += this.activeParticles[i].y;
    }

    return {
      x: sumX / this.activeParticles.length,
      y: sumY / this.activeParticles.length,
    };
  }

  private refillParticles(dt: number) {
    const particleCount = this.activeParticles.length;
    const targetPopulation = this._settings.maxParticleCount;
    if (particleCount >= targetPopulation) {
      this._emissionAccumulator = 0;
      return;
    }

    this._emissionAccumulator += this._settings.emissionRate * dt;
    const availableParticles = Math.floor(this._emissionAccumulator + 1e-12);
    const particlesToAdd = Math.min(availableParticles, targetPopulation - particleCount);
    this._emissionAccumulator -= particlesToAdd;

    for (let i = 0; i < particlesToAdd; i++) {
      this.addRandomParticle();
    }

    if (this.activeParticles.length >= targetPopulation) {
      this._emissionAccumulator = 0;
    }
  }

  private getRadius() {
    return this.getRandomNumberBetween(
      this._settings.minParticleRadius,
      this._settings.maxParticleRadius,
    );
  }

  private getFillStyle() {
    if (typeof this._settings.fillStyle === 'string') {
      return this._settings.fillStyle;
    }

    return this._settings.fillStyle(this._randomSource);
  }

  private getRandomNumberBetween(min: number, max: number): number {
    return this._randomSource() * (max - min) + min;
  }

  private validatePopulationCount(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > MAX_PARTICLE_COUNT) {
      throw new RangeError(`Particle count must be an integer from 0 to ${MAX_PARTICLE_COUNT}.`);
    }
  }

  private validateEmissionRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_PARTICLE_EMISSION_RATE) {
      throw new RangeError(
        `Particle emission rate must be a finite number from 0 to ${MAX_PARTICLE_EMISSION_RATE}.`,
      );
    }
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

    const overlap = p1.radius + p2.radius - distance;
    if (overlap > 0) {
      // Position correction prevents persistent overlap that causes clumping/jitter.
      const correctionPercent = 0.8;
      const slop = 0.01;
      const correction = Math.max(overlap - slop, 0) * correctionPercent * 0.5;
      p1.x += normalX * correction;
      p1.y += normalY * correction;
      p2.x -= normalX * correction;
      p2.y -= normalY * correction;
    }

    const relativeVelocityX = p1.velocity.x - p2.velocity.x;
    const relativeVelocityY = p1.velocity.y - p2.velocity.y;
    const velocityAlongNormal = relativeVelocityX * normalX + relativeVelocityY * normalY;

    // If particles are separating, do not apply an impulse.
    if (velocityAlongNormal > 0) {
      return;
    }

    // Equal-mass impulse resolution along collision normal.
    const impulseMagnitude = -(1 + elasticity) * velocityAlongNormal * 0.5;
    const impulseX = impulseMagnitude * normalX;
    const impulseY = impulseMagnitude * normalY;

    p1.velocity.x += impulseX;
    p1.velocity.y += impulseY;
    p2.velocity.x -= impulseX;
    p2.velocity.y -= impulseY;
  }
}
