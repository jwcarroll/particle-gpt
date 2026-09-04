import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRenderSurfaceConfig,
  getBackingHeight,
  getBackingWidth,
} from '../src/renderers/RenderSurface';

test('a DPR of two doubles backing dimensions without changing logical dimensions', () => {
  const surface = createRenderSurfaceConfig(800, 600, 2);

  assert.deepEqual(surface, {
    logicalWidth: 800,
    logicalHeight: 600,
    devicePixelRatio: 2,
    backgroundColor: '#242424',
  });
  assert.equal(getBackingWidth(surface), 1600);
  assert.equal(getBackingHeight(surface), 1200);
});

test('surface config keeps a valid minimum size and pixel ratio', () => {
  const surface = createRenderSurfaceConfig(0, -20, 0, '#112233');

  assert.deepEqual(surface, {
    logicalWidth: 1,
    logicalHeight: 1,
    devicePixelRatio: 1,
    backgroundColor: '#112233',
  });
});
