import assert from 'node:assert/strict';
import test from 'node:test';
import { RendererManager, RendererManagerOptions } from '../src/renderers/RendererManager';
import { ParticleRenderer } from '../src/renderers/ParticleRenderer';
import { ShaderRegistry } from '../src/shaders';
import { WebGLRenderer } from '../src/renderers/WebGLRenderer';

class FakeRenderer implements ParticleRenderer {
  initializeCalls: Array<[number, number]> = [];
  resizeCalls: Array<[number, number]> = [];
  disposed = false;

  initialize(width: number, height: number): void {
    this.initializeCalls.push([width, height]);
  }

  render(): void {}

  resize(width: number, height: number): void {
    this.resizeCalls.push([width, height]);
  }

  dispose(): void {
    this.disposed = true;
  }
}

function createManager(options: RendererManagerOptions): RendererManager {
  return new RendererManager(
    {} as HTMLCanvasElement,
    {} as HTMLCanvasElement,
    new ShaderRegistry(),
    options,
  );
}

test('does not probe WebGL while Canvas2D is active', () => {
  let webglAttempts = 0;
  const doubleBuffered = new FakeRenderer();
  const direct = new FakeRenderer();
  const manager = createManager({
    createDoubleBuffered: () => doubleBuffered,
    createDirect: () => direct,
    createWebGL: () => {
      webglAttempts += 1;
      throw new Error('WebGL is unavailable');
    },
  });

  manager.initialize(800, 600);

  assert.equal(manager.active, 'DoubleBuffered');
  assert.equal(webglAttempts, 0);
  assert.deepEqual(doubleBuffered.initializeCalls, [[800, 600]]);
  assert.deepEqual(direct.initializeCalls, [[800, 600]]);
  assert.equal(manager.getWebGLCapabilityStatus().state, 'unprobed');
});

test('retains the active Canvas2D renderer when WebGL initialization fails', () => {
  let webglAttempts = 0;
  const manager = createManager({
    createDoubleBuffered: () => new FakeRenderer(),
    createDirect: () => new FakeRenderer(),
    createWebGL: () => {
      webglAttempts += 1;
      throw new Error('ANGLE_instanced_arrays is unavailable');
    },
  });
  manager.initialize(800, 600);
  const result = manager.select('WebGL');

  assert.deepEqual(result, {
    active: 'DoubleBuffered',
    changed: false,
    reason: 'WebGL renderer could not initialize: ANGLE_instanced_arrays is unavailable',
  });
  assert.equal(manager.active, 'DoubleBuffered');
  assert.deepEqual(manager.getWebGLCapabilityStatus(), {
    state: 'unavailable',
    reason: 'WebGL renderer could not initialize: ANGLE_instanced_arrays is unavailable',
  });
  manager.select('WebGL');
  assert.equal(webglAttempts, 1);
});

test('initializes WebGL once when selected and resizes it thereafter', () => {
  const webgl = new FakeRenderer();
  let webglAttempts = 0;
  const manager = createManager({
    createDoubleBuffered: () => new FakeRenderer(),
    createDirect: () => new FakeRenderer(),
    createWebGL: () => {
      webglAttempts += 1;
      return webgl as unknown as WebGLRenderer;
    },
  });
  manager.initialize(800, 600);

  assert.deepEqual(manager.select('WebGL'), { active: 'WebGL', changed: true });
  manager.resize(1024, 768);
  assert.deepEqual(manager.select('WebGL'), { active: 'WebGL', changed: false });

  assert.equal(webglAttempts, 1);
  assert.deepEqual(webgl.initializeCalls, [[800, 600]]);
  assert.deepEqual(webgl.resizeCalls, [[1024, 768]]);
  assert.equal(manager.getWebGLCapabilityStatus().state, 'available');
});
