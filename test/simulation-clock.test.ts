import assert from 'node:assert/strict';
import test from 'node:test';
import { Particle } from '../src/particle';
import { SimulationClock } from '../src/SimulationClock';
import { Vector } from '../src/vector';

function runOneSecondSchedule(renderRate: number): {
  steps: number;
  simulationTime: number;
  stepCounts: number[];
} {
  const clock = new SimulationClock();
  let steps = 0;
  const stepCounts: number[] = [];
  const update = () => {
    steps++;
  };

  clock.advance(0, update);
  for (let frame = 1; frame <= renderRate; frame++) {
    const result = clock.advance((frame / renderRate) * 1_000, update);
    stepCounts.push(result.physicsSteps);
  }

  return {
    steps,
    simulationTime: clock.getDiagnostics().simulationTimeSeconds,
    stepCounts,
  };
}

test('30, 60, and 144 FPS render schedules execute the same 60 physics steps', () => {
  for (const renderRate of [30, 60, 144]) {
    const result = runOneSecondSchedule(renderRate);
    assert.equal(result.steps, 60, `${renderRate} FPS schedule`);
    assert.ok(Math.abs(result.simulationTime - 1) < 1e-12);
  }
});

test('low render cadence batches fixed steps while high cadence executes zero or one', () => {
  const thirtyFps = runOneSecondSchedule(30);
  const highRefresh = runOneSecondSchedule(144);

  assert.ok(thirtyFps.stepCounts.every((steps) => steps === 2));
  assert.ok(highRefresh.stepCounts.every((steps) => steps === 0 || steps === 1));
});

test('100 pixels per second moves approximately 100 pixels after 60 fixed steps', () => {
  const particle = new Particle(0, 0, new Vector(100, 0), 1);
  const clock = new SimulationClock();

  clock.advance(0, (dt) => particle.update(dt));
  for (let frame = 1; frame <= 60; frame++) {
    clock.advance((frame / 60) * 1_000, (dt) => particle.update(dt));
  }

  assert.ok(Math.abs(particle.x - 100) < 1e-9);
  assert.ok(Math.abs(particle.previousX - (100 - 100 / 60)) < 1e-9);
});

test('a large wall-clock discontinuity is clamped instead of becoming a large physics step', () => {
  const clock = new SimulationClock();
  const receivedSteps: number[] = [];

  clock.advance(0, (dt) => receivedSteps.push(dt));
  const frame = clock.advance(1_000, (dt) => receivedSteps.push(dt));

  assert.equal(frame.clamped, true);
  assert.ok(Math.abs(frame.discardedWallTimeSeconds - 0.9) < 1e-12);
  assert.equal(receivedSteps.length, 6);
  assert.ok(receivedSteps.every((step) => step === 1 / 60));
});

test('bounded catch-up preserves backlog, skips rendering, and exposes overload', () => {
  const clock = new SimulationClock({
    maxStepsPerCallback: 1,
    overloadThresholdSeconds: 0.05,
  });

  clock.advance(0, () => undefined);
  const frame = clock.advance(100, () => undefined);

  assert.equal(frame.physicsSteps, 1);
  assert.equal(frame.behind, true);
  assert.equal(frame.shouldRender, false);
  assert.equal(frame.overloaded, true);
  assert.ok(frame.accumulatorSeconds > 0.08);
});

test('pause and resume discard hidden time and accumulator remainder', () => {
  const clock = new SimulationClock();
  let steps = 0;

  clock.advance(0, () => steps++);
  clock.advance(10, () => steps++);
  clock.pause();
  clock.advance(10_000, () => steps++);
  clock.resume(10_000);
  clock.advance(10_000 + 1_000 / 60, () => steps++);

  assert.equal(steps, 1);
  assert.ok(Math.abs(clock.getDiagnostics().simulationTimeSeconds - 1 / 60) < 1e-12);
});
