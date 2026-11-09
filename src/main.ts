import './style.css';
import packageMetadata from '../package.json';
import { World } from './simulator';
import { createCatalog } from './plugins/catalog';
import { SimulationController } from './SimulationController';
import { RendererManager, RendererType } from './renderers/RendererManager';
import {
  createRenderSurfaceConfig,
  getBackingWidth,
  getBackingHeight,
} from './renderers/RenderSurface';
import { BenchmarkModule } from './benchmark';
import { Inspector } from './ui/Inspector';
import { Presentation } from './ui/Presentation';
import { setupShell, element } from './ui/Shell';
import { captureScene } from './Scene';

const canvas = element<HTMLCanvasElement>('canvas');
const webglCanvas = element<HTMLCanvasElement>('webgl-canvas');
const overlay = element<HTMLCanvasElement>('overlay');
const viewport = element('viewport');
const report = (text: string) => {
  element('message').textContent = text;
};
const { forces, effects } = createCatalog();
const world = new World();
const controller = new SimulationController(world, forces, effects);
world.updateSettings({
  width: Math.max(1, viewport.clientWidth),
  height: Math.max(1, viewport.clientHeight),
  maxParticleCount: 1000,
  minParticleLifeSpan: 5,
  maxParticleLifeSpan: 15,
  minParticleRadius: 2,
  maxParticleRadius: 5,
  enableParticleCollision: false,
});
world.setColors({ mode: 'palette', colors: ['#39a0ed', '#6ec6ff', '#9bdaf1'] });
world.setForceProvider((context) => forces.getNetForce(context));
world.setParticleForceProvider((context, particle) => forces.getParticleForce(context, particle));
controller.reset();
const baseScene = captureScene(controller);
const renderers = new RendererManager(canvas, webglCanvas, effects);
const presentation = new Presentation(overlay, controller);
const getSurface = () => {
  const settings = world.getSettings();
  return createRenderSurfaceConfig(
    settings.width,
    settings.height,
    window.devicePixelRatio,
    controller.background,
  );
};
let lastDpr = window.devicePixelRatio;
const lifecycle = controller.benchmarkLifecycle();
const benchmark = new BenchmarkModule(
  world,
  forces,
  effects,
  () => {
    const surface = getSurface();
    return {
      renderer: {
        id: renderers.active,
        capability:
          renderers.active === 'WebGL'
            ? renderers.getWebGLCapabilityStatus().state
            : 'not-applicable',
      },
      surface: {
        ...surface,
        backingWidth: getBackingWidth(surface),
        backingHeight: getBackingHeight(surface),
      },
      clock: {
        fixedStepSeconds: controller.clock.fixedStepSeconds,
        maxFrameDeltaSeconds: controller.clock.maxFrameDeltaSeconds,
        maxStepsPerCallback: controller.clock.maxStepsPerCallback,
        overloadThresholdSeconds: controller.clock.overloadThresholdSeconds,
      },
      pixelsPerMeter: 100,
      build: {
        appVersion: packageMetadata.version,
        revision: import.meta.env.VITE_GIT_SHA ?? 'development',
      },
    };
  },
  {
    begin: () => {
      lifecycle.begin();
      presentation.clear();
      synchronize();
    },
    end: () => {
      lifecycle.end();
      presentation.clear();
      synchronize();
    },
  },
);
function resizeSurface(): void {
  const surface = getSurface();
  renderers.resize(surface);
  overlay.width = getBackingWidth(surface);
  overlay.height = getBackingHeight(surface);
  const scale = Math.min(
    viewport.clientWidth / surface.logicalWidth,
    viewport.clientHeight / surface.logicalHeight,
  );
  for (const target of [canvas, webglCanvas, overlay]) {
    target.style.width = surface.logicalWidth * scale + 'px';
    target.style.height = surface.logicalHeight * scale + 'px';
  }
  lastDpr = window.devicePixelRatio;
  presentation.clear();
}
function resizeViewport(): void {
  benchmark.invalidate('Viewport or pixel density changed');
  if (controller.fitToWindow)
    world.updateSettings({
      width: Math.max(1, viewport.clientWidth),
      height: Math.max(1, viewport.clientHeight),
    });
  resizeSurface();
  inspector?.refresh();
}
function selectRenderer(type: RendererType): void {
  controller.change(() => {
    const result = renderers.select(type);
    canvas.hidden = result.active === 'WebGL';
    webglCanvas.hidden = result.active !== 'WebGL';
    if (result.reason) report(result.reason);
  });
}
renderers.initialize(getSurface());
resizeSurface();
const inspector = new Inspector(
  element('inspector-content'),
  controller,
  benchmark,
  renderers,
  selectRenderer,
  resizeSurface,
  report,
);
let lastLock = false;
function synchronize(): void {
  if (lastLock !== controller.locked || !element('inspector').contains(document.activeElement))
    inspector?.refresh();
  lastLock = controller.locked;
  for (const control of Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      '[data-edit]',
    ),
  ))
    control.disabled = controller.locked;
  element('play').textContent = controller.paused ? 'Play' : 'Pause';
  if (document.activeElement !== element('seed'))
    element<HTMLInputElement>('seed').value = String(controller.seed);
}
function refreshScene(): void {
  inspector.selectField(null);
  presentation.clear();
  resizeSurface();
  synchronize();
}
const shell = setupShell({
  controller,
  inspector,
  overlay,
  presentation,
  baseScene,
  report,
  synchronize,
  refreshScene,
  resizeViewport,
});
webglCanvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (renderers.active === 'WebGL') benchmark.invalidate('WebGL context was lost');
  renderers.handleWebGLContextLoss();
  canvas.hidden = false;
  webglCanvas.hidden = true;
  inspector.refresh();
  report('WebGL context lost; Canvas2D is active');
});
window.addEventListener('resize', resizeViewport);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    benchmark.invalidate('Document visibility changed');
    controller.clock.pause();
  } else if (!controller.paused) controller.clock.resume();
});
synchronize();
let lastUi = 0,
  lastFrame = 0,
  fps = 60;
let profiling = false;
function animate(now: number): void {
  if (profiling) {
    requestAnimationFrame(animate);
    return;
  }
  if (lastDpr !== window.devicePixelRatio) resizeViewport();
  const updateStart = performance.now();
  const frame = controller.clock.advance(now, (dt) => world.update(dt));
  const updateTime = performance.now() - updateStart;
  if (frame.clamped) benchmark.invalidate('Wall-clock time was clamped');
  else if (frame.overloaded) benchmark.invalidate('Physics could not keep pace with wall time');
  if (frame.shouldRender) {
    const start = performance.now(),
      renderer = renderers.activeRenderer;
    renderer.setTime?.(
      controller.paused
        ? controller.clock.getDiagnostics().simulationTimeSeconds
        : frame.presentationTimeSeconds,
    );
    renderer.render(world.activeParticles, controller.paused ? 1 : frame.interpolationAlpha);
    const renderTime = performance.now() - start;
    presentation.draw(inspector.getSelected());
    shell.capture(renderers.active === 'WebGL' ? webglCanvas : canvas);
    benchmark.recordFrame({
      updateTime,
      renderTime,
      particleCount: world.particleCount,
      poolSize: world.particlePool.length,
    });
  }
  if (lastFrame) fps = fps * 0.95 + (1000 / Math.max(1, now - lastFrame)) * 0.05;
  lastFrame = now;
  if (now - lastUi > 250) {
    const d = controller.clock.getDiagnostics();
    element('status').textContent =
      renderers.active +
      ' · ' +
      world.particleCount.toLocaleString() +
      ' particles · ' +
      fps.toFixed(0) +
      ' FPS';
    element('diagnostics').textContent =
      'Simulation ' +
      d.simulationTimeSeconds.toFixed(2) +
      ' s · Clamped ' +
      d.clampedFrames +
      ' · Discarded ' +
      d.discardedWallTimeSeconds.toFixed(2) +
      ' s' +
      (d.overloaded ? ' · OVERLOADED' : '');
    lastUi = now;
    synchronize();
  }
  requestAnimationFrame(animate);
}
if (import.meta.env.MODE === 'test') {
  void import('./testing').then(({ attachTesting }) =>
    attachTesting({
      controller,
      benchmark,
      renderers,
      selectRenderer,
      refreshScene,
      suspend: (value: boolean) => {
        profiling = value;
      },
    }),
  );
}
requestAnimationFrame(animate);
