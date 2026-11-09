import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../src/simulator';
import { Particle } from '../src/particle';
import { Vector } from '../src/vector';
import { createCatalog } from '../src/plugins/catalog';
import { SimulationController } from '../src/SimulationController';
import {
  applyScene,
  captureScene,
  makePreset,
  sceneFragment,
  parseSceneFragment,
} from '../src/Scene';
import { Field, sampleFields } from '../src/Fields';
import { BenchmarkRunner } from '../src/benchmark/BenchmarkRunner';
import { SCENARIOS } from '../src/benchmark/BenchmarkScenario';

function setup() {
  const world = new World();
  world.updateSettings({
    width: 800,
    height: 600,
    maxParticleCount: 10,
    enableParticleCollision: false,
  });
  const { forces, effects } = createCatalog();
  const c = new SimulationController(world, forces, effects);
  world.setForceProvider((ctx) => forces.getNetForce(ctx));
  world.setParticleForceProvider((ctx, particle) => forces.getParticleForce(ctx, particle));
  c.reset();
  return c;
}
test('radius reduction preserves collisions of already alive large particles', () => {
  const w = new World();
  w.updateSettings({
    width: 800,
    height: 600,
    maxParticleCount: 2,
    minParticleRadius: 1,
    maxParticleRadius: 1,
    emissionRate: 0,
  });
  w.addParticle(new Particle(100, 100, new Vector(10, 0), 20));
  w.addParticle(new Particle(130, 100, new Vector(-10, 0), 20));
  w.update(1 / 60);
  assert.ok(w.activeParticles[0].velocity.x < 0);
  assert.ok(w.activeParticles[1].velocity.x > 0);
});
test('collision characterization: separating, exact overlap, dense, boundaries, tunneling', () => {
  const w = new World();
  w.updateSettings({ width: 800, height: 600, maxParticleCount: 0, emissionRate: 0 });
  const first = new Particle(100, 100, new Vector(-10, 0), 10);
  const second = new Particle(115, 100, new Vector(10, 0), 10);
  w.addParticle(first);
  w.addParticle(second);
  w.update(0);
  assert.equal(first.velocity.x, -10);
  assert.equal(second.velocity.x, 10);
  second.x = first.x;
  second.y = first.y;
  w.update(0);
  assert.ok(Number.isFinite(first.x) && first.x !== second.x);
  for (let i = 0; i < 30; i++) w.addParticle(new Particle(200, 200, new Vector(0, 0), 5));
  w.update(1 / 60);
  assert.ok(w.activeParticles.every((p) => Number.isFinite(p.x)));
  first.x = 0;
  first.velocity.x = -10;
  w.update(1 / 60);
  assert.ok(first.x >= first.radius && first.velocity.x > 0);
  const fast = new World();
  fast.updateSettings({ width: 1000, height: 600, maxParticleCount: 0 });
  const a = new Particle(100, 300, new Vector(12000, 0), 2),
    b = new Particle(300, 300, new Vector(-12000, 0), 2);
  fast.addParticle(a);
  fast.addParticle(b);
  fast.update(1 / 60);
  assert.ok(
    a.x > b.x && a.velocity.x > 0,
    'discrete collisions currently permit high-speed tunneling',
  );
});
test('pause, single-step and seeded reset are deterministic', () => {
  const c = setup();
  c.toggle();
  const before = c.world.snapshotState().particles;
  c.step();
  assert.equal(c.clock.getDiagnostics().totalPhysicsSteps, 1);
  assert.notDeepEqual(c.world.snapshotState().particles, before);
  c.reset();
  assert.deepEqual(c.world.snapshotState().particles, before);
  assert.equal(c.paused, true);
});
test('scene round-trip, radial migration, and malformed import are atomic', () => {
  const c = setup(),
    scene = captureScene(c);
  assert.deepEqual(parseSceneFragment(sceneFragment(scene)), scene);
  const invalid = structuredClone(scene);
  invalid.plugins.gravity.state.strengthMps2 = NaN;
  assert.throws(() => applyScene(invalid, c));
  assert.deepEqual(captureScene(c), scene);
  const old = structuredClone(scene);
  old.plugins.radial.schemaVersion = 1;
  delete old.plugins.radial.state.evaluationMode;
  applyScene(old, c);
  assert.equal(c.forces.get('radial')!.getState().enabled, false);
  assert.equal((c.forces.get('radial')!.getState() as any).evaluationMode, 'uniform');
  const preset = makePreset('Vortex', scene);
  applyScene(preset, c);
  assert.equal(c.world.getFields()[0].kind, 'vortex');
});
test('registry restoration validates all entries before mutating and preserves RNG', () => {
  const c = setup(),
    before = c.forces.snapshot();
  assert.throws(() =>
    c.forces.restore({ gravity: { ...(before.gravity as object), strengthMps2: 2 }, wind: {} }),
  );
  assert.deepEqual(c.forces.snapshot(), before);
  const wind = c.forces.get('wind')!;
  wind.setState({ seed: 999, enabled: true });
  c.world.update(1 / 60);
  const snapshot = c.forces.snapshot();
  wind.setState({ seed: 5 });
  c.forces.restore(snapshot);
  assert.deepEqual(c.forces.snapshot(), snapshot);
});
test('radial field pulls opposite particles in opposite directions', () => {
  const c = setup(),
    radial = c.forces.get('radial')!;
  radial.setState({ enabled: true, centerX: 100, centerY: 100, falloff: 'none' });
  const ctx = {
    dt: 1 / 60,
    elapsedTime: 0,
    worldWidth: 800,
    worldHeight: 600,
    particleCount: 2,
    particleCentroidX: 100,
    particleCentroidY: 100,
  };
  assert.ok(c.forces.getParticleForce(ctx, { x: 80, y: 100 }).x > 0);
  assert.ok(c.forces.getParticleForce(ctx, { x: 120, y: 100 }).x < 0);
  assert.deepEqual(c.forces.getParticleForce(ctx, { x: 100, y: 100 }), { x: 0, y: 0 });
});
test('emitter generation is seeded, capped, and field sampling is pure', () => {
  const field: Field = {
    id: 'one',
    kind: 'emitter',
    x: 200,
    y: 200,
    strength: 8,
    falloff: 'none',
    rate: 120,
    direction: 270,
    spread: 30,
  };
  const a = setup(),
    b = setup();
  for (const c of [a, b]) {
    c.world.setFields([field]);
    c.world.resetPopulation(0, { seed: 55 });
    c.world.update(1 / 60);
  }
  assert.deepEqual(a.world.snapshotState().particles, b.world.snapshotState().particles);
  assert.equal(a.world.particleCount, 2);
  for (let i = 0; i < 10; i++) a.world.update(1 / 60);
  assert.equal(a.world.particleCount, 10);
  const before = a.world.snapshotState();
  sampleFields([{ ...field, kind: 'vortex' }], 220, 200, { x: 0, y: 0 });
  assert.deepEqual(a.world.snapshotState(), before);
});
test('benchmark timeout and cancellation restore exact controller and world state', () => {
  const c = setup();
  c.toggle();
  c.step();
  c.trails = true;
  const world = c.world.snapshotState(),
    clock = c.clock.snapshot();
  let now = 0,
    reason = '';
  const runner = new BenchmarkRunner(
    c.forces,
    c.effects,
    undefined,
    c.benchmarkLifecycle(),
    () => now,
  );
  runner.start(SCENARIOS.ramp, c.world, {
    onInvalid: (r) => {
      reason = r;
    },
  });
  assert.equal(c.locked, true);
  assert.throws(() => c.reset());
  assert.equal(c.trails, false);
  now = 62000;
  runner.recordFrame({ updateTime: 1, renderTime: 1, particleCount: 100, poolSize: 0 }, c.world);
  assert.match(reason, /Timed out/);
  assert.equal(c.locked, false);
  assert.deepEqual(c.world.snapshotState(), world);
  assert.deepEqual(c.clock.snapshot(), clock);
  assert.equal(c.trails, true);
  runner.start(SCENARIOS.standard, c.world);
  runner.stop(c.world);
  runner.stop(c.world);
  assert.deepEqual(c.world.snapshotState(), world);
});
test('unsupported color callbacks fail benchmark preflight without changing the scene', () => {
  const c = setup();
  c.world.updateSettings({ fillStyle: () => '#ffffff' });
  const before = c.world.snapshotState();
  const runner = new BenchmarkRunner(c.forces, c.effects, undefined, c.benchmarkLifecycle());
  runner.start(SCENARIOS.standard, c.world);
  assert.equal(runner.getState(), 'invalid');
  assert.equal(c.locked, false);
  assert.deepEqual(c.world.snapshotState(), before);
});
