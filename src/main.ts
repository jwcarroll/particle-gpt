import './style.css'
import { World } from './simulator'
import { Force } from './force';
import { Degree, Vector } from './vector';
import { BladeApi, Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { Canvas2DRenderer } from './renderers/Canvas2DRenderer';
import { DirectCanvas2DRenderer } from './renderers/DirectCanvas2DRenderer';
import { WebGLRenderer } from './renderers/WebGLRenderer';
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
  const GRAVITY_MPS2 = 9.81;
  const PIXELS_PER_METER = 100;
  const down = new Degree(90);
  const gravity = Force.fromVector('gravity', Vector.fromAngle(down.radians, GRAVITY_MPS2 * PIXELS_PER_METER));

  // Create separate canvas for WebGL (can't mix 2d and webgl contexts)
  const webglCanvas = document.createElement('canvas');
  webglCanvas.id = 'webgl-canvas';
  webglCanvas.style.display = 'none';
  canvas.parentElement?.appendChild(webglCanvas);

  // Renderer setup with hot-swapping support
  const renderers = {
    'DoubleBuffered': new Canvas2DRenderer(canvas),
    'Direct': new DirectCanvas2DRenderer(canvas),
    'WebGL': new WebGLRenderer(webglCanvas),
  };
  type RendererType = keyof typeof renderers;

  const rendererState = { current: 'DoubleBuffered' as RendererType };
  let renderer: ParticleRenderer = renderers[rendererState.current];

  // Helper to show correct canvas
  const updateCanvasVisibility = (type: RendererType) => {
    canvas.style.display = type === 'WebGL' ? 'none' : 'block';
    webglCanvas.style.display = type === 'WebGL' ? 'block' : 'none';
  };

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
  const paneRefs = setupTweakPane(world, benchmark, rendererState, (type: RendererType) => {
    renderer = renderers[type];
    renderer.initialize(window.innerWidth, window.innerHeight);
    updateCanvasVisibility(type);
  });

  // Initialize all renderers
  Object.values(renderers).forEach(r => r.initialize(window.innerWidth, window.innerHeight));

  // Handle window resize
  window.addEventListener('resize', () => {
    Object.values(renderers).forEach(r => r.resize(window.innerWidth, window.innerHeight));
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

type IntervalRange = {
  min: number;
  max: number;
};

type ColorMode = 'solid' | 'rainbow' | 'preset';
type ColorPreset = 'water' | 'fire' | 'forest' | 'sunset';

type PaneState = {
  particleCountRange: IntervalRange;
  lifespanRange: IntervalRange;
  radiusRange: IntervalRange;
  velocityRange: IntervalRange;
  angleRange: IntervalRange;
  colorMode: ColorMode;
  colorPreset: ColorPreset;
  rainbowCount: number;
  solidColor: string;
  colorPalette: string[];
};

const COLOR_PRESETS: Record<ColorPreset, string[]> = {
  water: ['#0b3c5d', '#1d6996', '#39a0ed', '#6ec6ff', '#9bdaf1'],
  fire: ['#4a0d00', '#8b1d04', '#d94801', '#ff8c00', '#ffd166', '#ff4d00'],
  forest: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#95d5b2'],
  sunset: ['#3a0f5c', '#8c1c61', '#d1495b', '#edae49', '#f7e1ae'],
};

function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

function createRandomPalette(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(randomHexColor());
  }
  return colors;
}

function setupTweakPane(
  world: World,
  benchmark: BenchmarkModule,
  rendererState: { current: string },
  onRendererChange: (type: 'DoubleBuffered' | 'Direct' | 'WebGL') => void
): PaneReferences {
  const pane = new Pane();
  pane.registerPlugin(EssentialsPlugin);
  const fpsgraph = pane.addBlade({ view: 'fpsgraph', label: 'FPS', rows: 2 }) as FpsBladeApi;
  const settings = world.getSettings();
  const initialSolidColor = typeof settings.fillStyle === 'string' ? settings.fillStyle : '#00aaff';
  const initialRainbowCount = 7;

  const paneState: PaneState = {
    particleCountRange: {
      min: settings.minParticleCount,
      max: settings.maxParticleCount,
    },
    lifespanRange: {
      min: settings.minParticleLifeSpan,
      max: settings.maxParticleLifeSpan,
    },
    radiusRange: {
      min: settings.minParticleRadius,
      max: settings.maxParticleRadius,
    },
    velocityRange: {
      min: settings.minParticleVelocity,
      max: settings.maxParticleVelocity,
    },
    angleRange: {
      min: settings.minStartingAngle,
      max: settings.maxStartingAngle,
    },
    colorMode: typeof settings.fillStyle === 'string' ? 'solid' : 'rainbow',
    colorPreset: 'water',
    rainbowCount: initialRainbowCount,
    solidColor: initialSolidColor,
    colorPalette: typeof settings.fillStyle === 'string'
      ? [initialSolidColor]
      : createRandomPalette(initialRainbowCount),
  };

  const tabs = pane.addTab({
    pages: [
      { title: 'Simulation' },
      { title: 'Rendering' },
      { title: 'Benchmark' },
    ],
  });

  const simulationTab = tabs.pages[0];
  const renderingTab = tabs.pages[1];
  const benchmarkTab = tabs.pages[2];

  const populationFolder = simulationTab.addFolder({ title: 'Population', expanded: true });
  const lifespanAndSizeFolder = simulationTab.addFolder({ title: 'Lifespan & Size', expanded: false });
  const motionFolder = simulationTab.addFolder({ title: 'Motion', expanded: false });
  const collisionFolder = simulationTab.addFolder({ title: 'Collision', expanded: false });

  populationFolder.addBinding(paneState, 'particleCountRange', {
    min: 0,
    max: 50000,
    step: 10,
    label: 'Count Range',
  });
  populationFolder.addBinding(settings, 'spawnRate', { min: 10, max: 1000, step: 10, label: 'Spawn Rate' });
  populationFolder.addBinding(world, 'particleCount', { label: 'Particles', readonly: true });

  lifespanAndSizeFolder.addBinding(paneState, 'lifespanRange', {
    min: 0.1,
    max: 100,
    step: 0.1,
    label: 'Lifespan',
  });
  lifespanAndSizeFolder.addBinding(paneState, 'radiusRange', {
    min: 0,
    max: 100,
    step: 1,
    label: 'Radius',
  });

  motionFolder.addBinding(paneState, 'velocityRange', {
    min: 0,
    max: 1000,
    step: 1,
    label: 'Velocity',
  });
  motionFolder.addBinding(paneState, 'angleRange', {
    min: 0,
    max: 360,
    step: 1,
    label: 'Angle',
  });

  collisionFolder.addBinding(settings, 'enableParticleCollision', { label: 'Enable Collisions' });
  collisionFolder.addBinding(settings, 'elasticity', { min: 0, max: 1, step: 0.01 });

  const rendererFolder = renderingTab.addFolder({ title: 'Renderer', expanded: true });
  rendererFolder.addBinding(rendererState, 'current', {
    label: 'Renderer',
    options: {
      'Canvas2D': 'DoubleBuffered',
      'Canvas2D (Direct)': 'Direct',
      'WebGL': 'WebGL',
    },
  }).on('change', (ev) => {
    onRendererChange(ev.value as 'DoubleBuffered' | 'Direct' | 'WebGL');
  });

  const colorFolder = renderingTab.addFolder({ title: 'Color', expanded: true });
  const paletteFolder = colorFolder.addFolder({ title: 'Palette', expanded: true });
  const colorModeBinding = colorFolder.addBinding(paneState, 'colorMode', {
    label: 'Mode',
    options: {
      Solid: 'solid',
      Rainbow: 'rainbow',
      Preset: 'preset',
    },
  });

  const colorPresetBinding = colorFolder.addBinding(paneState, 'colorPreset', {
    label: 'Preset',
    options: {
      Water: 'water',
      Fire: 'fire',
      Forest: 'forest',
      Sunset: 'sunset',
    },
  });

  const rainbowCountBinding = colorFolder.addBinding(paneState, 'rainbowCount', {
    label: 'Colors',
    min: 5,
    max: 10,
    step: 1,
  });

  const randomizePaletteButton = colorFolder.addButton({ title: 'Randomize Palette' });

  const dynamicPaletteBindings: BladeApi[] = [];
  const clearPaletteBindings = () => {
    while (dynamicPaletteBindings.length > 0) {
      dynamicPaletteBindings.pop()?.dispose();
    }
  };

  const syncPaletteForMode = (regenerateRainbow: boolean) => {
    if (paneState.colorMode === 'solid') {
      paneState.colorPalette = [paneState.solidColor];
      return;
    }

    if (paneState.colorMode === 'preset') {
      paneState.colorPalette = [...COLOR_PRESETS[paneState.colorPreset]];
      return;
    }

    if (regenerateRainbow || paneState.colorPalette.length === 0) {
      paneState.colorPalette = createRandomPalette(paneState.rainbowCount);
      return;
    }

    const next = [...paneState.colorPalette];
    if (next.length > paneState.rainbowCount) {
      next.length = paneState.rainbowCount;
    } else {
      while (next.length < paneState.rainbowCount) {
        next.push(randomHexColor());
      }
    }
    paneState.colorPalette = next;
  };

  const rebuildPaletteBindings = () => {
    clearPaletteBindings();

    for (let i = 0; i < paneState.colorPalette.length; i++) {
      const swatch = { color: paneState.colorPalette[i] };
      const binding = paletteFolder.addBinding(swatch, 'color', {
        label: `Color ${i + 1}`,
        view: 'color',
      });
      binding.on('change', (ev) => {
        paneState.colorPalette[i] = ev.value as string;
        if (paneState.colorMode === 'solid') {
          paneState.solidColor = paneState.colorPalette[0];
        }
      });
      dynamicPaletteBindings.push(binding);
    }
  };

  const updateColorUiVisibility = () => {
    colorPresetBinding.hidden = paneState.colorMode !== 'preset';
    rainbowCountBinding.hidden = paneState.colorMode !== 'rainbow';
    randomizePaletteButton.hidden = paneState.colorMode !== 'rainbow';
  };

  syncPaletteForMode(false);
  rebuildPaletteBindings();
  updateColorUiVisibility();

  colorModeBinding.on('change', () => {
    syncPaletteForMode(true);
    rebuildPaletteBindings();
    updateColorUiVisibility();
  });
  colorPresetBinding.on('change', () => {
    syncPaletteForMode(false);
    rebuildPaletteBindings();
  });
  rainbowCountBinding.on('change', () => {
    syncPaletteForMode(false);
    rebuildPaletteBindings();
  });
  randomizePaletteButton.on('click', () => {
    syncPaletteForMode(true);
    rebuildPaletteBindings();
  });

  // Setup benchmark UI
  benchmark.setupUI(benchmarkTab);

  //update world settings when pane is changed
  pane.on('change', () => {
    // Don't overwrite settings while benchmark is running
    if (benchmark.isRunning()) return;

    settings.minParticleCount = paneState.particleCountRange.min;
    settings.maxParticleCount = paneState.particleCountRange.max;
    settings.minParticleLifeSpan = paneState.lifespanRange.min;
    settings.maxParticleLifeSpan = paneState.lifespanRange.max;
    settings.minParticleRadius = paneState.radiusRange.min;
    settings.maxParticleRadius = paneState.radiusRange.max;
    settings.minParticleVelocity = paneState.velocityRange.min;
    settings.maxParticleVelocity = paneState.velocityRange.max;
    settings.minStartingAngle = paneState.angleRange.min;
    settings.maxStartingAngle = paneState.angleRange.max;
    settings.fillStyle = () => {
      const palette = paneState.colorPalette;
      if (palette.length === 0) {
        return paneState.solidColor;
      }
      const index = Math.floor(Math.random() * palette.length);
      return palette[index];
    };

    world.updateSettings(settings);
  });

  return { fpsgraph };
}
