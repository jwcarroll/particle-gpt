import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOpaqueColor } from '../src/colors';
import { Particle } from '../src/particle';
import { Vector } from '../src/vector';

test('normalizes the supported opaque color formats', () => {
  assert.deepEqual(parseOpaqueColor('#0af'), [0, 170 / 255, 1]);
  assert.deepEqual(parseOpaqueColor('#ff8040'), [1, 128 / 255, 64 / 255]);
  assert.deepEqual(parseOpaqueColor('rgb(255, 128, 64)'), [1, 128 / 255, 64 / 255]);
  assert.deepEqual(parseOpaqueColor('hsl(0, 100%, 50%)'), [1, 0, 0]);
  assert.deepEqual(parseOpaqueColor('blue'), [0, 0, 1]);
});

test('rejects transparent and unsupported colors so renderers cannot diverge', () => {
  assert.throws(() => parseOpaqueColor('#ff804080'), TypeError);
  assert.throws(() => parseOpaqueColor('rgba(255, 128, 64, 0.5)'), TypeError);
  assert.throws(() => parseOpaqueColor('rebeccapurple'), TypeError);
});

test('particles normalize their color at creation and pool reset', () => {
  const particle = new Particle(0, 0, new Vector(0, 0), 1, '#0af');
  assert.deepEqual(particle.color, [0, 170 / 255, 1]);

  particle.reset(0, 0, new Vector(0, 0), 1, 'hsl(120, 100%, 25%)', 1);
  assert.deepEqual(particle.color, [0, 0.5, 0]);
});
