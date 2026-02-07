import './style.css'
import { World } from './simulator'
import { Force } from './force';
import { Degree, Vector } from './vector';
import { BladeApi, Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { Canvas2DRenderer } from './renderers/Canvas2DRenderer';
import { ParticleRenderer } from './renderers/ParticleRenderer';
import { BenchmarkModule } from './benchmark';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const app = document.querySelector('#app');

if (!app) {
  throw new Error('Could not find app element');
}

if (!canvas) {
  app.innerHTML = `
    <div class="error">
      <h1>Canvas not found</h1>
      <p>Make sure you have a canvas element with the id "canvas"</p>
    </div>
  `;
}
else {
  const down = new Degree(90);
  const gravity = Force.fromVector('gravity', Vector.fromAngle(down.radians, 10));
  const renderer:ParticleRenderer = new Canvas2DRenderer(canvas);

  const world = new World();
  world.addForce(gravity);
  world.updateSettings({
    height: window.innerHeight,
    width: window.innerWidth,
    minParticleCount: 500,
    maxParticleCount: 1000,
    minParticleLifeSpan: 5,
    maxParticleLifeSpan: 15,
    minParticleRadius: 5,
    maxParticleRadius: 20,
    enableParticleCollision: false,
    elasticity: 0.7,
    fillStyle: () => `hsl(${Math.random() * 360}, 100%, 50%)`,
  });

  const benchmark = new BenchmarkModule(world);
  const paneRefs = setupTweakPane(world, benchmark);

  renderer.initialize(window.innerWidth, window.innerHeight);

  // Handle window resize
  window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    world.updateSettings({
      height: window.innerHeight,
      width: window.innerWidth,
    });
  });

  let lastTime = performance.now();

  function animate(currentTime: number) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    paneRefs.fpsgraph.begin();

    const updateStart = performance.now();
    world.update(dt);
    const updateEnd = performance.now();

    const renderStart = performance.now();
    renderer.render(world.activeParticles);
    const renderEnd = performance.now();

    benchmark.recordFrame({
      updateTime: updateEnd - updateStart,
      renderTime: renderEnd - renderStart,
      particleCount: world.particleCount,
      poolSize: world.particlePool.length,
    });

    paneRefs.fpsgraph.end();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

interface FpsBladeApi extends BladeApi {
  begin(): void;
  end(): void;
}

type PaneReferences = {
  fpsgraph: FpsBladeApi;
}

function setupTweakPane(world: World, benchmark: BenchmarkModule): PaneReferences {
  const pane = new Pane();
  pane.registerPlugin(EssentialsPlugin);
  const settings = world.getSettings();

  pane.addBinding(settings, 'minParticleCount', { min: 0, max: 1000, step: 10 });
  pane.addBinding(settings, 'maxParticleCount', { min: 0, max: 10000, step: 10 });

  pane.addBinding(world, 'particleCount', { label: 'particles', readonly: true });

  pane.addBinding(settings, 'minParticleLifeSpan', { min: 0.1, max: 10, step: 0.1 });
  pane.addBinding(settings, 'maxParticleLifeSpan', { min: 0.1, max: 100, step: 0.1 });
  pane.addBinding(settings, 'minParticleRadius', { min: 0, max: 10, step: 1 });
  pane.addBinding(settings, 'maxParticleRadius', { min: 1, max: 100, step: 1 });
  pane.addBinding(settings, 'enableParticleCollision');
  pane.addBinding(settings, 'elasticity', { min: 0, max: 1 });

  const fpsgraph = pane.addBlade({ view: 'fpsgraph', label: 'FPS', rows: 2 }) as FpsBladeApi;

  // Setup benchmark UI
  benchmark.setupUI(pane);

  //update world settings when pane is changed
  pane.on('change', () => {
    // Don't overwrite settings while benchmark is running
    if (benchmark.isRunning()) return;
    world.updateSettings(settings);
  });

  return { fpsgraph };
}