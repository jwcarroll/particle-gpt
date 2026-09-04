import assert from 'node:assert/strict';
import test from 'node:test';
import { BenchmarkRunner } from '../src/benchmark/BenchmarkRunner';
import { SCENARIOS } from '../src/benchmark/BenchmarkScenario';
import { World } from '../src/simulator';

function createPopulatedWorld(count: number): World {
  const world = new World();
  world.updateSettings({
    width: 1_024,
    height: 768,
    maxParticleCount: count,
    minParticleRadius: 2,
    maxParticleRadius: 5,
    minParticleVelocity: 0,
    maxParticleVelocity: 100,
    minParticleLifeSpan: 5,
    maxParticleLifeSpan: 10,
    fillStyle: '#00bfd1',
  });
  world.resetPopulation(count, { seed: 123 });
  return world;
}

test('fixed-count benchmark starts with its exact declared population', () => {
  const world = createPopulatedWorld(1_000);
  const runner = new BenchmarkRunner();

  runner.start(SCENARIOS.collision, world);

  assert.equal(world.particleCount, SCENARIOS.collision.settings.maxParticleCount);
  assert.equal(world.particleCount, 500);
  assert.equal(runner.getState(), 'warmup');

  runner.stop(world);
  assert.equal(world.particleCount, 1_000);
});

test('ramp benchmark starts at rampStartCount regardless of prior population', () => {
  const world = createPopulatedWorld(5_000);
  const runner = new BenchmarkRunner();

  runner.start(SCENARIOS.ramp, world);

  assert.equal(world.particleCount, SCENARIOS.ramp.settings.rampStartCount);
  assert.equal(world.particleCount, 100);

  runner.stop(world);
  assert.equal(world.particleCount, 5_000);
});

test('benchmark population is reproducible from the scenario seed', () => {
  const firstWorld = createPopulatedWorld(1);
  const secondWorld = createPopulatedWorld(2);
  const firstRunner = new BenchmarkRunner();
  const secondRunner = new BenchmarkRunner();

  firstRunner.start(SCENARIOS.standard, firstWorld);
  secondRunner.start(SCENARIOS.standard, secondWorld);

  const firstParticle = firstWorld.activeParticles[0];
  const secondParticle = secondWorld.activeParticles[0];
  assert.deepEqual(
    {
      x: firstParticle.x,
      y: firstParticle.y,
      velocityX: firstParticle.velocity.x,
      velocityY: firstParticle.velocity.y,
      radius: firstParticle.radius,
      maxLifeSpan: firstParticle.maxLifeSpan,
    },
    {
      x: secondParticle.x,
      y: secondParticle.y,
      velocityX: secondParticle.velocity.x,
      velocityY: secondParticle.velocity.y,
      radius: secondParticle.radius,
      maxLifeSpan: secondParticle.maxLifeSpan,
    },
  );

  firstRunner.stop(firstWorld);
  secondRunner.stop(secondWorld);
});

test('invalidating a benchmark restores population and reports the reason', () => {
  const world = createPopulatedWorld(1_000);
  const runner = new BenchmarkRunner();
  let invalidReason = '';

  runner.start(SCENARIOS.collision, world, {
    onInvalid: (reason) => {
      invalidReason = reason;
    },
  });
  runner.invalidate('document visibility changed', world);

  assert.equal(runner.getState(), 'invalid');
  assert.equal(world.particleCount, 1_000);
  assert.equal(invalidReason, 'document visibility changed');
});
