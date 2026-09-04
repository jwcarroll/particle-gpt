import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WEBGL_PARTICLES } from '../src/renderers/WebGLRenderer';

test('WebGL particle capacity is explicit and stable', () => {
  assert.equal(MAX_WEBGL_PARTICLES, 50_000);
});
