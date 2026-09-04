import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PARTICLE_COUNT, World } from '../src/simulator';

function createWorld(): World {
  const world = new World();
  world.updateSettings({
    width: 800,
    height: 600,
    maxParticleCount: 1_000,
    minParticleRadius: 2,
    maxParticleRadius: 12,
    minParticleVelocity: 10,
    maxParticleVelocity: 200,
    minStartingAngle: 0,
    maxStartingAngle: 360,
    minParticleLifeSpan: 2,
    maxParticleLifeSpan: 8,
    fillStyle: (random) => `seeded-${Math.floor(random() * 10_000)}`,
    emissionRate: 2,
  });
  return world;
}

function particleSnapshot(world: World) {
  return world.activeParticles.map((particle) => ({
    x: particle.x,
    y: particle.y,
    velocityX: particle.velocity.x,
    velocityY: particle.velocity.y,
    radius: particle.radius,
    fillStyle: particle.fillStyle,
    maxLifeSpan: particle.maxLifeSpan,
  }));
}

test('resetPopulation creates the exact requested population', () => {
  const world = createWorld();

  world.resetPopulation(5, { seed: 42 });
  assert.equal(world.particleCount, 5);

  world.resetPopulation(3, { seed: 42 });
  assert.equal(world.particleCount, 3);
  assert.equal(world.particlePool.length, 2);

  const allParticles = [...world.activeParticles, ...world.particlePool];
  assert.equal(new Set(allParticles).size, 5, 'pool and active population must not contain duplicate references');
});

test('resetPopulation reproduces initial particle state from a seed', () => {
  const world = createWorld();

  world.resetPopulation(8, { seed: 1_337 });
  const first = particleSnapshot(world);

  world.resetPopulation(8, { seed: 1_337 });
  assert.deepEqual(particleSnapshot(world), first);
});

test('resetPopulation rejects invalid counts without changing active particles', () => {
  const world = createWorld();
  world.resetPopulation(4, { seed: 7 });
  const originalParticles = [...world.activeParticles];

  for (const invalidCount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_PARTICLE_COUNT + 1]) {
    assert.throws(() => world.resetPopulation(invalidCount), RangeError);
    assert.deepEqual(world.activeParticles, originalParticles);
  }
});

test('emission is measured in particles per simulated second', () => {
  const world = createWorld();
  world.setTargetPopulation(5);
  world.setEmissionRate(2);
  world.resetPopulation(0, { seed: 99 });

  world.update(0.25);
  assert.equal(world.particleCount, 0);

  world.update(0.25);
  assert.equal(world.particleCount, 1);

  world.update(0.5);
  assert.equal(world.particleCount, 2);
});

test('emission produces the same count at 60 Hz and 144 Hz', () => {
  const sixtyHertzWorld = createWorld();
  const highRefreshWorld = createWorld();
  for (const world of [sixtyHertzWorld, highRefreshWorld]) {
    world.setTargetPopulation(1_000);
    world.setEmissionRate(120);
    world.resetPopulation(0, { seed: 2026 });
  }

  for (let step = 0; step < 60; step++) {
    sixtyHertzWorld.update(1 / 60);
  }
  for (let step = 0; step < 144; step++) {
    highRefreshWorld.update(1 / 144);
  }

  assert.equal(sixtyHertzWorld.particleCount, 120);
  assert.equal(highRefreshWorld.particleCount, 120);
});

test('target changes do not silently trim and explicit trim returns particles to the pool', () => {
  const world = createWorld();
  world.resetPopulation(5, { seed: 10 });

  world.setTargetPopulation(2);
  world.update(1);
  assert.equal(world.particleCount, 5);

  world.trimPopulation(2);
  assert.equal(world.particleCount, 2);
  assert.equal(world.particlePool.length, 3);
});

test('world rejects invalid time, target, and emission values', () => {
  const world = createWorld();

  assert.throws(() => world.update(Number.NaN), RangeError);
  assert.throws(() => world.update(-1), RangeError);
  assert.throws(() => world.setTargetPopulation(1.5), RangeError);
  assert.throws(() => world.setEmissionRate(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => world.setEmissionRate(-1), RangeError);
  assert.throws(() => world.trimPopulation(1_000, 'unknown' as never), RangeError);
});
