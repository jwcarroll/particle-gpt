import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BenchmarkCompatibilityError,
  BenchmarkResult,
  BenchmarkRunManifest,
  BenchmarkStorage,
  withCompatibilityFingerprint,
} from '../src/benchmark';
import { BenchmarkComparison } from '../src/benchmark/BenchmarkComparison';
import { BenchmarkRunner } from '../src/benchmark/BenchmarkRunner';
import { SCENARIOS } from '../src/benchmark/BenchmarkScenario';
import { World } from '../src/simulator';

function createManifest(
  overrides: Partial<Omit<BenchmarkRunManifest, 'compatibilityFingerprint'>> = {},
): BenchmarkRunManifest {
  const manifest = {
    schemaVersion: 2 as const,
    scenario: SCENARIOS.standard,
    renderer: { id: 'DoubleBuffered', capability: 'not-applicable' as const },
    surface: {
      logicalWidth: 1024,
      logicalHeight: 768,
      backingWidth: 1024,
      backingHeight: 768,
      devicePixelRatio: 1,
      backgroundColor: '#242424',
    },
    clock: {
      fixedStepSeconds: 1 / 60,
      maxFrameDeltaSeconds: 0.1,
      maxStepsPerCallback: 8,
      overloadThresholdSeconds: 0.5,
    },
    pixelsPerMeter: 100,
    world: {
      initialParticleCount: 1000,
      maxParticleCount: 1000,
      enableParticleCollision: false,
      emissionRate: 3000,
      elasticity: 0.7,
      particleRadius: { min: 2, max: 5 },
      particleVelocity: { min: 0, max: 100 },
      particleLifeSpan: { min: 5, max: 10 },
      startingAngle: { min: 0, max: 360 },
      fillStyle: '#00bfd1',
      colors: { mode: 'solid' as const, color: '#00bfd1' },
      fields: [],
      seed: 1337,
    },
    presentation: { trails: false, arrows: false },
    forces: {},
    effects: {},
    thresholds: {
      targetFps: 58,
      sustainedDropMilliseconds: 1000,
      frameDropMilliseconds: 20,
    },
    quality: { sampleCount: 100 },
    build: { appVersion: '2.2.0', revision: 'one' },
    ...overrides,
  };
  return withCompatibilityFingerprint(manifest);
}

function createResult(manifest = createManifest()): BenchmarkResult {
  return {
    id: 'result-one',
    timestamp: '2026-09-04T00:00:00.000Z',
    scenario: manifest.scenario,
    stats: {
      avgFps: 60,
      minFps: 50,
      maxFps: 70,
      avgFrameTime: 16.67,
      p95FrameTime: 20,
      avgUpdateTime: 1,
      avgRenderTime: 1,
      framesDropped: 0,
      frameDropRate: 0,
      totalFrames: 100,
    },
    environment: {
      userAgent: 'test',
      screenWidth: 1024,
      screenHeight: 768,
      devicePixelRatio: 1,
      hardwareConcurrency: 8,
      timestamp: '2026-09-04T00:00:00.000Z',
    },
    manifest,
  };
}

function createWorld(): World {
  const world = new World();
  world.updateSettings({
    width: 1024,
    height: 768,
    maxParticleCount: 3,
    minParticleRadius: 2,
    maxParticleRadius: 5,
    minParticleVelocity: 0,
    maxParticleVelocity: 100,
    minParticleLifeSpan: 5,
    maxParticleLifeSpan: 10,
    fillStyle: '#00bfd1',
  });
  world.resetPopulation(3, { seed: 321 });
  world.update(1 / 60);
  return world;
}

test('benchmark cancellation restores the exact active particle state', () => {
  const world = createWorld();
  const before = world.snapshotState();
  const runner = new BenchmarkRunner();

  runner.start(SCENARIOS.standard, world);
  runner.stop(world);

  const after = world.snapshotState();
  assert.deepEqual(after.settings, before.settings);
  assert.deepEqual(after.particles, before.particles);
  assert.equal(after.elapsedTime, before.elapsedTime);
  assert.equal(after.emissionAccumulator, before.emissionAccumulator);
  assert.equal(after.randomSource, before.randomSource);
});

test('a zero-sample benchmark is invalidated instead of producing a baseline', () => {
  const world = createWorld();
  const runner = new BenchmarkRunner();
  let invalidReason = '';
  const instantScenario = { ...SCENARIOS.standard, warmupDuration: 0, duration: 0 };

  runner.start(instantScenario, world, {
    onInvalid: (reason) => {
      invalidReason = reason;
    },
  });
  runner.recordFrame(
    {
      updateTime: 1,
      renderTime: 1,
      particleCount: world.particleCount,
      poolSize: world.particlePool.length,
    },
    world,
  );

  assert.equal(runner.getState(), 'invalid');
  assert.equal(invalidReason, 'benchmark ended without measured frames');
});

test('build identity changes do not block comparison but renderer changes do', () => {
  const baseline = createResult();
  const sameWorkloadNewBuild = createResult(
    createManifest({ build: { appVersion: '2.3.0', revision: 'two' } }),
  );
  const comparison = new BenchmarkComparison().compare(baseline, sameWorkloadNewBuild);
  assert.equal(comparison.differingFields.length, 0);

  const changedRenderer = createResult(
    createManifest({ renderer: { id: 'WebGL', capability: 'available' } }),
  );
  assert.throws(
    () => new BenchmarkComparison().compare(baseline, changedRenderer),
    (error: unknown) =>
      error instanceof BenchmarkCompatibilityError && error.differingFields.includes('renderer.id'),
  );
});

test('benchmark storage rejects malformed imports without partially saving them', () => {
  const values = new Map<string, string>();
  const storage = new BenchmarkStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  const valid = createResult();

  assert.throws(() => storage.importFromJson(JSON.stringify([valid, { id: 'bad' }])));
  assert.equal(storage.getAll().length, 0);

  assert.equal(storage.importFromJson(JSON.stringify([valid])), 1);
  const restored = new BenchmarkStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  assert.deepEqual(restored.getAll(), [valid]);
});

test('different palettes cannot compare and legacy history stays readable and exportable', () => {
  const first = createResult();
  const secondManifest = createManifest();
  secondManifest.world.colors = { mode: 'palette', colors: ['#ffffff', '#ff0000'] };
  const second = createResult(withCompatibilityFingerprint(secondManifest));
  assert.throws(
    () => new BenchmarkComparison().compare(first, second),
    BenchmarkCompatibilityError,
  );
  const legacy = createResult();
  legacy.id = 'legacy';
  legacy.manifest.schemaVersion = 1;
  delete legacy.manifest.world.colors;
  delete legacy.manifest.world.fields;
  delete legacy.manifest.presentation;
  legacy.manifest = withCompatibilityFingerprint(legacy.manifest);
  const storage = new BenchmarkStorage(null);
  assert.equal(storage.importFromJson(JSON.stringify([legacy, first])), 2);
  const exported = JSON.parse(storage.exportToJson());
  assert.deepEqual(exported[0], legacy);
  assert.throws(() => new BenchmarkComparison().compare(legacy, first), /legacy history/);
  assert.equal(storage.delete('legacy'), true);
  assert.equal(storage.getAll().length, 1);
});

test('quota failures are visible while results remain exportable in memory', () => {
  const storage = new BenchmarkStorage({
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota exceeded');
    },
  });
  storage.save(createResult());
  assert.match(storage.persistenceError!, /Quota/);
  assert.equal(JSON.parse(storage.exportToJson()).length, 1);
});

test('unknown plugin schemas and missing clock fields reject the entire import', () => {
  for (const change of [
    (manifest: any) => {
      manifest.forces.unknown = { schemaVersion: 99, evaluationMode: 'uniform', state: {} };
    },
    (manifest: any) => {
      delete manifest.clock.fixedStepSeconds;
    },
  ]) {
    const invalid = createResult();
    invalid.id = 'invalid';
    change(invalid.manifest);
    invalid.manifest = withCompatibilityFingerprint(invalid.manifest);
    const storage = new BenchmarkStorage(null);
    assert.throws(() => storage.importFromJson(JSON.stringify([createResult(), invalid])));
    assert.equal(storage.getAll().length, 0);
  }
});
