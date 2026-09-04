import assert from 'node:assert/strict';
import test from 'node:test';
import { RendererManager, RendererManagerOptions } from '../src/renderers/RendererManager';
import { ParticleRenderer } from '../src/renderers/ParticleRenderer';
import { RenderSurfaceConfig } from '../src/renderers/RenderSurface';
import { ShaderRegistry } from '../src/shaders';
import { WebGLRenderer } from '../src/renderers/WebGLRenderer';

class FakeRenderer implements ParticleRenderer {
  initializeCalls: RenderSurfaceConfig[] = [];
  resizeCalls: RenderSurfaceConfig[] = [];
  disposed = false;

  initialize(surface: RenderSurfaceConfig): void {
    this.initializeCalls.push(surface);
  }

  render(): void {}

  resize(surface: RenderSurfaceConfig): void {
    this.resizeCalls.push(surface);
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

const standardSurface: RenderSurfaceConfig = {
  logicalWidth: 800,
  logicalHeight: 600,
  devicePixelRatio: 1,
  backgroundColor: '#242424',
};

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

  manager.initialize(standardSurface);

  assert.equal(manager.active, 'DoubleBuffered');
  assert.equal(webglAttempts, 0);
  assert.deepEqual(doubleBuffered.initializeCalls, [standardSurface]);
  assert.deepEqual(direct.initializeCalls, [standardSurface]);
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
  manager.initialize(standardSurface);
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
  manager.initialize(standardSurface);

  assert.deepEqual(manager.select('WebGL'), { active: 'WebGL', changed: true });
  const resizedSurface = { ...standardSurface, logicalWidth: 1024, logicalHeight: 768 };
  manager.resize(resizedSurface);
  assert.deepEqual(manager.select('WebGL'), { active: 'WebGL', changed: false });

  assert.equal(webglAttempts, 1);
  assert.deepEqual(webgl.initializeCalls, [standardSurface]);
  assert.deepEqual(webgl.resizeCalls, [resizedSurface]);
  assert.equal(manager.getWebGLCapabilityStatus().state, 'available');
});
